import fs from "fs";
import path from "path";
import pino from "pino";
import { Prisma } from "@prisma/client";
import type { WASocket } from "@whiskeysockets/baileys";
import { prisma } from "../config/prisma";
import { logger } from "../utils/logger";
import { processText, processAudioBuffer } from "./messageProcessor";

type PairingStatus = "IDLE" | "PAIRING" | "CONNECTED" | "DISCONNECTED" | "ERROR";

interface SessionState {
  accountId: number;
  sock: WASocket;
  status: PairingStatus;
  qr?: string;
  lastError?: string;
  connectedJid?: string;
  startedAt: Date;
  lidToJidMap: Map<string, string>; // @lid JID → @s.whatsapp.net JID
  reconnectAttempts: number;
  reconnectTimer?: NodeJS.Timeout;
  hasEverConnected: boolean;
  manualDisconnect?: boolean;
}

class WhatsappQrPairingService {
  private sessions = new Map<number, SessionState>();
  private processedMessageIds = new Set<string>();
  private readonly maxReconnectWindowMs = 250 * 24 * 60 * 60 * 1000; // 250 dias

  constructor() {
    // Restaura sessões pareadas após restart do backend.
    setTimeout(() => {
      this.restorePersistedSessions().catch((err) => {
        logger.error("[WPP QR] Erro ao restaurar sessões persistidas", err);
      });
    }, 1500);
  }

  private async restorePersistedSessions(): Promise<void> {
    const baseDir = path.resolve(__dirname, "../../storage/wa-sessions");
    if (!fs.existsSync(baseDir)) return;

    const dirs = fs.readdirSync(baseDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^account-\d+$/.test(d.name))
      .map((d) => d.name);

    if (dirs.length === 0) return;

    for (const dir of dirs) {
      const accountId = Number(dir.replace("account-", ""));
      if (!Number.isFinite(accountId) || this.sessions.has(accountId)) continue;

      const account = await prisma.generatedWhatsappAccount.findUnique({ where: { id: accountId } });
      if (!account || !account.isActive) continue;

      const authDir = this.getAuthDir(accountId);
      const session: SessionState = {
        accountId,
        sock: null as any,
        status: "IDLE",
        startedAt: new Date(),
        lidToJidMap: new Map<string, string>(),
        reconnectAttempts: 0,
        hasEverConnected: false,
      };
      this.sessions.set(accountId, session);

      logger.info(`[WPP QR] Restaurando sessão persistida da conta ${accountId}`);
      await this._createSocket(accountId, authDir, session, 0);
    }
  }

  private normalizeFromJid(jid: string): string {
    return String(jid || "").replace(/@.*/, "").replace(/\D/g, "");
  }

  private formatWhatsappNumber(value: string): string {
    const digits = this.normalizeFromJid(value);
    if (!digits) return value;
    if (digits.startsWith("55") && digits.length >= 12) {
      const ddd = digits.slice(2, 4);
      const first = digits.slice(4, 9);
      const second = digits.slice(9, 13);
      return `+55 ${ddd} ${first}${second ? "-" + second : ""}`;
    }
    return `+${digits}`;
  }

  public resolveRealPhoneFromStoredIdentifier(storedPhone: string): string | null {
    const raw = String(storedPhone || "").trim();
    if (!raw) return null;
    if (!raw.endsWith("@lid")) {
      const digits = this.normalizeFromJid(raw);
      return digits ? this.formatWhatsappNumber(digits) : raw;
    }

    for (const session of this.sessions.values()) {
      const realJid = session.lidToJidMap.get(raw);
      if (realJid) {
        return this.formatWhatsappNumber(realJid);
      }
    }

    return null;
  }

  public buildPhoneDisplay(storedPhone: string): string {
    const raw = String(storedPhone || "").trim();
    if (!raw) return "";

    const resolved = this.resolveRealPhoneFromStoredIdentifier(raw);
    if (resolved && raw.endsWith("@lid")) {
      return `${resolved} · ${raw}`;
    }
    return resolved || raw;
  }

