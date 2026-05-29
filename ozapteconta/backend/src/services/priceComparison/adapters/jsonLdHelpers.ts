/**
 * Helpers para extrair produtos a partir de blocos JSON-LD (`schema.org/Product`)
 * presentes na maioria dos varejistas brasileiros.
 *
 * Usado por buscape, magalu, kabum e pichau como caminho preferencial
 * antes de cair em selectors CSS específicos.
 */

import * as cheerio from "cheerio";
import { parseBRLToCents } from "../httpClient";
import type { ProductOffer } from "../types";

interface JsonLdOffer {
  "@type"?: string;
  price?: number | string;
  priceCurrency?: string;
  url?: string;
  availability?: string;
  seller?: { name?: string };
}

interface JsonLdProduct {
  "@type"?: string | string[];
  name?: string;
  brand?: string | { name?: string };
  model?: string;
  image?: string | string[];
  url?: string;
  aggregateRating?: { ratingValue?: number; reviewCount?: number };
  offers?: JsonLdOffer | JsonLdOffer[] | { offers?: JsonLdOffer[] };
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === null || v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function flattenOffers(node: JsonLdProduct["offers"]): JsonLdOffer[] {
  if (!node) return [];
  if (Array.isArray(node)) return node;
  // pode vir como AggregateOffer com `offers` interno
  if (typeof node === "object" && "offers" in node && Array.isArray(node.offers)) {
    return node.offers;
  }
  return [node as JsonLdOffer];
}

/** Detecta blocos do tipo Product no JSON-LD da página. */
export function extractJsonLdProducts(html: string): JsonLdProduct[] {
  const $ = cheerio.load(html);
  const products: JsonLdProduct[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const nodes = asArray(parsed).flatMap((p) => {
        if (p && typeof p === "object" && "@graph" in p && Array.isArray(p["@graph"])) {
          return p["@graph"];
        }
        return [p];
      });
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const type = node["@type"];
        const isProduct = Array.isArray(type)
          ? type.includes("Product")
          : type === "Product";
        if (isProduct) {
          products.push(node as JsonLdProduct);
        }
      }
    } catch {
      // ignorar JSON-LD inválido
    }
  });

  return products;
}

/**
 * Converte produtos JSON-LD em ofertas. Quando o produto tem múltiplas
 * `offers`, retorna a oferta de menor preço.
 */
export function jsonLdToOffers(
  products: JsonLdProduct[],
  fonteSlug: string,
  fallbackUrl?: (productName: string) => string,
): ProductOffer[] {
  const offers: ProductOffer[] = [];

  for (const p of products) {
    if (!p.name) continue;
    const flatOffers = flattenOffers(p.offers);
    if (flatOffers.length === 0) continue;

    let bestPrice = Infinity;
    let bestOffer: JsonLdOffer | null = null;

    for (const o of flatOffers) {
      const cents = parseBRLToCents(o.price ?? null);
      if (cents > 0 && cents < bestPrice) {
        bestPrice = cents;
        bestOffer = o;
      }
    }

    if (!bestOffer || bestPrice === Infinity) continue;

    const brand =
      typeof p.brand === "string"
        ? p.brand
        : typeof p.brand === "object" && p.brand?.name
          ? p.brand.name
          : null;
    const image = Array.isArray(p.image) ? p.image[0] : p.image;
    const url = bestOffer.url || p.url || (fallbackUrl ? fallbackUrl(p.name) : "");
    if (!url) continue;

    offers.push({
      fonteSlug,
      titulo: p.name,
      marca: brand,
      modelo: p.model || null,
      atributos: {},
      precoCents: bestPrice,
      freteCents: 0,
      totalCents: bestPrice,
      urlProduto: url,
      urlImagem: image,
      vendedor: bestOffer.seller?.name,
      ratingMedio: p.aggregateRating?.ratingValue
        ? Number(p.aggregateRating.ratingValue)
        : undefined,
      ratingCount: p.aggregateRating?.reviewCount
        ? Number(p.aggregateRating.reviewCount)
        : undefined,
    });
  }

  return offers;
}
