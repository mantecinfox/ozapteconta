/**
 * Cliente HTTP enxuto usado pelos adapters do comparador de preços.
 *
 * - User-Agent realista (rotaciona) e Accept-Language pt-BR
 * - AbortSignal.timeout para enforço de timeout do adapter
 * - Retorna texto ou JSON conforme solicitado
 */

const REAL_USER_AGENTS = [
  // Chrome / Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
  // Chrome / macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
  // Firefox / Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
  // Safari / macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
];

function pickUserAgent(): string {
  /* SANITY CHECK: array sempre populado */
  if (REAL_USER_AGENTS.length === 0) {
    throw new Error("REAL_USER_AGENTS sem entradas — configure user agents válidos");
  }
  const idx = Math.floor(Math.random() * REAL_USER_AGENTS.length);
  return REAL_USER_AGENTS[idx];
}

export interface FetchOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  acceptJson?: boolean;
}

export async function fetchHtml(url: string, opts: FetchOptions = {}): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 8000;
  const headers: Record<string, string> = {
    "User-Agent": pickUserAgent(),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.7,en;q=0.5",
    "Cache-Control": "no-cache",
    ...opts.headers,
  };
  const res = await fetch(url, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ao buscar ${url}`);
  }
  return res.text();
}

export async function fetchJson<T = unknown>(url: string, opts: FetchOptions = {}): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 8000;
  const headers: Record<string, string> = {
    "User-Agent": pickUserAgent(),
    "Accept": "application/json",
    "Accept-Language": "pt-BR,pt;q=0.9",
    ...opts.headers,
  };
  const res = await fetch(url, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ao buscar ${url}`);
  }
  return (await res.json()) as T;
}

/** Converte um preço escrito em pt-BR ("R$ 1.799,90" ou "1799.90") para centavos. */
export function parseBRLToCents(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 100);
  }
  const cleaned = String(value)
    .replace(/[Rr]\$\s*/g, "")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".");
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}
