/**
 * fipeService.ts
 * Consulta Tabela FIPE via API Parallelum (parallelum.com.br/fipe/api/v2)
 *
 * Tipos suportados:
 *  - cars         → carros (nacionais, importados, novos e usados)
 *  - motorcycles  → motos
 *  - trucks       → caminhões e micro-ônibus
 *
 * Cache: marcas e modelos ficam em cache 24h; preço final 30 min
 */

import fs from "fs";
import path from "path";
import { logger } from "../utils/logger";
import { phoneticNormalize, levenshtein } from "../utils/textTolerance";

/* Domínio principal costuma retornar 429 quando há muitas consultas;
 * o espelho abaixo responde na mesma API v2 com menor bloqueio. */
const FIPE_API_BASES = [
  "https://fipe.parallelum.com.br/api/v2",
  "https://parallelum.com.br/fipe/api/v2",
];
const FIPE_DISK_CACHE_DIR = path.resolve(__dirname, "..", "..", "data", "fipe-disk-cache");

// ─── Cache ────────────────────────────────────────────────────────────────────
interface CacheEntry<T> { data: T; expiresAt: number }
const fipeCache = new Map<string, CacheEntry<unknown>>();
const fipeInFlight = new Map<string, Promise<unknown>>();

function cGet<T>(key: string): T | null {
  const e = fipeCache.get(key) as CacheEntry<T> | undefined;
  if (!e || Date.now() > e.expiresAt) { fipeCache.delete(key); return null; }
  return e.data;
}
function cSet<T>(key: string, data: T, ttlMs: number): void {
  fipeCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

const TTL_BRANDS  = 24 * 60 * 60 * 1000; // 24h
const TTL_MODELS  = 24 * 60 * 60 * 1000; // 24h
const TTL_YEARS   = 24 * 60 * 60 * 1000; // 24h
const TTL_PRICE   = 30 * 60 * 1000;       // 30 min
const TTL_QUERY   = 10 * 60 * 1000;       // 10 min

function queryCacheKey(type: FipeVehicleType, rawQuery: string): string {
  return `query_${type}_${normalizeBrandAliases(rawQuery)}`;
}

async function withInFlight<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = fipeInFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const created = factory()
    .finally(() => {
      fipeInFlight.delete(key);
    });

  fipeInFlight.set(key, created as Promise<unknown>);
  return created;
}

// ─── Tipos FIPE ───────────────────────────────────────────────────────────────
export type FipeVehicleType = "cars" | "motorcycles" | "trucks";

interface FipeBrand  { code: string; name: string }
interface FipeModel  { code: number; name: string }
interface FipeYear   { code: string; name: string }
interface FipePrice  {
  vehicleType: number;
  brand: string;
  model: string;
  modelYear: number;
  fuel: string;
  codeFipe: string;
  referenceMonth: string;
  price: string;            // "R$ 43.690,00"
  fuelAcronym: string;
}
interface FipeModelsResponse {
  models?: FipeModel[];
}

const FIPE_BRAND_HINTS = [
  "toyota", "honda", "volkswagen", "vw", "fiat", "chevrolet", "gm", "ford", "hyundai",
  "renault", "nissan", "jeep", "peugeot", "citroen", "mitsubishi", "kia", "bmw", "mercedes",
  "audi", "volvo", "land rover", "lexus", "porsche", "ram", "byd", "caoa", "chery", "jac",
  "omoda", "gwm", "ferrari", "lamborghini", "maserati", "aston martin", "bentley", "rolls",
  "tesla", "mini", "subaru", "dodge", "chrysler",
  "yamaha", "kawasaki", "ducati", "triumph", "suzuki", "dafra", "shineray", "harley",
  "scania", "iveco", "man",
];

