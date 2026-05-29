/**
 * macroIndicatorsService.ts
 * Indicadores macroeconômicos com cadeia de fallback:
 * BCB SGS → IBGE Agregados v3 → BrasilAPI → Ipeadata → brapi (opcional)
 */

import { config } from "../config";
import { prisma } from "../config/prisma";
import { logger } from "../utils/logger";
import {
  ExternalDataError,
  fetchJsonWithFallback,
  getCachedIndicator,
  type IndicatorPoint,
  type JsonFetchSource,
} from "./externalData/externalDataClient";

export type MacroIndicatorKey =
  | "ipca_mensal"
  | "ipca_12m"
  | "selic"
  | "cdi"
  | "igpm"
  | "ipc_fipe";

interface BcbSgsRow {
  data: string;
  valor: string;
}

interface IbgeAgregadoResponse {
  id: string;
  variavel: string;
  resultados: Array<{
    series: Array<{
      serie: Record<string, string>;
    }>;
  }>;
}

interface BrasilApiTaxa {
  nome: string;
  valor: number;
}

interface IpeadataValorRow {
  VALDATA: string;
  VALVALOR: number;
}

interface IpeadataValoresResponse {
  value: IpeadataValorRow[];
}

interface BrapiInflationRow {
  date: string;
  value: number;
}

interface BrapiInflationResponse {
  inflation?: BrapiInflationRow[];
}

const BCB_SGS = {
  selic: 11,
  ipcaMensal: 433,
  ipca12m: 13522,
  igpm: 189,
  cdi: 4389,
  ipcFipe: 193,
} as const;

const IBGE = {
  agregadoIpca: 1737,
  variavelMensal: 63,
  variavel12m: 2265,
} as const;

const IPEADATA_SERIES: Partial<Record<MacroIndicatorKey, string>> = {
  ipca_mensal: "PRECOS12_IPCA12",
  igpm: "IGP12_IGPM12",
  ipc_fipe: "PRECOS12_IPCFIPE12",
};

function parseBcbLatest(payload: unknown): IndicatorPoint | null {
  const rows = payload as BcbSgsRow[];
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const latest = rows[rows.length - 1];
  const value = parseFloat(latest.valor);
  if (!Number.isFinite(value)) return null;
  return {
    value,
    referenceDate: latest.data,
    sourceSlug: "bcb_sgs",
  };
}

function parseIbgeLatest(payload: unknown, sourceSlug: string): IndicatorPoint | null {
  const rows = payload as IbgeAgregadoResponse[];
  const serie = rows?.[0]?.resultados?.[0]?.series?.[0]?.serie;
  if (!serie || typeof serie !== "object") return null;

  const periods = Object.keys(serie).sort();
  if (periods.length === 0) return null;
  const periodKey = periods[periods.length - 1];
  const value = parseFloat(serie[periodKey]);
  if (!Number.isFinite(value)) return null;

  const year = periodKey.slice(0, 4);
  const month = periodKey.slice(4, 6);
  return {
    value,
    referenceDate: `01/${month}/${year}`,
    sourceSlug,
  };
}

function parseBrasilApiTaxa(payload: unknown, taxName: string): IndicatorPoint | null {
  const rows = payload as BrasilApiTaxa[];
  if (!Array.isArray(rows)) return null;
  const match = rows.find((row) => row.nome?.toLowerCase() === taxName.toLowerCase());
  if (!match || !Number.isFinite(match.valor)) return null;
  return {
    value: match.valor,
    referenceDate: new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    sourceSlug: "brasilapi",
  };
}

function parseIpeadataLatest(payload: unknown): IndicatorPoint | null {
  const body = payload as IpeadataValoresResponse;
  const rows = body?.value;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const latest = rows[0];
  if (!Number.isFinite(latest.VALVALOR)) return null;
  const date = new Date(latest.VALDATA);
  const referenceDate = Number.isNaN(date.getTime())
    ? String(latest.VALDATA)
    : date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return {
    value: latest.VALVALOR,
    referenceDate,
    sourceSlug: "ipeadata",
  };
}

