/**
 * Busca de voos via Apify (Google Flights scraper).
 * Actor padrão: johnvc/google-flights-data-scraper-flight-and-price-search
 */
import { config } from "../config";
import { logger } from "../utils/logger";
import { runApifyActorAndGetItems } from "./apifyClient";

export type FlightTripType = "one_way" | "round_trip";

export type FlightSearchQuery = {
  originCode: string;
  destinationCode: string;
  originLabel: string;
  destinationLabel: string;
  outboundDate: string;
  returnDate?: string;
  tripType: FlightTripType;
  rawQuery: string;
};

export type FlightSearchResult = {
  success: boolean;
  message: string;
};

type ApifyFlightItem = Record<string, unknown>;

/** alias → código aeroporto/metrópole */
export const CITY_LABELS: Record<string, string> = {
  sao: "SAO",
  "sao paulo": "SAO",
  sp: "SAO",
  guarulhos: "GRU",
  gru: "GRU",
  congonhas: "CGH",
  cgh: "CGH",
  campinas: "VCP",
  vcp: "VCP",
  viracopos: "VCP",
  rio: "RIO",
  "rio de janeiro": "RIO",
  rj: "RIO",
  galeao: "GIG",
  gig: "GIG",
  santos: "SDU",
  sdu: "SDU",
  belo: "BHZ",
  bh: "BHZ",
  "belo horizonte": "BHZ",
  confins: "CNF",
  cnf: "CNF",
  plu: "PLU",
  brasilia: "BSB",
  bsb: "BSB",
  salvador: "SSA",
  ssa: "SSA",
  recife: "REC",
  rec: "REC",
  fortaleza: "FOR",
  "porto alegre": "POA",
  poa: "POA",
  curitiba: "CWB",
  cwb: "CWB",
  florianopolis: "FLN",
  fln: "FLN",
  manaus: "MAO",
  mao: "MAO",
  belem: "BEL",
  bel: "BEL",
  goiania: "GYN",
  gyn: "GYN",
  natal: "NAT",
  nat: "NAT",
  maceio: "MCZ",
  mcz: "MCZ",
  vitoria: "VIX",
  vix: "VIX",
  cuiaba: "CGB",
  cgb: "CGB",
  "campo grande": "CGR",
  cgr: "CGR",
  "joao pessoa": "JPA",
  jpa: "JPA",
  aracaju: "AJU",
  aju: "AJU",
  teresina: "THE",
  the: "THE",
  londrina: "LDB",
  ldb: "LDB",
};

const MONTHS_PT: Record<string, number> = {
  janeiro: 1, jan: 1,
  fevereiro: 2, fev: 2,
  marco: 3, mar: 3,
  abril: 4, abr: 4,
  maio: 5, mai: 5,
  junho: 6, jun: 6,
  julho: 7, jul: 7,
  agosto: 8, ago: 8,
  setembro: 9, set: 9,
  outubro: 10, out: 10,
  novembro: 11, nov: 11,
  dezembro: 12, dez: 12,
};

function normalizeText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function formatIsoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return iso;
}

export function defaultOutboundDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return formatIsoDate(date.getFullYear(), date.getMonth() + 1, date.getDate()) || "2026-06-15";
}