  private extractIncomingText(msg: any): string | null {
    const m = msg?.message?.ephemeralMessage?.message || msg?.message?.viewOnceMessage?.message || msg?.message;
    if (!m) return null;

    if (m.conversation) return String(m.conversation);
    if (m.extendedTextMessage?.text) return String(m.extendedTextMessage.text);
    if (m.imageMessage?.caption) return String(m.imageMessage.caption);
    if (m.videoMessage?.caption) return String(m.videoMessage.caption);
    if (m.buttonsResponseMessage?.selectedDisplayText) return String(m.buttonsResponseMessage.selectedDisplayText);
    if (m.listResponseMessage?.title) return String(m.listResponseMessage.title);
    if (m.templateButtonReplyMessage?.selectedDisplayText) return String(m.templateButtonReplyMessage.selectedDisplayText);

    return null;
  }

  private normalizeQrPayload(qrValue: string): string {
    const value = String(qrValue || "").trim();
    if (!value) return value;

    // Alguns builds retornam URL com payload no fragmento (#2@...)
    // e o scanner de "Aparelhos conectados" espera o payload puro.
    const hashIndex = value.indexOf("#2@");
    if (hashIndex >= 0) {
      return value.slice(hashIndex + 1);
    }

    return value;
  }

  private getAuthDir(accountId: number): string {
    return path.resolve(__dirname, "../../storage/wa-sessions", `account-${accountId}`);
  }

  private normalizeToJid(phone: string): string {
    if (phone.includes("@")) return phone; // já é um JID completo (@s.whatsapp.net, @lid, etc.)
    const digits = String(phone || "").replace(/\D/g, "");
    return `${digits}@s.whatsapp.net`;
  }

