/**
 * Normalização de produtos para o comparador de preços.
 *
 * Extrai marca, modelo e atributos chave (litros, polegadas, GB, RAM, voltagem)
 * a partir do título cru retornado pelos adapters, gerando uma chave canônica
 * usada para agrupar ofertas equivalentes vindas de fontes diferentes.
 */

import type { NormalizedProduct, ProductAttributes, ProductOffer } from "./types";

/**
 * Lista (não exaustiva) de marcas comuns de eletro/eletrônico no Brasil.
 * A ordem importa: marcas mais específicas devem vir antes das genéricas
 * para evitar matches errados (ex.: "Samsung Galaxy" antes de "Samsung").
 */
const KNOWN_BRANDS = [
  // Eletrodomésticos
  "Brastemp", "Consul", "Electrolux", "Whirlpool", "Panasonic",
  "Midea", "Philco", "Mondial", "Britania", "Britânia",
  "Cadence", "Arno", "Oster", "Black+Decker", "Black Decker",
  "Mueller", "Latina", "Suggar", "Cuisinart", "KitchenAid",
  // Áudio e vídeo
  "Samsung", "LG", "Sony", "Philips", "TCL", "AOC",
  "Toshiba", "Sharp", "Hisense", "Multilaser", "JBL", "Bose",
  // Informática / smartphones
  "Apple", "iPhone", "Xiaomi", "Motorola", "Asus", "Acer",
  "Dell", "Lenovo", "HP", "Positivo", "Vaio",
  "AMD", "Intel", "NVIDIA", "Gigabyte", "MSI", "Corsair",
  "Kingston", "Sandisk", "Seagate", "WD", "Western Digital",
  "Logitech", "Razer", "HyperX", "Redragon",
  // Linha branca pesada
  "Continental", "Esmaltec", "Atlas", "Itatiaia", "Tramontina",
];

/** Aliases / variações que apontam para a mesma marca canônica. */
const BRAND_ALIASES: Record<string, string> = {
  "britânia": "Britania",
  "black decker": "Black+Decker",
  "western digital": "WD",
  "iphone": "Apple",
};

