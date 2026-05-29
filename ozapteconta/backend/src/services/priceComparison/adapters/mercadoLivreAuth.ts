/**
 * Autenticação OAuth do Mercado Livre Developers (Client Credentials Grant).
 *
 * Desde 2024 a API publica `api.mercadolibre.com/sites/MLB/search` deixou
 * de aceitar acesso anônimo (retorna 403 `PA_UNAUTHORIZED_RESULT_FROM_POLICIES`).
 * Para usar o adapter de Mercado Livre é necessário cadastrar uma aplicação em
 *   https://developers.mercadolivre.com.br/devcenter/applications/manage
 * e setar no `.env`:
 *   MERCADO_LIVRE_CLIENT_ID=<App ID>
 *   MERCADO_LIVRE_CLIENT_SECRET=<Client Secret>
 *
 * Este módulo cacheia o `access_token` em memória do processo. O token MLB tem
 * validade de ~21600 segundos (6h); renovamos com margem de 5 minutos.
 */

import { config } from "../../../config";

interface MlbTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  user_id?: number;
}

interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}

let cached: CachedToken | null = null;
let inFlight: Promise<string> | null = null;

/* MAX_ITER: 1 — função chamada com mutex via `inFlight` */
async function requestNewToken(timeoutMs: number): Promise<string> {
  const { clientId, clientSecret } = config.priceComparison.mercadoLivre;

  /* SANITY CHECK: credenciais obrigatórias antes de qualquer request */
  if (!clientId || !clientSecret) {
    throw new Error(
      "Mercado Livre exige credenciais OAuth — cadastre uma aplicação em " +
        "https://developers.mercadolivre.com.br/devcenter/applications/manage e " +
        "configure MERCADO_LIVRE_CLIENT_ID e MERCADO_LIVRE_CLIENT_SECRET no .env",
    );
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(
      `Falha ao obter token Mercado Livre: HTTP ${res.status} — ${errBody.slice(0, 200)}`,
    );
  }

  const json = (await res.json()) as MlbTokenResponse;
  if (!json.access_token || typeof json.expires_in !== "number") {
    throw new Error("Resposta de token Mercado Livre inválida (sem access_token / expires_in)");
  }

  const safetyMs = 5 * 60 * 1000;
  cached = {
    accessToken: json.access_token,
    expiresAtMs: Date.now() + json.expires_in * 1000 - safetyMs,
  };
  return cached.accessToken;
}

/**
 * Devolve um access_token válido. Reaproveita o cache em memória e serializa
 * pedidos concorrentes via `inFlight` para evitar múltiplos POSTs simultâneos.
 */
export async function getMercadoLivreAccessToken(timeoutMs = 8000): Promise<string> {
  if (cached && cached.expiresAtMs > Date.now()) {
    return cached.accessToken;
  }
  if (inFlight) return inFlight;

  inFlight = requestNewToken(timeoutMs).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Invalida o cache (útil quando um request com token vier 401/403). */
export function clearMercadoLivreTokenCache(): void {
  cached = null;
}

export function isMercadoLivreConfigured(): boolean {
  return config.priceComparison.mercadoLivre.configured;
}
