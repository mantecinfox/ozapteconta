import fs from "fs";
import path from "path";
import pino from "pino";
import { Prisma } from "@prisma/client";
import type { WASocket } from "@whiskeysockets/baileys";
import { prisma } from "../config/prisma";
import { logger } from "../utils/logger";
import { appendUserContextEarly, processText, processAudioBuffer } from "./messageProcessor";
import { registerWhatsappIdentityAlias, resolveWhatsappIdentity } from "./whatsappIdentityService";
import { isPlausibleWhatsappPhone } from "../utils/whatsappPhoneUtils";
import { detectMarketQuery, executeMarketQuery } from "./marketDataService";
import { buildUnreadContentFallbackHints } from "./userPhraseModels";
import {
  classifyIntent,
  ensureBaselineLessons,
  learnFromUnreadableRecovery,
} from "./aiLearningService";
import { prepareWhatsAppText } from "../utils/whatsappText";
import { WhatsappInboundBuffer } from "./whatsappInboundBuffer";

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
  outboundJidMap: Map<string, string>; // chave de envio → JID real (@lid ou @s.whatsapp.net)
  reconnectAttempts: number;
  reconnectTimer?: NodeJS.Timeout;
  hasEverConnected: boolean;
  manualDisconnect?: boolean;
}

const QR_TYPING_ENABLED = process.env.WPP_QR_TYPING_ENABLED !== "false";
const QR_TYPING_MIN_MS = Number(process.env.WPP_QR_TYPING_MIN_MS ?? 1500);
const QR_TYPING_MAX_MS = Number(process.env.WPP_QR_TYPING_MAX_MS ?? 4200);
const WPP_UNREADABLE_DELAY_MS = Number(process.env.WPP_UNREADABLE_DELAY_MS ?? 12000);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function computeTypingDurationMs(text: string): number {
  const normalized = String(text || "").trim();
  const base = 420 + normalized.length * 14;
  const multilineBonus = normalized.includes("\n") ? 220 : 0;
  const jitter = Math.floor(Math.random() * 221) - 110;
  return clamp(base + multilineBonus + jitter, QR_TYPING_MIN_MS, QR_TYPING_MAX_MS);
}

function safeUnreadableDelayMs(): number {
  return clamp(WPP_UNREADABLE_DELAY_MS, 8000, 30000);
}

class WhatsappQrPairingService {
  private sessions = new Map<number, SessionState>();
  private readonly inboundBuffer = new WhatsappInboundBuffer();
  private recentAudioMessageIds = new Set<string>();
  /**
   * Mapeia `accountId:messageId` → timestamp da última entrega. Usado apenas
   * para deduplicar o protocolo multi-device do Baileys (mesmo `key.id` chega
   * em `notify` + `append`). Reenvios manuais do usuário têm `messageId`
   * diferente, então passam normalmente.
   */
  private recentTextMessageIds = new Map<string, number>();
  private unreadableNoticeAt = new Map<string, number>();
  private unreadableMessageTimers = new Map<string, NodeJS.Timeout>();
  private unreadableTimersByRemote = new Map<string, Set<string>>();
  private readonly maxReconnectWindowMs = 250 * 24 * 60 * 60 * 1000; // 250 dias

  private static readonly FALLBACK_TEXT_KEYS = new Set([
    "text",
    "body",
    "displayText",
    "hydratedContentText",
    "caption",
    "title",
    "description",
    "contentText",
    "content",
    "message",
    "paramsJson",
    "selectedDisplayText",
    "selectedButtonId",
    "selectedId",
    "selectedRowId",
    "id",
    "name",
    "conversation",
  ]);

  private unreadableTimerKey(accountId: number, messageId: string): string {
    return `${accountId}:${messageId}`;
  }

  private unreadableRemoteKey(accountId: number, remoteJid: string): string {
    return `${accountId}:${remoteJid}`;
  }

