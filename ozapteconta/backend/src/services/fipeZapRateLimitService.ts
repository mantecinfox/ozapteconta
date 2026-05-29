/**
 * Rate limit FipeZap — máx. 5 consultas/dia por telefone (Brasília).
 */
import { prisma } from "../config/prisma";
import { logger } from "../utils/logger";
import type { FipeZapQuery, FipeZapResult } from "./fipeZapService";
import { queryFipeZap } from "./fipeZapService";

const FIPEZAP_TIMEZONE = "America/Sao_Paulo";
const FIPEZAP_DAILY_LIMIT = 5;

export interface FipeZapRateLimitCheck {
  allowed: boolean;
  message: string;
}

function normalizeClientPhone(phone: string): string {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits || digits.length < 10) return "";
  return digits.slice(-13);
}

function getSaoPauloDayBounds(): { dayStart: Date; dayEnd: Date } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: FIPEZAP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  const dayKey = `${year}-${month}-${day}`;

  return {
    dayStart: new Date(`${dayKey}T00:00:00-03:00`),
    dayEnd: new Date(`${dayKey}T23:59:59.999-03:00`),
  };
}

export async function checkFipeZapSearchAllowed(phone: string): Promise<FipeZapRateLimitCheck> {
  const userPhone = normalizeClientPhone(phone);
  if (!userPhone) {
    return { allowed: false, message: "⚠️ Não foi possível identificar seu número para a consulta FipeZap." };
  }

  const { dayStart, dayEnd } = getSaoPauloDayBounds();
  const usedToday = await prisma.fipeZapSearchLog.count({
    where: {
      userPhone,
      success: true,
      searchedAt: { gte: dayStart, lte: dayEnd },
    },
  });

  if (usedToday >= FIPEZAP_DAILY_LIMIT) {
    return {
      allowed: false,
      message:
        `🚫 *Limite diário FipeZap*\n\n` +
        `Você já utilizou as *${FIPEZAP_DAILY_LIMIT} consultas* permitidas hoje.\n` +
        `O limite renova à meia-noite (horário de Brasília).`,
    };
  }

  return { allowed: true, message: "" };
}

async function recordFipeZapSearch(
  phone: string,
  rawQuery: string,
  scope: string,
): Promise<void> {
  const userPhone = normalizeClientPhone(phone);
  if (!userPhone) return;

  try {
    await prisma.fipeZapSearchLog.create({
      data: {
        userPhone,
        rawQuery: String(rawQuery || "").trim().slice(0, 200) || "-",
        scope: scope.slice(0, 32),
        success: true,
      },
    });
  } catch (err) {
    logger.warn("[fipezap-rate] falha ao registrar busca", err);
  }
}

export async function runFipeZapQueryWithRateLimit(
  phone: string,
  rawQuery: string,
  fipeZapQuery: FipeZapQuery,
): Promise<FipeZapResult> {
  const limitCheck = await checkFipeZapSearchAllowed(phone);
  if (!limitCheck.allowed) {
    return { success: false, message: limitCheck.message };
  }

  const fipeZapResult = await queryFipeZap(fipeZapQuery);
  if (fipeZapResult.success) {
    const scopeKey = fipeZapQuery.scope === "brasil"
      ? "brasil"
      : (fipeZapQuery.citySlug ?? "cidade");
    await recordFipeZapSearch(phone, rawQuery, scopeKey);
  }
  return fipeZapResult;
}
