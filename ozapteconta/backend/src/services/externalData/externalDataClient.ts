/**
 * Cliente HTTP compartilhado com fallback, retry, cache RAM/Redis/disco.
 */

import fs from "fs";
import path from "path";
import { getSharedRedisConnection } from "../../queues/redis";
import { logger } from "../../utils/logger";

export type ExternalDataErrorCode =
  | "TIMEOUT"
  | "RATE_LIMIT"
  | "NOT_FOUND"
  | "UPSTREAM"
  | "PARSE";

export class ExternalDataError extends Error {
  readonly code: ExternalDataErrorCode;
  readonly sourceSlug: string;
  readonly statusCode?: number;

  constructor(
    code: ExternalDataErrorCode,
    sourceSlug: string,
    message: string,
    statusCode?: number,
  ) {
    super(message);
    this.name = "ExternalDataError";
    this.code = code;
    this.sourceSlug = sourceSlug;
    this.statusCode = statusCode;
  }
}

export interface IndicatorPoint {
  value: number;
  referenceDate: string;
  sourceSlug: string;
}

export interface JsonFetchSource<T> {
  slug: string;
  url: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  parse: (payload: unknown) => T | null;
}

interface MemoryCacheEntry<T> {
  payload: T;
  expiresAt: number;
  staleUntil?: number;
}

const memoryCache = new Map<string, MemoryCacheEntry<unknown>>();
const inFlightRequests = new Map<string, Promise<unknown>>();

const DEFAULT_TIMEOUT_MS = 10_000;
const RETRY_DELAYS_MS = [300, 900];
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof ExternalDataError) {
    return err.code === "RATE_LIMIT" || err.code === "TIMEOUT" || err.code === "UPSTREAM";
  }
  if (err instanceof Error && err.name === "TimeoutError") return true;
  return false;
}

export async function fetchJsonOnce<T>(
  sourceSlug: string,
  url: string,
  options?: {
    headers?: Record<string, string>;
    timeoutMs?: number;
  },
): Promise<T> {
  if (typeof url !== "string" || !url.startsWith("http")) {
    throw new ExternalDataError("PARSE", sourceSlug, "URL inválida");
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastError: unknown;

  /* MAX_ITER: 3 — tentativa inicial + 2 retries */
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "ozapteconta/1.0",
          ...options?.headers,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.status === 429) {
        throw new ExternalDataError(
          "RATE_LIMIT",
          sourceSlug,
          `HTTP 429 — ${sourceSlug}`,
          429,
        );
      }
      if (response.status === 404) {
        throw new ExternalDataError(
          "NOT_FOUND",
          sourceSlug,
          `HTTP 404 — ${sourceSlug}`,
          404,
        );
      }
      if (!response.ok) {
        throw new ExternalDataError(
          RETRYABLE_STATUS.has(response.status) ? "UPSTREAM" : "UPSTREAM",
          sourceSlug,
          `HTTP ${response.status} — ${sourceSlug}`,
          response.status,
        );
      }

      const payload = await response.json() as unknown;
      return payload as T;
    } catch (err) {
      lastError = err;
      if (attempt >= RETRY_DELAYS_MS.length || !isRetryableError(err)) {
        break;
      }
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }

  if (lastError instanceof ExternalDataError) throw lastError;
  if (lastError instanceof Error && lastError.name === "TimeoutError") {
    throw new ExternalDataError("TIMEOUT", sourceSlug, `Timeout — ${sourceSlug}`);
  }
  throw new ExternalDataError(
    "UPSTREAM",
    sourceSlug,
    lastError instanceof Error ? lastError.message : String(lastError),
  );
}

export async function fetchJsonWithFallback<T>(
  sources: JsonFetchSource<T>[],
): Promise<{ payload: T; sourceSlug: string }> {
  if (!Array.isArray(sources) || sources.length === 0) {
    throw new ExternalDataError("PARSE", "none", "Nenhuma fonte configurada");
  }

  const errors: string[] = [];
  for (const source of sources) {
    try {
      const payload = await fetchJsonOnce<unknown>(source.slug, source.url, {
        headers: source.headers,
        timeoutMs: source.timeoutMs,
      });
      const parsed = source.parse(payload);
      if (parsed === null) {
        errors.push(`${source.slug}: parse inválido`);
        continue;
      }
      return { payload: parsed, sourceSlug: source.slug };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${source.slug}: ${message}`);
      logger.warn(`[externalData] fonte ${source.slug} falhou`, err);
    }
  }

  throw new ExternalDataError(
    "UPSTREAM",
    sources[sources.length - 1]?.slug ?? "unknown",
    errors.join(" | "),
  );
}

function memoryGet<T>(key: string, allowStale = false): T | null {
  const entry = memoryCache.get(key) as MemoryCacheEntry<T> | undefined;
  if (!entry) return null;
  const now = Date.now();
  if (now <= entry.expiresAt) return entry.payload;
  if (allowStale && entry.staleUntil && now <= entry.staleUntil) return entry.payload;
  memoryCache.delete(key);
  return null;
}

function memorySet<T>(
  key: string,
  payload: T,
  ttlMs: number,
  staleTtlMs = 24 * 60 * 60 * 1000,
): void {
  memoryCache.set(key, {
    payload,
    expiresAt: Date.now() + ttlMs,
    staleUntil: Date.now() + staleTtlMs,
  });
}

export async function redisGet<T>(key: string): Promise<T | null> {
  try {
    const redis = getSharedRedisConnection();
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.warn(`[externalData] redis get falhou ${key}`, err);
    return null;
  }
}

export async function redisSet<T>(key: string, payload: T, ttlSeconds: number): Promise<void> {
  try {
    const redis = getSharedRedisConnection();
    await redis.set(key, JSON.stringify(payload), "EX", ttlSeconds);
  } catch (err) {
    logger.warn(`[externalData] redis set falhou ${key}`, err);
  }
}

export function readDiskJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.warn(`[externalData] disco read falhou ${filePath}`, err);
    return null;
  }
}

export function writeDiskJson(filePath: string, payload: unknown): void {
  /* SANITY CHECK: diretório gravável */
  const dirPath = path.dirname(filePath);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
}

export async function withInFlight<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = inFlightRequests.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const created = factory().finally(() => {
    inFlightRequests.delete(key);
  });
  inFlightRequests.set(key, created as Promise<unknown>);
  return created;
}

export async function getCachedIndicator(
  cacheKey: string,
  factory: () => Promise<IndicatorPoint>,
  options?: { ttlMs?: number; redisTtlSeconds?: number },
): Promise<IndicatorPoint> {
  const ttlMs = options?.ttlMs ?? 60 * 60 * 1000;
  const redisTtlSeconds = options?.redisTtlSeconds ?? 3600;

  const fromMemory = memoryGet<IndicatorPoint>(cacheKey);
  if (fromMemory) return fromMemory;

  const redisKey = `macro:${cacheKey}`;
  const fromRedis = await redisGet<IndicatorPoint>(redisKey);
  if (fromRedis) {
    memorySet(cacheKey, fromRedis, ttlMs);
    return fromRedis;
  }

  return withInFlight(cacheKey, async () => {
    try {
      const fresh = await factory();
      memorySet(cacheKey, fresh, ttlMs);
      await redisSet(redisKey, fresh, redisTtlSeconds);
      return fresh;
    } catch (err) {
      const stale = memoryGet<IndicatorPoint>(cacheKey, true);
      if (stale) {
        logger.warn(`[externalData] servindo stale ${cacheKey}`, err);
        return { ...stale, sourceSlug: `${stale.sourceSlug}_stale` };
      }
      throw err;
    }
  });
}
