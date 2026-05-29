import type { AiIntent } from "./aiLearningService";

/** Skins do motor de atendimento v3.0 */
export type ResponseSkin =
  | "financeiro"
  | "cripto"
  | "nutricional"
  | "fipe"
  | "educacional"
  | "geral";

export type EmotionalTone = "neutral" | "pressa" | "ansiedade" | "confusao" | "curiosidade";

export interface SkinContext {
  skin: ResponseSkin;
  tone: EmotionalTone;
  secondarySkin?: ResponseSkin;
}

const ZERO_DRIFT_BASE = `
MOTOR ZERO-DRIFT RESPONDER v3.0 — regras invioláveis:
- Nunca comece com "Olá", "Claro!", "Ótima pergunta!"
- Nunca termine com "Espero ter ajudado", "Posso ajudar em mais algo?"
- Cada linha carrega informação nova. Remova linhas sem valor.
- Não invente preços, cotações, estatísticas ou "estudos mostram".
- Não recomende compra/venda de ativos, diagnóstico médico ou promessa de resultado.
- Dado em tempo real indisponível: "Não tenho esse dado em tempo real. Consulte [fonte]."
- Português brasileiro. Formatação WhatsApp: *negrito*, _itálico_.
- Máximo 250 palavras salvo análise nutricional detalhada de refeição.
`.trim();

const SKIN_PROMPTS: Record<ResponseSkin, string> = {
  financeiro: `
SKIN FINANCEIRO — analítico, neutro, anti-hype.
Formato obrigatório:
📊 [DADO MACRO], [IMPACTO EM 1 FRASE]
💡 [CONCEITO EM 1-2 FRASES]

Lembrete: análise educacional, não recomendação.
`.trim(),

  cripto: `
SKIN CRIPTOMOEDAS — tecnólogo pragmático, fundamentos.
Formato obrigatório:
🔍 [CONTEXTO ON-CHAIN OU DE MERCADO RELEVANTE]
⚙️ [FUNDAMENTO EM 1-2 FRASES]
⚠️ [RISCO REAL]

Análise de fundamentos, não call de preço.
`.trim(),

  nutricional: `
SKIN NUTRICIONAL — científico, sem julgamentos, anti-dietas milagrosas.
Formato obrigatório (conteúdo educacional):
🍎 [FATO NUTRICIONAL CONSOLIDADO]
🥘 [SUGESTÃO PRÁTICA]
🚫 [MITO COMUM]

Conteúdo educacional. Não substitui nutricionista.
Para listas de alimentos/refeições: calcule macros em faixas (ex: 280–320 kcal), nunca valor exato.
`.trim(),

  fipe: `
SKIN FIPE E VEÍCULOS — pragmático, negociador, mercado real.
Formato obrigatório:
📋 FIPE: R$ [VALOR ou "consulte fipe.org.br"]
💸 Mercado real: [FAIXA DE NEGOCIAÇÃO]
🔧 Ponto de atenção: [PROBLEMA CRÔNICO OU CUSTO OCULTO]

Se não tiver valor FIPE, oriente consulta via comando "fipe [marca modelo ano]".
`.trim(),

  educacional: `
SKIN EDUCACIONAL — didático, paciente, método socrático.
Formato obrigatório:
🎓 [CONCEITO PRINCIPAL EM 1 FRASE]
📝 [EXEMPLO PRÁTICO OU ANALOGIA]
💡 [DICA DE PROVA OU ATALHO DE MEMORIZAÇÃO]
`.trim(),

  geral: `
SKIN GERAL — assistente ozapteconta.
Capacidades: contas a pagar/receber, resumos, TMB/IMC, nutrição, mercado, FIPE, comparador de preços.
Se a pergunta encaixa em um comando, explique o comando com 1 exemplo prático.
`.trim(),
};

const TONE_INSTRUCTIONS: Record<EmotionalTone, string> = {
  neutral: "",
  pressa: "TOM DETECTADO: pressa → bullets, zero preâmbulo, resposta imediata.",
  ansiedade: "TOM DETECTADO: ansiedade → 1 frase curta de acolhimento contextual (ex: 'Respira.'), depois resposta direta.",
  confusao: "TOM DETECTADO: confusão → 1 analogia simples antes do conceito.",
  curiosidade: "TOM DETECTADO: curiosidade → resposta direta com 1 dado interessante.",
};

const ANXIETY_MARKERS =
  /\b(meu deus|desespero|preocupad|ansios|medo|nervos|urgente|socorro|ajuda|nao sei o que fazer|não sei o que fazer)\b/i;
const HASTE_MARKERS = /\b(rapido|rápido|urgente|agora|ja|já|corre|preciso saber)\b/i;
const CONFUSION_MARKERS =
  /\b(nao entendi|não entendi|confus|como funciona|explica|nao sei|não sei|o que e|o que é)\b/i;
const CRYPTO_MARKERS =
  /\b(bitcoin|btc|ethereum|eth|cripto|criptomoeda|defi|nft|blockchain|binance|coinbase|carteira cripto|on-?chain)\b/i;
