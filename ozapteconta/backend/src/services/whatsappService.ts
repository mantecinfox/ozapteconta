import axios from "axios";
import FormData from "form-data";
import { prisma } from "../config/prisma";
import { logger } from "../utils/logger";
import { prepareWhatsAppText } from "../utils/whatsappText";
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

async function getConfig(): Promise<WppConfig | null> {
  const cfg = await prisma.whatsappConfig.findFirst();
  if (!cfg?.accessToken || !cfg?.phoneNumberId || !cfg.enabled) return null;
  return {
    accessToken: cfg.accessToken,
    phoneNumberId: cfg.phoneNumberId,
    apiBase: `https://graph.facebook.com/v19.0`,
  };
}

// ─── Enviar mensagem de texto ─────────────────────────────────────────────────
export async function sendMessage(to: string, text: string): Promise<boolean> {
  const textoUtf8 = prepareWhatsAppText(text);
  const cfg = await getConfig();
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