export function formatDatePtBr(isoDate: string): string {
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function parseTravelDateFromText(text: string): string | undefined {
  const normalized = normalizeText(text);
  const now = new Date();

  if (/\b(nao sei|nao tenho|tanto faz|qualquer data)\b/.test(normalized)) {
    return defaultOutboundDate();
  }

  if (/\b(hoje|agora)\b/.test(normalized)) {
    return formatIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate()) || undefined;
  }

  if (/\b(amanha)\b/.test(normalized)) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatIsoDate(tomorrow.getFullYear(), tomorrow.getMonth() + 1, tomorrow.getDate()) || undefined;
  }

  if (/\b(semana que vem|proxima semana)\b/.test(normalized)) {
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return formatIsoDate(nextWeek.getFullYear(), nextWeek.getMonth() + 1, nextWeek.getDate()) || undefined;
  }

  if (/\b(final de semana|fim de semana|este fim de semana|proximo fim de semana)\b/.test(normalized)) {
    const nextSaturday = new Date(now);
    const daysUntilSaturday = (6 - nextSaturday.getDay() + 7) % 7 || 7;
    nextSaturday.setDate(nextSaturday.getDate() + daysUntilSaturday);
    return formatIsoDate(nextSaturday.getFullYear(), nextSaturday.getMonth() + 1, nextSaturday.getDate()) || undefined;
  }

  if (/\b(mes que vem|proximo mes)\b/.test(normalized)) {
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 15);
    return formatIsoDate(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 15) || undefined;
  }

  const monthOnly = normalized.match(/\b(em|para|no|na)\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\b/);
  if (monthOnly) {
    const month = MONTHS_PT[monthOnly[2]];
    if (month) {
      let year = now.getFullYear();
      if (month < now.getMonth() + 1) year += 1;
      return formatIsoDate(year, month, 15) || undefined;
    }
  }

  const isoMatch = normalized.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (isoMatch) {
    return formatIsoDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3])) || undefined;
  }

  const brMatch = normalized.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](20\d{2}))?\b/);
  if (brMatch) {
    const day = Number(brMatch[1]);
    const month = Number(brMatch[2]);
    const year = brMatch[3] ? Number(brMatch[3]) : now.getFullYear();
    return formatIsoDate(year, month, day) || undefined;
  }

  const monthNameMatch = normalized.match(/\b(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(20\d{2}))?\b/);
  if (monthNameMatch) {
    const day = Number(monthNameMatch[1]);
    const month = MONTHS_PT[monthNameMatch[2]];
    const year = monthNameMatch[3] ? Number(monthNameMatch[3]) : now.getFullYear();
    if (month) return formatIsoDate(year, month, day) || undefined;
  }

  return undefined;
}

export function resolveAirportCodeFromText(text: string): { code: string; label: string } | null {
  const normalized = normalizeText(text);
  if (!normalized) return null;

  if (/^[a-z]{3,4}$/.test(normalized)) {
    const code = normalized.toUpperCase();
    return { code, label: code };
  }

  const sortedAliases = Object.entries(CITY_LABELS).sort((left, right) => right[0].length - left[0].length);
  for (const [alias, code] of sortedAliases) {
    const pattern = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (pattern.test(normalized)) {
      return { code, label: alias };
    }
  }

  return null;
}

function trimRouteToken(token: string): string {
  return token
    .replace(/\b(dia|em|no|na|data|ida|volta|partida|mes|semana)\b.*/i, "")
    .replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b.*/i, "")
    .trim();
}

function extractRoute(text: string): { origin?: string; destination?: string } {
  const normalized = normalizeText(text);

  const dePara = normalized.match(
    /\b(?:de|saindo de|partindo de)\s+([a-z0-9\s-]{2,40}?)\s+(?:para|ate|a)\s+([a-z0-9\s-]{2,40}?)(?:\s|$|,|\.)/,
  );
  if (dePara) {
    return {
      origin: trimRouteToken(dePara[1].trim()),
      destination: trimRouteToken(dePara[2].trim()),
    };
  }

  const passagem = normalized.match(
    /\b(?:passagem|voo|voos|flight|viajar|viajo)\s+(?:de\s+)?([a-z0-9\s-]{2,40}?)\s+(?:para|ate|a|-)\s+([a-z0-9\s-]{2,40}?)(?:\s|$|,|\.)/,
  );
  if (passagem) {
    return {
      origin: trimRouteToken(passagem[1].trim()),
      destination: trimRouteToken(passagem[2].trim()),
    };
  }

  const cities = Object.keys(CITY_LABELS)
    .sort((left, right) => right.length - left.length)
    .flatMap((alias) => {
      const pattern = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      const match = pattern.exec(normalized);
      return match ? [{ alias, index: match.index ?? 0 }] : [];
    })
    .sort((left, right) => left.index - right.index);

  if (cities.length >= 2) {
    return {
      origin: cities[0].alias,
      destination: cities[1].alias,
    };
  }

  return {};
}

