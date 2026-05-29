import axios from "axios";
import FormData from "form-data";
import { prisma } from "../config/prisma";
import { logger } from "../utils/logger";
import { prepareWhatsAppText, splitWhatsAppText } from "../utils/whatsappText";
import { whatsappQrPairingService } from "./whatsappQrPairingService";

interface WppConfig {
  accessToken: string;
  phoneNumberId: string;
  apiBase: string;
}

const HUMANIZED_SEND_ENABLED = process.env.WPP_HUMANIZE_ENABLED !== "false";
const HUMANIZED_DELAY_MIN_MS = Number(process.env.WPP_HUMANIZE_MIN_MS ?? 300);
const HUMANIZED_DELAY_MAX_MS = Number(process.env.WPP_HUMANIZE_MAX_MS ?? 2600);

const CRITICAL_FAST_TRACK_REGEX = /(\botp\b|\b2fa\b|\bcodigo\b|\bcódigo\b|\btoken\b|\bsenha\b|\bexpirou\b|\burgente\b|\berro\b|\bfalha\b)/i;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function shouldBypassHumanizedDelay(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return true;
  if (CRITICAL_FAST_TRACK_REGEX.test(normalized)) return true;
  return false;
}

function computeHumanizedDelayMs(text: string): number {
  const normalized = text.trim();
  const length = normalized.length;

  // Delay scales with message size, then receives small jitter to avoid robotic pacing.
  const base = 280 + length * 18;
  const multilineBonus = normalized.includes("\n") ? 160 : 0;
  const punctuationBonus = /[.!?]/.test(normalized) ? 80 : 0;
  const jitter = Math.floor(Math.random() * 241) - 120;

  return clamp(base + multilineBonus + punctuationBonus + jitter, HUMANIZED_DELAY_MIN_MS, HUMANIZED_DELAY_MAX_MS);
}

async function maybeApplyHumanizedDelay(text: string): Promise<void> {
  if (!HUMANIZED_SEND_ENABLED) return;
  if (shouldBypassHumanizedDelay(text)) return;

  const delayMs = computeHumanizedDelayMs(text);
  await sleep(delayMs);
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function trySendDocumentViaQr(
  to: string,
  params: { buffer: Buffer; fileName: string; mimeType: string; caption?: string },
): Promise<boolean> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const sentViaQr = await whatsappQrPairingService.sendDocumentUsingConnectedSession(
      to,
      params.buffer,
      params.fileName,
      params.mimeType,
      params.caption,
    );
    if (sentViaQr) {
      logger.info(`[WhatsApp] Documento enviado por sessão QR pareada para ${to} na tentativa ${attempt}`);
      return true;
    }

    if (attempt < 4) {
      await sleep(2000);
    }
  }

  return false;
}

async function trySendImageViaQr(
  to: string,
  params: { imageUrl: string; caption?: string },
): Promise<boolean> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const sentViaQr = await whatsappQrPairingService.sendImageUsingConnectedSession(
      to,
      params.imageUrl,
      params.caption,
    );
    if (sentViaQr) {
      logger.info(`[WhatsApp] Imagem enviada por sessão QR pareada para ${to} na tentativa ${attempt}`);
      return true;
    }

    if (attempt < 4) {
      await sleep(2000);
    }
  }

  return false;
}

async function trySendImageBufferViaQr(
  to: string,
  params: { buffer: Buffer; caption?: string },
): Promise<boolean> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const sentViaQr = await whatsappQrPairingService.sendImageBufferUsingConnectedSession(
      to,
      params.buffer,
      params.caption,
    );
    if (sentViaQr) {
      logger.info(`[WhatsApp] Imagem (buffer) enviada por sessão QR para ${to} na tentativa ${attempt}`);
      return true;
    }

    if (attempt < 4) {
      await sleep(2000);
    }
  }

  return false;
}

async function getConfig(): Promise<WppConfig | null> {
  const cfg = await prisma.whatsappConfig.findFirst();
  if (!cfg?.accessToken || !cfg?.phoneNumberId || !cfg.enabled) return null;
  return {
    accessToken: cfg.accessToken,
    phoneNumberId: cfg.phoneNumberId,
    apiBase: `https://graph.facebook.com/v19.0`,
  };
}

/** Indicador "digitando..." na sessão QR (Baileys). */
export async function startComposingIndicator(to: string): Promise<() => Promise<void>> {
  return whatsappQrPairingService.startComposingSession(to);
}