function parseBrapiInflationLatest(payload: unknown): IndicatorPoint | null {
  const body = payload as BrapiInflationResponse;
  const rows = body?.inflation;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const latest = rows[rows.length - 1];
  if (!Number.isFinite(latest.value)) return null;
  return {
    value: latest.value,
    referenceDate: latest.date,
    sourceSlug: "brapi",
  };
}

function buildBcbSource(serie: number): JsonFetchSource<IndicatorPoint> {
  return {
    slug: "bcb_sgs",
    url: `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados/ultimos/1?formato=json`,
    parse: parseBcbLatest,
  };
}

function buildIbgeSource(variavelId: number, slug: string): JsonFetchSource<IndicatorPoint> {
  return {
    slug,
    url:
      `https://servicodados.ibge.gov.br/api/v3/agregados/${IBGE.agregadoIpca}` +
      `/periodos/-3/variaveis/${variavelId}?localidades=N1`,
    parse: (payload) => parseIbgeLatest(payload, slug),
  };
}

function buildBrasilApiSource(taxName: string): JsonFetchSource<IndicatorPoint> {
  return {
    slug: "brasilapi",
    url: "https://brasilapi.com.br/api/taxas/v1",
    parse: (payload) => parseBrasilApiTaxa(payload, taxName),
  };
}

function buildIpeadataSource(serieCodigo: string): JsonFetchSource<IndicatorPoint> {
  const base = config.externalData.ipeadataBaseUrl.replace(/\/$/, "");
  return {
    slug: "ipeadata",
    url:
      `${base}/ValoresSerie(SERCODIGO='${encodeURIComponent(serieCodigo)}')` +
      "?$top=1&$orderby=VALDATA%20desc",
    parse: parseIpeadataLatest,
  };
}

function buildBrapiInflationSource(): JsonFetchSource<IndicatorPoint> | null {
  const token = config.market.brapiToken;
  if (!token) return null;
  return {
    slug: "brapi",
    url: `https://brapi.dev/api/v2/inflation?country=brazil&historical=false&token=${encodeURIComponent(token)}`,
    parse: parseBrapiInflationLatest,
  };
}

async function persistSnapshot(indicatorKey: MacroIndicatorKey, point: IndicatorPoint): Promise<void> {
  try {
    await prisma.macroIndicatorSnapshot.create({
      data: {
        indicatorKey,
        value: point.value,
        referenceDate: point.referenceDate,
        sourceSlug: point.sourceSlug,
      },
    });
  } catch (err) {
    logger.warn(`[macro] falha ao persistir snapshot ${indicatorKey}`, err);
  }
}

async function loadPrismaStale(indicatorKey: MacroIndicatorKey): Promise<IndicatorPoint | null> {
  try {
    const row = await prisma.macroIndicatorSnapshot.findFirst({
      where: { indicatorKey },
      orderBy: { fetchedAt: "desc" },
    });
    if (!row) return null;
    const ageMs = Date.now() - row.fetchedAt.getTime();
    if (ageMs > 24 * 60 * 60 * 1000) return null;
    return {
      value: row.value,
      referenceDate: row.referenceDate,
      sourceSlug: `${row.sourceSlug}_db_stale`,
    };
  } catch (err) {
    logger.warn(`[macro] falha ao ler snapshot ${indicatorKey}`, err);
    return null;
  }
}

async function fetchIndicator(
  indicatorKey: MacroIndicatorKey,
  sources: JsonFetchSource<IndicatorPoint>[],
): Promise<IndicatorPoint> {
  const cacheKey = `indicator_${indicatorKey}`;
  return getCachedIndicator(cacheKey, async () => {
    try {
      const { payload, sourceSlug } = await fetchJsonWithFallback(sources);
      const point = { ...payload, sourceSlug };
      await persistSnapshot(indicatorKey, point);
      return point;
    } catch (err) {
      const stale = await loadPrismaStale(indicatorKey);
      if (stale) {
        logger.warn(`[macro] fallback prisma stale ${indicatorKey}`, err);
        return stale;
      }
      throw err;
    }
  });
}

