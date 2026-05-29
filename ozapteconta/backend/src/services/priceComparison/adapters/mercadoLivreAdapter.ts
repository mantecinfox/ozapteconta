/**
 * Adapter Mercado Livre — API oficial autenticada via OAuth (Client Credentials).
 *
 * Endpoint: GET https://api.mercadolibre.com/sites/MLB/search?q=...&limit=...
 * Requer header `Authorization: Bearer <access_token>` desde 2024.
 *
 * Sem credenciais (`MERCADO_LIVRE_CLIENT_ID` / `MERCADO_LIVRE_CLIENT_SECRET`)
 * o adapter lança erro instrutivo — o orquestrador registra como falha no
 * `PriceSearchLog` e prossegue com as demais fontes.
 */

import Bottleneck from "bottleneck";
import { parseBRLToCents } from "../httpClient";
import type { AdapterSearchOptions, PriceAdapter, ProductOffer } from "../types";
import {
  clearMercadoLivreTokenCache,
  getMercadoLivreAccessToken,
  isMercadoLivreConfigured,
} from "./mercadoLivreAuth";

interface MlbAttribute {
  id: string;
  name: string;
  value_name?: string | null;
}

interface MlbShipping {
  free_shipping?: boolean;
  store_pick_up?: boolean;
}

interface MlbResult {
  id: string;
  title: string;
  price: number;
  currency_id: string;
  permalink: string;
  thumbnail?: string;
  condition?: string;
  available_quantity?: number;
  seller?: {
    nickname?: string;
  };
  shipping?: MlbShipping;
  attributes?: MlbAttribute[];
  reviews?: {
    rating_average?: number;
    total?: number;
  };
}

interface MlbSearchResponse {
  results: MlbResult[];
}

const limiter = new Bottleneck({ minTime: 1000 });

async function callSearchApi(
  url: string,
  timeoutMs: number,
  retryOnAuthFail: boolean,
): Promise<MlbSearchResponse> {
  const token = await getMercadoLivreAccessToken(timeoutMs);

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Accept-Language": "pt-BR,pt;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (res.status === 401 || res.status === 403) {
    /* SANITY CHECK: token pode ter sido revogado/expirado antes da margem; tenta uma vez */
    if (retryOnAuthFail) {
      clearMercadoLivreTokenCache();
      return callSearchApi(url, timeoutMs, false);
    }
    const errBody = await res.text().catch(() => "");
    throw new Error(
      `Mercado Livre rejeitou o token (HTTP ${res.status}). ` +
        `Verifique se a aplicação cadastrada está ativa: ${errBody.slice(0, 180)}`,
    );
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ao buscar Mercado Livre (${url})`);
  }
  return (await res.json()) as MlbSearchResponse;
}

export const mercadoLivreAdapter: PriceAdapter = {
  slug: "mercado_livre",
  displayName: "Mercado Livre",
  requiresPlaywright: false,

  async searchProducts(query: string, opts?: AdapterSearchOptions): Promise<ProductOffer[]> {
    /* SANITY CHECK: fail fast com mensagem instrutiva se admin esqueceu credenciais */
    if (!isMercadoLivreConfigured()) {
      throw new Error(
        "Mercado Livre desativado: configure MERCADO_LIVRE_CLIENT_ID e " +
          "MERCADO_LIVRE_CLIENT_SECRET no .env (cadastro em " +
          "https://developers.mercadolivre.com.br/devcenter/applications/manage)",
      );
    }

    const limit = Math.min(opts?.limit ?? 15, 30);
    const url =
      `https://api.mercadolibre.com/sites/MLB/search` +
      `?q=${encodeURIComponent(query)}&limit=${limit}&condition=new`;
    const timeoutMs = opts?.timeoutMs ?? 8000;

    const data = await limiter.schedule(() => callSearchApi(url, timeoutMs, true));

    if (!data?.results?.length) return [];

    return data.results
      .filter((r) => r.currency_id === "BRL" && r.price > 0)
      .map((r): ProductOffer => {
        const marca = r.attributes?.find((a) => a.id === "BRAND")?.value_name || null;
        const modelo = r.attributes?.find((a) => a.id === "MODEL")?.value_name || null;
        const precoCents = parseBRLToCents(r.price);
        const freteCents = 0;
        return {
          fonteSlug: "mercado_livre",
          titulo: r.title,
          marca,
          modelo,
          atributos: {},
          precoCents,
          freteCents,
          totalCents: precoCents + freteCents,
          urlProduto: r.permalink,
          urlImagem: r.thumbnail,
          vendedor: r.seller?.nickname,
          ratingMedio: r.reviews?.rating_average,
          ratingCount: r.reviews?.total,
        };
      });
  },
};