const EDUCATIONAL_MARKERS =
  /\b(prova|vestibular|enem|estudar|redacao|redação|matematica|matemática|historia|história|geografia|simulado|concurso|faculdade|escola|aula)\b/i;
const FIPE_MARKERS =
  /\b(fipe|carro|moto|veiculo|veículo|ipva|desvaloriz|seminovo|usado|km rodad)\b/i;

/** Detecta tom emocional a partir do texto (inclui áudio transcrito). */
export function detectEmotionalTone(text: string): EmotionalTone {
  const normalized = String(text || "").trim();
  if (!normalized) return "neutral";
  if (ANXIETY_MARKERS.test(normalized)) return "ansiedade";
  if (HASTE_MARKERS.test(normalized)) return "pressa";
  if (CONFUSION_MARKERS.test(normalized)) return "confusao";
  if (/\?$/.test(normalized) || /\b(por que|porque|como|qual)\b/i.test(normalized)) return "curiosidade";
  return "neutral";
}

/** Áudio/transcrição ininteligível — pede confirmação. */
export function buildUnclearAudioPrompt(topicHints: string[]): string {
  const optionA = topicHints[0] || "finanças";
  const optionB = topicHints[1] || "nutrição";
  return `Ruído no áudio. Confirme: dúvida sobre *${optionA}* ou *${optionB}*?`;
}

export function isLikelyUnclearTranscript(text: string): boolean {
  const transcript = String(text || "").trim();
  if (!transcript || transcript.length < 3) return true;
  if (/^[\W\d\s]+$/.test(transcript)) return true;
  const words = transcript.split(/\s+/).filter(Boolean);
  if (words.length <= 2 && transcript.length < 12) return true;
  return false;
}

/** Mapeia intent + texto para skin dominante (máx. 1 secundária). */
export function resolveResponseSkin(intent: AiIntent | "unknown", text: string): SkinContext {
  const tone = detectEmotionalTone(text);
  const lower = String(text || "").toLowerCase();

  if (intent === "nutrition" || intent === "diet_plan" || intent === "bmr") {
    return { skin: "nutricional", tone };
  }
  if (intent === "fipe" || intent === "fipezap" || FIPE_MARKERS.test(lower)) {
    const secondary = /\b(invest|aplicar|renda fixa|selic)\b/i.test(lower) ? ("financeiro" as ResponseSkin) : undefined;
    return { skin: "fipe", tone, secondarySkin: secondary };
  }
  if (intent === "market") {
    const skin: ResponseSkin = CRYPTO_MARKERS.test(lower) ? "cripto" : "financeiro";
    return { skin, tone };
  }
  if (CRYPTO_MARKERS.test(lower)) {
    return { skin: "cripto", tone };
  }
  if (EDUCATIONAL_MARKERS.test(lower)) {
    return { skin: "educacional", tone };
  }
  if (intent === "finance" || intent === "summary" || intent === "report") {
    return { skin: "financeiro", tone };
  }

  return { skin: "geral", tone };
}

/** Monta system prompt completo para chamada LLM. */
export function buildZeroDriftSystemPrompt(
  ctx: SkinContext,
  extras?: { marketData?: string; userName?: string },
): string {
  const parts: string[] = [ZERO_DRIFT_BASE];

  if (extras?.userName) {
    parts.push(`Nome do usuário (use no máximo 1 vez): ${extras.userName}`);
  }

  parts.push(SKIN_PROMPTS[ctx.skin]);

  if (ctx.secondarySkin && ctx.secondarySkin !== ctx.skin) {
    parts.push(`SKIN SECUNDÁRIA (máx. 1 linha complementar): ${SKIN_PROMPTS[ctx.secondarySkin]}`);
  }

  const toneLine = TONE_INSTRUCTIONS[ctx.tone];
  if (toneLine) parts.push(toneLine);

  if (extras?.marketData) {
    parts.push(`DADOS DE MERCADO REAIS (use estes números, não invente):\n${extras.marketData}`);
  }

  return parts.join("\n\n");
}

/** Prompt nutricional enriquecido (refeições + skin 3). */
export function buildZeroDriftNutritionPrompt(): string {
  return `${ZERO_DRIFT_BASE}

${SKIN_PROMPTS.nutricional}

ANÁLISE DE REFEIÇÃO (quando usuário listar alimentos):
━━━━━━━━━━━━━━━━
🍽️ *[Refeição]*
🔥 *Calorias:* [faixa] kcal
💪 *Proteína:* ~Xg · 🍞 *Carbo:* ~Xg · 🫒 *Gordura:* ~Xg
━━━━━━━━━━━━━━━━
✅ *Avaliação:* [bom / aceitável / evitar]
📏 *Porção ideal:* [...]
💡 *Dica:* [1 linha prática]

Calorias e macros SEMPRE em faixas. Sem saudação inicial. Interprete listas soltas sem pedir reformatação.`;
}

/** Prompt investimento (financeiro ou cripto). */
export function buildZeroDriftInvestmentPrompt(marketData: string, userText: string): string {
  const ctx = resolveResponseSkin("market", userText);
  return `${buildZeroDriftSystemPrompt(ctx, { marketData })}

Estruture a análise com os emojis da skin. Finalize com aviso educacional (não recomendação formal).`;
}
