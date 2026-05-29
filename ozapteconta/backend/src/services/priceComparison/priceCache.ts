/**
 * Cache Redis das buscas por (fonte + query).
 * TTL padrão: 1 hora.
 */

import { getSharedRedisConnection } from "../../queues/redis";
import { logger } from "../../utils/logger";
import type { ProductOffer } from "./types";

const TTL_SECONDS = 60 * 60; // 1h

function normalizeQueryForKey(query: string): string {
  return query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 100);
}

function buildKey(sourceSlug: string, query: string): string {
  return `pricecmp:${sourceSlug}:${normalizeQueryForKey(query)}`;
}

export async function getCachedOffers(
  sourceSlug: string,
  query: string,
): Promise<ProductOffer[] | null> {
  try {
    const redis = getSharedRedisConnection();
    const raw = await redis.get(buildKey(sourceSlug, query));
    if (!raw) return null;
    return JSON.parse(raw) as ProductOffer[];
  } catch (err) {
    logger.warn(`[priceCache] erro ao ler cache ${sourceSlug}: ${String(err)}`);
    return null;
  }
}

export async function setCachedOffers(
  sourceSlug: string,
  query: string,
  offers: ProductOffer[],
): Promise<void> {
  try {
    const redis = getSharedRedisConnection();
    await redis.set(
      buildKey(sourceSlug, query),
      JSON.stringify(offers),
      "EX",
      TTL_SECONDS,
    );
  } catch (err) {
    logger.warn(`[priceCache] erro ao gravar cache ${sourceSlug}: ${String(err)}`);
  }
}

/**
 * Rate limit por usuário WhatsApp.
 * Permite até `limit` buscas em `windowSeconds`.
 * Retorna `true` se a chamada está dentro do limite.
 */
export async function checkRateLimit(
  phone: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number; resetInSeconds: number }> {
  /* SANITY CHECK: limites positivos */
  if (limit <= 0 || windowSeconds <= 0) {
    return { allowed: true, remaining: limit, resetInSeconds: 0 };
  }

  try {
    const redis = getSharedRedisConnection();
    const key = `pricecmp:rate:${phone}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }
    const ttl = await redis.ttl(key);
    const allowed = count <= limit;
    return {
      allowed,
      remaining: Math.max(0, limit - count),
      resetInSeconds: ttl > 0 ? ttl : windowSeconds,
    };
  } catch (err) {
    logger.warn(`[priceCache] erro no rate-limit ${phone}: ${String(err)}`);
    // Em falha do Redis, libera (fail-open) para não derrubar o fluxo.
    return { allowed: true, remaining: limit, resetInSeconds: 0 };
  }
}