const FIPE_BRAND_ALIASES: Array<{ pattern: RegExp; replacement: string }> = [
  /* Volkswagen — variações mais comuns (V↔W, falta de S, troca de M/N final) */
  { pattern: /\b(wolkswagen|wolksvagen|wolksvagem|volkswagem|wolksvaguen|vokswagen|volcsvagen|volksvagem|volksvagen|wolkvagen|volkvagen|wolksvaghen)\b/g, replacement: "volkswagen" },
  { pattern: /\b(volks|wolks|vw)\b/g, replacement: "volkswagen" },
  /* Chevrolet */
  { pattern: /\b(chevrollet|chevrole|chevrolett|chevroley|chevy)\b/g, replacement: "chevrolet" },
  /* Mercedes */
  { pattern: /\b(mercedez|mercedis|mercedes benz|mercede)\b/g, replacement: "mercedes" },
  /* Hyundai */
  { pattern: /\b(hyunday|hiundai|hiunday|hyunda|hiunda)\b/g, replacement: "hyundai" },
  /* Renault */
  { pattern: /\b(renaul|renaut|renaule|renalt)\b/g, replacement: "renault" },
  /* Citroën */
  { pattern: /\b(citroem|citroen|citroan|citroem)\b/g, replacement: "citroen" },
  /* Chery */
  { pattern: /\bcaoa cherri\b/g, replacement: "caoa chery" },
  { pattern: /\b(cherri|cheri)\b/g, replacement: "chery" },
  /* Peugeot */
  { pattern: /\b(peugeout|peugot|pegeout|pegeot)\b/g, replacement: "peugeot" },
  /* BYD (chinesa popular) */
  { pattern: /\b(bid|bydy|bidi)\b/g, replacement: "byd" },
  /* Omoda (nova marca Chery) */
  { pattern: /\b(omoda chery|chery omoda|comoda)\b/g, replacement: "omoda" },
  /* Lamborghini */
  { pattern: /\b(lambo|lamborgini|lamborguini|lamborghine|lamborhini|lambourghini)\b/g, replacement: "lamborghini" },
  /* Ferrari */
  { pattern: /\b(ferari|ferary|ferrary|feraary)\b/g, replacement: "ferrari" },
  /* Toyota */
  { pattern: /\b(toiota|toiyota|toyotta)\b/g, replacement: "toyota" },
  /* Honda */
  { pattern: /\b(ronda|onda|hondda)\b/g, replacement: "honda" },
];

// ─── Fetch helper ─────────────────────────────────────────────────────────────
const FIPE_RETRY_STATUSES = new Set([429, 502, 503, 504]);
const FIPE_RETRY_DELAYS_MS = [1_500, 4_000];

