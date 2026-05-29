/**
 * Adapter Buscapé API oficial (requer app-token + auth-token).
 * Fallback: desabilitar slug buscape_api e usar buscape (scraping).
 */

import Bottleneck from "bottleneck";
import { config } from "../../../config";
import { logger } from "../../../utils/logger";
import { fetchJsonOnce } from "../../externalData/externalDataClient";
import { parseBRLToCents } from "../httpClient";
import type { AdapterSearchOptions, PriceAdapter, ProductOffer } from "../types";

const limiter = new Bottleneck({ minTime: 2000 });

interface BuscapeApiOffer {
  offerName?: string;
  price?: number | string;
  url?: string;
  seller?: { sellerName?: string };
}

interface BuscapeApiResponse {
  offer?: BuscapeApiOffer[];
  offers?: BuscapeApiOffer[];
}

function parseOffers(payload: BuscapeApiResponse, limit: number): ProductOffer[] {
  const rawOffers = payload.offer ?? payload.offers ?? [];
  if (!Array.isArray(rawOffers)) return [];

  const offers: ProductOffer[] = [];
  for (const item of rawOffers) {
    if (offers.length >= limit) break;
    const titulo = String(item.offerName || "").trim();
    if (!titulo) continue;

    let precoCents = 0;
    if (typeof item.price === "number") {
      precoCents = Math.round(item.price * 100);
    } else if (typeof item.price === "string") {
      precoCents = parseBRLToCents(item.price);
    }
    if (precoCents <= 0) continue;

    const urlProduto = String(item.url || "").trim();
    if (!urlProduto.startsWith("http")) continue;

    offers.push({
      fonteSlug: "buscape_api",
      titulo,
      marca: null,
      modelo: null,
      atributos: {},
      precoCents,
      freteCents: 0,
      totalCents: precoCents,
      urlProduto,
      vendedor: item.seller?.sellerName ?? undefined,
    });
  }
  return offers;
}

export const buscapeApiAdapter: PriceAdapter = {
  slug: "buscape_api",
  displayName: "Buscapé API",
  requiresPlaywright: false,

  async searchProducts(query: string, opts?: AdapterSearchOptions): Promise<ProductOffer[]> {
    if (!config.externalData.buscapeApiConfigured) {
      logger.debug("[buscapeApi] tokens não configurados — adapter ignorado");
      return [];
    }

    const cleanedQuery = String(query || "").trim();
    if (cleanedQuery.length < 3) return [];

    const limit = Math.min(opts?.limit ?? 10, 20);
    const timeoutMs = opts?.timeoutMs ?? 8000;
    const keyword = encodeURIComponent(cleanedQuery);
    const url =
      `http://api.buscape.com.br/service/findOfferList/` +
      `?keyword=${keyword}&format=json&results=20`;

    return limiter.schedule(async () => {
      try {
        const payload = await fetchJsonOnce<BuscapeApiResponse>("buscape_api", url, {
          timeoutMs,
          headers: {
            "app-token": config.externalData.buscapeAppToken,
            "auth-token": config.externalData.buscapeAuthToken,
          },
        });
        return parseOffers(payload, limit);
      } catch (err) {
        logger.warn("[buscapeApi] busca falhou", err);
        throw err;
      }
    });
  },
};
