/**
 * marketDataService.ts
 * Integração com APIs de mercado financeiro brasileiro e internacional.
 *
 * Fontes:
 *  - BCB SGS  : Selic, IPCA, IGP-M, câmbio USD/BRL (sem chave)
 *  - brapi    : Ações B3, FIIs, índices, BDRs, cripto (opcional: BRAPI_TOKEN)
 *  - Mercado Bitcoin: BTC, ETH, LTC em BRL (sem chave)
 *  - Alpha Vantage : Ações globais, Forex (opcional: ALPHA_VANTAGE_KEY)
 */

import { config } from "../config";
import { logger } from "../utils/logger";

// ─── Cache simples em memória ─────────────────────────────────────────────────
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function cacheGet<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function cacheSet<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

const TTL_SHORT = 5 * 60 * 1000;   // 5 min — cotações em tempo real
const TTL_LONG  = 60 * 60 * 1000;  // 60 min — indicadores (Selic, IPCA)

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function fetchJSON<T = unknown>(url: string, headers?: Record<string, string>): Promise<T> {
  const res = await fetch(url, {
    headers: { "Accept": "application/json", ...headers },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.json() as Promise<T>;
}

function fmt(value: number, decimals = 2): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtPct(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${fmt(value)}%`;
}

// ─── BCB SGS ──────────────────────────────────────────────────────────────────
// https://api.bcb.gov.br/dados/serie/bcdata.sgs.{serie}/dados/ultimos/1?formato=json
// Séries: 11 = Selic meta, 433 = IPCA mensal, 189 = IGP-M mensal,
//         10813 = USD/BRL compra (diário), 3698 = EUR/BRL

interface BcbSgsEntry {
  data: string;   // "dd/MM/yyyy"
  valor: string;  // "5.25"
}

async function bcbSgs(serie: number): Promise<{ value: number; date: string }> {
  const cacheKey = `bcb_${serie}`;
  const cached = cacheGet<{ value: number; date: string }>(cacheKey);
  if (cached) return cached;

  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados/ultimos/1?formato=json`;
  const data = await fetchJSON<BcbSgsEntry[]>(url);
  if (!data.length) throw new Error(`BCB SGS série ${serie}: sem dados`);

  const result = { value: parseFloat(data[0].valor), date: data[0].data };
  cacheSet(cacheKey, result, TTL_LONG);
  return result;
}

// ─── BCB Câmbio ───────────────────────────────────────────────────────────────
interface BcbCambioEntry {
  cotacaoCompra: number;
  cotacaoVenda: number;
  dataHoraCotacao: string;
}
interface BcbCambioResponse {
  value: BcbCambioEntry[];
}

async function bcbDollar(): Promise<{ buy: number; sell: number; date: string }> {
  const cacheKey = "bcb_dollar";
  const cached = cacheGet<{ buy: number; sell: number; date: string }>(cacheKey);
  if (cached) return cached;

  // Tenta últimas 5 datas úteis para pegar o mais recente
  const url =
    "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?" +
    `@dataCotacao='${getTodayStr()}'&$top=1&$orderby=dataHoraCotacao%20desc&$format=json&$select=cotacaoCompra,cotacaoVenda,dataHoraCotacao`;

  try {
    const data = await fetchJSON<BcbCambioResponse>(url);
    if (data.value && data.value.length > 0) {
      const entry = data.value[0];
      const result = {
        buy: entry.cotacaoCompra,
        sell: entry.cotacaoVenda,
        date: entry.dataHoraCotacao,
      };
      cacheSet(cacheKey, result, TTL_SHORT);
      return result;
    }
  } catch (e) {
    logger.warn("[market] BCB PTAX falhou, tentando SGS 10813", e);
  }

  // Fallback: BCB SGS série 10813 (USD/BRL compra)
  const sgs = await bcbSgs(10813);
  const result = { buy: sgs.value, sell: sgs.value, date: sgs.date };
  cacheSet(cacheKey, result, TTL_SHORT);
  return result;
}

function getTodayStr(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}-${dd}-${yyyy}`; // MM-DD-YYYY required by BCB PTAX
}

// ─── brapi ────────────────────────────────────────────────────────────────────
interface BrapiQuote {
  symbol: string;
  shortName: string;
  longName?: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketPreviousClose: number;
  regularMarketOpen: number;
  regularMarketDayHigh: number;
  regularMarketDayLow: number;
  currency: string;
  marketState: string;
}

interface BrapiResponse {
  results: BrapiQuote[];
}

async function brapiQuote(ticker: string): Promise<BrapiQuote> {
  const sym = ticker.toUpperCase();
  const cacheKey = `brapi_${sym}`;
  const cached = cacheGet<BrapiQuote>(cacheKey);
  if (cached) return cached;

  const token = config.market.brapiToken;
  const tokenParam = token ? `&token=${token}` : "";
  const url = `https://brapi.dev/api/quote/${sym}?range=1d&interval=1d${tokenParam}`;

  const data = await fetchJSON<BrapiResponse>(url);
  if (!data.results || !data.results.length) throw new Error(`brapi: nenhum resultado para ${sym}`);

  const result = data.results[0];
  cacheSet(cacheKey, result, TTL_SHORT);
  return result;
}

// ─── Mercado Bitcoin ──────────────────────────────────────────────────────────
interface MbTicker {
  high: string;
  low: string;
  vol: string;
  last: string;
  buy: string;
  sell: string;
  date: number;
}
interface MbTickerResponse {
  ticker: MbTicker;
}

async function mercadoBitcoinTicker(coin: "BTC" | "ETH" | "LTC" | "XRP" | "SOL" | "ADA" | string): Promise<{ last: number; buy: number; sell: number; high: number; low: number }> {
  const cacheKey = `mb_${coin}`;
  const cached = cacheGet<{ last: number; buy: number; sell: number; high: number; low: number }>(cacheKey);
  if (cached) return cached;

  const url = `https://www.mercadobitcoin.net/api/${coin}/ticker/`;
  const data = await fetchJSON<MbTickerResponse>(url);
  const t = data.ticker;
  const result = {
    last: parseFloat(t.last),
    buy: parseFloat(t.buy),
    sell: parseFloat(t.sell),
    high: parseFloat(t.high),
    low: parseFloat(t.low),
  };
  cacheSet(cacheKey, result, TTL_SHORT);
  return result;
}

// ─── Alpha Vantage (global) ───────────────────────────────────────────────────
interface AlphaGlobalQuote {
  "Global Quote": {
    "01. symbol": string;
    "02. open": string;
    "03. high": string;
    "04. low": string;
    "05. price": string;
    "09. change": string;
    "10. change percent": string;
  };
}

async function alphaVantageQuote(symbol: string): Promise<{ price: number; change: number; changePct: number } | null> {
  const key = config.market.alphaVantageKey;
  if (!key) return null;

  const cacheKey = `av_${symbol.toUpperCase()}`;
  const cached = cacheGet<{ price: number; change: number; changePct: number }>(cacheKey);
  if (cached) return cached;

  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${key}`;
  const data = await fetchJSON<AlphaGlobalQuote>(url);
  const gq = data["Global Quote"];
  if (!gq || !gq["05. price"]) return null;

  const result = {
    price: parseFloat(gq["05. price"]),
    change: parseFloat(gq["09. change"]),
    changePct: parseFloat(gq["10. change percent"].replace("%", "")),
  };
  cacheSet(cacheKey, result, TTL_SHORT);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  FUNÇÕES PÚBLICAS
// ═══════════════════════════════════════════════════════════════════════════════

/** Cotação do Dólar (USD/BRL) */
export async function getDollar(): Promise<string> {
  try {
    const d = await bcbDollar();
    const dateStr = new Date(d.date).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
    return (
      `💵 *Dólar Americano (USD/BRL)*\n` +
      `Compra: R$ ${fmt(d.buy, 4)}\n` +
      `Venda: R$ ${fmt(d.sell, 4)}\n` +
      `🕐 Atualizado: ${dateStr}\n` +
      `_Fonte: Banco Central do Brasil_`
    );
  } catch (e) {
    logger.error("[market] getDollar error", e);
    return "⚠️ Não foi possível obter a cotação do dólar agora. Tente novamente em instantes.";
  }
}

/** Euro (EUR/BRL) via BCB SGS série 21619 */
export async function getEuro(): Promise<string> {
  try {
    const e = await bcbSgs(21619);
    return (
      `💶 *Euro (EUR/BRL)*\n` +
      `Cotação: R$ ${fmt(e.value, 4)}\n` +
      `📅 Data: ${e.date}\n` +
      `_Fonte: Banco Central do Brasil_`
    );
  } catch (err) {
    logger.error("[market] getEuro error", err);
    return "⚠️ Não foi possível obter a cotação do euro agora.";
  }
}

/** Taxa Selic vigente */
export async function getSelic(): Promise<string> {
  try {
    const s = await bcbSgs(11);
    return (
      `📊 *Taxa Selic (Meta)*\n` +
      `Valor: *${fmt(s.value, 2)}% ao ano*\n` +
      `📅 Data: ${s.date}\n` +
      `_Fonte: Banco Central do Brasil_`
    );
  } catch (e) {
    logger.error("[market] getSelic error", e);
    return "⚠️ Não foi possível obter a taxa Selic agora.";
  }
}

/** IPCA mensal mais recente */
export async function getIPCA(): Promise<string> {
  try {
    const i = await bcbSgs(433);
    return (
      `📈 *IPCA (Inflação Mensal)*\n` +
      `Valor: *${fmt(i.value, 2)}% no mês*\n` +
      `📅 Data: ${i.date}\n` +
      `_Fonte: Banco Central do Brasil_`
    );
  } catch (e) {
    logger.error("[market] getIPCA error", e);
    return "⚠️ Não foi possível obter o IPCA agora.";
  }
}

/** IGP-M mensal */
export async function getIGPM(): Promise<string> {
  try {
    const g = await bcbSgs(189);
    return (
      `📉 *IGP-M (Inflação Mensal)*\n` +
      `Valor: *${fmt(g.value, 2)}% no mês*\n` +
      `📅 Data: ${g.date}\n` +
      `_Fonte: Banco Central do Brasil_`
    );
  } catch (e) {
    logger.error("[market] getIGPM error", e);
    return "⚠️ Não foi possível obter o IGP-M agora.";
  }
}

/** Bitcoin em BRL (Mercado Bitcoin) */
export async function getBitcoin(): Promise<string> {
  try {
    const b = await mercadoBitcoinTicker("BTC");
    return (
      `₿ *Bitcoin (BTC/BRL)*\n` +
      `Último: R$ ${fmt(b.last, 2)}\n` +
      `Compra: R$ ${fmt(b.buy, 2)}\n` +
      `Venda:  R$ ${fmt(b.sell, 2)}\n` +
      `Máx/Mín hoje: R$ ${fmt(b.high, 2)} / R$ ${fmt(b.low, 2)}\n` +
      `_Fonte: Mercado Bitcoin_`
    );
  } catch (e) {
    logger.error("[market] getBitcoin error", e);
    return "⚠️ Não foi possível obter a cotação do Bitcoin agora.";
  }
}

/** Ethereum em BRL */
export async function getEthereum(): Promise<string> {
  try {
    const e = await mercadoBitcoinTicker("ETH");
    return (
      `🔷 *Ethereum (ETH/BRL)*\n` +
      `Último: R$ ${fmt(e.last, 2)}\n` +
      `Compra: R$ ${fmt(e.buy, 2)}\n` +
      `Venda:  R$ ${fmt(e.sell, 2)}\n` +
      `Máx/Mín hoje: R$ ${fmt(e.high, 2)} / R$ ${fmt(e.low, 2)}\n` +
      `_Fonte: Mercado Bitcoin_`
    );
  } catch (err) {
    logger.error("[market] getEthereum error", err);
    return "⚠️ Não foi possível obter a cotação do Ethereum agora.";
  }
}

/** Cotação de cripto genérica em BRL (ex: SOL, LTC, XRP, ADA) */
export async function getCrypto(coin: string): Promise<string> {
  const sym = coin.toUpperCase();
  const labels: Record<string, string> = {
    BTC: "Bitcoin", ETH: "Ethereum", LTC: "Litecoin", XRP: "Ripple",
    SOL: "Solana", ADA: "Cardano", BNB: "BNB",
  };
  const label = labels[sym] || sym;

  try {
    const c = await mercadoBitcoinTicker(sym);
    return (
      `🪙 *${label} (${sym}/BRL)*\n` +
      `Último: R$ ${fmt(c.last, 2)}\n` +
      `Compra: R$ ${fmt(c.buy, 2)} | Venda: R$ ${fmt(c.sell, 2)}\n` +
      `Máx/Mín hoje: R$ ${fmt(c.high, 2)} / R$ ${fmt(c.low, 2)}\n` +
      `_Fonte: Mercado Bitcoin_`
    );
  } catch (e) {
    logger.error(`[market] getCrypto(${sym}) error`, e);
    return `⚠️ Não foi possível obter a cotação de ${label} agora.`;
  }
}

/** Cotação de ação B3 via brapi (ex: PETR4, VALE3, ITUB4) */
export async function getStockB3(ticker: string): Promise<string> {
  const sym = ticker.toUpperCase().replace(/[^A-Z0-9]/g, "");

  try {
    const q = await brapiQuote(sym);
    const pct = fmtPct(q.regularMarketChangePercent);
    const changeIcon = q.regularMarketChangePercent >= 0 ? "📈" : "📉";
    const name = q.longName || q.shortName || sym;

    return (
      `${changeIcon} *${sym} — ${name}*\n` +
      `Preço: R$ ${fmt(q.regularMarketPrice, 2)}\n` +
      `Variação: ${fmtPct(q.regularMarketChange)} (${pct})\n` +
      `Abertura: R$ ${fmt(q.regularMarketOpen, 2)}\n` +
      `Máx/Mín: R$ ${fmt(q.regularMarketDayHigh, 2)} / R$ ${fmt(q.regularMarketDayLow, 2)}\n` +
      `Fechamento ant.: R$ ${fmt(q.regularMarketPreviousClose, 2)}\n` +
      `_Fonte: brapi.dev (B3)_`
    );
  } catch (e) {
    logger.error(`[market] getStockB3(${sym}) error`, e);
    // Fallback Alpha Vantage para ação brasileira no formato TICKER.SA
    try {
      const av = await alphaVantageQuote(`${sym}.SAO`);
      if (av) {
        const changeIcon = av.changePct >= 0 ? "📈" : "📉";
        return (
          `${changeIcon} *${sym}*\n` +
          `Preço: R$ ${fmt(av.price, 2)}\n` +
          `Variação: ${fmtPct(av.changePct)}\n` +
          `_Fonte: Alpha Vantage_`
        );
      }
    } catch {}
    return `⚠️ Não foi possível obter a cotação de *${sym}*. Verifique se o ticker está correto.`;
  }
}

/** Cotação de ação global (NYSE/NASDAQ) via Alpha Vantage */
export async function getGlobalStock(symbol: string): Promise<string> {
  const sym = symbol.toUpperCase();
  try {
    const av = await alphaVantageQuote(sym);
    if (!av) return `⚠️ Alpha Vantage não configurado. Defina a variável *ALPHA_VANTAGE_KEY* no servidor.`;

    const changeIcon = av.changePct >= 0 ? "📈" : "📉";
    return (
      `${changeIcon} *${sym} (Global)*\n` +
      `Preço: $${fmt(av.price, 2)}\n` +
      `Variação: ${fmtPct(av.changePct)}\n` +
      `_Fonte: Alpha Vantage_`
    );
  } catch (e) {
    logger.error(`[market] getGlobalStock(${sym}) error`, e);
    return `⚠️ Não foi possível obter a cotação de *${sym}* agora.`;
  }
}

/** IBOVESPA via brapi */
export async function getIbovespa(): Promise<string> {
  try {
    const q = await brapiQuote("^BVSP");
    const pct = fmtPct(q.regularMarketChangePercent);
    const changeIcon = q.regularMarketChangePercent >= 0 ? "📈" : "📉";
    return (
      `${changeIcon} *IBOVESPA*\n` +
      `Pontos: ${fmt(q.regularMarketPrice, 0)}\n` +
      `Variação: ${fmtPct(q.regularMarketChange)} (${pct})\n` +
      `Máx/Mín: ${fmt(q.regularMarketDayHigh, 0)} / ${fmt(q.regularMarketDayLow, 0)}\n` +
      `_Fonte: brapi.dev_`
    );
  } catch (e) {
    logger.error("[market] getIbovespa error", e);
    return "⚠️ Não foi possível obter o IBOVESPA agora.";
  }
}

/** Resumo completo do mercado: Dólar + Bitcoin + IBOVESPA + Selic */
export async function getMarketSummary(): Promise<string> {
  const results = await Promise.allSettled([
    bcbDollar(),
    mercadoBitcoinTicker("BTC"),
    brapiQuote("^BVSP"),
    bcbSgs(11),
  ]);

  const lines: string[] = ["🌐 *Resumo do Mercado Financeiro*\n"];

  // Dólar
  if (results[0].status === "fulfilled") {
    const d = results[0].value;
    lines.push(`💵 *Dólar:* R$ ${fmt(d.sell, 4)}`);
  } else {
    lines.push("💵 *Dólar:* indisponível");
  }

  // Bitcoin
  if (results[1].status === "fulfilled") {
    const b = results[1].value;
    lines.push(`₿ *Bitcoin:* R$ ${fmt(b.last, 2)}`);
  } else {
    lines.push("₿ *Bitcoin:* indisponível");
  }

  // IBOVESPA
  if (results[2].status === "fulfilled") {
    const ib = results[2].value;
    const pct = fmtPct(ib.regularMarketChangePercent);
    const icon = ib.regularMarketChangePercent >= 0 ? "📈" : "📉";
    lines.push(`${icon} *IBOVESPA:* ${fmt(ib.regularMarketPrice, 0)} pts (${pct})`);
  } else {
    lines.push("📊 *IBOVESPA:* indisponível");
  }

  // Selic
  if (results[3].status === "fulfilled") {
    const s = results[3].value;
    lines.push(`🏦 *Selic:* ${fmt(s.value, 2)}% a.a.`);
  } else {
    lines.push("🏦 *Selic:* indisponível");
  }

  const now = new Date().toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  lines.push(`\n🕐 _Atualizado: ${now}_`);
  lines.push("_Fontes: BCB, Mercado Bitcoin, brapi.dev_");

  return lines.join("\n");
}

// ─── Detecção de consultas de mercado ─────────────────────────────────────────

export interface MarketQuery {
  type:
    | "dollar" | "euro" | "selic" | "ipca" | "igpm"
    | "bitcoin" | "ethereum" | "crypto" | "stock_b3"
    | "stock_global" | "ibovespa" | "summary" | "help_market";
  param?: string; // ticker ou símbolo de cripto
}

/** Retorna um MarketQuery se o texto for uma consulta de mercado, ou null caso contrário */
export function detectMarketQuery(text: string): MarketQuery | null {
  const t = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .trim();

  // Ajuda sobre mercado
  if (/^(mercado|financeiro|cotacoes?|precos?)(\s+hoje)?$/.test(t) ||
      /^(o que|quais?) (cotacoes?|ativos|acoes?)/.test(t)) {
    return { type: "summary" };
  }

  // Resumo do mercado
  if (/^(resumo|panorama|visao geral|overview)\s*(do\s*)?(mercado|financeiro)?$/.test(t) ||
      /^mercado hoje$/.test(t)) {
    return { type: "summary" };
  }

  // Dólar
  if (/\b(dolar|usd|cambio|cotacao do dolar|preco do dolar|dolar hoje|taxa de cambio)\b/.test(t) &&
      !/bitcoin|btc|euro|eur/.test(t)) {
    return { type: "dollar" };
  }

  // Euro
  if (/\b(euro|eur|cotacao do euro|preco do euro)\b/.test(t)) {
    return { type: "euro" };
  }

  // Selic
  if (/\b(selic|taxa selic|taxa basica|juros basicos?)\b/.test(t)) {
    return { type: "selic" };
  }

  // IPCA
  if (/\b(ipca|inflacao mensal|indice de preco)\b/.test(t)) {
    return { type: "ipca" };
  }

  // IGP-M
  if (/\b(igpm|igp.?m|inflacao igp)\b/.test(t)) {
    return { type: "igpm" };
  }

  // IBOVESPA / Bolsa
  if (/\b(ibovespa|ibov|bolsa|b3|indice bovespa|bolsa de valores)\b/.test(t)) {
    return { type: "ibovespa" };
  }

  // Bitcoin
  if (/\b(bitcoin|btc)\b/.test(t) && !/ethereum|eth/.test(t)) {
    return { type: "bitcoin" };
  }

  // Ethereum
  if (/\b(ethereum|eth)\b/.test(t)) {
    return { type: "ethereum" };
  }

  // Outras criptos: "cotação SOL", "quanto é LTC", "XRP hoje"
  const cryptoMatch = t.match(/\b(cotacao|preco|quanto|valor)?\s*(solana|sol|litecoin|ltc|ripple|xrp|cardano|ada|bnb)\b/);
  if (cryptoMatch) {
    const aliases: Record<string, string> = {
      solana: "SOL", sol: "SOL",
      litecoin: "LTC", ltc: "LTC",
      ripple: "XRP", xrp: "XRP",
      cardano: "ADA", ada: "ADA",
      bnb: "BNB",
    };
    const key = cryptoMatch[2] as string;
    return { type: "crypto", param: aliases[key] || key.toUpperCase() };
  }

  // Ação B3: "cotação PETR4", "VALE3 hoje", "ação ITUB4"
  const stockB3Match = t.match(/\b(acao|acoes|cotacao|ticker|fii|fundo|papel|bolsa)?\s*([a-z]{4}[0-9]{1,2}[a-z]?)\b/);
  if (stockB3Match) {
    const ticker = stockB3Match[2].toUpperCase();
    // Ignora palavras comuns que casam com o padrão
    const ignored = new Set(["IPCA", "IGPM", "IBOV", "TAXA", "META", "PELO", "PELO", "PARA", "COMO", "ISSO", "ESTA", "ESSE"]);
    if (!ignored.has(ticker)) {
      return { type: "stock_b3", param: ticker };
    }
  }

  // Ação global: "AAPL", "MSFT hoje", "cotação TSLA"
  const globalMatch = t.match(/\b(acao|cotacao)?\s*([a-z]{1,5})\s*(hoje|agora|preco)?\b/);
  if (globalMatch && /^(aapl|msft|tsla|amzn|googl|goog|meta|nvda|brk|jpm|bac|wmt|dis|nflx|ba)$/.test(globalMatch[2])) {
    return { type: "stock_global", param: globalMatch[2].toUpperCase() };
  }

  return null;
}

/** Executa a consulta de mercado e retorna o texto formatado */
export async function executeMarketQuery(query: MarketQuery): Promise<string> {
  switch (query.type) {
    case "summary":    return getMarketSummary();
    case "dollar":     return getDollar();
    case "euro":       return getEuro();
    case "selic":      return getSelic();
    case "ipca":       return getIPCA();
    case "igpm":       return getIGPM();
    case "ibovespa":   return getIbovespa();
    case "bitcoin":    return getBitcoin();
    case "ethereum":   return getEthereum();
    case "crypto":     return getCrypto(query.param || "BTC");
    case "stock_b3":   return getStockB3(query.param || "PETR4");
    case "stock_global": return getGlobalStock(query.param || "AAPL");
    case "help_market": return getMarketHelp();
    default:           return getMarketSummary();
  }
}

/** Mensagem de ajuda sobre os comandos de mercado */
export function getMarketHelp(): string {
  return (
    `💹 *Consultas de Mercado Financeiro*\n\n` +
    `Você pode me perguntar sobre:\n\n` +
    `💵 *Câmbio*\n` +
    `   → "dólar hoje" / "cotação do euro"\n\n` +
    `📊 *Bolsa*\n` +
    `   → "IBOVESPA" / "bolsa hoje"\n` +
    `   → "cotação PETR4" / "VALE3" / "ITUB4"\n` +
    `   → "AAPL" / "TSLA" / "MSFT" (ações globais)\n\n` +
    `₿ *Criptomoedas*\n` +
    `   → "bitcoin" / "ethereum" / "SOL"\n\n` +
    `🏦 *Indicadores*\n` +
    `   → "selic" / "IPCA" / "IGP-M"\n\n` +
    `📋 *Resumo Geral*\n` +
    `   → "mercado hoje" / "resumo do mercado"\n\n` +
    `_Os dados são atualizados automaticamente a cada 5 minutos._`
  );
}