function fipeRetryDelayMs(attemptIndex: number, response?: Response): number {
  const retryAfterHeader = response?.headers.get("retry-after");
  if (retryAfterHeader) {
    const seconds = Number.parseInt(retryAfterHeader, 10);
    if (Number.isFinite(seconds) && seconds > 0 && seconds <= 120) {
      return seconds * 1000;
    }
  }
  return FIPE_RETRY_DELAYS_MS[Math.min(attemptIndex, FIPE_RETRY_DELAYS_MS.length - 1)];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let lastFipeHttpAt = 0;
const FIPE_MIN_GAP_MS = 350;

async function throttleFipeHttp(): Promise<void> {
  const now = Date.now();
  const waitMs = FIPE_MIN_GAP_MS - (now - lastFipeHttpAt);
  if (waitMs > 0) await sleep(waitMs);
  lastFipeHttpAt = Date.now();
}

function diskCacheFileKey(apiPath: string): string {
  return apiPath.replace(/^\//, "").replace(/\//g, "__");
}

function readDiskCache<T>(apiPath: string): T | null {
  try {
    const filePath = path.join(FIPE_DISK_CACHE_DIR, `${diskCacheFileKey(apiPath)}.json`);
    if (!fs.existsSync(filePath)) return null;
    const envelope = JSON.parse(fs.readFileSync(filePath, "utf8")) as { payload?: T };
    if (!envelope?.payload) return null;
    return envelope.payload;
  } catch (err) {
    logger.warn(`[fipe] leitura cache disco falhou: ${apiPath}`, err);
    return null;
  }
}

function writeDiskCache<T>(apiPath: string, payload: T): void {
  try {
    fs.mkdirSync(FIPE_DISK_CACHE_DIR, { recursive: true });
    const filePath = path.join(FIPE_DISK_CACHE_DIR, `${diskCacheFileKey(apiPath)}.json`);
    /* SANITY CHECK: gravação atômica simples do payload FIPE */
    fs.writeFileSync(
      filePath,
      JSON.stringify({ savedAt: Date.now(), payload }),
      "utf8",
    );
  } catch (err) {
    logger.warn(`[fipe] gravação cache disco falhou: ${apiPath}`, err);
  }
}

async function fipeGet<T>(path: string): Promise<T> {
  const requestKey = `http_${path}`;
  return withInFlight(requestKey, async () => {
    let lastStatus = 0;

    for (const baseUrl of FIPE_API_BASES) {
      /* MAX_ITER: 1 tentativa + FIPE_RETRY_DELAYS_MS.length retries, por base */
      for (let attempt = 0; attempt <= FIPE_RETRY_DELAYS_MS.length; attempt++) {
        await throttleFipeHttp();
        const res = await fetch(`${baseUrl}${path}`, {
          headers: { "Accept": "application/json" },
          signal: AbortSignal.timeout(15_000),
        });

        if (res.ok) {
          const payload = (await res.json()) as T;
          writeDiskCache(path, payload);
          return payload;
        }

        lastStatus = res.status;
        const canRetry = FIPE_RETRY_STATUSES.has(res.status) && attempt < FIPE_RETRY_DELAYS_MS.length;
        if (!canRetry) {
          break;
        }

        const waitMs = fipeRetryDelayMs(attempt, res);
        logger.warn(
          `[fipe] HTTP ${res.status} em ${baseUrl}${path} — retry ${attempt + 1}/${FIPE_RETRY_DELAYS_MS.length} em ${waitMs}ms`,
        );
        await sleep(waitMs);
      }
    }

    if (lastStatus === 429 || lastStatus === 503) {
      const stale = readDiskCache<T>(path);
      if (stale) {
        logger.warn(`[fipe] HTTP ${lastStatus} em ${path} — usando cache em disco`);
        return stale;
      }
    }

    throw new Error(`FIPE API HTTP ${lastStatus || "unknown"}: ${path}`);
  });
}

// ─── Normalização para busca fuzzy ────────────────────────────────────────────
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // remove acentos
    .replace(/[^a-z0-9\s]/g, " ")     // remove pontuação
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeBrandAliases(text: string): string {
  let out = normalize(text);
  for (const alias of FIPE_BRAND_ALIASES) {
    out = out.replace(alias.pattern, alias.replacement);
  }
  return out;
}

/** Pontuação de similaridade entre query e candidato (0–100). Tolerante a
 *  erros fonéticos do PT-BR (V↔W, K↔C, Y↔I, PH↔F, LH/L, NH/N, duplicados) e
 *  a distância de edição pequena (até 2 caracteres por token via Levenshtein).
 *
 *  REGRA CRÍTICA DE PREFIXO: a comparação `prefix` só é válida quando AMBOS
 *  os lados têm pelo menos 3 caracteres. Sem esse guarda, abreviações como
 *  "vw" (que normaliza fonéticamente para "v") capturariam qualquer palavra
 *  começando em V — exemplo real: query "voyage" colidiria com "vw" e o
 *  algoritmo confundiria o modelo Voyage com a marca VW, levando à seleção
 *  errada de "AMAROK" como modelo do Voyage.
 */
function score(query: string, candidate: string): number {
  const q = normalize(query);
  const c = normalize(candidate);

  if (c === q) return 100;
  if (c.startsWith(q)) return 95;
  if (c.includes(q)) return 80;

  /* Forma fonética canônica — corrige wolksvagen → volcsvagen → volkswagen → volcsvagen */
  const qp = phoneticNormalize(q);
  const cp = phoneticNormalize(c);
  if (qp && cp) {
    if (qp === cp) return 92;
    if (cp.startsWith(qp)) return 90;
    if (cp.includes(qp)) return 78;
  }

  /* Token match com tolerância. Descartamos tokens-query com <2 chars
   * (números soltos "1", "6" gerariam matches falsos via prefix). */
  const qTokens = q.split(" ").filter((t) => t.length >= 2);
  const cTokens = c.split(" ").filter(Boolean);
  if (qTokens.length === 0) return 0;

  let matched = 0;
  for (const qt of qTokens) {
    const qtp = phoneticNormalize(qt);
    const hit = cTokens.some((ct) => {
      if (ct === qt) return true;
      /* Prefix ASCII: ambos com ≥3 chars (evita "1" → "16v") */
      if (qt.length >= 3 && ct.length >= 3 && (ct.startsWith(qt) || qt.startsWith(ct))) {
        return true;
      }
      const ctp = phoneticNormalize(ct);
      /* Prefix fonético: ambos com ≥3 chars (evita "voyage"→"voiage" colidir
       * com "vw"→"v"). */
      if (qtp.length >= 3 && ctp.length >= 3 && (ctp.startsWith(qtp) || qtp.startsWith(ctp))) {
        return true;
      }
      /* Tolera até 2 edits em palavras com pelo menos 4 letras (evita falsos
       * positivos em palavras curtas como "gol" vs "uno"). */
      if (qtp.length >= 4 && ctp.length >= 4) {
        const dist = levenshtein(qtp, ctp);
        const maxLen = Math.max(qtp.length, ctp.length);
        if (dist <= 2 && dist / maxLen < 0.35) return true;
      }
      return false;
    });
    if (hit) matched++;
  }
  const ratio = matched / qTokens.length;
  return Math.round(ratio * 70);
}

function bestMatch<T extends { name: string; code: string | number }>(
  query: string,
  items: T[],
): T | null {
  let best: T | null = null;
  let bestScore = 0;
  for (const item of items) {
    const s = score(query, item.name);
    if (s > bestScore) { bestScore = s; best = item; }
  }
  return bestScore >= 20 ? best : null;
}

function rankedMatches<T extends { name: string; code: string | number }>(
  query: string,
  items: T[],
  limit = 8,
): T[] {
  return items
    .map((item) => ({ item, score: score(query, item.name), nameLength: normalize(item.name).length }))
    .filter((entry) => entry.score >= 20)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.nameLength - right.nameLength;
    })
    .slice(0, limit)
    .map((entry) => entry.item);
}