  /**
   * Verifica se a mensagem já foi entregue ao `processText` nesta sessão.
   * Usa `accountId:messageId` (chave do Baileys), evitando bloquear o reenvio
   * manual do mesmo texto pelo usuário. Janela de retenção: 10 minutos.
   */
  private shouldSkipDuplicateMessageId(accountId: number, messageId: string): boolean {
    if (!messageId) return false;
    const key = `${accountId}:${messageId}`;
    const now = Date.now();

    /* SANITY CHECK: limpa entradas expiradas para não vazar memória */
    if (this.recentTextMessageIds.size > 2000) {
      for (const [k, ts] of this.recentTextMessageIds.entries()) {
        if (now - ts > 10 * 60 * 1000) this.recentTextMessageIds.delete(k);
      }
    }

    if (this.recentTextMessageIds.has(key)) return true;
    this.recentTextMessageIds.set(key, now);
    return false;
  }

  private trackUnreadableTimer(accountId: number, remoteJid: string, timerKey: string): void {
    const remoteKey = this.unreadableRemoteKey(accountId, remoteJid);
    const timerKeys = this.unreadableTimersByRemote.get(remoteKey) || new Set<string>();
    timerKeys.add(timerKey);
    this.unreadableTimersByRemote.set(remoteKey, timerKeys);
  }

  private untrackUnreadableTimer(accountId: number, remoteJid: string, timerKey: string): void {
    const remoteKey = this.unreadableRemoteKey(accountId, remoteJid);
    const timerKeys = this.unreadableTimersByRemote.get(remoteKey);
    if (!timerKeys) return;
    timerKeys.delete(timerKey);
    if (timerKeys.size === 0) this.unreadableTimersByRemote.delete(remoteKey);
  }

  private clearUnreadableFollowUpsByRemoteJid(accountId: number, remoteJid: string): void {
    const remoteKey = this.unreadableRemoteKey(accountId, remoteJid);
    const timerKeys = this.unreadableTimersByRemote.get(remoteKey);
    if (!timerKeys || timerKeys.size === 0) return;

    for (const timerKey of timerKeys) {
      const timer = this.unreadableMessageTimers.get(timerKey);
      if (timer) clearTimeout(timer);
      this.unreadableMessageTimers.delete(timerKey);
    }

    this.unreadableTimersByRemote.delete(remoteKey);
  }

  private clearUnreadableFollowUp(accountId: number, messageId: string): void {
    const key = this.unreadableTimerKey(accountId, messageId);
    const timer = this.unreadableMessageTimers.get(key);
    if (!timer) return;
    clearTimeout(timer);
    this.unreadableMessageTimers.delete(key);
  }

  private scheduleUnreadableFollowUp(accountId: number, remoteJid: string, messageId: string): void {
    const key = this.unreadableTimerKey(accountId, messageId);
    this.clearUnreadableFollowUp(accountId, messageId);

    // Aguarda alguns segundos antes de enviar aviso — WhatsApp frequentemente reenvia a mensagem
    // completa dentro desse prazo (protocolo multi-device: "append" antes do "notify").
    const timer = setTimeout(async () => {
      this.unreadableMessageTimers.delete(key);
      this.untrackUnreadableTimer(accountId, remoteJid, key);
      if (!this.shouldSendUnreadableNotice(remoteJid)) return;

      try {
        const session = this.sessions.get(accountId);
        const recoveredText = await this.tryRecoverLikelyTextFromContext(remoteJid);

        if (recoveredText) {
          logger.info(`[WPP QR] Contexto recuperado para ${remoteJid}: ${recoveredText.slice(0, 80)}`);
          await processText(this.normalizeFromJid(remoteJid), undefined, recoveredText);
          return;
        }

        const contextualReply = await this.buildContextualFallbackReply(remoteJid);
        await session?.sock.sendMessage(remoteJid, {
          text: contextualReply,
        });
      } catch (replyErr) {
        logger.warn(`[WPP QR] Falha ao enviar aviso de mensagem ilegível (${remoteJid}): ${String(replyErr)}`);
      }
    }, safeUnreadableDelayMs());

    this.unreadableMessageTimers.set(key, timer);
    this.trackUnreadableTimer(accountId, remoteJid, key);
  }