function normalizeText(s: string): string {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Detecta marca no título usando lista conhecida. Retorna nome canônico. */
export function extractBrand(title: string): string | null {
  if (!title) return null;
  const normalized = normalizeText(title);
  for (const brand of KNOWN_BRANDS) {
    const brandNormalized = normalizeText(brand);
    const re = new RegExp(`\\b${brandNormalized.replace(/[+]/g, "\\+")}\\b`);
    if (re.test(normalized)) {
      const canonical = BRAND_ALIASES[brandNormalized] || brand;
      return canonical;
    }
  }
  return null;
}

/**
 * Tenta extrair um código de modelo do título.
 * Heurística: token alfanumérico de 4+ caracteres com letras E dígitos,
 * ou padrões clássicos tipo "BRM44HK", "UN50DU7700", "iPhone 13", "RTX 4060".
 */
export function extractModel(title: string, brand: string | null): string | null {
  if (!title) return null;
  const tokens = String(title).split(/[\s,/()\[\]]+/).filter(Boolean);
  const brandNorm = brand ? normalizeText(brand) : null;

  for (const raw of tokens) {
    const token = raw.replace(/[^a-zA-Z0-9-]/g, "");
    if (token.length < 4) continue;
    if (brandNorm && normalizeText(token) === brandNorm) continue;

    const hasLetter = /[a-zA-Z]/.test(token);
    const hasDigit = /[0-9]/.test(token);
    if (hasLetter && hasDigit) {
      return token.toUpperCase();
    }
  }

  // Padrões nominais comuns ("iPhone 13", "Galaxy S24", "RTX 4060")
  const nominalMatch = title.match(/\b(iPhone|Galaxy|RTX|GTX|Radeon|Ryzen|Core i\d)\s*([0-9]{2,5}[a-zA-Z]?)/i);
  if (nominalMatch) {
    return `${nominalMatch[1]} ${nominalMatch[2]}`.toUpperCase();
  }

  return null;
}

/** Extrai atributos comparáveis (litros, polegadas, GB, RAM, voltagem). */
export function extractAttributes(title: string): ProductAttributes {
  const attrs: ProductAttributes = {};
  if (!title) return attrs;
  const t = normalizeText(title);

  const litrosMatch = t.match(/(\d{2,4})\s*(?:l|litros?)\b/);
  if (litrosMatch) {
    const n = parseInt(litrosMatch[1], 10);
    if (n >= 20 && n <= 999) attrs.litros = n;
  }

  const polegadasMatch = t.match(/(\d{2,3})\s*(?:''|"|polegadas?|pol\.?)\b/);
  if (polegadasMatch) {
    const n = parseInt(polegadasMatch[1], 10);
    if (n >= 10 && n <= 120) attrs.polegadas = n;
  } else {
    // TVs comuns: "smart tv 50" sem unidade explícita
    const tvMatch = t.match(/\b(?:tv|smart tv|monitor)\s+(\d{2,3})\b/);
    if (tvMatch) {
      const n = parseInt(tvMatch[1], 10);
      if (n >= 19 && n <= 120) attrs.polegadas = n;
    }
  }

  // Storage GB / TB
  const storageMatch =
    t.match(/(\d{2,4})\s*gb\b/) || t.match(/(\d{1,2})\s*tb\b/);
  if (storageMatch) {
    const isTb = /tb/.test(storageMatch[0]);
    const num = parseInt(storageMatch[1], 10);
    attrs.capacidadeGb = isTb ? num * 1024 : num;
  }

  // RAM (preferência por padrão "8gb ram" ou "ram 8gb")
  const ramMatch =
    t.match(/(\d{1,3})\s*gb\s+ram\b/) || t.match(/\bram\s*(\d{1,3})\s*gb\b/);
  if (ramMatch) {
    attrs.ramGb = parseInt(ramMatch[1], 10);
  }

  if (/\bbivolt\b/.test(t)) attrs.voltagem = "BIVOLT";
  else if (/\b110\s*v\b/.test(t)) attrs.voltagem = "110V";
  else if (/\b220\s*v\b/.test(t)) attrs.voltagem = "220V";

  return attrs;
}

/** Gera a chave canônica usada para deduplicar ofertas equivalentes. */
export function buildCanonicalKey(
  brand: string | null,
  model: string | null,
  attrs: ProductAttributes,
): string {
  const parts: string[] = [];
  parts.push(brand ? normalizeText(brand) : "sem-marca");
  parts.push(model ? normalizeText(model) : "sem-modelo");
  if (attrs.litros) parts.push(`${attrs.litros}l`);
  if (attrs.polegadas) parts.push(`${attrs.polegadas}pol`);
  if (attrs.capacidadeGb) parts.push(`${attrs.capacidadeGb}gb`);
  if (attrs.ramGb) parts.push(`ram${attrs.ramGb}`);
  return parts.join("|");
}

/**
 * Enriquece uma oferta crua adicionando marca, modelo, atributos
 * e o `totalCents` (preço + frete).
 */
export function enrichOffer(offer: ProductOffer): ProductOffer {
  // Guard clause: preço inválido -> normaliza para 0 e total = 0
  /* SANITY CHECK: preço negativo seria erro de parser */
  const preco = Number.isFinite(offer.precoCents) && offer.precoCents > 0 ? offer.precoCents : 0;
  const frete = Number.isFinite(offer.freteCents) && offer.freteCents > 0 ? offer.freteCents : 0;

  const marca = offer.marca || extractBrand(offer.titulo);
  const modelo = offer.modelo || extractModel(offer.titulo, marca);
  const atributos = Object.keys(offer.atributos || {}).length > 0
    ? offer.atributos
    : extractAttributes(offer.titulo);

  return {
    ...offer,
    marca,
    modelo,
    atributos,
    precoCents: preco,
    freteCents: frete,
    totalCents: preco + frete,
  };
}

/**
 * Agrupa um array de ofertas em produtos normalizados.
 * Ofertas com mesma chave canônica viram um NormalizedProduct único.
 * Ofertas sem marca/modelo ficam isoladas (chave inclui um sufixo único).
 */
export function groupIntoProducts(offers: ProductOffer[]): NormalizedProduct[] {
  const enriched = offers.map(enrichOffer).filter((o) => o.precoCents > 0);
  const buckets = new Map<string, ProductOffer[]>();
  let isolatedCounter = 0;

  for (const offer of enriched) {
    let key = buildCanonicalKey(offer.marca, offer.modelo, offer.atributos);
    // Sem marca E sem modelo: produto inclassificável, não deve ser deduplicado.
    if (!offer.marca && !offer.modelo) {
      key = `${key}|iso-${isolatedCounter++}`;
    }
    const bucket = buckets.get(key) || [];
    bucket.push(offer);
    buckets.set(key, bucket);
  }

  const products: NormalizedProduct[] = [];
  for (const [chave, ofertas] of buckets.entries()) {
    const sorted = ofertas.sort((a, b) => a.totalCents - b.totalCents);
    const min = sorted[0].totalCents;
    const max = sorted[sorted.length - 1].totalCents;
    const avg = Math.round(
      sorted.reduce((acc, o) => acc + o.totalCents, 0) / sorted.length,
    );

    // Título canônico: pega o mais longo (geralmente mais informativo)
    const titulo = sorted.reduce(
      (best, current) => (current.titulo.length > best.length ? current.titulo : best),
      sorted[0].titulo,
    );

    products.push({
      chave,
      titulo,
      marca: sorted[0].marca,
      modelo: sorted[0].modelo,
      atributos: sorted[0].atributos,
      ofertas: sorted,
      minTotalCents: min,
      avgTotalCents: avg,
      maxTotalCents: max,
    });
  }

  // Ordena produtos por menor preço.
  products.sort((a, b) => a.minTotalCents - b.minTotalCents);
  return products;
}
