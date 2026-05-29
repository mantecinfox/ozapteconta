/**
 * Limites de consulta FIPE por cliente (telefone WhatsApp):
 * - Carros: no máximo 3 buscas por dia (calendário de Brasília)
 * - Qualquer tipo: intervalo mínimo de 10 minutos entre buscas
 */
import { prisma } from "../config/prisma";
import { logger } from "../utils/logger";
import type { FipeQueryResult, FipeVehicleType } from "./fipeService";
import { queryFipe } from "./fipeService";

const FIPE_TIMEZONE = "America/Sao_Paulo";
const FIPE_CARS_DAILY_LIMIT = 3;
const FIPE_MIN_GAP_MS = 10 * 60 * 1000;

export interface FipeRateLimitCheck {
  allowed: boolean;
  message: string;
}

function normalizeClientPhone(phone: string): string {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits || digits.length < 10) return "";
  return digits.slice(-13);
}

/** Limites do dia atual em America/Sao_Paulo (UTC-3 fixo — sem horário de verão). */
function getSaoPauloDayBounds(): { dayStart: Date; dayEnd: Date } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: FIPE_TIMEZONE,
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

function formatMinutesPt(minutes: number): string {
  if (minutes <= 1) return "1 minuto";
  return `${minutes} minutos`;
}

/**
 * Verifica se o cliente pode iniciar uma nova consulta FIPE.
 * Não grava no banco — chamar recordFipeSearch após sucesso.
 */
export async function checkFipeSearchAllowed(
  phone: string,
  vehicleType: FipeVehicleType,
): Promise<FipeRateLimitCheck> {
  const userPhone = normalizeClientPhone(phone);
  if (!userPhone) {
    return { allowed: false, message: "⚠️ Não foi possível identificar seu número para a consulta FIPE." };
  }

  const lastSearch = await prisma.fipeClientSearchLog.findFirst({
    where: { userPhone, success: true },
    orderBy: { searchedAt: "desc" },
    select: { searchedAt: true },
  });

  if (lastSearch) {
    const elapsedMs = Date.now() - lastSearch.searchedAt.getTime();
    if (elapsedMs < FIPE_MIN_GAP_MS) {
      const waitMinutes = Math.ceil((FIPE_MIN_GAP_MS - elapsedMs) / 60_000);
      return {
        allowed: false,
        message:
          `⏳ *Aguarde antes da próxima consulta FIPE*\n\n` +
          `O intervalo mínimo entre buscas é de *10 minutos*.\n` +
          `Tente novamente em cerca de *${formatMinutesPt(waitMinutes)}*.`,
      };
    }
  }

  if (vehicleType === "cars") {
    const { dayStart, dayEnd } = getSaoPauloDayBounds();
    const carsToday = await prisma.fipeClientSearchLog.count({
      where: {
        userPhone,
        vehicleType: "cars",
        success: true,
        searchedAt: { gte: dayStart, lte: dayEnd },
      },
    });

    if (carsToday >= FIPE_CARS_DAILY_LIMIT) {
      return {
        allowed: false,
        message:
          `🚫 *Limite diário de consultas FIPE (carros)*\n\n` +
          `Você já utilizou as *${FIPE_CARS_DAILY_LIMIT} buscas de carro* permitidas hoje.\n` +
          `O limite é renovado à meia-noite (horário de Brasília).\n\n` +
          `_Dica: motos e caminhões têm consulta separada, se precisar._`,
      };
    }
  }

  return { allowed: true, message: "" };
}

/** Registra consulta FIPE concluída com sucesso (conta no limite diário / intervalo). */
export async function recordFipeSearch(
  phone: string,
  vehicleType: FipeVehicleType,
  rawQuery: string,
): Promise<void> {
  const userPhone = normalizeClientPhone(phone);
  if (!userPhone) return;

  const querySnippet = String(rawQuery || "").trim().slice(0, 200);
  try {
    await prisma.fipeClientSearchLog.create({
      data: {
        userPhone,
        vehicleType,
        rawQuery: querySnippet || "-",
        success: true,
      },
    });
  } catch (err) {
    logger.warn("[fipe-rate] falha ao registrar busca", err);
  }
}

/** Consulta FIPE com verificação de limites e registro após sucesso. */
export async function runFipeQueryWithRateLimit(
  phone: string,
  rawQuery: string,
  vehicleType: FipeVehicleType,
): Promise<FipeQueryResult> {
  const limitCheck = await checkFipeSearchAllowed(phone, vehicleType);
  if (!limitCheck.allowed) {
    return { success: false, message: limitCheck.message };
  }

  const fipeResult = await queryFipe(phone, rawQuery, vehicleType);
  if (fipeResult.success) {
    await recordFipeSearch(phone, vehicleType, rawQuery);
  }
  return fipeResult;
}

/** Consultas de carro restantes hoje (útil para mensagens futuras). */
export async function getFipeCarsRemainingToday(phone: string): Promise<number> {
  const userPhone = normalizeClientPhone(phone);
  if (!userPhone) return 0;

  const { dayStart, dayEnd } = getSaoPauloDayBounds();
  const used = await prisma.fipeClientSearchLog.count({
    where: {
      userPhone,
      vehicleType: "cars",
      success: true,
      searchedAt: { gte: dayStart, lte: dayEnd },
    },
  });
  return Math.max(0, FIPE_CARS_DAILY_LIMIT - used);
}
