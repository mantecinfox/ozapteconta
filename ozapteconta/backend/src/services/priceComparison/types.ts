/**
 * Tipos compartilhados pelo comparador de preços.
 *
 * - `ProductOffer` representa UMA oferta crua trazida por um adapter.
 * - `NormalizedProduct` agrupa ofertas equivalentes (mesma marca+modelo).
 * - `PriceAdapter` é a interface que cada fonte (Mercado Livre, KaBuM, ...)
 *   precisa implementar para entrar no pipeline de busca.
 */

export interface ProductOffer {
  /** Slug da fonte (mercado_livre, buscape, magalu, kabum, pichau, etc). */
  fonteSlug: string;
  /** Título do anúncio na fonte (cru). */
  titulo: string;
  /** Marca detectada (Samsung, LG, Brastemp...) — null se não foi possível extrair. */
  marca: string | null;
  /** Modelo principal detectado (ex.: "UN50DU7700", "BRM44HK"). */
  modelo: string | null;
  /** Atributos normalizados úteis para deduplicação (litros, polegadas, GB...). */
  atributos: ProductAttributes;
  /** Preço do produto em centavos (BRL). */
  precoCents: number;
  /** Preço do frete em centavos (0 se não informado/grátis). */
  freteCents: number;
  /** Soma `precoCents + freteCents` — chave de ordenação para o top 3. */
  totalCents: number;
  /** URL da página do produto. */
  urlProduto: string;
  /** URL da imagem principal (opcional). */
  urlImagem?: string;
  /** Nome do vendedor exibido (loja oficial, marketplace seller, ...). */
  vendedor?: string;
  /** Avaliação média (0-5) quando disponível. */
  ratingMedio?: number;
  /** Quantidade de avaliações usadas para `ratingMedio`. */
  ratingCount?: number;
}

export interface ProductAttributes {
  /** Capacidade em litros (geladeiras, micro-ondas). */
  litros?: number;
  /** Tamanho em polegadas (TVs, monitores, notebooks). */
  polegadas?: number;
  /** Capacidade de armazenamento em GB (smartphones, SSDs, notebooks). */
  capacidadeGb?: number;
  /** Memória RAM em GB (notebooks, smartphones). */
  ramGb?: number;
  /** Voltagem normalizada ("110V", "220V", "BIVOLT"). */
  voltagem?: "110V" | "220V" | "BIVOLT";
}

export interface NormalizedProduct {
  /** Chave canônica usada para deduplicar (marca|modelo|atributos relevantes). */
  chave: string;
  /** Título canônico (escolhe o mais informativo entre as ofertas agrupadas). */
  titulo: string;
  marca: string | null;
  modelo: string | null;
  atributos: ProductAttributes;
  /** Ofertas agrupadas neste produto, ordenadas pelo menor `totalCents`. */
  ofertas: ProductOffer[];
  minTotalCents: number;
  avgTotalCents: number;
  maxTotalCents: number;
}

export interface ComparisonSummary {
  query: string;
  totalOfertas: number;
  fontesConsultadas: string[];
  fontesComErro: string[];
  produtos: NormalizedProduct[];
  /** Menor oferta entre TODAS as ofertas (não só top 3). */
  menorOferta: ProductOffer | null;
  /** Maior oferta entre TODAS as ofertas. */
  maiorOferta: ProductOffer | null;
  /** Média ponderada dos `totalCents` das ofertas. */
  precoMedioCents: number;
  /** Top 3 ofertas distintas por menor preço total. */
  top3: ProductOffer[];
  /** Tempo total da consulta em ms. */
  latenciaMs: number;
}

export interface AdapterSearchOptions {
  /** Limite de ofertas por adapter — usado para não sobrecarregar a resposta. */
  limit?: number;
  /** Timeout total do adapter (sobrescreve o configurado no banco). */
  timeoutMs?: number;
}

export interface PriceAdapter {
  /** Slug da fonte — precisa bater com `PriceSearchSource.slug`. */
  readonly slug: string;
  readonly displayName: string;
  /** Indica se o adapter exige Playwright instalado para funcionar. */
  readonly requiresPlaywright: boolean;
  /**
   * Faz a busca na fonte e retorna ofertas cruas (sem normalização).
   * Deve respeitar `opts.timeoutMs` e abortar se exceder.
   * Lançar erro em caso de falha — o orquestrador captura.
   */
  searchProducts(query: string, opts?: AdapterSearchOptions): Promise<ProductOffer[]>;
}