async function sendMessageChunk(to: string, textoUtf8: string, cfg: WppConfig | null): Promise<boolean> {
  if (!cfg) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const sentViaQr = await whatsappQrPairingService.sendMessageUsingConnectedSession(to, textoUtf8);
      if (sentViaQr) {
        logger.info(`[WhatsApp] Mensagem enviada por sessão QR pareada para ${to} (tentativa ${attempt})`);
        return true;
      }

      if (attempt < 3) {
        await sleep(1200);
      }
    }

    logger.warn(`[WhatsApp] Sem API oficial ativa e sem sessão QR conectada. Mensagem NÃO enviada para ${to}: ${textoUtf8.substring(0, 60)}`);
    return false;
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await maybeApplyHumanizedDelay(textoUtf8);

      const res = await fetch(`${cfg.apiBase}/${cfg.phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.accessToken}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: to.replace(/\D/g, ""),
          type: "text",
          text: { body: textoUtf8, preview_url: false },
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        logger.info(`[WhatsApp] Mensagem enviada para ${to} (tentativa ${attempt})`);
        return true;
      }

      const err = await res.text();
      logger.error(`[WhatsApp] Falha ao enviar para ${to}: ${res.status} ${err}`);
    } catch (err) {
      logger.error(`[WhatsApp] Erro ao enviar para ${to}:`, err);
    }

    if (attempt < 3) {
      await sleep(1200);
    }
  }

  return false;
}

// ─── Enviar mensagem de texto ─────────────────────────────────────────────────
export async function sendMessage(to: string, text: string): Promise<boolean> {
  const blocos = splitWhatsAppText(text);
  const cfg = await getConfig();
  let allOk = true;

  for (let i = 0; i < blocos.length; i += 1) {
    const ok = await sendMessageChunk(to, blocos[i], cfg);
    if (!ok) allOk = false;
    if (i < blocos.length - 1) {
      await sleep(400);
    }
  }

  return allOk;
}

export async function sendDocument(
  to: string,
  params: { buffer: Buffer; fileName: string; mimeType: string; caption?: string },
): Promise<boolean> {
  const cfg = await getConfig();
  if (!cfg) {
    const sentViaQr = await trySendDocumentViaQr(to, params);
    if (sentViaQr) {
      return true;
    }
    logger.warn(`[WhatsApp] Sem API oficial ativa e sem sessão QR conectada. Documento NÃO enviado para ${to}: ${params.fileName}`);
    return false;
  }

  try {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("file", params.buffer, {
      filename: params.fileName,
      contentType: params.mimeType,
    });

    const uploadResponse = await axios.post(`${cfg.apiBase}/${cfg.phoneNumberId}/media`, form, {
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        ...form.getHeaders(),
      },
      timeout: 30000,
    });

    const mediaId = uploadResponse.data?.id;
    if (!mediaId) {
      throw new Error("Media ID não retornado pela API do WhatsApp");
    }

    const res = await fetch(`${cfg.apiBase}/${cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to.replace(/\D/g, ""),
        type: "document",
        document: {
          id: mediaId,
          caption: params.caption ? prepareWhatsAppText(params.caption) : undefined,
          filename: params.fileName,
        },
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`${res.status} ${err}`);
    }

    logger.info(`[WhatsApp] Documento enviado para ${to}`);
    return true;
  } catch (err) {
    logger.error(`[WhatsApp] Erro ao enviar documento para ${to}:`, err);

    const sentViaQr = await trySendDocumentViaQr(to, params);
    if (sentViaQr) {
      logger.info(`[WhatsApp] Documento enviado via fallback QR para ${to}`);
      return true;
    }

    return false;
  }
}

