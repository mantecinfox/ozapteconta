/**
 * Agregador de ofertas vindas de múltiplos adapters.
 *
 * - Recebe array bruto de `ProductOffer`.
 * - Normaliza e agrupa em `NormalizedProduct` usando `productNormalizer`.
 * - Calcula min/avg/max das ofertas (não dos produtos).
 * - Retorna top 3 ofertas distintas (uma por produto canônico) por menor preço.
 */

import { groupIntoProducts } from "./productNormalizer";
import type {
  ComparisonSummary,
  NormalizedProduct,
  ProductOffer,
} from "./types";

export interface AggregateInput {
  query: string;
  ofertasPorFonte: Map<string, ProductOffer[]>;
  fontesComErro: string[];
  latenciaMs: number;
}

export function aggregateOffers(input: AggregateInput): ComparisonSummary {
  const todasOfertas: ProductOffer[] = [];
  for (const ofertas of input.ofertasPorFonte.values()) {
    todasOfertas.push(...ofertas);
  }

  const produtos: NormalizedProduct[] = groupIntoProducts(todasOfertas);

  if (todasOfertas.length === 0) {
    return {
      query: input.query,
      totalOfertas: 0,
      fontesConsultadas: [...input.ofertasPorFonte.keys()],
      fontesComErro: input.fontesComErro,
      produtos: [],
      menorOferta: null,
      maiorOferta: null,
      precoMedioCents: 0,
      top3: [],
      latenciaMs: input.latenciaMs,
    };
  }

  // Min, max e média sobre TODAS as ofertas (não só top 3).
  const todasOrdenadas = [...todasOfertas]
    .filter((o) => o.totalCents > 0)
    .sort((a, b) => a.totalCents - b.totalCents);
  const menor = todasOrdenadas[0];
  const maior = todasOrdenadas[todasOrdenadas.length - 1];
  const media =
    todasOrdenadas.reduce((acc, o) => acc + o.totalCents, 0) /
    Math.max(todasOrdenadas.length, 1);

  // Top 3: uma melhor oferta por produto canônico (já ordenado por minTotalCents).
  const top3 = produtos
    .slice(0, 3)
    .map((p) => p.ofertas[0]);

  return {
    query: input.query,
    totalOfertas: todasOfertas.length,
    fontesConsultadas: [...input.ofertasPorFonte.keys()],
    fontesComErro: input.fontesComErro,
    produtos,
    menorOferta: menor,
    maiorOferta: maior,
    precoMedioCents: Math.round(media),
    top3,
    latenciaMs: input.latenciaMs,
  };
}