  private shouldSendUnreadableNotice(remoteJid: string): boolean {
    const key = String(remoteJid || "").trim();
    if (!key) return false;

    const now = Date.now();
    const lastAt = this.unreadableNoticeAt.get(key) || 0;
    if (now - lastAt < 120000) return false; // evita spam em sequência

    this.unreadableNoticeAt.set(key, now);
    return true;
  }

  private isLikelyUserText(value: string): boolean {
    const trimmed = String(value || "").trim();
    if (!trimmed) return false;
    if (trimmed.length < 2 || trimmed.length > 500) return false;
    if (trimmed.includes("@s.whatsapp.net") || trimmed.includes("@lid")) return false;
    if (/^[A-Za-z0-9_-]{20,}$/.test(trimmed)) return false;
    return /[A-Za-zÀ-ÿ]/.test(trimmed) || /\d+\s*(reais|r\$|hoje|amanh[ãa]|dia)/i.test(trimmed);
  }

  private extractFallbackTextFromObject(payload: unknown, depth = 0): string | null {
    if (depth > 5 || payload === null || payload === undefined) return null;

    if (typeof payload === "string") {
      const trimmed = payload.trim();
      return this.isLikelyUserText(trimmed) ? trimmed : null;
    }

    if (Array.isArray(payload)) {
      for (const item of payload) {
        const candidate = this.extractFallbackTextFromObject(item, depth + 1);
        if (candidate) return candidate;
      }
      return null;
    }

    if (typeof payload !== "object") return null;

    const record = payload as Record<string, unknown>;

    for (const [key, value] of Object.entries(record)) {
      if (!WhatsappQrPairingService.FALLBACK_TEXT_KEYS.has(key)) continue;
      if (typeof value !== "string") continue;
      const trimmed = value.trim();
      if (this.isLikelyUserText(trimmed)) return trimmed;
    }

    for (const value of Object.values(record)) {
      const candidate = this.extractFallbackTextFromObject(value, depth + 1);
      if (candidate) return candidate;
    }

    return null;
  }

  private normalizeRecoveredText(text: string): string {
    const compact = String(text || "")
      .replace(/\s+/g, " ")
      .trim();
    return compact.slice(0, 500);
  }

  private parseConversationContext(context: unknown): Array<{ role?: string; content?: string }> {
    if (!Array.isArray(context)) return [];
    return context
      .map((entry) => {
        const item = entry as Record<string, unknown>;
        return {
          role: typeof item.role === "string" ? item.role : undefined,
          content: typeof item.content === "string" ? item.content : undefined,
        };
      })
      .filter((entry) => entry.content);
  }

  private async tryRecoverLikelyTextFromContext(remoteJid: string): Promise<string | null> {
    const identity = await resolveWhatsappIdentity(remoteJid);
    const candidates = Array.from(new Set([identity.canonicalPhone, remoteJid, ...identity.aliases].filter(Boolean)));
    if (candidates.length === 0) return null;

    const user = await prisma.whatsappUser.findFirst({
      where: { phone: { in: candidates } },
      select: { conversationContext: true },
    });

    const context = this.parseConversationContext(user?.conversationContext);
    const recentUserPrompts = context
      .filter((entry) => entry.role === "user" && entry.content)
      .map((entry) => String(entry.content || "").trim())
      .filter(Boolean)
      .slice(-5)
      .reverse();

    // Agora usa o classificador evolutivo: qualquer prompt recente que
    // a IA consiga classificar (nutrition, finance, market, fipe, bmr…)
    // é reprocessado, não apenas cotação.
    for (const prompt of recentUserPrompts) {
      try {
        const classification = await classifyIntent(prompt);
        if (classification.intent !== "unknown" && classification.confidence >= 0.5) {
          return prompt;
        }
      } catch {
        // ignora — tenta o próximo
      }
    }

    // Compatibilidade: se nada bateu, ainda tenta detectMarketQuery
    const marketLike = recentUserPrompts.find((prompt) => detectMarketQuery(prompt));
    if (marketLike) return marketLike;

    return null;
  }