function sourcesForIndicator(indicatorKey: MacroIndicatorKey): JsonFetchSource<IndicatorPoint>[] {
  const list: JsonFetchSource<IndicatorPoint>[] = [];

  switch (indicatorKey) {
    case "ipca_mensal":
      list.push(buildBcbSource(BCB_SGS.ipcaMensal));
      list.push(buildIbgeSource(IBGE.variavelMensal, "ibge"));
      list.push(buildBrasilApiSource("IPCA"));
      if (IPEADATA_SERIES.ipca_mensal) list.push(buildIpeadataSource(IPEADATA_SERIES.ipca_mensal));
      break;
    case "ipca_12m":
      list.push(buildBcbSource(BCB_SGS.ipca12m));
      list.push(buildIbgeSource(IBGE.variavel12m, "ibge"));
      list.push(buildBrasilApiSource("IPCA"));
      {
        const brapi = buildBrapiInflationSource();
        if (brapi) list.push(brapi);
      }
      break;
    case "selic":
      list.push(buildBcbSource(BCB_SGS.selic));
      list.push(buildBrasilApiSource("Selic"));
      break;
    case "cdi":
      list.push(buildBcbSource(BCB_SGS.cdi));
      list.push(buildBrasilApiSource("CDI"));
      break;
    case "igpm":
      list.push(buildBcbSource(BCB_SGS.igpm));
      if (IPEADATA_SERIES.igpm) list.push(buildIpeadataSource(IPEADATA_SERIES.igpm));
      break;
    case "ipc_fipe":
      list.push(buildBcbSource(BCB_SGS.ipcFipe));
      if (IPEADATA_SERIES.ipc_fipe) list.push(buildIpeadataSource(IPEADATA_SERIES.ipc_fipe));
      break;
    default:
      break;
  }

  return list;
}

export async function getMacroIndicator(indicatorKey: MacroIndicatorKey): Promise<IndicatorPoint> {
  const sources = sourcesForIndicator(indicatorKey);
  if (sources.length === 0) {
    throw new ExternalDataError("PARSE", indicatorKey, "Indicador sem fontes configuradas");
  }
  return fetchIndicator(indicatorKey, sources);
}

export function formatSourceLabel(sourceSlug: string): string {
  const map: Record<string, string> = {
    bcb_sgs: "Banco Central do Brasil",
    ibge: "IBGE",
    brasilapi: "BrasilAPI",
    ipeadata: "Ipeadata",
    brapi: "brapi.dev",
  };
  const base = sourceSlug.replace(/_(stale|db_stale)$/, "");
  return map[base] ?? base;
}

export function getMacroHelp(): string {
  return (
    `📊 *Indicadores Macroeconômicos*\n\n` +
    `Digite ou fale (áudio) qualquer frase abaixo:\n\n` +
    `• _ipca_ — inflação mensal\n` +
    `• _qual a inflação do mês?_\n` +
    `• _ipca 12 meses_ — inflação acumulada\n` +
    `• _inflação acumulada no ano_\n` +
    `• _cdi_ · _cdi hoje_ · _taxa cdi_\n` +
    `• _selic_ · _taxa selic_\n` +
    `• _igp-m_ · _igpm_\n` +
    `• _ipc fipe_ — inflação São Paulo\n\n` +
    `Atalhos: _indicadores_ · _modelos_ (lista completa)\n\n` +
    `_Plano Completo. Fontes oficiais com fallback automático._`
  );
}

/** Compatibilidade: BCB SGS direto para marketDataService legado */
export async function fetchBcbSgsLatest(serie: number): Promise<IndicatorPoint> {
  const { payload } = await fetchJsonWithFallback([buildBcbSource(serie)]);
  return payload;
}