  private clearReconnectTimer(session: SessionState): void {
    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer);
      session.reconnectTimer = undefined;
    }
  }

  private async scheduleReconnect(
    accountId: number,
    authDir: string,
    session: SessionState,
    retries: number,
    reason: string,
  ): Promise<void> {
    if (!this.sessions.has(accountId) || session.manualDisconnect) {
      return;
    }

    const sessionAgeMs = Date.now() - session.startedAt.getTime();
    if (sessionAgeMs > this.maxReconnectWindowMs) {
      session.status = "DISCONNECTED";
      this.sessions.delete(accountId);
      await prisma.generatedWhatsappAccount.update({
        where: { id: accountId },
        data: {
          whatsappConnectionStatus: "DISCONNECTED",
          lastHealthCheck: new Date(),
          lastHealthCheckError: "Janela máxima de reconexão excedida (250 dias)",
        },
      });
      logger.warn(`[WPP QR] Reconexão encerrada para conta ${accountId} após 250 dias`);
      return;
    }

    const delayMs = Math.min(60000, 2000 * Math.pow(2, Math.min(retries, 5)));
    session.reconnectAttempts = retries;
    this.clearReconnectTimer(session);

    session.reconnectTimer = setTimeout(async () => {
      if (!this.sessions.has(accountId) || session.manualDisconnect) return;
      try {
        logger.warn(
          `[WPP QR] Tentando reconectar conta ${accountId} (tentativa ${retries + 1}) após ${delayMs}ms. Motivo: ${reason}`,
        );
        await this._createSocket(accountId, authDir, session, retries + 1);
      } catch (err) {
        logger.error(`[WPP QR] Falha ao iniciar reconexão da conta ${accountId}`, err);
      }
    }, delayMs);
  }

  private async _createSocket(accountId: number, authDir: string, session: SessionState, retries = 0): Promise<void> {
    let baileys: typeof import("@whiskeysockets/baileys");
    try {
      baileys = await import("@whiskeysockets/baileys");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      session.status = "ERROR";
      session.lastError = message;
      logger.error("[WPP QR] Falha ao carregar Baileys. Verifique suporte a WebAssembly/SIMD no servidor.", err);
      await prisma.generatedWhatsappAccount.update({
        where: { id: accountId },
        data: {
          whatsappConnectionStatus: "ERROR",
          lastHealthCheck: new Date(),
          lastHealthCheckError: message,
        },
      });
      throw err;
    }

    const {
      Browsers,
      DisconnectReason,
      fetchLatestBaileysVersion,
      useMultiFileAuthState,
      downloadMediaMessage,
    } = baileys;
    const makeWASocket = baileys.default;
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      auth: state,
      version,
      browser: Browsers.macOS("ozapteconta"),
      printQRInTerminal: false,
      logger: pino({ level: "silent" }),
      syncFullHistory: false,
      markOnlineOnConnect: false,
      connectTimeoutMs: 30000,
      keepAliveIntervalMs: 15000,
    });

    session.sock = sock;

    sock.ev.on("creds.update", saveCreds);

    // Constrói mapa de @lid → JID real para suportar protocolo novo do WhatsApp
    sock.ev.on("contacts.set" as any, ({ contacts }: { contacts: Array<{ lid?: string; id?: string }> }) => {
      for (const c of contacts) {
        if (c.lid && c.id) session.lidToJidMap.set(c.lid, c.id);
      }
      logger.info(`[WPP QR] contacts.set: ${session.lidToJidMap.size} LIDs mapeados`);
    });
    sock.ev.on("contacts.upsert" as any, (contacts: Array<{ lid?: string; id?: string }>) => {
      for (const c of contacts) {
        if (c.lid && c.id) session.lidToJidMap.set(c.lid, c.id);
      }
    });

    logger.info(`[WPP QR] Listener de mensagens registrado para conta ${accountId}`);

    sock.ev.on("messages.upsert", async (ev) => {
      try {
        logger.info(`[WPP QR] upsert recebido na conta ${accountId}: tipo=${ev.type}, total=${ev.messages?.length || 0}`);
        if (!ev.messages?.length) return;
        if (ev.type !== "notify" && ev.type !== "append") {
          logger.info(`[WPP QR] tipo ignorado: ${ev.type}`);
          return;
        }

        for (const msg of ev.messages || []) {
          const messageId = msg?.key?.id;
          if (!messageId || this.processedMessageIds.has(messageId)) continue;
          this.processedMessageIds.add(messageId);
          if (this.processedMessageIds.size > 2000) {
            this.processedMessageIds.clear();
          }

          if (msg?.key?.fromMe) {
            logger.info(`[WPP QR] msg fromMe ignorada (id=${messageId})`);
            continue;
          }

          const remoteJid = msg?.key?.remoteJid || "";
          // Aceita contatos individuais: @s.whatsapp.net (padrão) e @lid (protocolo novo)
          const isIndividual = remoteJid.endsWith("@s.whatsapp.net") || remoteJid.endsWith("@lid");
          if (!isIndividual || remoteJid === "status@broadcast") {
            logger.info(`[WPP QR] jid ignorado: ${remoteJid}`);
            continue;
          }

          // Resolve número: para @lid, busca o JID real no mapa de contatos
          let phone: string;
          if (remoteJid.endsWith("@lid")) {
            const realJid = session.lidToJidMap.get(remoteJid);
            if (!realJid) {
              // @lid ainda não mapeado — usa o JID completo para poder responder corretamente
              logger.info(`[WPP QR] @lid não resolvido ainda (${remoteJid}), usando JID completo para resposta`);
              phone = remoteJid; // JID completo: permite enviar de volta ao @lid
            } else {
              phone = this.normalizeFromJid(realJid);
              logger.info(`[WPP QR] @lid resolvido: ${remoteJid} → ${phone}`);
            }
          } else {
            phone = this.normalizeFromJid(remoteJid);
          }
          if (!phone) continue;

          const text = this.extractIncomingText(msg)?.trim();
          if (!text) {
            // Verificar se é mensagem de áudio
            const m = msg?.message?.ephemeralMessage?.message || msg?.message?.viewOnceMessage?.message || msg?.message;
            const audioMsg = m?.audioMessage;
            if (audioMsg) {
              const senderName = msg?.pushName || undefined;
              logger.info(`[WPP QR] Áudio recebido em conta ${accountId} de ${phone} — processando...`);
              try {
                const session = this.sessions.get(accountId);
                if (session?.sock) {
                  const buffer = await downloadMediaMessage(msg, "buffer", {}, { logger: pino({ level: "silent" }), reuploadRequest: session.sock.updateMediaMessage }) as Buffer;
                  const mimeType: string = audioMsg.mimetype || "audio/ogg; codecs=opus";
                  await processAudioBuffer(phone, senderName, buffer, mimeType, messageId);
                } else {
                  logger.warn(`[WPP QR] Sessão ${accountId} não disponível para download de áudio`);
                }
              } catch (audioErr) {
                logger.error(`[WPP QR] Erro ao processar áudio da conta ${accountId}:`, audioErr);
              }
            } else {
              logger.info(`[WPP QR] Mensagem sem texto útil na conta ${accountId} (jid=${remoteJid}, id=${messageId}, msg_keys=${Object.keys(msg?.message || {}).join(',')})`);
            }
            continue;
          }

          const senderName =
            msg?.pushName ||
            msg?.message?.extendedTextMessage?.contextInfo?.participant ||
            undefined;

          logger.info(`[WPP QR] Mensagem recebida em conta ${accountId} de ${phone}: ${text.slice(0, 80)}`);
          await processText(phone, senderName, text);
        }
      } catch (err) {
        logger.error(`[WPP QR] Erro ao processar mensagem recebida na conta ${accountId}`, err);
      }
    });

    sock.ev.on("connection.update", async (update) => {
      try {
        if (update.qr) {
          const normalizedQr = this.normalizeQrPayload(update.qr);
          session.status = "PAIRING";
          session.qr = normalizedQr;

          await prisma.generatedWhatsappAccount.update({
            where: { id: accountId },
            data: {
              whatsappConnectionStatus: "PAIRING",
              qrCodeData: normalizedQr,
              qrCodeExpiresAt: new Date(Date.now() + 60 * 1000),
              lastHealthCheck: new Date(),
              lastHealthCheckError: null,
            },
          });

          logger.info(`[WPP QR] QR gerado para conta ${accountId}`);
        }

        if (update.connection === "open") {
          session.status = "CONNECTED";
          session.qr = undefined;
          session.connectedJid = sock.user?.id;
          session.hasEverConnected = true;
          session.reconnectAttempts = 0;
          session.manualDisconnect = false;
          this.clearReconnectTimer(session);

          // Auto-preenche o telefone da conta a partir do JID pareado
          const jid = sock.user?.id || "";
          const phoneDigits = jid.replace(/@.*/, "").replace(/:\d+$/, "").replace(/\D/g, "");
          const autoPhone = phoneDigits ? `+${phoneDigits}` : null;

          // Gera label descritivo com o número pareado
          const now = new Date();
          const dateStr = now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
          const autoLabel = autoPhone ? `Conta ${autoPhone} - ${dateStr}` : undefined;

          const account = await prisma.generatedWhatsappAccount.findUnique({ where: { id: accountId } });
          const isAutoLabel = account?.label.startsWith("Conta ") && account.label.includes(" - ");

          await prisma.generatedWhatsappAccount.update({
            where: { id: accountId },
            data: {
              whatsappConnectionStatus: "CONNECTED",
              qrCodeData: null,
              qrCodeExpiresAt: null,
              ...(autoPhone && !account?.phone ? { phone: autoPhone } : {}),
              ...(autoLabel && isAutoLabel ? { label: autoLabel } : {}),
              sessionData: {
                connectedJid: sock.user?.id,
                connectedAt: new Date().toISOString(),
              },
              lastHealthCheck: new Date(),
              lastHealthCheckError: null,
            },
          });

          logger.info(`[WPP QR] Conta ${accountId} conectada: ${sock.user?.id} → telefone: ${autoPhone}`);
        }

        if (update.connection === "close") {
          const statusCode = (update.lastDisconnect?.error as any)?.output?.statusCode;
          const shouldLogout = statusCode === DisconnectReason.loggedOut;
          const wasConnected = session.status === "CONNECTED";

          session.qr = undefined;

          if (shouldLogout || session.manualDisconnect) {
            // Logout definitivo — limpa tudo
            session.status = "DISCONNECTED";
            this.clearReconnectTimer(session);
            this.sessions.delete(accountId);
            try { fs.rmSync(authDir, { recursive: true, force: true }); } catch { /* ignore */ }

            await prisma.generatedWhatsappAccount.update({
              where: { id: accountId },
              data: {
                whatsappConnectionStatus: "DISCONNECTED",
                qrCodeData: null,
                qrCodeExpiresAt: null,
                lastHealthCheck: new Date(),
                lastHealthCheckError: "Sessão desconectada (logout)",
              },
            });
            logger.warn(`[WPP QR] Logout definitivo para conta ${accountId}`);
            return;
          }

          if (!wasConnected && retries < 5) {
            // QR expirou ou conexão caiu durante o pareamento — reconectar automaticamente
            session.status = "PAIRING";
            await this.scheduleReconnect(
              accountId,
              authDir,
              session,
              retries,
              `pareamento interrompido (código ${statusCode ?? "n/a"})`,
            );
            return;
          }

          // Se já conectou alguma vez, mantém reconectando automaticamente para evitar queda por inatividade.
          const canKeepReconnecting = wasConnected || session.hasEverConnected;
          session.status = "DISCONNECTED";
          await prisma.generatedWhatsappAccount.update({
            where: { id: accountId },
            data: {
              whatsappConnectionStatus: "DISCONNECTED",
              qrCodeData: null,
              qrCodeExpiresAt: null,
              lastHealthCheck: new Date(),
              lastHealthCheckError: wasConnected
                ? `Conexão perdida (código ${statusCode ?? "n/a"}). Reconexão automática iniciada.`
                : "Falha ao parear após várias tentativas",
            },
          });

          if (canKeepReconnecting) {
            await this.scheduleReconnect(
              accountId,
              authDir,
              session,
              retries,
              `conexão fechada após sessão ativa (código ${statusCode ?? "n/a"})`,
            );
            logger.warn(`[WPP QR] Conta ${accountId} desconectou e entrou em reconexão automática (código: ${statusCode})`);
            return;
          }

          this.clearReconnectTimer(session);
          this.sessions.delete(accountId);
          logger.warn(`[WPP QR] Sessão encerrada para conta ${accountId} (código: ${statusCode})`);
        }
      } catch (err) {
        logger.error(`[WPP QR] Erro no update de conexão da conta ${accountId}`, err);
      }
    });
  }

  async startPairing(accountId: number): Promise<{ success: boolean; status: PairingStatus; qr?: string; message: string }> {
    const account = await prisma.generatedWhatsappAccount.findUnique({ where: { id: accountId } });
    if (!account) {
      return { success: false, status: "ERROR", message: "Conta não encontrada" };
    }

    const existing = this.sessions.get(accountId);
    if (existing && (existing.status === "PAIRING" || existing.status === "CONNECTED")) {
      return {
        success: true,
        status: existing.status,
        qr: existing.qr,
        message: existing.status === "CONNECTED" ? "Conta já conectada" : "Pareamento em andamento",
      };
    }

    const authDir = this.getAuthDir(accountId);
    // Evita loop de logout usando credenciais corrompidas/expiradas de sessão antiga.
    try {
      fs.rmSync(authDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    fs.mkdirSync(authDir, { recursive: true });

    const session: SessionState = {
      accountId,
      sock: null as any, // será definido em _createSocket
      status: "IDLE",
      startedAt: new Date(),
      lidToJidMap: new Map(),
      reconnectAttempts: 0,
      hasEverConnected: false,
    };
    this.sessions.set(accountId, session);

    await this._createSocket(accountId, authDir, session, 0);

    // Aguarda até 15s para devolver o QR real do WhatsApp no primeiro retorno.
    const started = Date.now();
    while (Date.now() - started < 15000) {
      if (session.status === "CONNECTED") {
        return { success: true, status: "CONNECTED", message: "Conta já conectada" };
      }
      if (session.qr) {
        return { success: true, status: "PAIRING", qr: session.qr, message: "QR de pareamento gerado" };
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    return { success: true, status: session.status, qr: session.qr, message: "Pareamento iniciado. Aguarde o QR" };
  }

  async getPairingStatus(accountId: number): Promise<{
    success: boolean;
    status: PairingStatus | string;
    qr?: string | null;
    connectedJid?: string;
    lastError?: string | null;
  }> {
    const live = this.sessions.get(accountId);
    if (live) {
      return {
        success: true,
        status: live.status,
        qr: live.qr || null,
        connectedJid: live.connectedJid,
        lastError: live.lastError || null,
      };
    }

    const account = await prisma.generatedWhatsappAccount.findUnique({ where: { id: accountId } });
    if (!account) {
      return { success: false, status: "ERROR", lastError: "Conta não encontrada" };
    }

    return {
      success: true,
      status: account.whatsappConnectionStatus || "IDLE",
      qr: account.qrCodeData || null,
      connectedJid: (account.sessionData as any)?.connectedJid,
      lastError: account.lastHealthCheckError,
    };
  }

  async disconnect(accountId: number): Promise<{ success: boolean; message: string }> {
    const session = this.sessions.get(accountId);
    if (session) {
      session.manualDisconnect = true;
      this.clearReconnectTimer(session);
      try {
        await session.sock.logout();
      } catch {
        // ignore
      }
      try {
        session.sock.end(new Error("Manual disconnect"));
      } catch {
        // ignore
      }
      this.sessions.delete(accountId);
    }

    await prisma.generatedWhatsappAccount.update({
      where: { id: accountId },
      data: {
        whatsappConnectionStatus: "DISCONNECTED",
        qrCodeData: null,
        qrCodeExpiresAt: null,
        sessionData: Prisma.JsonNull,
        lastHealthCheck: new Date(),
      },
    });

    const authDir = this.getAuthDir(accountId);
    try {
      fs.rmSync(authDir, { recursive: true, force: true });
    } catch {
      // ignore
    }

    return { success: true, message: "Conta desconectada" };
  }

  async sendMessageUsingConnectedSession(to: string, text: string): Promise<boolean> {
    const connected = Array.from(this.sessions.values()).find((s) => s.status === "CONNECTED");
    if (!connected) return false;

    try {
      await connected.sock.sendMessage(this.normalizeToJid(to), { text });
      return true;
    } catch (err) {
      logger.error("[WPP QR] Erro ao enviar mensagem por sessão conectada", err);
      return false;
    }
  }

  async sendImageUsingConnectedSession(to: string, imageUrl: string, caption?: string): Promise<boolean> {
    const connected = Array.from(this.sessions.values()).find((s) => s.status === "CONNECTED");
    if (!connected) return false;

    try {
      await connected.sock.sendMessage(this.normalizeToJid(to), {
        image: { url: imageUrl },
        caption,
      });
      return true;
    } catch (err) {
      logger.error("[WPP QR] Erro ao enviar imagem por sessão conectada", err);
      return false;
    }
  }

  async sendDocumentUsingConnectedSession(
    to: string,
    buffer: Buffer,
    fileName: string,
    mimeType: string,
    caption?: string,
  ): Promise<boolean> {
    const connected = Array.from(this.sessions.values()).find((s) => s.status === "CONNECTED");
    if (!connected) return false;

    try {
      await connected.sock.sendMessage(this.normalizeToJid(to), {
        document: buffer,
        fileName,
        mimetype: mimeType,
        caption,
      });
      return true;
    } catch (err) {
      logger.error("[WPP QR] Erro ao enviar documento por sessão conectada", err);
      return false;
    }
  }
}

export const whatsappQrPairingService = new WhatsappQrPairingService();
