/**
 * Adapter Magalu (Magazine Luiza) — usa página de busca pública.
 * Extração preferencial via JSON-LD (Magalu publica `Product` em quase todas as listagens).
 */

import * as cheerio from "cheerio";
import Bottleneck from "bottleneck";
import { fetchHtml, parseBRLToCents } from "../httpClient";
import { extractJsonLdProducts, jsonLdToOffers } from "./jsonLdHelpers";
import type { AdapterSearchOptions, PriceAdapter, ProductOffer } from "../types";

const limiter = new Bottleneck({ minTime: 4000 }); // máx 15/min

function buildSearchUrl(query: string): string {
  const slug = encodeURIComponent(query.trim());
  return `https://www.magazineluiza.com.br/busca/${slug}/`;
}

function parseHtmlFallback(html: string, limit: number): ProductOffer[] {
  const $ = cheerio.load(html);
  const offers: ProductOffer[] = [];

  $("li[data-testid='product-card-container'], a[data-testid='product-card-container']").each(
    (_, el) => {
      if (offers.length >= limit) return false;
      const $el = $(el);
      const titulo =
        $el.find("[data-testid='product-title']").first().text().trim() ||
        $el.find("h2, h3").first().text().trim();
      const precoStr =
        $el.find("[data-testid='price-value']").first().text() ||
        $el.find("[class*='price__BestPriceValue'], [class*='price']").first().text();
      const link = $el.attr("href") || $el.find("a").first().attr("href");
      if (!titulo || !precoStr || !link) return;
      const precoCents = parseBRLToCents(precoStr);
      if (precoCents <= 0) return;
      const urlProduto = link.startsWith("http") ? link : `https://www.magazineluiza.com.br${link}`;
      offers.push({
        fonteSlug: "magalu",
        titulo,
        marca: null,
        modelo: null,
        atributos: {},
        precoCents,
        freteCents: 0,
        totalCents: precoCents,
        urlProduto,
      });
      return;
    },
  );

  return offers;
}

export const magaluAdapter: PriceAdapter = {
  slug: "magalu",
  displayName: "Magazine Luiza",
  requiresPlaywright: false,

  async searchProducts(query: string, opts?: AdapterSearchOptions): Promise<ProductOffer[]> {
    const limit = Math.min(opts?.limit ?? 10, 20);
    const url = buildSearchUrl(query);
    const html = await limiter.schedule(() =>
      fetchHtml(url, { timeoutMs: opts?.timeoutMs ?? 8000 }),
    );

    const jsonLd = extractJsonLdProducts(html);
    const fromJsonLd = jsonLdToOffers(jsonLd, "magalu").slice(0, limit);
    if (fromJsonLd.length >= 3) return fromJsonLd;

    const fallback = parseHtmlFallback(html, limit);
    const seen = new Set(fromJsonLd.map((o) => o.urlProduto));
    const merged = [...fromJsonLd];
    for (const o of fallback) {
      if (seen.has(o.urlProduto)) continue;
      seen.add(o.urlProduto);
      merged.push(o);
      if (merged.length >= limit) break;
    }
    return merged;
  },
};