export function detectFlightQuery(text: string): FlightSearchQuery | null {
  const normalized = normalizeText(text);
  if (!normalized || normalized.length < 4) return null;

  const route = extractRoute(text);
  const originResolved = route.origin ? resolveAirportCodeFromText(route.origin) : null;
  const destinationResolved = route.destination ? resolveAirportCodeFromText(route.destination) : null;

  if (!originResolved || !destinationResolved || originResolved.code === destinationResolved.code) {
    return null;
  }

  const outboundDate = parseTravelDateFromText(text) || defaultOutboundDate();
  const returnMatch = parseReturnDate(text, outboundDate);

  return {
    originCode: originResolved.code,
    destinationCode: destinationResolved.code,
    originLabel: originResolved.label,
    destinationLabel: destinationResolved.label,
    outboundDate,
    returnDate: returnMatch,
    tripType: returnMatch ? "round_trip" : "one_way",
    rawQuery: text.trim(),
  };
}

function parseReturnDate(text: string, outboundDate: string): string | undefined {
  const normalized = normalizeText(text);
  if (!/\b(id[ae] e volta|volta|round trip)\b/.test(normalized)) return undefined;

  const returnPart = normalized.split(/\bvolta\b/)[1];
  if (returnPart) {
    const parsed = parseTravelDateFromText(returnPart);
    if (parsed) return parsed;
  }

  const outbound = new Date(`${outboundDate}T12:00:00`);
  outbound.setDate(outbound.getDate() + 7);
  return formatIsoDate(outbound.getFullYear(), outbound.getMonth() + 1, outbound.getDate()) || undefined;
}