  private async buildContextualFallbackReply(remoteJid: string): Promise<string> {
    try {
      const recovered = await this.tryRecoverLikelyTextFromContext(remoteJid);
      if (recovered) {
        // NÃO responde mais com texto fixo de cotação — devolve o texto
        // recuperado para o pipeline reprocessar via processText/IA evolutiva.
        // O caller (scheduleUnreadableFollowUp) já trata `recoveredText`
        // antes de chamar este método, então aqui só caímos no fallback
        // genérico se realmente nada foi recuperado.
        const marketQuery = detectMarketQuery(recovered);
        if (marketQuery) {
          const response = await executeMarketQuery(marketQuery);
          return `Perfeito, vou continuar daqui com base no seu contexto recente:\n\n${response}`;
        }
      }
    } catch (err) {
      logger.warn(`[WPP QR] Não foi possível montar fallback contextual (${remoteJid}): ${String(err)}`);
    }

    return (
      "Recebi sua mensagem mas não consegui ler o conteúdo dessa vez.\n\n" +
      buildUnreadContentFallbackHints()
    );
  }

  private async resolveLidToPhone(session: SessionState, remoteJid: string): Promise<string | null> {
    const mapped = session.lidToJidMap.get(remoteJid);
    if (mapped) {
      return this.normalizeFromJid(mapped);
    }

    // Aguarda um curto intervalo para dar chance do contacts.upsert preencher o mapa.
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const mappedAfterWait = session.lidToJidMap.get(remoteJid);
    if (mappedAfterWait) {
      return this.normalizeFromJid(mappedAfterWait);
    }

    // Fallback: consulta alias persistido no banco (system_settings)
    try {
      const { canonicalPhone } = await resolveWhatsappIdentity(remoteJid);
      if (canonicalPhone && isPlausibleWhatsappPhone(canonicalPhone)) {
        logger.info(`[WPP QR] @lid resolvido via DB alias: ${remoteJid} → ${canonicalPhone}`);
        return canonicalPhone;
      }
    } catch (dbErr) {
      logger.warn(`[WPP QR] Erro ao consultar alias DB para ${remoteJid}: ${String(dbErr)}`);
    }

    return null;
  }

  constructor() {
    // Restaura sessões pareadas após restart do backend.
    setTimeout(() => {
      this.restorePersistedSessions().catch((err) => {
        logger.error("[WPP QR] Erro ao restaurar sessões persistidas", err);
      });
    }, 1500);

    // Garante lições evolutivas mínimas na base.
    ensureBaselineLessons().catch((err: unknown) => {
      logger.warn(`[WPP QR] Falha garantindo baseline de lições: ${String(err)}`);
    });
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
        outboundJidMap: new Map<string, string>(),
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

    const edited = m.protocolMessage?.editedMessage?.message;
    if (edited?.conversation) return String(edited.conversation);
    if (edited?.extendedTextMessage?.text) return String(edited.extendedTextMessage.text);

    if (m.conversation) return String(m.conversation);
    if (m.extendedTextMessage?.text) return String(m.extendedTextMessage.text);
    if (m.imageMessage?.caption) return String(m.imageMessage.caption);
    if (m.videoMessage?.caption) return String(m.videoMessage.caption);
    if (m.documentMessage?.caption) return String(m.documentMessage.caption);
    if (m.buttonsResponseMessage?.selectedDisplayText) return String(m.buttonsResponseMessage.selectedDisplayText);
    if (m.buttonsResponseMessage?.selectedButtonId) return String(m.buttonsResponseMessage.selectedButtonId);
    if (m.listResponseMessage?.title) return String(m.listResponseMessage.title);
    if (m.listResponseMessage?.description) return String(m.listResponseMessage.description);
    if (m.listResponseMessage?.singleSelectReply?.title) return String(m.listResponseMessage.singleSelectReply.title);
    if (m.listResponseMessage?.singleSelectReply?.selectedRowId) return String(m.listResponseMessage.singleSelectReply.selectedRowId);
    if (m.templateButtonReplyMessage?.selectedDisplayText) return String(m.templateButtonReplyMessage.selectedDisplayText);
    if (m.templateButtonReplyMessage?.selectedId) return String(m.templateButtonReplyMessage.selectedId);

    const interactiveText =
      m.interactiveResponseMessage?.body?.text ||
      m.interactiveResponseMessage?.nativeFlowResponseMessage?.name ||
      m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
    if (typeof interactiveText === "string" && this.isLikelyUserText(interactiveText)) {
      return this.normalizeRecoveredText(interactiveText);
    }

    const interactiveParamsJson = m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
    if (typeof interactiveParamsJson === "string") {
      try {
        const parsed = JSON.parse(interactiveParamsJson);
        const parsedCandidate = this.extractFallbackTextFromObject(parsed);
        if (parsedCandidate) return this.normalizeRecoveredText(parsedCandidate);
      } catch {
        // ignora JSON inválido e segue fallback geral
      }
    }

    const fallbackText = this.extractFallbackTextFromObject(m);
    if (fallbackText) return this.normalizeRecoveredText(fallbackText);

    // Alguns payloads trazem texto em camadas fora de "message" (event wrappers / contextInfo).
    const envelopeFallback = this.extractFallbackTextFromObject(msg);
    if (envelopeFallback) return this.normalizeRecoveredText(envelopeFallback);

    return null;
  }

