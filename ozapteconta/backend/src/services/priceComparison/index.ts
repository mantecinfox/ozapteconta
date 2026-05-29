/**
 * Ponto de entrada do pacote de comparação de preços.
 */

export { comparePrices } from "./priceComparisonService";
export { checkRateLimit } from "./priceCache";
export type {
  ComparisonSummary,
  NormalizedProduct,
  ProductOffer,
  PriceAdapter,
} from "./types";
