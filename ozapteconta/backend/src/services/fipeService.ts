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

import { logger } from "../utils/logger";

const FIPE_BASE = "https://parallelum.com.br/fipe/api/v2";

// ─── Cache ────────────────────────────────────────────────────────────────────
interface CacheEntry<T> { data: T; expiresAt: number }
const fipeCache = new Map<string, CacheEntry<unknown>>();

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
const TTL_PRICE   = 30 * 60 * 1000;       // 30 min

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
  "yamaha", "kawasaki", "ducati", "triumph", "suzuki", "dafra", "shineray", "harley",
  "scania", "iveco", "volvo", "man",
];

const FIPE_BRAND_ALIASES: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bwolkswagen\b/g, replacement: "volkswagen" },
  { pattern: /\bvolkswagem\b/g, replacement: "volkswagen" },
  { pattern: /\bvolks\b/g, replacement: "volkswagen" },
  { pattern: /\bwolks\b/g, replacement: "volkswagen" },
  { pattern: /\bvokswagen\b/g, replacement: "volkswagen" },
  { pattern: /\bchevrollet\b/g, replacement: "chevrolet" },
  { pattern: /\bmercedez\b/g, replacement: "mercedes" },
  { pattern: /\bhyunday\b/g, replacement: "hyundai" },
  { pattern: /\brenaul\b/g, replacement: "renault" },
  { pattern: /\bcitroem\b/g, replacement: "citroen" },
  { pattern: /\bcaoa cherri\b/g, replacement: "caoa chery" },
];

// ─── Fetch helper ─────────────────────────────────────────────────────────────
async function fipeGet<T>(path: string): Promise<T> {
  const res = await fetch(`${FIPE_BASE}${path}`, {
    headers: { "Accept": "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`FIPE API HTTP ${res.status}: ${path}`);
  return res.json() as Promise<T>;
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

/** Pontuação de similaridade entre query e candidato (0–100) */
function score(query: string, candidate: string): number {
  const q = normalize(query);
  const c = normalize(candidate);

  if (c === q) return 100;
  if (c.startsWith(q)) return 95;
  if (c.includes(q)) return 80;

  // token match: cada token da query encontrado no candidato
  const qTokens = q.split(" ").filter(Boolean);
  const cTokens = c.split(" ").filter(Boolean);
  let matched = 0;
  for (const qt of qTokens) {
    if (cTokens.some((ct) => ct.startsWith(qt) || qt.startsWith(ct))) matched++;
  }
  const ratio = qTokens.length > 0 ? matched / qTokens.length : 0;
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
  return fipeGet<FipeYear[]>(`/${type}/brands/${brandCode}/models/${modelCode}/years`);
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

// ═══════════════════════════════════════════════════════════════════════════════
//  INTERFACE PÚBLICA
// ═══════════════════════════════════════════════════════════════════════════════

export interface FipeQueryResult {
  success: boolean;
  message: string;
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

    // Estratégia: tentar match de marca explícita primeiro (primeiros tokens)
    // Divide query em "possível marca" + "possível modelo"
    const tokens = normalizeBrandAliases(queryWithoutYear).split(" ").filter(Boolean);

    let foundBrand: FipeBrand | null = null;
    let modelQuery = queryWithoutYear;

    // Tenta progressivamente mais tokens como marca
    for (let n = Math.min(tokens.length, 3); n >= 1; n--) {
      const brandCandidate = tokens.slice(0, n).join(" ");
      const match = bestMatch(brandCandidate, brands);
      if (match && score(brandCandidate, match.name) >= 40) {
        foundBrand = match;
        modelQuery = tokens.slice(n).join(" ");
        break;
      }
    }

    // Fallback: melhor score geral
    if (!foundBrand) {
      foundBrand = bestMatch(queryWithoutYear, brands);
      modelQuery = queryWithoutYear;
    }

    if (!foundBrand) {
      return {
        success: false,
        message:
          `❌ Marca não encontrada para: *"${rawQuery}"*\n\n` +
          `Não consegui identificar a marca. Tente com uma marca conhecida:\n` +
          `• "fipe volkswagen gol 2020"\n` +
          `• "fipe honda civic 2019"\n` +
          `• "fipe toyota hilux 2020"\n` +
          `• "fipe moto honda cg 160 2022"`,
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
      const candidates = rankedMatches(modelQuery, modelItemsForMatch, 10);
      for (const candidate of candidates) {
        const candidateYears = await getYears(type, foundBrand.code, parseInt(candidate.code, 10));
        if (candidateYears.some((year) => year.name.includes(String(requestedYear)))) {
          foundModelRaw = candidate;
          break;
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

    return {
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
    };
  } catch (err) {
    logger.error("[fipe] queryFipe error", err);
    return {
      success: false,
      message:
        "⚠️ Erro ao consultar a Tabela FIPE. Tente novamente em instantes.\n" +
        "_A API pode estar temporariamente indisponível._",
    };
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
    `Consulte o preço de mercado de:\n\n` +
    `🚗 *Carros* (nacionais, importados, 0km ou usados)\n` +
    `🏍️ *Motos*\n` +
    `🚛 *Caminhões e Micro-ônibus*\n\n` +
    `*Para funcionar melhor, envie sempre:* _marca + modelo + ano_\n\n` +
    `*Como consultar:*\n` +
    `→ "fipe volkswagen gol 2020"\n` +
    `→ "fipe honda civic 2019"\n` +
    `→ "fipe moto honda cg 160 2022"\n` +
    `→ "fipe toyota corolla xei 2021"\n` +
    `→ "fipe volkswagen polo 2023"\n` +
    `→ "fipe toyota hilux 2020"\n` +
    `→ "fipe moto yamaha fazer 250 2021"\n\n` +
    `_Fonte: Tabela FIPE Oficial_`
  );
}
