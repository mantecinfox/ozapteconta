/**
 * Adapter KaBuM! — usa a página de busca pública.
 * KaBuM embute dados no Next.js (__NEXT_DATA__) — tentamos primeiro JSON-LD,
 * depois caímos para selectors de produto.
 */

import * as cheerio from "cheerio";
import Bottleneck from "bottleneck";
import { fetchHtml, parseBRLToCents } from "../httpClient";
import { extractJsonLdProducts, jsonLdToOffers } from "./jsonLdHelpers";
import type { AdapterSearchOptions, PriceAdapter, ProductOffer } from "../types";

const limiter = new Bottleneck({ minTime: 3000 }); // máx 20/min

function buildSearchUrl(query: string): string {
  const slug = encodeURIComponent(query.trim());
  return `https://www.kabum.com.br/busca/${slug}`;
}

function parseHtmlFallback(html: string, limit: number): ProductOffer[] {
  const $ = cheerio.load(html);
  const offers: ProductOffer[] = [];

  $("a[class*='productCard'], a[data-smarthintproductid]").each((_, el) => {
    if (offers.length >= limit) return false;
    const $el = $(el);
    const titulo =
      $el.find("span[class*='nameCard'], h2, h3").first().text().trim();
    const precoStr =
      $el.find("span[class*='priceCard']").first().text() ||
      $el.find("[class*='price']").first().text();
    const link = $el.attr("href");
    if (!titulo || !precoStr || !link) return;
    const precoCents = parseBRLToCents(precoStr);
    if (precoCents <= 0) return;
    const urlProduto = link.startsWith("http") ? link : `https://www.kabum.com.br${link}`;
    offers.push({
      fonteSlug: "kabum",
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

export const kabumAdapter: PriceAdapter = {
  slug: "kabum",
  displayName: "KaBuM!",
  requiresPlaywright: false,

  async searchProducts(query: string, opts?: AdapterSearchOptions): Promise<ProductOffer[]> {
    const limit = Math.min(opts?.limit ?? 10, 20);
    const url = buildSearchUrl(query);
    const html = await limiter.schedule(() =>
      fetchHtml(url, { timeoutMs: opts?.timeoutMs ?? 8000 }),
    );

    const jsonLd = extractJsonLdProducts(html);
    const fromJsonLd = jsonLdToOffers(jsonLd, "kabum").slice(0, limit);
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