export async function sendImageByUrl(
  to: string,
  params: { imageUrl: string; caption?: string },
): Promise<boolean> {
  const cfg = await getConfig();
  if (!cfg) {
    const sentViaQr = await trySendImageViaQr(to, params);
    if (sentViaQr) {
      return true;
    }
    logger.warn(`[WhatsApp] Sem API oficial ativa e sem sessão QR conectada. Imagem NÃO enviada para ${to}`);
    return false;
  }

  try {
    const res = await fetch(`${cfg.apiBase}/${cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to.replace(/\D/g, ""),
        type: "image",
        image: {
          link: params.imageUrl,
          caption: params.caption ? prepareWhatsAppText(params.caption) : undefined,
        },
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`${res.status} ${err}`);
    }

    logger.info(`[WhatsApp] Imagem enviada para ${to}`);
    return true;
  } catch (err) {
    logger.error(`[WhatsApp] Erro ao enviar imagem para ${to}:`, err);

    const sentViaQr = await trySendImageViaQr(to, params);
    if (sentViaQr) {
      logger.info(`[WhatsApp] Imagem enviada via fallback QR para ${to}`);
      return true;
    }

    return false;
  }
}

/**
 * Envia uma imagem a partir de um Buffer em memória (PNG/JPEG/WebP).
 * Tenta primeiro a sessão QR conectada (Baileys aceita Buffer direto). Se a
 * API oficial estiver configurada e a sessão QR falhar, faz upload via
 * `/media` da Cloud API e depois envia. Nunca lança — retorna boolean.
 */
export async function sendImageBuffer(
  to: string,
  params: { buffer: Buffer; mimeType?: string; caption?: string; fileName?: string },
): Promise<boolean> {
  /* SANITY CHECK: buffer não vazio */
  if (!params.buffer || params.buffer.length === 0) {
    logger.warn(`[WhatsApp] sendImageBuffer chamado com buffer vazio para ${to}`);
    return false;
  }

  const sentViaQr = await trySendImageBufferViaQr(to, {
    buffer: params.buffer,
    caption: params.caption,
  });
  if (sentViaQr) return true;

  const cfg = await getConfig();
  if (!cfg) {
    logger.warn(`[WhatsApp] sem API oficial e sem sessão QR — imagem (buffer) NÃO enviada para ${to}`);
    return false;
  }

  try {
    const mime = params.mimeType || "image/png";
    const fileName = params.fileName || "image.png";

    const uploadForm = new FormData();
    uploadForm.append("messaging_product", "whatsapp");
    uploadForm.append("type", mime);
    uploadForm.append("file", new Blob([params.buffer], { type: mime }), fileName);

    const uploadRes = await fetch(`${cfg.apiBase}/${cfg.phoneNumberId}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.accessToken}` },
      body: uploadForm,
      signal: AbortSignal.timeout(30000),
    });
    if (!uploadRes.ok) {
      throw new Error(`upload falhou: ${uploadRes.status} ${await uploadRes.text()}`);
    }
    const { id: mediaId } = (await uploadRes.json()) as { id: string };

    const sendRes = await fetch(`${cfg.apiBase}/${cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to.replace(/\D/g, ""),
        type: "image",
        image: {
          id: mediaId,
          caption: params.caption ? prepareWhatsAppText(params.caption) : undefined,
        },
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!sendRes.ok) {
      throw new Error(`send falhou: ${sendRes.status} ${await sendRes.text()}`);
    }
    logger.info(`[WhatsApp] Imagem (buffer) enviada via Cloud API para ${to}`);
    return true;
  } catch (err) {
    logger.error(`[WhatsApp] sendImageBuffer falhou para ${to}:`, err);
    return false;
  }
}

// ─── Baixar mídia (áudio) ─────────────────────────────────────────────────────
export async function downloadMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const cfg = await getConfig();
  if (!cfg) return null;

  try {
    // Passo 1: obter URL da mídia
    const metaRes = await fetch(`${cfg.apiBase}/${mediaId}`, {
      headers: { Authorization: `Bearer ${cfg.accessToken}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!metaRes.ok) {
      logger.error(`[WhatsApp] Falha ao obter URL da mídia ${mediaId}: ${metaRes.status}`);
      return null;
    }

    const meta = (await metaRes.json()) as { url: string; mime_type: string };

    // Passo 2: baixar o arquivo
    const mediaRes = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${cfg.accessToken}` },
      signal: AbortSignal.timeout(30000),
    });

    if (!mediaRes.ok) {
      logger.error(`[WhatsApp] Falha ao baixar mídia ${mediaId}: ${mediaRes.status}`);
      return null;
    }

    const arrayBuffer = await mediaRes.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType: meta.mime_type || "audio/ogg",
    };
  } catch (err) {
    logger.error(`[WhatsApp] Erro ao baixar mídia ${mediaId}:`, err);
    return null;
  }
}

// ─── Formatação ───────────────────────────────────────────────────────────────
export function formatCurrency(value: number | string | { toNumber(): number }): string {
  const num = typeof value === "object" ? value.toNumber() : Number(value);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num);
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "Sem data";
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return String(date);
  }
}
