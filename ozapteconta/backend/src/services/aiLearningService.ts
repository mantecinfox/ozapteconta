import { prisma } from "../config/prisma";
import { logger } from "../utils/logger";
import { phoneticNormalize } from "../utils/textTolerance";

export type AiIntent =
  | "nutrition"
  | "finance"
  | "market"
  | "fipe"
  | "fipezap"
  | "bmr"
  | "diet_plan"
  | "report"
  | "summary"
  | "list_pending"
  | "list_paid"
  | "mark_paid"
  | "help"
  | "models"
  | "priceSearch"
  | "unknown";

export type LearningChannel = "text" | "audio" | "recovery";

export interface IntentClassification {
  intent: AiIntent;
  confidence: number;
  source: "lesson" | "heuristic" | "disambiguation";
  lessonId?: number;
  matchedPattern?: string;
}

/** Comando explícito: modelo, modelos, MODELO, etc. Tolerante a erros. */
export function isModelsCommand(text: string): boolean {
  const n = normalizeForIntent(text);
  if (!n) return false;
  const p = phoneticNormalize(n);
  if (n === "modelo" || n === "modelos" || p === "modelo" || p === "modelos") return true;
  const tests: RegExp[] = [
    /^(ver|mostrar|quero|lista|listar)\s+modelos?$/,
    /^como\s+(digitar|falar|usar|perguntar|enviar)$/,
    /^(exemplos|templates?|frases modelo)$/,
    /^modelos?\s+(de\s+)?(frases|exemplos|comandos|mensagens)$/,
  ];
  return tests.some((r) => r.test(n) || (p !== n && r.test(p)));
}