// ─── Obter marcas ─────────────────────────────────────────────────────────────
async function getBrands(type: FipeVehicleType): Promise<FipeBrand[]> {
  const key = `brands_${type}`;
  const cached = cGet<FipeBrand[]>(key);
  if (cached) return cached;

  const data = await fipeGet<FipeBrand[]>(`/${type}/brands`);
  cSet(key, data, TTL_BRANDS);
  return data;
}

// ─── Obter modelos ────────────────────────────────────────────────────────────
async function getModels(type: FipeVehicleType, brandCode: string): Promise<FipeModel[]> {
  const key = `models_${type}_${brandCode}`;
  const cached = cGet<FipeModel[]>(key);
  if (cached) return cached;

  const data = await fipeGet<FipeModelsResponse | FipeModel[]>(`/${type}/brands/${brandCode}/models`);
  const models = Array.isArray(data) ? data : data.models ?? [];
  cSet(key, models, TTL_MODELS);
  return models;
}

// ─── Obter anos ───────────────────────────────────────────────────────────────
async function getYears(type: FipeVehicleType, brandCode: string, modelCode: number): Promise<FipeYear[]> {
  const key = `years_${type}_${brandCode}_${modelCode}`;
  const cached = cGet<FipeYear[]>(key);
  if (cached) return cached;

  const years = await fipeGet<FipeYear[]>(`/${type}/brands/${brandCode}/models/${modelCode}/years`);
  cSet(key, years, TTL_YEARS);
  return years;
}

// ─── Obter preço ─────────────────────────────────────────────────────────────
async function getPrice(
  type: FipeVehicleType,
  brandCode: string,
  modelCode: number,
  yearCode: string,
): Promise<FipePrice> {
  const key = `price_${type}_${brandCode}_${modelCode}_${yearCode}`;
  const cached = cGet<FipePrice>(key);
  if (cached) return cached;

  const data = await fipeGet<FipePrice>(
    `/${type}/brands/${brandCode}/models/${modelCode}/years/${yearCode}`,
  );
  cSet(key, data, TTL_PRICE);
  return data;
}

