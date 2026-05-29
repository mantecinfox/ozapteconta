/**
 * Registry de adapters do comparador de preços.
 * Novos adapters (Amazon BR, Casas Bahia via Playwright) entram aqui no futuro.
 */

import type { PriceAdapter } from "../types";
import { mercadoLivreAdapter } from "./mercadoLivreAdapter";
import { buscapeAdapter } from "./buscapeAdapter";
import { buscapeApiAdapter } from "./buscapeApiAdapter";
import { magaluAdapter } from "./magaluAdapter";
import { kabumAdapter } from "./kabumAdapter";
import { pichauAdapter } from "./pichauAdapter";

const ADAPTERS: PriceAdapter[] = [
  mercadoLivreAdapter,
  buscapeApiAdapter,
  buscapeAdapter,
  magaluAdapter,
  kabumAdapter,
  pichauAdapter,
];

const REGISTRY = new Map<string, PriceAdapter>(ADAPTERS.map((a) => [a.slug, a]));

export function getAdapter(slug: string): PriceAdapter | undefined {
  return REGISTRY.get(slug);
}

export function listAdapters(): PriceAdapter[] {
  return [...REGISTRY.values()];
}