function readField(item: ApifyFlightItem, keys: string[]): string {
  for (const key of keys) {
    const value = item[key];
    if (value == null) continue;
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function parsePriceNumber(value: string): number | null {
  const numeric = Number(value.replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(numeric) ? numeric : null;
}

function formatPrice(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "—";
  if (/^R\$/i.test(trimmed)) return trimmed;
  const numeric = parsePriceNumber(trimmed);
  if (numeric == null) return trimmed;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(numeric);
}

function formatFlightItems(items: ApifyFlightItem[], query: FlightSearchQuery): string {
  const routeLabel = `${query.originLabel} → ${query.destinationLabel}`;
  const dateLabel = formatDatePtBr(query.outboundDate);

  if (items.length === 0) {
    return (
      `✈️ *Resultado — ${routeLabel}*\n` +
      `📅 ${dateLabel}\n\n` +
      `Não encontrei voos disponíveis nessa data.\n\n` +
      `*O que você pode fazer:*\n` +
      `• Tentar outra data (_"mês que vem"_, _"15/08"_)\n` +
      `• Mudar o destino (_"praia no nordeste"_)\n` +
      `• Pedir sugestões: _"melhor destino barato saindo de ${query.originLabel}"_`
    );
  }

  const sorted = [...items].sort((left, right) => {
    const leftPrice = parsePriceNumber(readField(left, ["price", "totalPrice", "lowest_price", "amount"]));
    const rightPrice = parsePriceNumber(readField(right, ["price", "totalPrice", "lowest_price", "amount"]));
    if (leftPrice == null) return 1;
    if (rightPrice == null) return -1;
    return leftPrice - rightPrice;
  });

  const top = sorted.slice(0, 5);
  const bestPrice = parsePriceNumber(readField(sorted[0], ["price", "totalPrice", "lowest_price", "amount"]));

  const lines = top.map((item, index) => {
    const airline = readField(item, ["airline", "airlines", "carrier", "company"]) || "Companhia aérea";
    const price = formatPrice(readField(item, ["price", "totalPrice", "lowest_price", "amount"]));
    const departure = readField(item, ["departure_time", "departureTime", "departure", "departure_airport_time"]);
    const arrival = readField(item, ["arrival_time", "arrivalTime", "arrival", "arrival_airport_time"]);
    const duration = readField(item, ["duration", "total_duration", "flight_duration"]);
    const stopsRaw = readField(item, ["stops", "stop_count", "number_of_stops"]);
    const stopsNum = Number(stopsRaw);
    const stopsLabel =
      stopsRaw === "0" || stopsNum === 0
        ? "✈️ Voo direto"
        : stopsRaw
          ? `🔁 ${stopsRaw} escala(s)`
          : "🔁 Consulte escalas";

    const medal = index === 0 ? "🥇 " : index === 1 ? "🥈 " : index === 2 ? "🥉 " : "";

    return (
      `${medal}*Opção ${index + 1}* — ${airline}\n` +
      `   💰 *${price}*` +
      (departure ? `\n   🛫 Saída: ${departure}` : "") +
      (arrival ? `\n   🛬 Chegada: ${arrival}` : "") +
      (duration ? `\n   ⏱ Duração: ${duration}` : "") +
      `\n   ${stopsLabel}`
    );
  });

  const tip =
    bestPrice != null && bestPrice < 400
      ? "\n\n💡 *Dica:* preço bem competitivo para essa rota — vale comparar horários antes de fechar."
      : bestPrice != null && bestPrice > 900
        ? "\n\n💡 *Dica:* tente datas flexíveis (±3 dias) ou voos com escala para economizar."
        : "\n\n💡 *Dica:* voos cedo ou tarde da noite costumam ser mais baratos.";

  return (
    `✈️ *Melhores voos encontrados*\n` +
    `📍 *${routeLabel}*\n` +
    `📅 Ida: *${dateLabel}*` +
    (query.returnDate ? ` · Volta: *${formatDatePtBr(query.returnDate)}*` : "") +
    `\n🇧🇷 Valores aproximados em reais\n\n` +
    lines.join("\n\n") +
    tip +
    `\n\n_Para nova busca, fale naturalmente: "quero ir pra Recife mês que vem" ou "passagem mais barata pro nordeste"._`
  );
}

export async function searchFlights(query: FlightSearchQuery): Promise<FlightSearchResult> {
  if (!config.apify.configured) {
    return {
      success: false,
      message:
        "⚠️ *Busca de voos temporariamente indisponível.*\n\n" +
        "A integração ainda não foi configurada no servidor. Entre em contato com o suporte.",
    };
  }

  const actorInput: Record<string, unknown> = {
    departure_id: query.originCode,
    arrival_id: query.destinationCode,
    outbound_date: query.outboundDate,
    gl: "br",
    hl: "pt",
    currency: "BRL",
    type: query.tripType === "round_trip" ? 1 : 2,
  };

  if (query.returnDate) {
    actorInput.return_date = query.returnDate;
  }

  try {
    const items = await runApifyActorAndGetItems<ApifyFlightItem>(
      config.apify.flightActorId,
      actorInput,
      config.apify.maxResults,
    );

    return {
      success: items.length > 0,
      message: formatFlightItems(items, query),
    };
  } catch (err) {
    logger.error("[flight-search] falha Apify", err);
    return {
      success: false,
      message:
        `⚠️ Não consegui concluir a busca *${query.originLabel} → ${query.destinationLabel}* agora.\n\n` +
        `Pode tentar de novo em instantes ou me dizer:\n` +
        `• outra data (_"semana que vem"_)\n` +
        `• outro destino (_"praia barata"_)\n` +
        `• ou digite *cancelar* para recomeçar`,
    };
  }
}