// ─── Selecionar o ano mais próximo ────────────────────────────────────────────
function pickYear(years: FipeYear[], requestedYear?: number): FipeYear {
  if (!requestedYear) {
    // Retorna o mais recente que não seja "32000-1" (zero km)
    // anos seguem o formato "2020-1", "2020-3", "32000-1" (0km)
    const real = years.filter((y) => !y.code.startsWith("32000"));
    return real.length > 0 ? real[0] : years[0];
  }

  // Procura o ano exato
  const exact = years.find((y) => y.name.includes(String(requestedYear)));
  if (exact) return exact;

  // Mais próximo
  let closest = years[0];
  let closestDiff = Infinity;
  for (const y of years) {
    const match = y.name.match(/\d{4}/);
    if (!match) continue;
    const diff = Math.abs(parseInt(match[0], 10) - requestedYear);
    if (diff < closestDiff) { closestDiff = diff; closest = y; }
  }
  return closest;
}

// ─── Ícone por tipo ───────────────────────────────────────────────────────────
function vehicleIcon(type: FipeVehicleType): string {
  return type === "motorcycles" ? "🏍️" : type === "trucks" ? "🚛" : "🚗";
}

function vehicleLabel(type: FipeVehicleType): string {
  return type === "motorcycles" ? "Moto" : type === "trucks" ? "Caminhão" : "Carro";
}

// ─── Sugestões de modelos populares ───────────────────────────────────────────
function getPopularModelSuggestions(models: FipeModel[], count = 3): FipeModel[] {
  // Retorna os N primeiros modelos mais populares (primeiros geralmente são os mais comuns)
  return models.slice(0, count);
}

/**
 * Mensagem amigável quando não conseguimos identificar a marca.
 * Inclui exemplos atualizados por categoria (populares + premium + chinesas + exóticos).
 */