  private async deliverInboundText(
    accountId: number,
    phone: string,
    senderName: string | undefined,
    remoteJid: string,
    messageId: string,
    text: string,
  ): Promise<void> {
    this.inboundBuffer.markFinished(accountId, messageId);
    this.clearUnreadableFollowUpsByRemoteJid(accountId, remoteJid);

    if (this.shouldSkipDuplicateMessageId(accountId, messageId)) {
      logger.info(`[WPP QR] Duplicata notify+append ignorada (id=${messageId})`);
      return;
    }

    await appendUserContextEarly(phone, text);
    logger.info(`[WPP QR] Mensagem recebida em conta ${accountId} de ${phone}: ${text.slice(0, 80)}`);

    const session = this.sessions.get(accountId);
    if (session) {
      this.trackReplyJid(session, phone, remoteJid);
    }

    await processText(phone, senderName, text);
  }

  private async handleInboundGiveUp(
    accountId: number,
    remoteJid: string,
    messageId: string,
    phone: string,
  ): Promise<void> {
    if (this.inboundBuffer.isFinished(accountId, messageId)) return;
    this.inboundBuffer.markFinished(accountId, messageId);

    if (!this.shouldSendUnreadableNotice(remoteJid)) return;

    try {
      const recoveredText = await this.tryRecoverLikelyTextFromContext(remoteJid);
      if (recoveredText) {
        logger.info(`[WPP QR] Contexto recuperado para ${remoteJid}: ${recoveredText.slice(0, 80)}`);
        await learnFromUnreadableRecovery(recoveredText, true);
        await processText(this.normalizeFromJid(remoteJid) || phone, undefined, recoveredText);
        return;
      }

      const session = this.sessions.get(accountId);
      const contextualReply = await this.buildContextualFallbackReply(remoteJid);
      await session?.sock.sendMessage(remoteJid, { text: contextualReply });
    } catch (replyErr) {
      logger.warn(`[WPP QR] Falha ao enviar aviso de mensagem ilegível (${remoteJid}): ${String(replyErr)}`);
    }
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

  private trackReplyJid(session: SessionState, recipientKey: string, remoteJid: string): void {
    if (!recipientKey || !remoteJid) return;
    session.outboundJidMap.set(recipientKey, remoteJid);
    const digits = this.normalizeFromJid(recipientKey);
    if (digits) session.outboundJidMap.set(digits, remoteJid);
    session.outboundJidMap.set(remoteJid, remoteJid);
  }

  private normalizeToJid(phone: string): string {
    if (phone.includes("@")) return phone;

    for (const session of this.sessions.values()) {
      const mapped = session.outboundJidMap.get(phone);
      if (mapped) return mapped;
    }

    const digits = String(phone || "").replace(/\D/g, "");
    if (!digits) return phone;

    if (!isPlausibleWhatsappPhone(digits)) {
      for (const session of this.sessions.values()) {
        const lidJid = `${digits}@lid`;
        const byLid = session.outboundJidMap.get(lidJid);
        if (byLid) return byLid;
      }
      return `${digits}@lid`;
    }

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

    const extractBound = (raw: unknown) => this.extractIncomingText(raw);

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
          if (!messageId) continue;

          if (msg?.key?.fromMe) {
            logger.info(`[WPP QR] msg fromMe ignorada (id=${messageId})`);
            continue;
          }

          const remoteJid = msg?.key?.remoteJid || "";
          const isIndividual = remoteJid.endsWith("@s.whatsapp.net") || remoteJid.endsWith("@lid");
          if (!isIndividual || remoteJid === "status@broadcast") {
            logger.info(`[WPP QR] jid ignorado: ${remoteJid}`);
            continue;
          }

          if (this.inboundBuffer.isFinished(accountId, messageId)) {
            const lateText = extractBound(msg)?.trim();
            if (!lateText) continue;
          }

          let phone: string;
          if (remoteJid.endsWith("@lid")) {
            const resolvedPhone = await this.resolveLidToPhone(session, remoteJid);
            if (resolvedPhone && isPlausibleWhatsappPhone(resolvedPhone)) {
              phone = resolvedPhone;
              await registerWhatsappIdentityAlias(remoteJid, phone);
              logger.info(`[WPP QR] @lid resolvido: ${remoteJid} → ${phone}`);
            } else {
              phone = remoteJid;
              logger.warn(`[WPP QR] @lid sem telefone E.164; usando JID ${remoteJid} para resposta`);
            }
          } else {
            phone = this.normalizeFromJid(remoteJid);
            if (phone && isPlausibleWhatsappPhone(phone)) {
              await registerWhatsappIdentityAlias(remoteJid, phone);
            }
          }
          if (!phone) continue;

          const senderName =
            msg?.pushName ||
            msg?.message?.extendedTextMessage?.contextInfo?.participant ||
            undefined;

          const m = msg?.message?.ephemeralMessage?.message || msg?.message?.viewOnceMessage?.message || msg?.message;
          const audioMsg = m?.audioMessage;
            if (audioMsg) {
              const audioKey = `${accountId}:${messageId}`;
              if (this.recentAudioMessageIds.has(audioKey)) {
                logger.info(`[WPP QR] Áudio duplicado ignorado id=${messageId}`);
                continue;
              }
              this.recentAudioMessageIds.add(audioKey);
              if (this.recentAudioMessageIds.size > 2000) this.recentAudioMessageIds.clear();

              this.inboundBuffer.markFinished(accountId, messageId);
              this.clearUnreadableFollowUpsByRemoteJid(accountId, remoteJid);
              logger.info(`[WPP QR] Áudio recebido em conta ${accountId} de ${phone} — processando...`);
            try {
              const activeSession = this.sessions.get(accountId);
              if (activeSession?.sock) {
                const buffer = await downloadMediaMessage(msg, "buffer", {}, {
                  logger: pino({ level: "silent" }),
                  reuploadRequest: activeSession.sock.updateMediaMessage,
                }) as Buffer;
                const mimeType: string = audioMsg.mimetype || "audio/ogg; codecs=opus";
                await processAudioBuffer(phone, senderName, buffer, mimeType, messageId);
              }
            } catch (audioErr) {
              logger.error(`[WPP QR] Erro ao processar áudio da conta ${accountId}:`, audioErr);
            }
            continue;
          }

          const textImmediate = extractBound(msg)?.trim();
          if (textImmediate) {
            await this.deliverInboundText(accountId, phone, senderName, remoteJid, messageId, textImmediate);
            continue;
          }

          logger.info(
            `[WPP QR] Payload sem texto (aguardando append) conta=${accountId} jid=${remoteJid} id=${messageId} tipo=${ev.type} keys=${Object.keys(msg?.message || {}).join(",")}`,
          );

          this.inboundBuffer.enqueueOrRetry(
            {
              accountId,
              remoteJid,
              messageId,
              rawMsg: msg,
              phone,
              senderName,
            },
            extractBound,
            {
              onTextReady: async (entry, text) => {
                await this.deliverInboundText(
                  entry.accountId,
                  entry.phone,
                  entry.senderName,
                  entry.remoteJid,
                  entry.messageId,
                  text,
                );
              },
              onGiveUp: async (entry) => {
                await this.handleInboundGiveUp(
                  entry.accountId,
                  entry.remoteJid,
                  entry.messageId,
                  entry.phone,
                );
              },
            },
          );
        }
      } catch (err) {
        logger.error(`[WPP QR] Erro ao processar mensagem recebida na conta ${accountId}`, err);
      }
    });

    sock.ev.on("messages.update", async (updates) => {
      try {
        for (const update of updates) {
          const messageId = update.key?.id;
          const remoteJid = update.key?.remoteJid || "";
          if (!messageId || update.key?.fromMe) continue;
          if (!remoteJid.endsWith("@s.whatsapp.net") && !remoteJid.endsWith("@lid")) continue;

          const patchMsg = { key: update.key, message: update.update };
          this.inboundBuffer.retryFromUpdate(accountId, messageId, patchMsg, extractBound, {
            onTextReady: async (entry, text) => {
              const phone =
                entry.phone ||
                this.normalizeFromJid(remoteJid) ||
                (await this.resolveLidToPhone(session, remoteJid)) ||
                "";
              if (!phone) return;
              await this.deliverInboundText(accountId, phone, undefined, remoteJid, messageId, text);
            },
            onGiveUp: async () => {
              /* give-up já tratado no buffer principal */
            },
          });
        }
      } catch (err) {
        logger.warn(`[WPP QR] messages.update erro conta ${accountId}: ${String(err)}`);
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
      outboundJidMap: new Map(),
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
      const jid = this.normalizeToJid(to);

      if (QR_TYPING_ENABLED) {
        const typingMs = computeTypingDurationMs(text);
        try {
          await connected.sock.presenceSubscribe(jid);
        } catch {
          // presença pode falhar em alguns estados; envio segue normalmente
        }

        try {
          await connected.sock.sendPresenceUpdate("composing", jid);
          await new Promise((resolve) => setTimeout(resolve, typingMs));
        } catch {
          // se presença falhar, não interrompe o envio da mensagem
        }
      }

      const textoUtf8 = prepareWhatsAppText(text);
      await connected.sock.sendMessage(jid, { text: textoUtf8 });

      if (QR_TYPING_ENABLED) {
        try {
          await connected.sock.sendPresenceUpdate("paused", jid);
        } catch {
          // ignore
        }
      }

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

  /**
   * Envia uma imagem a partir de um Buffer em memória (PNG/JPEG/WebP).
   * Usa o Baileys que aceita `image: Buffer` diretamente sem precisar de URL
   * pública ou upload prévio. Ideal para silhuetas geradas em runtime.
   */
  async sendImageBufferUsingConnectedSession(to: string, buffer: Buffer, caption?: string): Promise<boolean> {
    const connected = Array.from(this.sessions.values()).find((s) => s.status === "CONNECTED");
    if (!connected) return false;
    /* SANITY CHECK: buffer não vazio para não enviar imagem corrompida */
    if (!buffer || buffer.length === 0) return false;

    try {
      await connected.sock.sendMessage(this.normalizeToJid(to), {
        image: buffer,
        caption,
      });
      return true;
    } catch (err) {
      logger.error("[WPP QR] Erro ao enviar imagem (buffer) por sessão conectada", err);
      return false;
    }
  }

  /**
   * Mantém "digitando..." até chamar a função de parada retornada.
   */
  async startComposingSession(to: string): Promise<() => Promise<void>> {
    const connected = Array.from(this.sessions.values()).find((s) => s.status === "CONNECTED");
    if (!connected || !QR_TYPING_ENABLED) {
      return async () => undefined;
    }

    const jid = this.normalizeToJid(to);
    let active = true;

    const pulse = async () => {
      if (!active) return;
      try {
        await connected.sock.presenceSubscribe(jid);
        await connected.sock.sendPresenceUpdate("composing", jid);
      } catch {
        // presença opcional
      }
    };

    await pulse();
    const intervalRef = setInterval(() => {
      void pulse();
    }, 4000);

    return async () => {
      active = false;
      clearInterval(intervalRef);
      try {
        await connected.sock.sendPresenceUpdate("paused", jid);
      } catch {
        // ignore
      }
    };
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
