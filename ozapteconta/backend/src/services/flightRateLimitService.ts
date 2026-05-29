import { prisma } from "../config/prisma";
import { logger } from "../utils/logger";
import type { FlightSearchQuery, FlightSearchResult } from "./flightSearchService";
import { searchFlights } from "./flightSearchService";

const FLIGHT_TIMEZONE = "America/Sao_Paulo";
const FLIGHT_DAILY_LIMIT = 5;
const FLIGHT_MIN_GAP_MS = 15 * 60 * 1000;

export interface FlightRateLimitCheck {
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
    timeZone: FLIGHT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
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

export async function checkFlightSearchAllowed(phone: string): Promise<FlightRateLimitCheck> {
  const userPhone = normalizeClientPhone(phone);
  if (!userPhone) {
    return { allowed: false, message: "⚠️ Não foi possível identificar seu número para a busca de voos." };
  }

  const lastSearch = await prisma.flightSearchLog.findFirst({
    where: { userPhone, success: true },
    orderBy: { searchedAt: "desc" },
    select: { searchedAt: true },
  });

  if (lastSearch) {
    const elapsedMs = Date.now() - lastSearch.searchedAt.getTime();
    if (elapsedMs < FLIGHT_MIN_GAP_MS) {
      const waitMinutes = Math.ceil((FLIGHT_MIN_GAP_MS - elapsedMs) / 60_000);
      return {
        allowed: false,
        message:
          `⏳ *Aguarde antes da próxima busca de voos*\n\n` +
          `O intervalo mínimo é de *15 minutos*.\n` +
          `Tente novamente em cerca de *${formatMinutesPt(waitMinutes)}*.`,
      };
    }
  }

  const { dayStart, dayEnd } = getSaoPauloDayBounds();
  const searchesToday = await prisma.flightSearchLog.count({
    where: {
      userPhone,
      success: true,
      searchedAt: { gte: dayStart, lte: dayEnd },
    },
  });

  if (searchesToday >= FLIGHT_DAILY_LIMIT) {
    return {
      allowed: false,
      message:
        `🚫 *Limite diário de buscas de voos*\n\n` +
        `Você já usou as *${FLIGHT_DAILY_LIMIT} consultas* permitidas hoje.\n` +
        `O limite renova à meia-noite (horário de Brasília).`,
    };
  }

  return { allowed: true, message: "" };
}

export async function recordFlightSearch(
  phone: string,
  query: FlightSearchQuery,
  resultCount: number,
): Promise<void> {
  const userPhone = normalizeClientPhone(phone);
  if (!userPhone) return;

  try {
    await prisma.flightSearchLog.create({
      data: {
        userPhone,
        originCode: query.originCode,
        destinationCode: query.destinationCode,
        outboundDate: query.outboundDate,
        rawQuery: query.rawQuery.slice(0, 300),
        success: true,
        resultCount,
      },
    });
  } catch (err) {
    logger.warn("[flight-rate] falha ao registrar busca", err);
  }
}

export async function runFlightSearchWithRateLimit(
  phone: string,
  query: FlightSearchQuery,
): Promise<FlightSearchResult> {
  const limitCheck = await checkFlightSearchAllowed(phone);
  if (!limitCheck.allowed) {
    return { success: false, message: limitCheck.message };
  }

  const flightResult = await searchFlights(query);
  if (flightResult.success) {
    const resultCountMatch = flightResult.message.match(/\*(\d+)\./g);
    const resultCount = resultCountMatch ? resultCountMatch.length : 1;
    await recordFlightSearch(phone, query, resultCount);
  }

  return flightResult;
}