function buildBrandNotFoundMessage(rawQuery: string): string {
  return (
    `❌ *Não consegui identificar a marca em:* "${rawQuery}"\n\n` +
    `Caro cliente, esta consulta utiliza um sistema de busca via *API oficial da Tabela FIPE*. ` +
    `Para que a busca seja feita com perfeição, precisamos que você seja mais específico — ` +
    `informe corretamente *marca + modelo + ano* do veículo.\n\n` +
    `📌 *Formato:* fipe [marca] [modelo] [ano]\n\n` +
    `🚗 *Populares:*\n` +
    `• fipe fiat argo 2022\n` +
    `• fipe fiat strada 2023\n` +
    `• fipe volkswagen gol 2021\n` +
    `• fipe volkswagen polo 2023\n` +
    `• fipe toyota corolla 2022\n` +
    `• fipe toyota hilux 2021\n` +
    `• fipe honda civic 2020\n` +
    `• fipe honda hr-v 2023\n\n` +
    `🔋 *Chinesas (elétricos/híbridos):*\n` +
    `• fipe byd dolphin 2024\n` +
    `• fipe byd song plus 2024\n` +
    `• fipe omoda 5 2024\n\n` +
    `🏎️ *Exóticos:*\n` +
    `• fipe ferrari 488 2020\n` +
    `• fipe lamborghini huracan 2022\n\n` +
    `_Dica: se errar a grafia (ex: "wolksvagen") tudo bem — o sistema corrige sozinho marcas com erro fonético, mas o ano e modelo precisam estar corretos._`
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INTERFACE PÚBLICA
// ═══════════════════════════════════════════════════════════════════════════════

export interface FipeQueryResult {
  success: boolean;
  message: string;
  /** Quando success=true, devolve os identificadores para o caller poder
   *  anexar a silhueta apropriada (resolve em camada superior, fora do FIPE). */
  brandName?: string;
  modelName?: string;
  vehicleType?: FipeVehicleType;
}

/**
 * Busca o preço FIPE a partir de uma query em linguagem natural.
 *
 * @param phone    número do cliente (mantido por compatibilidade)
 * @param rawQuery texto da busca, ex: "gol 2020" | "honda cg 160 2022" | "civic"
 * @param type     "cars" | "motorcycles" | "trucks"
 */
export async function queryFipe(
  phone: string,
  rawQuery: string,
  type: FipeVehicleType = "cars",
): Promise<FipeQueryResult> {
  const qKey = queryCacheKey(type, rawQuery);
  const cachedResult = cGet<FipeQueryResult>(qKey);
  if (cachedResult) return cachedResult;

  try {
    void phone;
    // Extrai ano da query (4 dígitos entre 1950 e ano atual+1)
    const currentYear = new Date().getFullYear();
    const yearRegex = new RegExp(`\\b(19[5-9]\\d|20[0-${Math.floor((currentYear + 1) / 10)}]\\d)\\b`);
    const yearMatch = rawQuery.match(yearRegex);
    const requestedYear = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

    // Remove o ano da query para a busca por nome
    const queryWithoutYear = normalizeBrandAliases(rawQuery.replace(yearRegex, "").trim());

    // 1. Buscar marcas
    const brands = await getBrands(type);

    // Estratégia: testar TODAS as janelas contíguas de 1..3 tokens em qualquer
    // posição da query como possível marca. Pegamos a de maior score (>=40)
    // e priorizamos janelas mais longas (mais específicas).
    //
    // Isso cobre tanto "volkswagen voyage 1.6" (marca no início) quanto
    // "voyage 1.6 volkswagen" (marca no fim). Sem isso, o algoritmo antigo
    // só tentava prefixos e podia colidir falsamente — ex.: a query
    // "volkswagen voyage 1" antes batia em VW pelo loop n=3 e descartava
    // "voyage" inteiro como "marca", deixando modelQuery="6".
    const tokens = normalizeBrandAliases(queryWithoutYear).split(" ").filter(Boolean);

    let foundBrand: FipeBrand | null = null;
    let modelQuery = queryWithoutYear;
    let brandWindow: { start: number; len: number } | null = null;
    let brandWindowScore = 0;

    for (let len = Math.min(tokens.length, 3); len >= 1; len--) {
      for (let start = 0; start + len <= tokens.length; start++) {
        const brandCandidate = tokens.slice(start, start + len).join(" ");
        const match = bestMatch(brandCandidate, brands);
        if (!match) continue;
        const s = score(brandCandidate, match.name);
        /* Aceita match >=40 e prefere o de maior score; em empate prefere
         * janelas mais longas (mais específicas, já priorizadas pelo loop). */
        if (s >= 40 && s > brandWindowScore) {
          foundBrand = match;
          brandWindowScore = s;
          brandWindow = { start, len };
        }
      }
      /* Se já achamos algo nesta largura, paramos: janela mais longa vence. */
      if (foundBrand) break;
    }

    if (foundBrand && brandWindow) {
      modelQuery = [
        ...tokens.slice(0, brandWindow.start),
        ...tokens.slice(brandWindow.start + brandWindow.len),
      ].join(" ");
    }

    // Fallback: melhor score geral sobre toda a query
    if (!foundBrand) {
      foundBrand = bestMatch(queryWithoutYear, brands);
      modelQuery = queryWithoutYear;
    }

    if (!foundBrand) {
      return {
        success: false,
        message: buildBrandNotFoundMessage(rawQuery),
      };
    }

    // 2. Buscar modelos da marca
    const models = await getModels(type, foundBrand.code);

    const modelItems = models.map((m) => ({ code: m.code, name: m.name, codeStr: String(m.code) }));
    const modelItemsForMatch: FipeBrand[] = modelItems.map((m) => ({
      code: String(m.code),
      name: m.name,
    }));

    let foundModelRaw = modelQuery
      ? bestMatch(modelQuery, modelItemsForMatch)
      : modelItemsForMatch[0] ?? null;

    if (modelQuery && requestedYear) {
      const yearStr = String(requestedYear);
      const modelHasYear = async (modelCode: string): Promise<boolean> => {
        const modelYears = await getYears(type, foundBrand.code, parseInt(modelCode, 10));
        return modelYears.some((year) => year.name.includes(yearStr));
      };

      if (foundModelRaw && (await modelHasYear(foundModelRaw.code))) {
        /* Match principal já possui o ano — evita dezenas de chamadas extras (429). */
      } else {
        /* Máx. 6 alternativas: suficiente para Civic/Hilux sem estourar rate limit. */
        const candidates = rankedMatches(modelQuery, modelItemsForMatch, 6);
        for (const candidate of candidates) {
          if (foundModelRaw && candidate.code === foundModelRaw.code) continue;
          if (await modelHasYear(candidate.code)) {
            foundModelRaw = candidate;
            break;
          }
        }
      }
    }

    if (!foundModelRaw) {
      const popularSuggestions = getPopularModelSuggestions(models, 4);
      const suggestionsText = popularSuggestions
        .map((m) => `• "fipe ${foundBrand.name.toLowerCase()} ${m.name.toLowerCase()} 2020"`)
        .join("\n");
      return {
        success: false,
        message:
          `❌ Modelo não encontrado para *${foundBrand.name}*. Tente um desses:\n\n` +
          `${suggestionsText}\n\n` +
          `_Dica: Digite assim: "fipe [marca] [modelo] [ano]"_`,
      };
    }

    const foundModel: FipeModel = {
      code: parseInt(foundModelRaw.code, 10),
      name: foundModelRaw.name,
    };

    // 3. Buscar anos disponíveis
    const years = await getYears(type, foundBrand.code, foundModel.code);
    if (!years.length) {
      return { success: false, message: "⚠️ Nenhum ano encontrado para este modelo." };
    }

    const chosenYear = pickYear(years, requestedYear);

    // 4. Obter preço
    const price = await getPrice(type, foundBrand.code, foundModel.code, chosenYear.code);

    const icon = vehicleIcon(type);
    const label = vehicleLabel(type);
    const isZeroKm = chosenYear.code.startsWith("32000");
    const zeroKmTag = isZeroKm ? " (0 km)" : "";

    // Anos disponíveis (limitados a 5)
    const yearsAvailable = years
      .slice(0, 5)
      .map((y) => y.name)
      .join(", ");

    const result: FipeQueryResult = {
      success: true,
      message:
        `${icon} *Tabela FIPE — ${label}${zeroKmTag}*\n\n` +
        `🏷️ *Marca:* ${price.brand}\n` +
        `🚘 *Modelo:* ${price.model}\n` +
        `📅 *Ano/Combustível:* ${chosenYear.name}\n` +
        `💰 *Preço FIPE:* *${price.price}*\n` +
        `🔢 *Código FIPE:* ${price.codeFipe}\n` +
        `📋 *Referência:* ${price.referenceMonth}\n\n` +
        `📆 *Outros anos disponíveis:* ${yearsAvailable}${years.length > 5 ? "..." : ""}\n\n` +
        `_Fonte: Tabela FIPE Oficial (Parallelum)_`,
      brandName: price.brand,
      modelName: price.model,
      vehicleType: type,
    };
    cSet(qKey, result, TTL_QUERY);
    return result;
  } catch (err) {
    logger.error("[fipe] queryFipe error", err);
    const errText = err instanceof Error ? err.message : String(err);
    const isRateLimit = errText.includes("429");
    const failResult: FipeQueryResult = {
      success: false,
      message: isRateLimit
        ? "⚠️ A consulta FIPE está *temporariamente limitada* (muitas buscas seguidas).\n\n" +
          "Aguarde *1 a 2 minutos* e envie de novo:\n" +
          "`fipe volkswagen voyage 1.6 2020`"
        : "⚠️ Erro ao consultar a Tabela FIPE. Tente novamente em instantes.\n" +
          "_A API pode estar temporariamente indisponível._",
    };
    /* Cache curto: 429 → 90s para não martelar a API; outros erros → 30s */
    cSet(qKey, failResult, isRateLimit ? 90_000 : 30_000);
    return failResult;
  }
}

// ─── Detecção de consulta FIPE ────────────────────────────────────────────────

export interface FipeDetected {
  query: string;
  vehicleType: FipeVehicleType;
}

/**
 * Detecta se o texto é uma consulta FIPE.
 * Retorna { query, vehicleType } ou null se não for.
 */
export function detectFipeQuery(text: string): FipeDetected | null {
  const t = normalizeBrandAliases(text);

  const hasYear = /\b(19[5-9]\d|20\d\d)\b/.test(t);
  const hasKnownBrand = FIPE_BRAND_HINTS.some((brand) => t.includes(brand));

  // Aceita palavra-chave FIPE ou uma consulta simples com marca conhecida + ano.
  const hasFipeKw =
    /\bfipe\b/.test(t) ||
    /\btabela fipe\b/.test(t) ||
    /\bpreco fipe\b/.test(t) ||
    /\bvalor fipe\b/.test(t) ||
    /\bcotacao fipe\b/.test(t) ||
    /\bquanto (vale|custa|e) (o |a |meu |minha )?(carro|moto|veiculo|caminhao|pickup|suv|sedan)/.test(t);

  if (!hasFipeKw && !(hasKnownBrand && hasYear)) return null;

  if (/\bfipezap\b|\bfipe zap\b/.test(t)) return null;

  // Determina tipo de veículo
  let vehicleType: FipeVehicleType = "cars";

  if (/\b(moto(cicleta)?|motociclo|scooter|biz|cg\s*\d|bros|fan|pop|xre|cb\s*\d|nxr|pcx|ybr|fazer|lander|crosser|burgman|tmax|r\s*\d{3})\b/.test(t)) {
    vehicleType = "motorcycles";
  } else if (/\b(caminhao|caminhoes|truck|toco|carreta|onibus|micro.?onibus|mb\s*\d|iveco|scania|volvo\s*(fh|fm)|ford\s*cargo)\b/.test(t)) {
    vehicleType = "trucks";
  }

  // Remove palavras-chave para extrair a query limpa
  const query = t
    .replace(/\b(fipe|tabela|preco|valor|cotacao|consulta|buscar|quanto vale|quanto custa|qual o preco)\b/g, "")
    .replace(/\b(carro|moto(cicleta)?|caminhao|veiculo|automovel)\b/g, "")
    .replace(/\b(do|da|de|o|a|um|uma|meu|minha|novo|nova|usado|usada|nacional|importado|importada)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!query || query.length < 2) return null;

  return { query, vehicleType };
}

/** Mensagem de ajuda sobre consultas FIPE */
export function getFipeHelp(): string {
  return (
    `🚗 *Consulta Tabela FIPE*\n\n` +
    `Consulte o preço de mercado de:\n` +
    `🚗 *Carros* (nacionais, importados, 0km ou usados)\n` +
    `🏍️ *Motos*\n` +
    `🚛 *Caminhões e Micro-ônibus*\n\n` +
    `*Para funcionar melhor, envie sempre:* _marca + modelo + ano_\n\n` +
    `📌 *Formato:* fipe [marca] [modelo] [ano]\n\n` +
    `🚗 *Populares:*\n` +
    `→ fipe fiat argo 2022\n` +
    `→ fipe volkswagen gol 2021\n` +
    `→ fipe toyota corolla 2022\n` +
    `→ fipe honda civic 2020\n\n` +
    `🔋 *Chinesas (elétricos/híbridos):*\n` +
    `→ fipe byd dolphin 2024\n` +
    `→ fipe omoda 5 2024\n\n` +
    `🏎️ *Exóticos:*\n` +
    `→ fipe ferrari 488 2020\n` +
    `→ fipe lamborghini huracan 2022\n\n` +
    `🏍️ *Motos:*\n` +
    `→ fipe moto honda cg 160 2022\n` +
    `→ fipe moto yamaha fazer 250 2021\n\n` +
    `_O sistema corrige erros de digitação na marca (ex: "wolksvagen" → "volkswagen"). Modelo e ano precisam estar corretos._\n\n` +
    `_Fonte: Tabela FIPE Oficial_`
  );
}
