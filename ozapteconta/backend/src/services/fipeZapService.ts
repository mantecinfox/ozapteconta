/**
 * fipeZapService.ts
 * Índice FipeZap (imóveis) — Ipeadata → cache em disco (sync mensal).
 */

import path from "path";
import { config } from "../config";
import { logger } from "../utils/logger";
import {
  fetchJsonOnce,
  readDiskJson,
  withInFlight,
} from "./externalData/externalDataClient";
import { formatSourceLabel } from "./macroIndicatorsService";

export type FipeZapScope = "brasil" | "cidade";
export type FipeZapSegment = "venda" | "locacao";

export interface FipeZapQuery {
  scope: FipeZapScope;
  citySlug?: string;
  segment: FipeZapSegment;
  residential: boolean;
}

export interface FipeZapResult {
  success: boolean;
  message: string;
  variationPct?: number;
  indexValue?: number;
  referenceMonth?: string;
  sourceSlug?: string;
  scopeLabel?: string;
}

interface FipeZapDiskEntry {
  referenceMonth: string;
  scope: string;
  citySlug?: string;
  segment: FipeZapSegment;
  variationPct: number;
  indexValue: number;
  sourceSlug: string;
  fetchedAt: string;
}

interface IpeadataValorRow {
  VALDATA: string;
  VALVALOR: number;
}

interface IpeadataValoresResponse {
  value: IpeadataValorRow[];
}

interface CityConfig {
  label: string;
  ipeadataVenda: string;
  ipeadataLocacao?: string;
}

const CITY_MAP: Record<string, CityConfig> = {
  brasil: {
    label: "Brasil",
    ipeadataVenda: "FIPE12_VENBR12",
    ipeadataLocacao: "FIPE12_LOCBR12",
  },
  "sao-paulo": {
    label: "São Paulo",
    ipeadataVenda: "FIPE12_VENSP12",
    ipeadataLocacao: "FIPE12_LOCSP12",
  },
  "rio-de-janeiro": {
    label: "Rio de Janeiro",
    ipeadataVenda: "FIPE12_VENRJ12",
    ipeadataLocacao: "FIPE12_LOCRJ12",
  },
  "belo-horizonte": {
    label: "Belo Horizonte",
    ipeadataVenda: "FIPE12_VENBH12",
  },
  curitiba: {
    label: "Curitiba",
    ipeadataVenda: "FIPE12_VENCWB12",
  },
  "porto-alegre": {
    label: "Porto Alegre",
    ipeadataVenda: "FIPE12_VENPOA12",
  },
};

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function resolveIpeadataCode(query: FipeZapQuery): string {
  const cityKey = query.scope === "brasil" ? "brasil" : (query.citySlug ?? "brasil");
  const city = CITY_MAP[cityKey] ?? CITY_MAP.brasil;
  if (query.segment === "locacao" && city.ipeadataLocacao) {
    return city.ipeadataLocacao;
  }
  return city.ipeadataVenda;
}

function diskCachePath(query: FipeZapQuery): string {
  const cityKey = query.scope === "brasil" ? "brasil" : (query.citySlug ?? "brasil");
  const fileName = `${cityKey}_${query.segment}.json`;
  return path.join(config.externalData.fipeZapDiskCacheDir, fileName);
}