export function normalizeForIntent(text: string): string {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Variantes fonéticas adicionadas inline para palavras-chave cujas letras
 * são "consumidas" por `phoneticNormalize` (k→c, w→v, y→i, ph→f).
 * Mantemos a forma correta + a forma fonética canônica no mesmo regex.
 */
const HEURISTIC_INTENT_RULES: Array<{ intent: AiIntent; regex: RegExp; weight: number }> = [
  {
    intent: "nutrition",
    weight: 0.88,
    regex:
      /\b(caloria|calorias|kcal|ccal|proteina|carbo|gordura|fibra|engorda|emagrece|comi|comer|coma|comendo|almoco|jantar|janta|lanche|cafe da manha|cafe da tarde|ceia|refeicao|dieta|saudavel|nutricional|nutricionista|quantas calorias)\b/,
  },
  {
    intent: "nutrition",
    weight: 0.72,
    regex:
      /\b(pao|paozinho|margarina|manteiga|queijo|leite|ovo|frango|carne|peixe|arroz|feijao|banana|maca|abacate|sanduiche|sanduiche natural|sandvich|iogurte|yogurte|tapioca|aveia|mel|granola|salada|pizza|hamburguer|sushi|chocolate|acai|suco|cafe|marmita|brocolis|atum|salmao|tilapia)\b/,
  },
  {
    intent: "market",
    weight: 0.88,
    regex:
      /\b(dolar|bitcoin|btc|xrp|ripple|eth|ethereum|cripto|criptomoeda|ibov|ibovespa|selic|cdi|ipca|petr4|vale3|cotacao|cotacoes|mercado hoje|bolsa|nasdaq|sp500)\b/,
  },
  { intent: "fipezap", weight: 0.94, regex: /\b(fipezap|fipe zap|indice imovel|indice imobiliario|preco imovel|aluguel indice)\b/ },
  { intent: "fipe", weight: 0.92, regex: /\bfipe\b/ },
  {
    intent: "bmr",
    weight: 0.88,
    regex:
      /\b(imc|tmb|metabolismo basal|taxa basal|taxa metabolica|tdee|gasto calorico|deficit calorico|superavit|bulking|cutting)\b/,
  },
  { intent: "summary", weight: 0.92, regex: /\bresumo\b/ },
  { intent: "list_pending", weight: 0.88, regex: /\b(ver contas|contas pendentes|minhas contas|contas a pagar|contas a receber)\b/ },
  { intent: "list_paid", weight: 0.88, regex: /\b(contas pagas|ja paguei|historico de pagamentos)\b/ },
  { intent: "mark_paid", weight: 0.92, regex: /\bpaguei\b/ },
  {
    intent: "report",
    weight: 0.95,
    regex: /\b(enviar pdf|enviar relatorio|pdf por email|pdf para o email|relatorio por email|resumo por email)\b/,
  },
  { intent: "report", weight: 0.88, regex: /\b(gerar pdf|relatorio|relatorio em pdf|enviar relatorio|e mail|email)\b/ },
  { intent: "help", weight: 0.75, regex: /\b(ajuda|menu|comandos|como funciona|o que voce faz)\b/ },
  { intent: "models", weight: 0.98, regex: /^modelos?$/ },
  { intent: "models", weight: 0.95, regex: /\b(ver|mostrar|quero)\s+modelos?\b/ },
  { intent: "models", weight: 0.92, regex: /^como\s+(digitar|falar|usar|perguntar)$/ },
  {
    intent: "priceSearch",
    weight: 0.96,
    regex: /\b(comparar?\s+pre[csçz]?o|comparar?\s+pre[csçz]?os|melhor\s+pre[csçz]?o|menor\s+pre[csçz]?o|mais\s+barato|onde\s+comprar)\b/,
  },
  {
    intent: "priceSearch",
    weight: 0.9,
    regex: /\b(cota[rç]?\s+(produto|valor)|(quanto|qto|qnto|cuanto|kuanto)\s+custa|pre[csçz]?o\s+de|valor\s+de)\b/,
  },
  {
    intent: "priceSearch",
    weight: 0.88,
    regex: /\b(buscar?\s+pre[csçz]?o|pesquisar?\s+pre[csçz]?o|pre[csçz]?o\s+da?\s+)\b/,
  },
  {
    intent: "finance",
    weight: 0.82,
    regex:
      /\b(paguei|recebi|compra|comprei|comprado|compras|gastei|gasto|vence|vencimento|aluguel|luz|agua|internet|boleto|cartao|fatura|salario|nota fiscal|cnpj|pj|receita|lucro|margem|venda|vendas|cliente|fornecedor|reais|real)\b/,
  },
  {
    intent: "finance",
    weight: 0.78,
    regex: /\b(whey|way|vhei|vei|wei|way pequeno|way liquido|suplemento)\b.*\b(\d{1,4}|reais|real|r\$)\b/,
  },
  {
    intent: "finance",
    weight: 0.7,
    regex: /\b(\d{1,6}([.,]\d{1,2})?\s*(reais|real|r\$))\b/,
  },
];

function heuristicClassify(normalized: string): IntentClassification {
  if (!normalized) return { intent: "unknown", confidence: 0, source: "heuristic" };

  /* Forma fonética só calculada uma vez; usada como fallback em todos os regex. */
  const phonetic = phoneticNormalize(normalized);

  let best: { intent: AiIntent; weight: number; pattern?: string } = {
    intent: "unknown",
    weight: 0,
  };

  for (const rule of HEURISTIC_INTENT_RULES) {
    const hit = rule.regex.test(normalized) || (phonetic !== normalized && rule.regex.test(phonetic));
    if (hit && rule.weight > best.weight) {
      best = { intent: rule.intent, weight: rule.weight, pattern: rule.regex.source };
    }
  }

  const calorieRegex = /\b(quanta?s? caloria|kcal|ccal|engorda|emagrece|saudavel)\b/;
  if (calorieRegex.test(normalized) || (phonetic !== normalized && calorieRegex.test(phonetic))) {
    best = { intent: "nutrition", weight: Math.max(best.weight, 0.95), pattern: "calorie_question" };
  }

  return {
    intent: best.intent,
    confidence: best.weight,
    source: "heuristic",
    matchedPattern: best.pattern,
  };
}

function lessonMatchScore(normalized: string, patternNormalized: string): number {
  if (!patternNormalized) return 0;
  if (normalized === patternNormalized) return 1;
  if (normalized.includes(patternNormalized)) {
    const ratio = patternNormalized.length / Math.max(normalized.length, 1);
    return 0.65 + ratio * 0.35;
  }

  /* Fallback fonético: compara as duas formas canônicas (corrige V↔W, K↔C, Y↔I, etc.). */
  const phoneticNorm = phoneticNormalize(normalized);
  const phoneticPat = phoneticNormalize(patternNormalized);
  if (phoneticNorm !== normalized || phoneticPat !== patternNormalized) {
    if (phoneticNorm === phoneticPat) return 0.95;
    if (phoneticNorm.includes(phoneticPat)) {
      const ratio = phoneticPat.length / Math.max(phoneticNorm.length, 1);
      return 0.6 + ratio * 0.3;
    }
  }

  const patternTokens = patternNormalized.split(" ").filter((t) => t.length > 2);
  if (patternTokens.length === 0) return 0;
  const hits = patternTokens.filter((t) => {
    if (normalized.includes(t)) return true;
    const tPhon = phoneticNormalize(t);
    return tPhon !== t && phoneticNorm.includes(tPhon);
  }).length;
  return hits / patternTokens.length;
}

/**
 * Consulta lições aprendidas e cai para heurística + desambiguação.
 */
export async function classifyIntent(text: string): Promise<IntentClassification> {
  const normalized = normalizeForIntent(text);
  if (!normalized) return { intent: "unknown", confidence: 0, source: "heuristic" };

  let bestLesson: IntentClassification | null = null;

  try {
    const lessons = await prisma.aiIntentLesson.findMany({
      where: { enabled: true },
      orderBy: [{ confidence: "desc" }, { hits: "desc" }],
      take: 300,
    });

    for (const lesson of lessons) {
      const key = lesson.patternNormalized;
      if (!key) continue;
      const score = lessonMatchScore(normalized, key);
      if (score < 0.55) continue;
      const combined = Math.min(1, score * (lesson.confidence || 0.6));
      if (!bestLesson || combined > bestLesson.confidence) {
        bestLesson = {
          intent: lesson.intent as AiIntent,
          confidence: combined,
          source: "lesson",
          lessonId: lesson.id,
          matchedPattern: lesson.pattern,
        };
      }
    }
  } catch (err) {
    logger.warn(`[AILearning] Falha consultando lições: ${String(err)}`);
  }

  const heuristic = heuristicClassify(normalized);
  let result = bestLesson && bestLesson.confidence >= heuristic.confidence ? bestLesson : heuristic;

  const disamb = disambiguateNutritionVsFinance(text);
  if (disamb && disamb !== "unknown") {
    const financeNutritionConflict =
      (result.intent === "nutrition" || result.intent === "finance") &&
      disamb !== result.intent;
    if (financeNutritionConflict || result.confidence < 0.75) {
      result = {
        intent: disamb,
        confidence: Math.max(result.confidence, 0.88),
        source: "disambiguation",
        lessonId: result.lessonId,
        matchedPattern: result.matchedPattern,
      };
    }
  }

  return result;
}

interface RegisterLessonInput {
  pattern: string;
  intent: AiIntent;
  exampleInput?: string;
  exampleOutput?: string;
  source?: string;
  notes?: string;
  initialConfidence?: number;
}

export async function registerLesson(input: RegisterLessonInput): Promise<void> {
  const patternNormalized = normalizeForIntent(input.pattern).slice(0, 255);
  if (!patternNormalized) return;

  try {
    await prisma.aiIntentLesson.upsert({
      where: { patternNormalized_intent: { patternNormalized, intent: input.intent } },
      update: {
        pattern: input.pattern,
        exampleInput: input.exampleInput,
        exampleOutput: input.exampleOutput,
        ...(input.notes ? { notes: input.notes } : {}),
        ...(input.initialConfidence ? { confidence: input.initialConfidence } : {}),
        enabled: true,
      },
      create: {
        pattern: input.pattern,
        patternNormalized,
        intent: input.intent,
        exampleInput: input.exampleInput,
        exampleOutput: input.exampleOutput,
        source: input.source || "system",
        notes: input.notes,
        confidence: input.initialConfidence ?? 0.7,
      },
    });
  } catch (err) {
    logger.warn(`[AILearning] Falha registrando lição: ${String(err)}`);
  }
}

export async function recordOutcome(lessonId: number | undefined, success: boolean): Promise<void> {
  if (!lessonId) return;
  try {
    const lesson = await prisma.aiIntentLesson.findUnique({ where: { id: lessonId } });
    if (!lesson) return;
    const hits = lesson.hits + (success ? 1 : 0);
    const misses = lesson.misses + (success ? 0 : 1);
    const total = hits + misses;
    const confidence = total > 0 ? Math.min(1, hits / total) : lesson.confidence;
    await prisma.aiIntentLesson.update({
      where: { id: lessonId },
      data: { hits, misses, confidence },
    });
  } catch (err) {
    logger.warn(`[AILearning] Falha gravando outcome: ${String(err)}`);
  }
}

export interface LearnFromTurnInput {
  text: string;
  intent: AiIntent;
  success: boolean;
  classification?: IntentClassification;
  channel?: LearningChannel;
  notes?: string;
}

/**
 * Reforça lições após acerto ou falha (texto, áudio ou recuperação pós-ilegível).
 */
export async function learnFromTurn(input: LearnFromTurnInput): Promise<void> {
  const trimmed = String(input.text || "").trim();
  if (!trimmed || input.intent === "unknown") return;

  if (input.success) {
    await recordOutcome(input.classification?.lessonId, true);
    const pattern =
      trimmed.length > 120
        ? normalizeForIntent(trimmed).split(" ").slice(0, 8).join(" ")
        : trimmed.slice(0, 200);
    await registerLesson({
      pattern,
      intent: input.intent,
      exampleInput: trimmed.slice(0, 500),
      source: input.channel ? `auto-${input.channel}` : "auto-learn",
      notes: input.notes || "Reforço automático após processamento bem-sucedido.",
      initialConfidence: Math.min(0.95, (input.classification?.confidence || 0.75) + 0.05),
    });
    return;
  }

  await recordOutcome(input.classification?.lessonId, false);
  logger.info(
    `[AILearning] Falha registrada intent=${input.intent} canal=${input.channel || "text"} texto="${trimmed.slice(0, 50)}"`,
  );
}

export async function learnFromUnreadableRecovery(text: string, success: boolean): Promise<void> {
  const classification = await classifyIntent(text);
  if (classification.intent === "unknown") return;
  await learnFromTurn({
    text,
    intent: classification.intent,
    success,
    classification,
    channel: "recovery",
    notes: success
      ? "Recuperado após payload WhatsApp incompleto."
      : "Falha após aviso de mensagem ilegível.",
  });
}

export async function ensureBaselineLessons(): Promise<void> {
  const baseline: RegisterLessonInput[] = [
    { pattern: "comi", intent: "nutrition", initialConfidence: 0.95, notes: "Verbo de ingestão" },
    { pattern: "quantas calorias", intent: "nutrition", initialConfidence: 0.98 },
    { pattern: "kcal", intent: "nutrition", initialConfidence: 0.95 },
    { pattern: "pao com ovo", intent: "nutrition", initialConfidence: 0.9 },
    { pattern: "5 ovos", intent: "nutrition", initialConfidence: 0.93, notes: "Lista de refeição coloquial" },
    { pattern: "bananas aveia mel", intent: "nutrition", initialConfidence: 0.9, notes: "Café da manhã composto" },
    { pattern: "cafe da manha", intent: "nutrition", initialConfidence: 0.88 },
    { pattern: "sanduiche natural", intent: "nutrition", initialConfidence: 0.75, notes: "Só nutrição se perguntar calorias" },
    { pattern: "compra de sanduiche", intent: "finance", initialConfidence: 0.9 },
    { pattern: "compra de way", intent: "finance", initialConfidence: 0.92 },
    { pattern: "way pequeno", intent: "finance", initialConfidence: 0.9 },
    { pattern: "compra de whey", intent: "finance", initialConfidence: 0.9 },
    { pattern: "20 reais", intent: "finance", initialConfidence: 0.85 },
    { pattern: "paguei", intent: "finance", initialConfidence: 0.95 },
    { pattern: "recebi", intent: "finance", initialConfidence: 0.9 },
    { pattern: "vence dia", intent: "finance", initialConfidence: 0.9 },
    { pattern: "resumo", intent: "summary", initialConfidence: 0.95 },
    { pattern: "ver contas", intent: "list_pending", initialConfidence: 0.95 },
    { pattern: "contas pagas", intent: "list_paid", initialConfidence: 0.95 },
    { pattern: "fipe", intent: "fipe", initialConfidence: 0.98 },
    { pattern: "fipezap", intent: "fipezap", initialConfidence: 0.98 },
    { pattern: "fipezap sao paulo", intent: "fipezap", initialConfidence: 0.97 },
    { pattern: "indice imovel", intent: "fipezap", initialConfidence: 0.95 },
    { pattern: "ipca hoje", intent: "market", initialConfidence: 0.95 },
    { pattern: "taxa cdi", intent: "market", initialConfidence: 0.95 },
    { pattern: "inflacao do mes", intent: "market", initialConfidence: 0.92 },
    { pattern: "ipc fipe", intent: "market", initialConfidence: 0.95 },
    { pattern: "ipca 12 meses", intent: "market", initialConfidence: 0.95 },
    { pattern: "dolar hoje", intent: "market", initialConfidence: 0.95 },
    { pattern: "bitcoin", intent: "market", initialConfidence: 0.95 },
    { pattern: "xrp", intent: "market", initialConfidence: 0.95 },
    { pattern: "bitcoin e xrp", intent: "market", initialConfidence: 0.98 },
    { pattern: "imc", intent: "bmr", initialConfidence: 0.95 },
    { pattern: "tmb", intent: "bmr", initialConfidence: 0.95 },
    { pattern: "modelo", intent: "models", initialConfidence: 0.99, notes: "Guia de frases para melhor resultado" },
    { pattern: "modelos", intent: "models", initialConfidence: 0.99 },
    { pattern: "como digitar", intent: "models", initialConfidence: 0.95 },
    { pattern: "como falar", intent: "models", initialConfidence: 0.95 },
    { pattern: "enviar pdf", intent: "report", initialConfidence: 0.95, notes: "Relatório PDF por e-mail" },
    { pattern: "pdf por email", intent: "report", initialConfidence: 0.95 },
    { pattern: "relatorio por email", intent: "report", initialConfidence: 0.95 },
    { pattern: "comparar preco", intent: "priceSearch", initialConfidence: 0.97, notes: "Comparador de preços (texto/audio)" },
    { pattern: "comparar precos", intent: "priceSearch", initialConfidence: 0.97 },
    { pattern: "menor preco", intent: "priceSearch", initialConfidence: 0.92 },
    { pattern: "melhor preco", intent: "priceSearch", initialConfidence: 0.92 },
    { pattern: "mais barato", intent: "priceSearch", initialConfidence: 0.9 },
    { pattern: "quanto custa", intent: "priceSearch", initialConfidence: 0.88 },
    { pattern: "preco da geladeira", intent: "priceSearch", initialConfidence: 0.9 },
    { pattern: "preco da tv", intent: "priceSearch", initialConfidence: 0.9 },
    { pattern: "preco do iphone", intent: "priceSearch", initialConfidence: 0.92 },
    { pattern: "cotar produto", intent: "priceSearch", initialConfidence: 0.92 },
    { pattern: "onde comprar", intent: "priceSearch", initialConfidence: 0.88 },
  ];

  for (const item of baseline) {
    await registerLesson({ ...item, source: "baseline" });
  }
}

export function disambiguateNutritionVsFinance(text: string): AiIntent | null {
  const n = normalizeForIntent(text);
  if (!n) return null;
  const p = phoneticNormalize(n);
  const t = (r: RegExp) => r.test(n) || (p !== n && r.test(p));

  const hasPrice =
    t(/\b(\d{1,6}([.,]\d{1,2})?\s*(reais|real|r\$))\b/) ||
    t(/\br\$\s*\d/) ||
    t(/\b\d{1,4}\s+reais\b/);
  const hasFinanceVerb = t(
    /\b(paguei|comprei|compra|compras|gastei|recebi|vence|vencimento|boleto|fatura|cartao|aluguel|luz|agua|internet|salario)\b/,
  );
  const hasNutritionVerb = t(
    /\b(comi|comer|coma|comendo|jantei|almocei|tomei|tomar|refeicao|engorda|emagrece|saudavel|caloria|calorias|kcal|ccal|proteina|macro)\b/,
  );
  const askingCalories = t(/\b(quanta?s? caloria|kcal|ccal|engorda|emagrece|saudavel|faz mal|faz bem)\b/);

  if (askingCalories) return "nutrition";
  if (hasFinanceVerb && hasPrice) return "finance";
  if (hasFinanceVerb && !hasNutritionVerb) return "finance";
  if (hasNutritionVerb && !hasFinanceVerb) return "nutrition";
  if (hasNutritionVerb && hasFinanceVerb && hasPrice) return "finance";

  return null;
}

/** Indica se a intenção deve pular nutrição e ir direto ao financeiro. */
export function shouldPreferFinanceRoute(text: string): boolean {
  if (isNutritionAdviceQuery(text)) return false;
  if (isPriceSearchQuery(text)) return false;
  if (/\b(pdf|relat[oó]rio|resumo)\b/i.test(text) && /\b(email|e-mail|gmail|enviar|envie)\b/i.test(text)) {
    return false;
  }
  const c = disambiguateNutritionVsFinance(text);
  if (c === "finance") return true;

  const n = normalizeForIntent(text);
  const p = phoneticNormalize(n);
  const t = (r: RegExp) => r.test(n) || (p !== n && r.test(p));
  return (
    t(/\b(compra|comprei|paguei|gastei|recebi)\b/) &&
    t(/\b(\d{1,6}|reais|real|r\$)\b/)
  );
}

/** Detecta perguntas de comparação/pesquisa de preço (eletro/eletrônicos). */
export function isPriceSearchQuery(text: string): boolean {
  const n = normalizeForIntent(text);
  if (!n) return false;
  const p = phoneticNormalize(n);
  const t = (r: RegExp) => r.test(n) || (p !== n && r.test(p));

  if (t(/\b(comparar?|compare|compara)\s+(o\s+)?pre[csçz]?o/)) return true;
  if (t(/\b(menor|melhor|mais barato)\s+(o\s+)?pre[csçz]?o/)) return true;
  if (t(/\b(quanto|qto|qnto|cuanto|kuanto)\s+custa|\b(onde comprar|cotar produto)\b/)) return true;
  if (t(/\b(buscar|pesquisar)\s+(o\s+)?pre[csçz]?o/)) return true;
  // "preço de" + substantivo de produto sem verbo financeiro
  if (t(/\b(paguei|comprei|compra|compras|gastei|recebi)\b/)) return false;
  if (t(/\bpre[csçz]?o\s+(de|da|do|das|dos)\b/)) return true;
  return false;
}

/**
 * Extrai a "query de produto" descartando comandos como "comparar preço",
 * "quanto custa", "onde comprar", etc. Usado pelo handler do WhatsApp.
 */
export function extractProductQuery(text: string): string {
  const original = String(text || "").trim();
  if (!original) return "";
  let cleaned = original;

  const stripPatterns: RegExp[] = [
    /^(comparar?|compare|compara|cota[rç]?|cotar|cota|buscar?|pesquisar?|busque|pesquise|pesquisa)\s+(o\s+)?pre[cç]?o(s)?\s+(d[aeo]s?\s+)?/i,
    /^(comparar?|compare|compara)\s+/i,
    /^(menor|melhor|mais\s+barato)\s+pre[cç]?o\s+(d[aeo]s?\s+)?/i,
    /^pre[cç]?o\s+(d[aeo]s?\s+)?/i,
    /^(quanto\s+custa|quanto\s+vale|quanto\s+sai)\s+(uma?|os?|as?|o|a)?\s*/i,
    /^onde\s+comprar\s+(uma?|os?|as?|o|a)?\s*/i,
    /^(quero|preciso)\s+(comprar|achar|encontrar)\s+(uma?|os?|as?|o|a)?\s*/i,
  ];

  for (const pattern of stripPatterns) {
    cleaned = cleaned.replace(pattern, "");
  }

  return cleaned.replace(/[?!.]+$/g, "").replace(/\s+/g, " ").trim();
}

/** Perguntas pedindo lista/recomendação (não lançamento financeiro). */
export function isNutritionAdviceQuery(text: string): boolean {
  const n = normalizeForIntent(text);
  if (!n) return false;
  const p = phoneticNormalize(n);
  const t = (r: RegExp) => r.test(n) || (p !== n && r.test(p));

  const asks =
    t(/\b(me envie|me manda|envie|liste|listar|quais|qual|sugira|recomende|indique|cite|fale sobre|diga|preciso de|quero saber)\b/) ||
    t(/\b(tres|três|3)\b/);
  const topic = t(
    /\b(carboidrato|proteina|gordura|fibra|alimento|refeicao|dieta|nutri|whey|way|vhei|vei|suplemento|vitamina|macro|saudavel)\b/,
  );
  return asks && topic;
}
