/**
 * Texto outbound WhatsApp: UTF-8, números pt-BR e emojis padronizados.
 */

export const WhatsAppEmoji = {
  grafico: "\u{1F4CA}",
  moedas: "\u{1F4B1}",
  alerta: "\u26A0\uFE0F",
  ultimo: "\u{1F4CC}",
  compra: "\u{1F6D2}",
  venda: "\u{1F4B0}",
  alta: "\u{1F4C8}",
  baixa: "\u{1F4C9}",
  fonte: "\u{1F3E6}",
  bitcoin: "\u{1F7E0}",
  ethereum: "\u{1F537}",
  cripto: "\u{1FA99}",
  ripple: "\u{1F4A7}",
  divisor: "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501",
} as const;

const CRIPTO_EMOJI_POR_SIMBOLO: Record<string, string> = {
  BTC: WhatsAppEmoji.bitcoin,
  ETH: WhatsAppEmoji.ethereum,
  XRP: WhatsAppEmoji.ripple,
  LTC: WhatsAppEmoji.cripto,
  SOL: WhatsAppEmoji.cripto,
  ADA: WhatsAppEmoji.cripto,
  BNB: WhatsAppEmoji.cripto,
};

const WHATSAPP_TEXT_MAX_CHARS = 4096;

/** Limite de legenda em imagens/documentos no WhatsApp (Cloud API / Baileys). */
export const WHATSAPP_IMAGE_CAPTION_MAX_CHARS = 1024;

/** Margem de segurança abaixo do limite de legenda. */
export const WHATSAPP_IMAGE_CAPTION_SAFE_CHARS = 980;

/** Divide texto longo em blocos seguros para o limite do WhatsApp (~4096 chars). */
export function splitWhatsAppText(textoBruto: string, maxChars = WHATSAPP_TEXT_MAX_CHARS): string[] {
  if (typeof textoBruto !== "string" || textoBruto.length === 0) return [""];
  const texto = prepareWhatsAppText(textoBruto);
  if (texto.length <= maxChars) return [texto];

  const blocos: string[] = [];
  let restante = texto;

  /* MAX_ITER: 64 */ 
  for (let iter = 0; iter < 64 && restante.length > 0; iter += 1) {
    if (restante.length <= maxChars) {
      blocos.push(restante);
      break;
    }

    let corte = restante.lastIndexOf("\n\n", maxChars);
    if (corte < maxChars * 0.4) corte = restante.lastIndexOf("\n", maxChars);
    if (corte < maxChars * 0.4) corte = restante.lastIndexOf(" ", maxChars);
    if (corte < maxChars * 0.25) corte = maxChars;

    blocos.push(restante.slice(0, corte).trimEnd());
    restante = restante.slice(corte).trimStart();
  }

  return blocos.filter((b) => b.length > 0);
}

/** Normaliza e valida UTF-8 antes de enviar ao Baileys / API oficial. */
export function prepareWhatsAppText(textoBruto: string): string {
  if (typeof textoBruto !== "string") {
    return "";
  }
  if (textoBruto.length === 0) {
    return "";
  }

  let texto = textoBruto.normalize("NFC");
  /* SANITY CHECK: round-trip UTF-8 descarta sequências inválidas */
  texto = Buffer.from(texto, "utf8").toString("utf8");
  return texto;
}

/** Formata número no padrão brasileiro sem depender de locale do SO. */
export function formatNumberPtBr(valor: number, casasDecimais = 2): string {
  if (!Number.isFinite(valor)) {
    return "0,00";
  }

  try {
    const formatado = valor.toLocaleString("pt-BR", {
      minimumFractionDigits: casasDecimais,
      maximumFractionDigits: casasDecimais,
    });
    if (formatado && !formatado.includes("?")) {
      return formatado;
    }
  } catch {
    // fallback manual abaixo
  }

  const fixo = valor.toFixed(casasDecimais);
  const [parteInteira, parteDecimal] = fixo.split(".");
  const comMilhar = parteInteira.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return parteDecimal !== undefined ? `${comMilhar},${parteDecimal}` : comMilhar;
}

export function emojiParaCripto(simbolo: string): string {
  return CRIPTO_EMOJI_POR_SIMBOLO[simbolo.toUpperCase()] ?? WhatsAppEmoji.cripto;
}

export interface BlocoCotacaoCriptoParams {
  simbolo: string;
  nomeExibicao: string;
  ultimo: number;
  compra: number;
  venda: number;
  maximo: number;
  minimo: number;
  fonte?: string;
}

export function montarBlocoCotacaoCripto(params: BlocoCotacaoCriptoParams): string {
  const emoji = emojiParaCripto(params.simbolo);
  const fonte = params.fonte ?? "Mercado Bitcoin";

  return (
    `${emoji} *${params.nomeExibicao} (${params.simbolo}/BRL)*\n` +
    `${WhatsAppEmoji.ultimo} Último: R$ ${formatNumberPtBr(params.ultimo, 2)}\n` +
    `${WhatsAppEmoji.compra} Compra: R$ ${formatNumberPtBr(params.compra, 2)}\n` +
    `${WhatsAppEmoji.venda} Venda: R$ ${formatNumberPtBr(params.venda, 2)}\n` +
    `${WhatsAppEmoji.alta} Máx hoje: R$ ${formatNumberPtBr(params.maximo, 2)}\n` +
    `${WhatsAppEmoji.baixa} Mín hoje: R$ ${formatNumberPtBr(params.minimo, 2)}\n` +
    `${WhatsAppEmoji.fonte} Fonte: ${fonte}`
  );
}

export function montarCabecalhoCotacoesMultiplas(): string {
  return (
    `${WhatsAppEmoji.grafico} *ÚLTIMAS COTAÇÕES SOLICITADAS*\n` +
    `${WhatsAppEmoji.divisor}`
  );
}
