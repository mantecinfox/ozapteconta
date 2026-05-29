/**
 * Orquestrador do comparador de preços.
 *
 * - Lista fontes habilitadas no banco (`PriceSearchSource`).
 * - Dispara adapters em paralelo com `Promise.allSettled`.
 * - Aplica cache Redis por (fonte, query).
 * - Persiste telemetria em `PriceSearchLog`.
 * - Agrega via `priceAggregator`.
 */

import { prisma } from "../../config/prisma";
import { logger } from "../../utils/logger";
import { getAdapter } from "./adapters";
import { aggregateOffers } from "./priceAggregator";
import { getCachedOffers, setCachedOffers } from "./priceCache";
import type { ComparisonSummary, ProductOffer } from "./types";

export interface SearchOptions {
  /** Telefone WhatsApp (E.164) — usado para telemetria. Opcional. */
  whatsappPhone?: string;
  /** Limite por adapter. Default 10. */
  perAdapterLimit?: number;
  /** Sobrescreve o timeout (ms) usado por todos os adapters. */
  timeoutMsOverride?: number;
}

export async function comparePrices(
  query: string,
  options: SearchOptions = {},
): Promise<ComparisonSummary> {
  const cleanedQuery = String(query || "").trim();
  /* SANITY CHECK: query mínima */
  if (cleanedQuery.length < 3) {
    return {
      query: cleanedQuery,
      totalOfertas: 0,
      fontesConsultadas: [],
      fontesComErro: [],
      produtos: [],
      menorOferta: null,
      maiorOferta: null,
      precoMedioCents: 0,
      top3: [],
      latenciaMs: 0,
    };
  }

  const startTs = Date.now();
  const sources = await prisma.priceSearchSource.findMany({
    where: { enabled: true },
  });

  if (sources.length === 0) {
    logger.warn("[priceComparison] nenhuma fonte habilitada em PriceSearchSource");
    return {
      query: cleanedQuery,
      totalOfertas: 0,
      fontesConsultadas: [],
      fontesComErro: [],
      produtos: [],
      menorOferta: null,
      maiorOferta: null,
      precoMedioCents: 0,
      top3: [],
      latenciaMs: Date.now() - startTs,
    };
  }

  const ofertasPorFonte = new Map<string, ProductOffer[]>();
  const fontesComErro: string[] = [];

  const tasks = sources.map(async (source) => {
    const adapter = getAdapter(source.slug);
    if (!adapter) {
      logger.warn(`[priceComparison] adapter não registrado para ${source.slug}`);
      fontesComErro.push(source.slug);
      return;
    }

    const taskStart = Date.now();
    let offers: ProductOffer[] = [];
    let fromCache = false;
    let errorMessage: string | null = null;

    try {
      const cached = await getCachedOffers(source.slug, cleanedQuery);
      if (cached) {
        offers = cached;
        fromCache = true;
      } else {
        offers = await adapter.searchProducts(cleanedQuery, {
          limit: options.perAdapterLimit ?? 10,
          timeoutMs: options.timeoutMsOverride ?? source.timeoutMs,
        });
        await setCachedOffers(source.slug, cleanedQuery, offers);
      }
      ofertasPorFonte.set(source.slug, offers);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      fontesComErro.push(source.slug);
      logger.warn(
        `[priceComparison] falha em ${source.slug}: ${errorMessage}`,
      );
      try {
        await prisma.priceSearchSource.update({
          where: { id: source.id },
          data: { lastErrorAt: new Date(), lastErrorMessage: errorMessage.slice(0, 500) },
        });
      } catch (updateErr) {
        logger.warn(`[priceComparison] falha registrando erro da fonte: ${String(updateErr)}`);
      }
    }

    const latencyMs = Date.now() - taskStart;
    const prices = offers.map((o) => o.totalCents).filter((c) => c > 0);
    const minPrice = prices.length ? Math.min(...prices) : null;
    const maxPrice = prices.length ? Math.max(...prices) : null;
    const avgPrice = prices.length
      ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
      : null;

    try {
      await prisma.priceSearchLog.create({
        data: {
          whatsappPhone: options.whatsappPhone || null,
          query: cleanedQuery.slice(0, 255),
          sourceSlug: source.slug,
          offersCount: offers.length,
          minPriceCents: minPrice,
          avgPriceCents: avgPrice,
          maxPriceCents: maxPrice,
          latencyMs,
          fromCache,
          errorMessage: errorMessage ? errorMessage.slice(0, 500) : null,
        },
      });
    } catch (logErr) {
      logger.warn(`[priceComparison] falha gravando log ${source.slug}: ${String(logErr)}`);
    }
  });

  await Promise.allSettled(tasks);

  return aggregateOffers({
    query: cleanedQuery,
    ofertasPorFonte,
    fontesComErro,
    latenciaMs: Date.now() - startTs,
  });
}