async function fetchFromIpeadata(serieCodigo: string): Promise<FipeZapDiskEntry | null> {
  const base = config.externalData.ipeadataBaseUrl.replace(/\/$/, "");
  const url =
    `${base}/ValoresSerie(SERCODIGO='${encodeURIComponent(serieCodigo)}')` +
    "?$top=2&$orderby=VALDATA%20desc";

  try {
    const payload = await fetchJsonOnce<IpeadataValoresResponse>("ipeadata", url);
    const rows = payload?.value;
    if (!Array.isArray(rows) || rows.length < 2) return null;

    const latest = rows[0];
    const previous = rows[1];
    if (!Number.isFinite(latest.VALVALOR) || !Number.isFinite(previous.VALVALOR)) {
      return null;
    }

    const variationPct =
      previous.VALVALOR === 0
        ? 0
        : ((latest.VALVALOR - previous.VALVALOR) / previous.VALVALOR) * 100;

    const date = new Date(latest.VALDATA);
    const referenceMonth = Number.isNaN(date.getTime())
      ? String(latest.VALDATA).slice(0, 7)
      : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

    return {
      referenceMonth,
      scope: "ipeadata",
      segment: "venda",
      variationPct,
      indexValue: latest.VALVALOR,
      sourceSlug: "ipeadata",
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    logger.warn(`[fipezap] Ipeadata falhou ${serieCodigo}`, err);
    return null;
  }
}

function loadDiskCache(query: FipeZapQuery): FipeZapDiskEntry | null {
  return readDiskJson<FipeZapDiskEntry>(diskCachePath(query));
}

function formatPct(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2).replace(".", ",")}%`;
}

function buildMessage(query: FipeZapQuery, entry: FipeZapDiskEntry, stale = false): string {
  const cityKey = query.scope === "brasil" ? "brasil" : (query.citySlug ?? "brasil");
  const cityLabel = CITY_MAP[cityKey]?.label ?? cityKey;
  const segmentLabel = query.segment === "venda" ? "Venda" : "Locação";
  const staleNote = stale ? "\n⚠️ _Dado em cache — fonte principal indisponível._" : "";

  return (
    `🏠 *FipeZap — ${cityLabel} (${segmentLabel})*\n\n` +
    `📅 Referência: *${entry.referenceMonth}*\n` +
    `📊 Variação mensal: *${formatPct(entry.variationPct)}*\n` +
    `📈 Número-índice: *${entry.indexValue.toFixed(2).replace(".", ",")}*\n\n` +
    `_Fonte: ${formatSourceLabel(entry.sourceSlug)}_${staleNote}\n\n` +
    `_Índice agregado de anúncios — não substitui avaliação de um imóvel específico._`
  );
}

export function detectFipeZapQuery(text: string): FipeZapQuery | null {
  const t = normalizeText(text);
  if (!/\b(fipezap|fipe zap|indice imovel|indice imobiliario|preco imovel|aluguel indice)\b/.test(t)) {
    return null;
  }

  const segment: FipeZapSegment = /\b(aluguel|locacao|locacao)\b/.test(t) ? "locacao" : "venda";

  let citySlug: string | undefined;
  const cityPatterns: Array<[RegExp, string]> = [
    [/sao paulo|\bsp\b/, "sao-paulo"],
    [/rio de janeiro|\brj\b/, "rio-de-janeiro"],
    [/belo horizonte|\bbh\b/, "belo-horizonte"],
    [/curitiba/, "curitiba"],
    [/porto alegre/, "porto-alegre"],
  ];

  for (const [pattern, slug] of cityPatterns) {
    if (pattern.test(t)) {
      citySlug = slug;
      break;
    }
  }

  if (/\b(brasil|nacional)\b/.test(t)) {
    return { scope: "brasil", segment, residential: true };
  }

  if (citySlug) {
    return { scope: "cidade", citySlug, segment, residential: true };
  }

  return { scope: "brasil", segment, residential: true };
}

export function getFipeZapHelp(): string {
  const cities = Object.entries(CITY_MAP)
    .filter(([slug]) => slug !== "brasil")
    .map(([, cfg]) => cfg.label)
    .join(", ");

  return (
    `🏠 *Consulta FipeZap (Imóveis)*\n\n` +
    `Índice de preços de imóveis anunciados. Digite ou fale:\n\n` +
    `• _fipezap_ — Brasil (venda)\n` +
    `• _fipezap sao paulo venda_\n` +
    `• _fipezap rio de janeiro aluguel_\n` +
    `• _fipezap belo horizonte venda_\n` +
    `• _indice imovel brasil_\n` +
    `• _indice imobiliario curitiba_\n` +
    `• _preco imovel sao paulo_ (índice, não avaliação)\n\n` +
    `Cidades: ${cities} e Brasil.\n\n` +
    `Atalhos: _fipezap_ · _modelos_\n\n` +
    `_Plano Completo. Limite: 5 consultas/dia._`
  );
}

export async function queryFipeZap(input: FipeZapQuery): Promise<FipeZapResult> {
  /* SANITY CHECK: segmento válido */
  if (input.segment !== "venda" && input.segment !== "locacao") {
    return { success: false, message: "⚠️ Segmento inválido. Use venda ou locação." };
  }

  const cityKey = input.scope === "brasil" ? "brasil" : (input.citySlug ?? "");
  if (input.scope === "cidade" && !CITY_MAP[cityKey]) {
    const supported = Object.keys(CITY_MAP).join(", ");
    return {
      success: false,
      message:
        `⚠️ Cidade não mapeada.\n\n` +
        `Cidades disponíveis: ${supported.replace(/,/g, ", ")}`,
    };
  }

  const cacheKey = `fipezap_${cityKey}_${input.segment}`;
  return withInFlight(cacheKey, async () => {
    const serieCodigo = resolveIpeadataCode(input);
    let entry = await fetchFromIpeadata(serieCodigo);
    let stale = false;

    if (!entry) {
      entry = loadDiskCache(input);
      stale = Boolean(entry);
    }

    if (!entry) {
      return {
        success: false,
        message:
          "⚠️ FipeZap temporariamente indisponível.\n\n" +
          "Tente novamente mais tarde ou aguarde a atualização mensal do cache.",
      };
    }

    entry.scope = cityKey;
    entry.segment = input.segment;
    if (cityKey !== "brasil") entry.citySlug = cityKey;

    const cityLabel = CITY_MAP[cityKey]?.label ?? "Brasil";
    return {
      success: true,
      message: buildMessage(input, entry, stale),
      variationPct: entry.variationPct,
      indexValue: entry.indexValue,
      referenceMonth: entry.referenceMonth,
      sourceSlug: entry.sourceSlug,
      scopeLabel: cityLabel,
    };
  });
}

export function listSupportedFipeZapCities(): string[] {
  return Object.keys(CITY_MAP);
}
