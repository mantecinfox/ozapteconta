/**
 * Adapter Buscapé — usa página pública de busca e tenta extrair via JSON-LD.
 * Fallback: parser de selectors quando JSON-LD não vier completo.
 */

import * as cheerio from "cheerio";
import Bottleneck from "bottleneck";
import { fetchHtml, parseBRLToCents } from "../httpClient";
import { extractJsonLdProducts, jsonLdToOffers } from "./jsonLdHelpers";
import type { AdapterSearchOptions, PriceAdapter, ProductOffer } from "../types";

const limiter = new Bottleneck({ minTime: 3000 }); // máx 20/min

function buildSearchUrl(query: string): string {
  const slug = encodeURIComponent(query.trim().replace(/\s+/g, "+"));
  return `https://www.buscape.com.br/search?q=${slug}`;
}

function parseHtmlFallback(html: string, limit: number): ProductOffer[] {
  const $ = cheerio.load(html);
  const offers: ProductOffer[] = [];

  $("[data-testid='product-card'], a[data-name='product-card']").each((_, el) => {
    if (offers.length >= limit) return false;
    const $el = $(el);
    const titulo =
      $el.find("[data-testid='product-card::name']").first().text().trim() ||
      $el.find("h2, h3").first().text().trim();
    const precoStr =
      $el.find("[data-testid='product-card::price']").first().text() ||
      $el.find("[class*='Price'], [class*='price']").first().text();
    const link = $el.attr("href") || $el.find("a").first().attr("href");
    if (!titulo || !precoStr || !link) return;
    const precoCents = parseBRLToCents(precoStr);
    if (precoCents <= 0) return;
    const urlProduto = link.startsWith("http") ? link : `https://www.buscape.com.br${link}`;
    offers.push({
      fonteSlug: "buscape",
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
  });

  return offers;
}

export const buscapeAdapter: PriceAdapter = {
  slug: "buscape",
  displayName: "Buscapé",
  requiresPlaywright: false,

  async searchProducts(query: string, opts?: AdapterSearchOptions): Promise<ProductOffer[]> {
    const limit = Math.min(opts?.limit ?? 10, 20);
    const url = buildSearchUrl(query);
    const html = await limiter.schedule(() =>
      fetchHtml(url, { timeoutMs: opts?.timeoutMs ?? 8000 }),
    );

    const jsonLd = extractJsonLdProducts(html);
    const fromJsonLd = jsonLdToOffers(jsonLd, "buscape").slice(0, limit);
    if (fromJsonLd.length >= 3) return fromJsonLd;

    const fallback = parseHtmlFallback(html, limit);
    // mescla evitando duplicar pela URL
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
