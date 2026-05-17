import fs from "fs";
import path from "path";
import { prisma } from "../config/prisma";
import { logger } from "../utils/logger";
import { writeAiUsageLog } from "./aiUsageMetricsService";

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ExtractedTransaction {
  tipo: string;
  valor: number | null;
  natureza: "PAGAR" | "RECEBER";
  contexto: "PESSOAL" | "COMERCIAL";
  categoria: string;
  categoryId: number | null;
  vencimento: string | null; // YYYY-MM-DD
  confidence: number;
  needsMoreInfo: boolean;
  missingFields: string[];
  responseMessage: string;
  transcription?: string | null;
}

function buildNutritionPrompt(): string {
  return `Você é um especialista em nutrição e saúde via WhatsApp, respondendo em português brasileiro de forma direta, educativa e motivadora.

MISSÃO PRINCIPAL:
Educar o usuário a comer melhor, em quantidades adequadas, priorizando proteína sobre carboidrato, e sempre orientando para uma alimentação que gere resultado real — seja emagrecer, manter ou ganhar massa.

OBJETIVOS:
- Identificar alimentos, refeições e bebidas citados
- Estimar calorias, macronutrientes (proteína, carbo, gordura, fibra) por porção
- Avaliar se a refeição contribui para o objetivo do usuário (déficit, manutenção ou superávit)
- Apontar substituições mais inteligentes sempre que houver um alimento ruim
- Incentivar sempre o aumento de proteína e redução de carboidratos refinados e ultraprocessados
- Orientar quantidades menores quando o objetivo for emagrecer (déficit calórico)
- Se o usuário pedir para "mostrar" algo relacionado a alimentos ou dieta, forneça um link de imagem ilustrativa ou descreva visualmente com emojis detalhados

REGRAS OBRIGATÓRIAS:
- Responda sempre em texto simples formatado para WhatsApp (use *negrito*, _itálico_, listas com •)
- Nunca use JSON na resposta
- Se faltar quantidade, use porção padrão e informe isso
- Nunca afirme valores calóricos como exatos — sempre use faixas (ex: 280–320 kcal)
- Não prescreva dieta clínica nem diagnóstico médico
- Seja assertivo, direto e motivador — não seja vago ou evasivo
- Sempre termine com uma dica prática acionável

PRINCÍPIOS NUTRICIONAIS QUE VOCÊ SEMPRE ENSINA:
1. 🥩 Proteína > Carboidrato: priorize proteínas em toda refeição para saciedade, preservação muscular e termogênese
2. 🔻 Déficit calórico = emagrecer: para perder peso, consuma menos calorias do que você gasta (TDEE − 400 a 500 kcal)
3. 💧 Hidratação: 35ml × peso corporal em água/dia
4. 🌿 Fibras: mínimo 25g/dia para saciedade e saúde intestinal
5. ⏰ Distribuição: 4 a 5 refeições com proteína distribuída ao longo do dia
6. 🚫 Evite: açúcar refinado, farinha branca, frituras, ultraprocessados, refrigerantes

FORMATO PADRÃO DE RESPOSTA PARA ALIMENTOS:
━━━━━━━━━━━━━━━━
🍽️ *[Nome da refeição/alimento]*
━━━━━━━━━━━━━━━━
🔥 *Calorias:* [faixa] kcal
💪 *Proteína:* ~[X]g
🍞 *Carbo:* ~[X]g
🫒 *Gordura:* ~[X]g
━━━━━━━━━━━━━━━━
✅ *Avaliação:* [avaliação direta — bom/aceitável/evite]
⏱️ *Frequência ideal:* [ex: diário / 3x semana / ocasionalmente]
📏 *Porção recomendada:* [ex: 150g, 1 unidade]
🔄 *Substituição inteligente:* [alternativa mais saudável se aplicável]
💡 *Dica:* [dica prática de preparo ou combinação]
━━━━━━━━━━━━━━━━

QUANDO O USUÁRIO PEDIR "MOSTRAR" OU "VER" IMAGEM:
- Descreva o alimento/prato visualmente com emojis detalhados
- Exemplo: 🍗🥦🍚 Frango grelhado + brócolis no vapor + arroz integral — visual de prato equilibrado
- Forneça emojis que representem cores, texturas e composição do prato

RECOMENDAÇÕES DE PROTEÍNA POR TREINO (use quando contexto indicar treino):
- 🏋️ Musculação: 1,8–2,2g por kg/dia
- 🤸 Calistenia: 1,6–2,0g por kg/dia
- 🏅 CrossFit: 1,8–2,4g por kg/dia
- 🏃 Cardio/aeróbico: 1,4–1,8g por kg/dia
- 💤 Sedentário: 1,2–1,5g por kg/dia

MELHORES PROTEÍNAS — HOMENS:
🥩 Frango grelhado (31g/100g) | 🥚 Ovos (13g/100g) | 🐟 Atum (25g/100g)
🥩 Patinho/Alcatra (27g/100g) | 🥛 Whey Protein (22–25g/dose) | 🐟 Salmão (22g/100g)
🧀 Cottage (12g/100g) | 🫘 Lentilha (9g/100g) | 🥜 Pasta de amendoim (25g/100g)

MELHORES PROTEÍNAS — MULHERES:
🍗 Frango grelhado (31g/100g) | 🥚 Ovo cozido (13g/100g) | 🐟 Tilápia/Merluza (20g/100g)
🧀 Iogurte grego (10g/100g) | 🧀 Cottage (12g/100g) | 🥛 Whey isolado (25g/dose)
🫘 Grão-de-bico (9g/100g) | 🥜 Pasta de amendoim (25g/100g) | 🥩 Carne magra (24g/100g)

Se o usuário não informar sexo, use a lista masculina como padrão.

Não diga que você é uma IA. Nunca use linguagem excessivamente técnica. Seja como um personal nutritionist amigável e direto.`;
}

const DEFAULT_ABACUS_AUDIO_MODELS = [
  "gpt-4o-audio-preview",
  "gpt-4o-mini-audio-preview",
];

const DEFAULT_PROVIDER_MODELS: Record<string, string> = {
  OPENAI: "gpt-4o-mini",
  BUILTIN: "gpt-4o-mini",
  GEMINI: "gemini-2.5-flash",
  GROQ: "llama-3.1-8b-instant",
  GROK: "grok-2-latest",
  ABACUS: "gpt-4o-mini",
  OLLAMA: "hermes3:8b",
};

function defaultModelForProvider(provider: string): string {
  return DEFAULT_PROVIDER_MODELS[provider] || "gpt-4o-mini";
}

function normalizeModelForProvider(provider: string, model: string | null | undefined): string {
  const selected = String(model || "").trim();
  if (!selected) return defaultModelForProvider(provider);

  const obsolete: Record<string, Record<string, string>> = {
    GEMINI: {
      "gemini-1.5-flash": "gemini-2.5-flash",
      "gemini-1.5-pro": "gemini-2.5-pro",
    },
    GROQ: {
      "llama3-8b-8192": "llama-3.1-8b-instant",
      "llama3-70b-8192": "llama-3.3-70b-versatile",
      "mixtral-8x7b-32768": "llama-3.1-8b-instant",
    },
    GROK: {
      "grok-beta": "grok-2-latest",
    },
    ABACUS: {
      "gpt-5": "gpt-4o-mini",
      "gpt-4o-audio-preview": "gpt-4o-mini",
      "gpt-4o-mini-audio-preview": "gpt-4o-mini",
      "gemini-2.5-pro": "gpt-4o-mini",
    },
  };

  return obsolete[provider]?.[selected] || selected;
}

async function ensureOllamaModelAvailable(baseUrl: string, model: string): Promise<void> {
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/tags`, {
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error(`OLLAMA indisponível em ${baseUrl}. Verifique se o serviço está ativo.`);
  }

  const data = (await response.json()) as {
    models?: Array<{ name?: string; model?: string }>;
  };
  const available = (data.models || [])
    .map((item) => item.name || item.model)
    .filter(Boolean) as string[];

  if (available.length === 0) {
    throw new Error(
      `OLLAMA não possui modelos instalados. Instale um modelo no servidor, por exemplo: ollama pull ${model}`,
    );
  }

  if (!available.includes(model)) {
    throw new Error(
      `Modelo OLLAMA "${model}" não instalado. Modelos disponíveis: ${available.join(", ")}`,
    );
  }
}

function normalizeAudioModelChain(raw: string | null | undefined): string[] {
  const parsed = String(raw || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const valid = Array.from(new Set(parsed)).filter((model) => DEFAULT_ABACUS_AUDIO_MODELS.includes(model));
  return valid.length > 0 ? valid : DEFAULT_ABACUS_AUDIO_MODELS;
}

function detectAudioFormatFromPath(audioPath: string): "ogg" | "mp3" | "wav" | "mp4" {
  const ext = path.extname(audioPath).toLowerCase();
  if (ext === ".mp3") return "mp3";
  if (ext === ".wav") return "wav";
  if (ext === ".mp4" || ext === ".m4a") return "mp4";
  return "ogg";
}

function extractResponseContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      const data = part as Record<string, unknown>;
      if (typeof data.text === "string") return data.text;
      if (typeof data.content === "string") return data.content;
      if (typeof data.transcript === "string") return data.transcript;
      return "";
    })
    .filter(Boolean)
    .join(" ")
    .trim();
}

function normalizeMissingFields(fields: string[] | null | undefined): string[] {
  return Array.isArray(fields)
    ? fields
        .map((field) => String(field || "").trim().toLowerCase())
        .filter(Boolean)
    : [];
}

function normalizeContext(contexto: string | null | undefined): "PESSOAL" | "COMERCIAL" | "NEUTRO" {
  if (contexto === "PESSOAL") return "PESSOAL";
  if (contexto === "COMERCIAL") return "COMERCIAL";
  return "NEUTRO";
}

function buildSmartMissingInfoMessage(
  tipo: string,
  missingFields: string[],
  contexto: "PESSOAL" | "COMERCIAL" | "NEUTRO",
): string {
  const safeTipo = (tipo || "lançamento").trim();
  const normalized = normalizeMissingFields(missingFields);
  const asks: string[] = [];

  if (normalized.includes("valor")) {
    asks.push("- valor (ex: 249,90)");
  }
  if (normalized.includes("vencimento")) {
    asks.push("- data de vencimento (ex: dia 25)");
  }
  if (normalized.includes("tipo")) {
    asks.push("- qual é a conta/despesa (ex: luz, internet, aluguel)");
  }

  if (asks.length === 0) {
    asks.push("- valor");
  }

  const introByContext: Record<"PESSOAL" | "COMERCIAL" | "NEUTRO", string> = {
    PESSOAL: `Perfeito, já identifiquei sua despesa pessoal: *${safeTipo}*.`,
    COMERCIAL: `Perfeito, já identifiquei o lançamento da sua empresa: *${safeTipo}*.`,
    NEUTRO: `Perfeito, já identifiquei que você quer registrar *${safeTipo}*.`,
  };

  const phraseByContext: Record<"PESSOAL" | "COMERCIAL" | "NEUTRO", string> = {
    PESSOAL: "Para finalizar direitinho no seu controle pessoal, me passe:",
    COMERCIAL: "Para fechar o lançamento financeiro da empresa sem erro, me passe:",
    NEUTRO: "Para concluir certinho, me passe só estes dados:",
  };

  const exampleByContext: Record<"PESSOAL" | "COMERCIAL" | "NEUTRO", string> = {
    PESSOAL: `Exemplo: *${safeTipo} 249,90 vence dia 25*`,
    COMERCIAL: `Exemplo: *${safeTipo} 249,90 vence dia 25 fornecedor XPTO*`,
    NEUTRO: `Exemplo: *${safeTipo} 249,90 vence dia 25*`,
  };

  return (
    introByContext[contexto] +
    `\n${phraseByContext[contexto]}` +
    `\n${asks.join("\n")}` +
    "\n\nSe preferir, pode mandar em uma frase só." +
    `\n${exampleByContext[contexto]}`
  );
}

function sanitizeAiResponseMessage(parsed: {
  tipo?: string | null;
  contexto?: string | null;
  needsMoreInfo?: boolean | null;
  missingFields?: string[] | null;
  responseMessage?: string | null;
}): string {
  const currentMessage = String(parsed.responseMessage || "").trim();
  const tipo = String(parsed.tipo || "lançamento").trim();
  const contexto = normalizeContext(parsed.contexto);
  const missingFields = normalizeMissingFields(parsed.missingFields || []);

  const hasBadPattern =
    /problema\s+estrutural|conserto|manuten[cç][aã]o|ordem\s+de\s+servi[cç]o/i.test(currentMessage);

  if (parsed.needsMoreInfo) {
    // Força consistência por contexto para evitar variações ruins de modelo.
    if (!currentMessage || hasBadPattern || missingFields.length > 0) {
      return buildSmartMissingInfoMessage(tipo, missingFields, contexto);
    }
    return buildSmartMissingInfoMessage(tipo, missingFields, contexto);
  }

  return currentMessage || "✅ Registrado!";
}

// ─── System prompt para extração de transações ────────────────────────────────
function buildExtractionPrompt(
  allowedContexts: ("PESSOAL" | "COMERCIAL")[],
  categories: Array<{ context: string; name: string; description: string | null }>
): string {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const tomorrow = new Date(now.getTime() + 86400000).toISOString().split("T")[0];
  const dayOfWeek = now.toLocaleDateString("pt-BR", { weekday: "long" });

  const onlyPessoal = allowedContexts.length === 1 && allowedContexts[0] === "PESSOAL";
  const onlyComercial = allowedContexts.length === 1 && allowedContexts[0] === "COMERCIAL";

  const contextRule = onlyPessoal
    ? 'CONTEXTO: Sempre "PESSOAL" (plano pessoal).'
    : onlyComercial
    ? 'CONTEXTO: Sempre "COMERCIAL" (plano empresarial).'
    : 'CONTEXTO: "PESSOAL" para despesas do dia a dia/casa, "COMERCIAL" para despesas empresariais.';

  const catLines = categories
    .filter((c) => allowedContexts.includes(c.context as "PESSOAL" | "COMERCIAL"))
    .map((c) => `  [${c.context}] "${c.name}" → ${c.description || ""}`)
    .join("\n");

  return `Você é um assistente financeiro pessoal via WhatsApp. Extraia informações financeiras de mensagens em português brasileiro e retorne APENAS um JSON válido.

CAMPOS A EXTRAIR:
- "tipo": nome específico da conta/item (ex: "Conta de Luz", "Feijão e Arroz", "Gasolina", "Telefone Celular")
- "valor": número decimal em reais. null se não informado
- "natureza": "PAGAR" para despesas/saídas, "RECEBER" para receitas/entradas
- "contexto": "PESSOAL" ou "COMERCIAL"
- "categoria": nome EXATO de uma das categorias abaixo
- "vencimento": data ISO YYYY-MM-DD. null se não informado. "hoje"=${today}, "amanhã"=${tomorrow}
- "confidence": 0.0 a 1.0
- "needsMoreInfo": true se faltar tipo ou valor
- "missingFields": lista de campos faltantes
- "responseMessage": mensagem amigável em português com emojis para enviar ao usuário

${contextRule}

CATEGORIAS DISPONÍVEIS (use o nome EXATO entre aspas):
${catLines}

REGRAS DE CATEGORIZAÇÃO:
• arroz, feijão, carne, leite, frango, ovo, farinha, café, peixe, legume, fruta, verdura, mercado, supermercado, feira → "Alimentação e Mercado" [PESSOAL]
• restaurante, lanchonete, McDonald's, Burger King, pizza, delivery, iFood, UberEats, marmita, sushi, hamburguer, lanche na rua, fast-food, cafeteria, sorveteria → "Refeições Fora / Delivery" [PESSOAL]
• aluguel (casa/apto), financiamento imóvel, IPTU, prestação do apê → "Moradia" [PESSOAL]
• condomínio, taxa condominial → "Condomínio" [PESSOAL]
• luz, energia, conta de luz, CPFL, Enel, Cemig, Elektro → "Energia Elétrica" [PESSOAL]
• água, esgoto, SABESP, SANEPAR, conta de água → "Água e Saneamento" [PESSOAL]
• gás, botijão, GLP, gás de cozinha → "Gás" [PESSOAL]
• internet, banda larga, fibra, telefone celular, plano móvel, recarga de celular, Tim, Vivo, Claro, Oi → "Internet e Telefone" [PESSOAL]
• netflix, spotify, amazon prime, disney+, hbo, globoplay, apple tv, youtube premium, tv a cabo, academia → "Assinaturas e Streaming" [PESSOAL]
• detergente, sabão, amaciante, vassoura, rodo, esponja, faxineira, diarista, dedetização → "Limpeza e Conservação" [PESSOAL]
• roupa, calça, camisa, vestido, tênis, sapato, sandália, meia, cueca, sutiã, moda, brechó → "Vestuário e Calçados" [PESSOAL]
• shampoo, sabonete, pasta de dente, desodorante, perfume, maquiagem, creme, protetor solar, manicure, salão, cabeleireiro, barbearia, depilação → "Higiene e Beleza" [PESSOAL]
• gasolina, etanol, diesel, GNV, Uber, 99, táxi, ônibus, metrô, passagem, pedágio, IPVA, seguro do carro, manutenção carro, troca de óleo, pneu → "Transporte" [PESSOAL]
• plano de saúde, médico, dentista, farmácia, remédio, exame, cirurgia, psicólogo, fisioterapia, suplemento, whey, vitamina → "Saúde e Bem-estar" [PESSOAL]
• escola, faculdade, mensalidade, curso, inglês, material escolar, livro, apostila, cursinho → "Educação" [PESSOAL]
• cinema, teatro, show, festival, parque, jogo, game, steam, PS, xbox, viagem lazer, hobby → "Lazer e Entretenimento" [PESSOAL]
• ração, veterinário, pet shop, vacina animal, banho e tosa, antipulgas → "Pet" [PESSOAL]
• dízimo, oferta, doação, ONG, vaquinha, cesta básica → "Doações e Solidariedade" [PESSOAL]
• presente, aniversário, natal, dia das mães, namorados, casamento, formatura → "Presentes e Comemorações" [PESSOAL]
• tinta, piso, reforma, tapete, cortina, móvel, decoração, pedreiro → "Reformas e Decoração" [PESSOAL]
• conserto urgente, chaveiro, vidraceiro, encanador urgente, guincho, multa por atraso, juro cartão → "Emergências e Imprevistos" [PESSOAL]
• seguro residencial, seguro de vida, apólice pessoal → "Seguro Pessoal / Residencial" [PESSOAL]
• IPTU, IPVA, IR pessoal, DARF pessoal → "Impostos Pessoais" [PESSOAL]
• salário recebido, holerite, 13°, férias recebidas, PLR → "Renda / Salário" [PESSOAL]
• freelance, bico, renda extra, venda pessoal, pix recebido → "Renda Extra / Freelance" [PESSOAL]
• funcionário, pró-labore, folha de pagamento → "Folha de Pagamento" [COMERCIAL]
• INSS patronal, FGTS empresa, encargos trabalhistas → "Encargos Trabalhistas" [COMERCIAL]
• aluguel do escritório, aluguel da loja, aluguel do galpão → "Aluguel Comercial" [COMERCIAL]
• luz da empresa, água da empresa, energia comercial → "Energia e Utilities" [COMERCIAL]
• internet empresarial, PABX, plano corporativo → "Internet e Telecom" [COMERCIAL]
• fornecedor, matéria-prima, insumo, embalagem → "Fornecedores e Insumos" [COMERCIAL]
• estoque, mercadoria para revenda, compra de produto → "Estoque e Mercadoria" [COMERCIAL]
• Google Ads, Meta Ads, marketing, publicidade, anúncio → "Marketing e Publicidade" [COMERCIAL]
• DAS, MEI, ISS, ICMS, IRPJ, CSLL, DARF empresa → "Impostos e Tributos" [COMERCIAL]
• contador, contabilidade, advogado, consultoria jurídica → "Contabilidade e Jurídico" [COMERCIAL]
• computador, software, licença, sistema, ERP → "Equipamentos e TI" [COMERCIAL]
• frete, transportadora, motoboy, combustível empresa → "Logística e Transporte" [COMERCIAL]
• manutenção do escritório, reforma comercial → "Manutenção Predial" [COMERCIAL]
• limpeza do escritório, terceirização limpeza → "Limpeza Comercial" [COMERCIAL]
• tarifa bancária, IOF, juros bancários → "Despesas Bancárias" [COMERCIAL]
• curso funcionário, treinamento, recrutamento → "Treinamento e RH" [COMERCIAL]
• passagem empresa, hotel empresa, diária → "Viagens Corporativas" [COMERCIAL]
• seguro empresarial, seguro frota → "Seguros Empresariais" [COMERCIAL]
• venda, faturamento, nota fiscal emitida, serviço prestado → "Receita Operacional" [COMERCIAL]
• consulta médica, retorno médico, prontuário, estetoscópio, esfigmomanômetro, termômetro clínica, otoscópio, luva de procedimento clínica, jaleco médico, lençol de papel clínica, mesa de exames, lixeira hospitalar clínica → "Clínica Médica (Insumos)" [COMERCIAL]
• consulta odontológica, profilaxia, broca odontológica, restauração dental, canal endodontia, extração dental, implante, aparelho ortodôntico, autoclave dental, anestésico dental, seringa carpule, alginato, gesso dental → "Clínica Odontológica (Insumos)" [COMERCIAL]
• internação, UTI, centro cirúrgico, emergência hospitalar, pronto-socorro, soro fisiológico hospitalar, cateter venoso, sonda nasogástrica, sonda vesical, fralda hospitalar, bomba de infusão, respirador mecânico, desfibrilador, maca, gases medicinais, autoclave central hospital → "Hospital (Insumos e Operação)" [COMERCIAL]
• empilhadeira, transpalete, palete supermercado, gôndola supermercado, PDV supermercado, câmara fria supermercado, etiqueta EAS, sensor antifurto, sistema ERP supermercado, nivelador de doca, câmera CCTV supermercado → "Supermercado (Operação)" [COMERCIAL]
• forno padaria, amassadeira, cilindro de massa, câmara de fermentação, fatiadora padaria, batedeira planetária padaria, farinha de trigo padaria, fermento biológico, forma de bolo, saco de confeitar, expositor de pães, alvará ANVISA padaria → "Padaria e Confeitaria (Operação)" [COMERCIAL]
• SNGPC, tarja preta farmácia, geladeira de medicamentos, freezer de vacinas, datalogger farmácia, cabine de fluxo laminar, seladora de blister, licença ANVISA farmácia, ERP farmacêutico, descarpak, cápsula vazia, balança de precisão farmácia → "Farmácia (Operação)" [COMERCIAL]
• fogão industrial restaurante, comanda eletrônica, taxa iFood, taxa Rappi, bag de entrega, marmita descartável, embalagem delivery, câmara fria restaurante, blast chiller, fritadeira industrial restaurante, exaustor industrial restaurante → "Restaurante (Operação)" [COMERCIAL]
• moedor de carne, serra de fita açougue, luva de malha de aço, câmara de maturação, SIF, bandeja isopor açougue, etiqueta validade carne, defumador industrial, cure nitrito, chaira, gancho de aço, trilho aéreo → "Açougue (Operação)" [COMERCIAL]
• fatiador de frios mercearia, balança hortifrúti mercearia, registradora elétrica, etiquetadora de preço mercearia, sacola plástica mercearia, gôndola mercearia, armadilha de roedor, dedetização mercearia, PDV mercearia → "Mercearia (Operação)" [COMERCIAL]
• taxa Uber, taxa 99, taxa inDriver, repasse de viagem, gasolina motorista app, rastreador veicular, chip de dados motorista, MEI motorista, DASN motorista, nota fiscal motorista, suporte de celular carro, extintor automotivo, cadeirinha bebê → "Transporte por App (Operação)" [COMERCIAL]

REGRAS PARA A "responseMessage":
• Se "needsMoreInfo" for true, peça apenas os campos faltantes de forma objetiva e amigável.
• Não use linguagem de diagnóstico técnico (ex: "problema estrutural", "conserto", "manutenção") para mensagens financeiras.
• Evite tom robótico ou genérico. Foque em ajudar a concluir o lançamento em uma próxima mensagem.

HOJE: ${dayOfWeek}, ${now.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
DATA ISO: ${today}

EXEMPLOS:
Entrada: "100, telefone celular"
Saída: {"tipo":"Conta Telefone Celular","valor":100.00,"natureza":"PAGAR","contexto":"PESSOAL","categoria":"Internet e Telefone","vencimento":null,"confidence":0.88,"needsMoreInfo":false,"missingFields":[],"responseMessage":"✅ *Conta Telefone Celular* registrada!\\n💰 R$ 100,00\\n📂 Internet e Telefone 📱"}

Entrada: "luz 97 dia 15"
Saída: {"tipo":"Conta de Luz","valor":97.00,"natureza":"PAGAR","contexto":"PESSOAL","categoria":"Energia Elétrica","vencimento":"${today.substring(0, 7)}-15","confidence":0.95,"needsMoreInfo":false,"missingFields":[],"responseMessage":"✅ *Conta de Luz* registrada!\\n💰 R$ 97,00 · 📅 dia 15\\n📂 Energia Elétrica 💡"}

Entrada: "recebi 2500 salário"
Saída: {"tipo":"Salário","valor":2500.00,"natureza":"RECEBER","contexto":"PESSOAL","categoria":"Renda / Salário","vencimento":null,"confidence":0.97,"needsMoreInfo":false,"missingFields":[],"responseMessage":"✅ *Salário* registrado!\\n💰 R$ 2.500,00\\n📂 Renda / Salário 💰"}

Entrada: "compra no mercado 350 ontem"
Saída: {"tipo":"Compras no Supermercado","valor":350.00,"natureza":"PAGAR","contexto":"PESSOAL","categoria":"Alimentação e Mercado","vencimento":"${tomorrow}","confidence":0.90,"needsMoreInfo":false,"missingFields":[],"responseMessage":"✅ *Compras no Supermercado* registrada!\\n💰 R$ 350,00\\n📂 Alimentação e Mercado 🛒"}

Entrada: "paguei fornecedor 1500"
Saída: {"tipo":"Pagamento Fornecedor","valor":1500.00,"natureza":"PAGAR","contexto":"COMERCIAL","categoria":"Fornecedores e Insumos","vencimento":null,"confidence":0.90,"needsMoreInfo":false,"missingFields":[],"responseMessage":"✅ *Pagamento Fornecedor* registrado!\\n💰 R$ 1.500,00\\n📂 Fornecedores e Insumos 🏭"}

Entrada: "conta do cartão"
Saída: {"tipo":"Fatura Cartão de Crédito","valor":null,"natureza":"PAGAR","contexto":"PESSOAL","categoria":"Emergências e Imprevistos","vencimento":null,"confidence":0.55,"needsMoreInfo":true,"missingFields":["valor","vencimento"],"responseMessage":"Perfeito, já identifiquei que você quer registrar *Fatura Cartão de Crédito*.\\nPara concluir certinho, me passe só estes dados:\\n- valor (ex: 249,90)\\n- data de vencimento (ex: dia 25)\\n\\nSe preferir, pode mandar em uma frase só.\\nExemplo: *Fatura Cartão de Crédito 249,90 vence dia 25*"}

Retorne APENAS o JSON, sem markdown, sem explicações.`;
}

function buildAudioExtractionPrompt(
  allowedContexts: ("PESSOAL" | "COMERCIAL")[],
  categories: Array<{ context: string; name: string; description: string | null }>
): string {
  return (
    buildExtractionPrompt(allowedContexts, categories) +
    `\n\nCAMPO ADICIONAL OBRIGATÓRIO PARA ÁUDIO:\n` +
    `- "transcription": transcrição em texto do áudio em português brasileiro\n\n` +
    `Primeiro entenda o áudio. Depois retorne SOMENTE o JSON final com todos os campos.`
  );
}

// ─── Chamada para provedores externos ─────────────────────────────────────────
async function callProvider(
  provider: string,
  apiKey: string,
  model: string,
  messages: AIMessage[],
  apiUrl?: string | null
): Promise<{ content: string; usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number } }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  let url = "";
  let body: Record<string, unknown> = {};

  switch (provider) {
    case "OPENAI":
    case "BUILTIN":
      url = "https://api.openai.com/v1/chat/completions";
      headers["Authorization"] = `Bearer ${apiKey}`;
      body = { model: normalizeModelForProvider(provider, model), messages, temperature: 0.1, max_tokens: 600 };
      break;

    case "GEMINI": {
      const geminiModel = normalizeModelForProvider(provider, model);
      url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;
      const sysMsg = messages.find((m) => m.role === "system");
      const userMsgs = messages.filter((m) => m.role !== "system");
      body = {
        ...(sysMsg && { system_instruction: { parts: [{ text: sysMsg.content }] } }),
        contents: userMsgs.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        generationConfig: { temperature: 0.1, maxOutputTokens: 600 },
      };
      break;
    }

    case "GROQ":
      url = "https://api.groq.com/openai/v1/chat/completions";
      headers["Authorization"] = `Bearer ${apiKey}`;
      body = { model: normalizeModelForProvider(provider, model), messages, temperature: 0.1, max_tokens: 600 };
      break;

    case "GROK":
      url = "https://api.x.ai/v1/chat/completions";
      headers["Authorization"] = `Bearer ${apiKey}`;
      body = { model: normalizeModelForProvider(provider, model), messages, temperature: 0.1, max_tokens: 600 };
      break;

    case "ABACUS": {
      // Abacus usa nova Responses API internamente — não suporta response_format sem "json" em todas as msgs.
      // Solução: injetar instrução JSON diretamente no system prompt + remover response_format.
      const abacusMessages = messages.map((m, idx) =>
        idx === 0 && m.role === "system"
          ? {
              ...m,
              content:
                m.content +
                "\n\nYou MUST respond ONLY with a raw json object. No markdown, no explanation. Output json and nothing else.",
            }
          : m
      );
      url = (apiUrl || "https://routellm.abacus.ai") + "/v1/chat/completions";
      headers["Authorization"] = `Bearer ${apiKey}`;
      body = {
        model: normalizeModelForProvider(provider, model),
        messages: abacusMessages,
        temperature: 0.1,
        max_tokens: 600,
        stream: false,
      };
      break;
    }

    case "OLLAMA": {
      const base = apiUrl || "http://localhost:11434";
      const ollamaModel = normalizeModelForProvider(provider, model);
      await ensureOllamaModelAvailable(base, ollamaModel);
      url = `${base}/api/chat`;
      body = { model: ollamaModel, messages, stream: false, options: { temperature: 0.1 } };
      break;
    }

    default:
      throw new Error(`Provedor desconhecido: ${provider}`);
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(provider === "OLLAMA" ? 60000 : 30000),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Provedor ${provider} retornou ${response.status}: ${err}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const usageRaw = data.usage as Record<string, unknown> | undefined;
  const usage = usageRaw
    ? {
        promptTokens: Number(usageRaw.prompt_tokens || usageRaw.input_tokens || 0),
        completionTokens: Number(usageRaw.completion_tokens || usageRaw.output_tokens || 0),
        totalTokens: Number(usageRaw.total_tokens || 0),
      }
    : undefined;

  // Extrai texto conforme o formato de cada provedor
  if (provider === "GEMINI") {
    const candidates = data.candidates as Array<{ content: { parts: Array<{ text: string }> } }>;
    return { content: candidates?.[0]?.content?.parts?.[0]?.text || "", usage };
  } else if (provider === "OLLAMA") {
    const msg = data.message as { content: string };
    return { content: msg?.content || "", usage };
  } else {
    const choices = data.choices as Array<{ message: { content: string } }>;
    return { content: choices?.[0]?.message?.content || "", usage };
  }
}

// ─── Cadeia de provedores por fonte ─────────────────────────────────────────
// Texto  → OLLAMA primeiro, ABACUS segundo, demais em seguida
// Áudio  → ABACUS primeiro, OLLAMA segundo, demais em seguida
async function getProviderChain(source: "text" | "audio" = "text") {
  const all = await prisma.aiProviderConfig.findMany({
    where: { enabled: true },
    orderBy: { id: "asc" },
  });

  // Cadeia de fallback: Groq → Abacus → Gemini (para ambos audio e texto)
  const priority = ["GROQ", "ABACUS", "GEMINI", "OPENAI", "GROK", "OLLAMA"];

  return [...all].sort((a, b) => {
    const ai = priority.indexOf(a.provider);
    const bi = priority.indexOf(b.provider);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

async function getAbacusAudioModelChain(): Promise<string[]> {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: "abacus_audio_model_chain" },
    });
    return normalizeAudioModelChain(setting?.value);
  } catch (err) {
    logger.warn(`[AIService] Falha ao carregar cadeia de modelos de áudio da ABACUS: ${String(err)}`);
    return DEFAULT_ABACUS_AUDIO_MODELS;
  }
}

export async function analyzeNutrition(text: string, history: AIMessage[] = []): Promise<string | null> {
  const messages: AIMessage[] = [
    { role: "system", content: buildNutritionPrompt() },
    ...history.slice(-4),
    { role: "user", content: text },
  ];

  const chain = await getProviderChain("text");
  let lastError: unknown;

  for (const provider of chain) {
    if (provider.provider !== "OLLAMA" && !provider.apiKey) continue;

    const startedAt = Date.now();
    const attempt = chain.indexOf(provider) + 1;

    try {
      const providerResult = await callProvider(
        provider.provider,
        provider.apiKey || "",
        normalizeModelForProvider(provider.provider, provider.model),
        messages,
        provider.apiUrl,
      );
      const content = providerResult.content.trim();

      await writeAiUsageLog({
        ts: new Date().toISOString(),
        provider: provider.provider,
        model: normalizeModelForProvider(provider.provider, provider.model),
        channel: "text",
        stage: "extract",
        success: Boolean(content),
        latencyMs: Date.now() - startedAt,
        fallbackUsed: attempt > 1,
        attempt,
        promptTokens: providerResult.usage?.promptTokens,
        completionTokens: providerResult.usage?.completionTokens,
        totalTokens: providerResult.usage?.totalTokens,
      });

      if (content) return content;
    } catch (err) {
      lastError = err;
      await writeAiUsageLog({
        ts: new Date().toISOString(),
        provider: provider.provider,
        model: normalizeModelForProvider(provider.provider, provider.model),
        channel: "text",
        stage: "extract",
        success: false,
        latencyMs: Date.now() - startedAt,
        fallbackUsed: attempt > 1,
        attempt,
        error: String(err),
      });
      logger.warn(`[AIService] Análise nutricional com ${provider.provider} falhou — tentando próximo: ${String(err)}`);
    }
  }

  logger.warn(`[AIService] Análise nutricional indisponível: ${String(lastError)}`);
  return null;
}

// ─── Plano de dieta personalizado via IA ────────────────────────────────────

function buildDietPlanPrompt(): string {
  return `Você é um nutricionista esportivo especializado, respondendo via WhatsApp em português brasileiro.

MISSÃO:
Criar um plano alimentar personalizado, completo e realista com base no perfil do usuário.

QUANDO O USUÁRIO FORNECER DADOS (objetivo, peso, altura, treino, restrições):
Monte um plano alimentar COMPLETO seguindo esta estrutura:

━━━━━━━━━━━━━━━━
🎯 *OBJETIVO:* [emagrecer / manter / ganhar massa]
📊 *META CALÓRICA:* ~[X] kcal/dia
💪 *META DE PROTEÍNA:* ~[X]g/dia ([X]g/kg)
━━━━━━━━━━━━━━━━

🌅 *CAFÉ DA MANHÃ* (~[X] kcal)
• Opção A: [alimento + quantidade]
• Opção B: [alternativa prática]
💡 _Dica: [timing ou preparo]_

🍎 *LANCHE DA MANHÃ* (~[X] kcal)
• [alimento proteico + quantidade]

🍽️ *ALMOÇO* (~[X] kcal)
• [Proteína + vegetal + carboidrato complexo + quantidade]
📏 _½ prato verduras, ¼ proteína, ¼ carbo_

🥜 *LANCHE DA TARDE* (~[X] kcal)
• [alimento proteico ou fruta com proteína]

🌙 *JANTAR* (~[X] kcal)
• [Refeição leve com proteína + vegetais]

[Se treino noturno adicione]:
🏋️ *PÓS-TREINO* (~[X] kcal)
• [opção de recuperação]

━━━━━━━━━━━━━━━━
📊 *RESUMO DO DIA:*
• Total: ~[X] kcal
• 🥩 Proteína: ~[X]g
• 🍞 Carboidrato: ~[X]g
• 🫒 Gordura: ~[X]g
• 💧 Água: ~[X]ml/dia
━━━━━━━━━━━━━━━━

🛒 *LISTA DE COMPRAS SEMANAL:*
[10-12 itens essenciais e acessíveis]

💡 *REGRAS DO SEU PLANO:*
1. Proteína em TODAS as refeições — saciedade e músculo
2. Prefira sempre: grelhado > cozido > assado > frito
3. [regra específica para o objetivo informado]
4. Beba água antes de cada refeição (200ml)
━━━━━━━━━━━━━━━━
⚕️ _Para acompanhamento clínico, consulte um nutricionista._

QUANDO FALTAR INFORMAÇÕES:
Se faltarem dados importantes (objetivo, peso, treino), pergunte de forma simples e direta:
"Para montar seu plano ideal, me diz rapidinho:
• 🎯 Objetivo: emagrecer, manter ou ganhar massa?
• ⚖️ Peso e altura?
• 🏋️ Pratica exercício? (tipo e frequência)
• 🚫 Tem alguma restrição alimentar?"

PRINCÍPIOS INEGOCIÁVEIS DO PLANO:
- Proteína > Carboidrato em todas as refeições
- Déficit de 400–500 kcal/dia para emagrecer (−0,4 a 0,5kg/semana)
- Superávit controlado de 200–300 kcal para ganho de massa limpa
- Carboidratos complexos: aveia, batata doce, arroz integral, quinoa
- Gorduras boas: azeite, abacate, oleaginosas, ovo inteiro
- Zero ultraprocessados, zero açúcar refinado no plano principal

Seja prático, motivador e direto. Use emojis com moderação. Não diga que é uma IA.`;
}

export async function generateDietPlan(text: string, history: AIMessage[] = []): Promise<string | null> {
  const messages: AIMessage[] = [
    { role: "system", content: buildDietPlanPrompt() },
    ...history.slice(-6),
    { role: "user", content: text },
  ];

  const chain = await getProviderChain("text");
  let lastError: unknown;

  for (const provider of chain) {
    if (provider.provider !== "OLLAMA" && !provider.apiKey) continue;
    const startedAt = Date.now();
    const attempt = chain.indexOf(provider) + 1;
    try {
      const providerResult = await callProvider(
        provider.provider,
        provider.apiKey || "",
        normalizeModelForProvider(provider.provider, provider.model),
        messages,
        provider.apiUrl,
      );
      const content = providerResult.content.trim();
      await writeAiUsageLog({
        ts: new Date().toISOString(),
        provider: provider.provider,
        model: normalizeModelForProvider(provider.provider, provider.model),
        channel: "text",
        stage: "extract",
        success: Boolean(content),
        latencyMs: Date.now() - startedAt,
        fallbackUsed: attempt > 1,
        attempt,
        promptTokens: providerResult.usage?.promptTokens,
        completionTokens: providerResult.usage?.completionTokens,
        totalTokens: providerResult.usage?.totalTokens,
      });
      if (content) return content;
    } catch (err) {
      lastError = err;
      logger.warn(`[AIService] Plano de dieta com ${provider.provider} falhou: ${String(err)}`);
    }
  }
  logger.warn(`[AIService] Plano de dieta indisponível: ${String(lastError)}`);
  return null;
}

// ─── Análise de Investimentos via IA ─────────────────────────────────────────

function buildInvestmentPrompt(marketData: string): string {
  return `Você é um analista de mercado financeiro experiente, respondendo via WhatsApp em português brasileiro.

DADOS DE MERCADO REAIS (gerados agora):
${marketData}

MISSÃO:
Com base nos dados acima, gere uma análise de investimento inteligente, envolvente, honesta e útil para o cliente.

ESTRUTURA DA ANÁLISE:

🤖 *ANÁLISE — [Nome do Ativo]*
━━━━━━━━━━━━━━━━
[2-3 parágrafos de análise sólida com base nos dados reais fornecidos: contexto do ativo, o que explica a tendência, fatores técnicos relevantes]

📊 *Momento atual:* [positivo / neutro / negativo] — [por quê em 1 frase]
🎯 *Perfil indicado:* [qual perfil de investidor se adequa: conservador / moderado / arrojado]
⚡ *Pontos de atenção:* [2-3 riscos ou oportunidades específicas baseadas nos dados]

💡 *Perspectiva (baseada nos dados):*
[Análise motivadora mas realista. Ex: "Com X% das semanas em alta e valorização de Y% em 3 meses, este ativo mostra momentum positivo. Pontos de entrada abaixo de R$... podem ser interessantes para investidores de médio prazo — porém a volatilidade recente exige..."]

━━━━━━━━━━━━━━━━
⚠️ *AVISO:* Esta análise é gerada por IA com fins informativos e não é recomendação formal de investimento. Rentabilidade passada não garante resultados futuros. Consulte um *corretor certificado (CNPI)* antes de decidir.
Pesquise também em: *Status Invest*, *Infomoney* ou *Rico Investimentos*.
━━━━━━━━━━━━━━━━

PRINCÍPIOS:
- Use os números reais do contexto fornecido
- Seja empolgante sobre o potencial mas honesto sobre os riscos
- Para cripto: ressalte SEMPRE o risco maior e a volatilidade extrema
- Para ações B3: mencione setor, dividendos se relevante, posição no índice
- Finalize sempre com o aviso legal
- Não diga que é uma IA
- Nunca faça previsão de preço específico futuro`;
}

export async function generateInvestmentAdvice(
  userMessage: string,
  marketData: string,
  history: AIMessage[] = [],
): Promise<string | null> {
  const messages: AIMessage[] = [
    { role: "system", content: buildInvestmentPrompt(marketData) },
    ...history.slice(-4),
    { role: "user", content: userMessage },
  ];

  const chain = await getProviderChain("text");
  let lastError: unknown;

  for (const provider of chain) {
    if (provider.provider !== "OLLAMA" && !provider.apiKey) continue;
    const startedAt = Date.now();
    const attempt = chain.indexOf(provider) + 1;
    try {
      const providerResult = await callProvider(
        provider.provider,
        provider.apiKey || "",
        normalizeModelForProvider(provider.provider, provider.model),
        messages,
        provider.apiUrl,
      );
      const content = providerResult.content.trim();
      await writeAiUsageLog({
        ts: new Date().toISOString(),
        provider: provider.provider,
        model: normalizeModelForProvider(provider.provider, provider.model),
        channel: "text",
        stage: "extract",
        success: Boolean(content),
        latencyMs: Date.now() - startedAt,
        fallbackUsed: attempt > 1,
        attempt,
        promptTokens: providerResult.usage?.promptTokens,
        completionTokens: providerResult.usage?.completionTokens,
        totalTokens: providerResult.usage?.totalTokens,
      });
      if (content) return content;
    } catch (err) {
      lastError = err;
      logger.warn(`[AIService] Análise de investimento com ${provider.provider} falhou: ${String(err)}`);
    }
  }

  logger.warn(`[AIService] Análise de investimento indisponível: ${String(lastError)}`);
  return null;
}

async function transcribeAudioWithProvider(
  provider: string,
  apiKey: string,
  audioPath: string,
): Promise<string | null> {
  try {
    if (provider === "GROQ") {
      // Groq Whisper API para transcrição de áudio
      const audioBuffer = await fs.promises.readFile(audioPath);
      const formData = new FormData();
      formData.append("file", new Blob([audioBuffer]), path.basename(audioPath));
      formData.append("model", "whisper-large-v3-turbo");

      const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        throw new Error(`Groq Whisper retornou ${response.status}`);
      }

      const data = (await response.json()) as { text?: string };
      return data.text || null;
    }

    // Para outros provedores, retornar nulo (não suportado ainda)
    return null;
  } catch (err) {
    logger.warn(`[AIService] Transcrição com ${provider} falhou: ${String(err)}`);
    return null;
  }
}

export async function extractTransactionFromAudio(
  audioPath: string,
  history: AIMessage[] = [],
  allowedContexts: ("PESSOAL" | "COMERCIAL")[] = ["PESSOAL", "COMERCIAL"],
): Promise<ExtractedTransaction | null> {
  const dbCategories = await prisma.expenseCategory.findMany({
    where: { isActive: true },
    select: { id: true, context: true, name: true, description: true },
    orderBy: { displayOrder: "asc" },
  });

  const systemPrompt = buildAudioExtractionPrompt(allowedContexts, dbCategories);
  
  // Tenta provedores em cadeia: Groq → Abacus → Gemini
  const chain = await getProviderChain("audio");
  let lastError: unknown;

  for (const provider of chain) {
    if (!provider.apiKey && provider.provider !== "OLLAMA") continue;

    const startedAt = Date.now();
    const attempt = chain.indexOf(provider) + 1;

    try {
      let transcription: string | null = null;
      let raw = "";

      // Se Groq, tenta transcrever com Whisper
      if (provider.provider === "GROQ") {
        transcription = await transcribeAudioWithProvider(provider.provider, provider.apiKey || "", audioPath);
        if (transcription) {
          // Processa o texto transcrito
          const messages: AIMessage[] = [
            { role: "system", content: systemPrompt },
            ...history.slice(-4),
            { role: "user", content: `Transcrição de áudio: "${transcription}"\n\nAgora extraia a transação financeira e devolva apenas o JSON solicitado.` },
          ];

          const result = await callProvider(
            provider.provider,
            provider.apiKey || "",
            normalizeModelForProvider(provider.provider, provider.model),
            messages,
            provider.apiUrl
          );
          raw = result.content;
        }
      } 
      // Se Abacus, usa processamento nativo de áudio
      else if (provider.provider === "ABACUS") {
        const audioBuffer = await fs.promises.readFile(audioPath);
        const audioBase64 = audioBuffer.toString("base64");
        const audioFormat = detectAudioFormatFromPath(audioPath);
        const baseUrl = (provider.apiUrl || "https://routellm.abacus.ai").replace(/\/+$/, "");
        const endpoint = `${baseUrl}/v1/chat/completions`;

        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${provider.apiKey || ""}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: provider.model || "gpt-4o-audio-preview",
            temperature: 0.1,
            max_tokens: 900,
            stream: false,
            messages: [
              { role: "system", content: systemPrompt },
              ...history.slice(-4),
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: "Ouça o áudio, entenda a transação financeira e devolva apenas o JSON solicitado.",
                  },
                  {
                    type: "input_audio",
                    input_audio: {
                      data: audioBase64,
                      format: audioFormat,
                    },
                  },
                ],
              },
            ],
          }),
          signal: AbortSignal.timeout(25000),
        });

        if (!response.ok) {
          throw new Error(`ABACUS retornou ${response.status}`);
        }

        const data = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }>; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } };
        raw = extractResponseContent(data?.choices?.[0]?.message?.content) || "";
      }

      if (!raw) continue;

      raw = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(raw) as ExtractedTransaction & { transcription?: string | null };
      
      const contexto: "PESSOAL" | "COMERCIAL" =
        parsed.contexto === "COMERCIAL" ? "COMERCIAL" : "PESSOAL";
      const catName = (parsed.categoria || "").trim();
      const matched = dbCategories.find(
        (c) => c.name.toLowerCase() === catName.toLowerCase() && c.context === contexto,
      ) ?? dbCategories.find((c) => c.name.toLowerCase() === catName.toLowerCase());

      logger.info(`[AIService] Extração de áudio via ${provider.provider} em ${Date.now() - startedAt}ms`);
      
      await writeAiUsageLog({
        ts: new Date().toISOString(),
        provider: provider.provider,
        model: provider.model || "audio-default",
        channel: "audio",
        stage: "extract",
        success: true,
        latencyMs: Date.now() - startedAt,
        fallbackUsed: attempt > 1,
        attempt,
      });

      return {
        tipo: parsed.tipo || "Conta",
        valor: parsed.valor ?? null,
        natureza: parsed.natureza === "RECEBER" ? "RECEBER" : "PAGAR",
        contexto,
        categoria: matched?.name ?? catName ?? "Outros",
        categoryId: matched?.id ?? null,
        vencimento: parsed.vencimento || null,
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
        needsMoreInfo: parsed.needsMoreInfo ?? true,
        missingFields: parsed.missingFields || [],
        responseMessage: sanitizeAiResponseMessage(parsed),
        transcription: transcription || parsed.transcription?.trim() || null,
      };
    } catch (err) {
      lastError = err;
      await writeAiUsageLog({
        ts: new Date().toISOString(),
        provider: provider.provider,
        model: provider.model || "audio-default",
        channel: "audio",
        stage: "extract",
        success: false,
        latencyMs: Date.now() - startedAt,
        fallbackUsed: attempt > 1,
        attempt,
        error: String(err),
      });
      logger.warn(`[AIService] Extração de áudio com ${provider.provider} falhou — próximo fallback: ${String(err)}`);
    }
  }

  logger.warn(`[AIService] Extração de áudio indisponível — todos provedores falharam: ${String(lastError)}`);
  return null;
}

// ─── Extração de transação ────────────────────────────────────────────────────
export async function extractTransaction(
  userMessage: string,
  history: AIMessage[] = [],
  allowedContexts: ("PESSOAL" | "COMERCIAL")[] = ["PESSOAL", "COMERCIAL"],
  source: "text" | "audio" = "text"
): Promise<ExtractedTransaction> {
  // Carrega categorias do DB (cache em memória por 5 min via closure não necessário — DB é rápido)
  const dbCategories = await prisma.expenseCategory.findMany({
    where: { isActive: true },
    select: { id: true, context: true, name: true, description: true },
    orderBy: { displayOrder: "asc" },
  });

  const messages: AIMessage[] = [
    { role: "system", content: buildExtractionPrompt(allowedContexts, dbCategories) },
    ...history.slice(-6),
    { role: "user", content: userMessage },
  ];

  let raw = "";

  try {
    const chain = await getProviderChain(source);

    if (chain.length === 0) {
      throw new Error("Nenhum provedor de IA habilitado");
    }

    let lastError: unknown;
    for (const provider of chain) {
      const startedAt = Date.now();
      const attempt = chain.indexOf(provider) + 1;
      // Pula provedores sem API key (exceto OLLAMA)
      if (provider.provider !== "OLLAMA" && !provider.apiKey) continue;

      try {
        logger.debug(`[AIService] Tentando provedor: ${provider.provider}`);
        const providerResult = await callProvider(
          provider.provider,
          provider.apiKey || "",
          normalizeModelForProvider(provider.provider, provider.model),
          messages,
          provider.apiUrl
        );
        raw = providerResult.content;

        await writeAiUsageLog({
          ts: new Date().toISOString(),
          provider: provider.provider,
          model: normalizeModelForProvider(provider.provider, provider.model),
          channel: source,
          stage: "extract",
          success: Boolean(raw),
          latencyMs: Date.now() - startedAt,
          fallbackUsed: attempt > 1,
          attempt,
          promptTokens: providerResult.usage?.promptTokens,
          completionTokens: providerResult.usage?.completionTokens,
          totalTokens: providerResult.usage?.totalTokens,
        });

        if (raw) {
          logger.debug(`[AIService] Sucesso com provedor: ${provider.provider}`);
          break; // sucesso — para aqui
        }
      } catch (provErr) {
        lastError = provErr;
        await writeAiUsageLog({
          ts: new Date().toISOString(),
          provider: provider.provider,
          model: normalizeModelForProvider(provider.provider, provider.model),
          channel: source,
          stage: "extract",
          success: false,
          latencyMs: Date.now() - startedAt,
          fallbackUsed: attempt > 1,
          attempt,
          error: String(provErr),
        });
        logger.warn(`[AIService] Provedor ${provider.provider} falhou — tentando próximo: ${provErr}`);
      }
    }

    if (!raw) throw lastError ?? new Error("Todos os provedores falharam");

    // Limpa markdown se vier
    raw = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    const parsed = JSON.parse(raw) as ExtractedTransaction;

    const contexto: "PESSOAL" | "COMERCIAL" =
      parsed.contexto === "COMERCIAL" ? "COMERCIAL" : "PESSOAL";

    // Resolve categoryId pelo nome retornado pela IA
    const catName = (parsed.categoria || "").trim();
    const matched = dbCategories.find(
      (c) => c.name.toLowerCase() === catName.toLowerCase() && c.context === contexto
    ) ?? dbCategories.find(
      (c) => c.name.toLowerCase() === catName.toLowerCase()
    );

    return {
      tipo: parsed.tipo || "Conta",
      valor: parsed.valor ?? null,
      natureza: parsed.natureza === "RECEBER" ? "RECEBER" : "PAGAR",
      contexto,
      categoria: matched?.name ?? catName ?? "Outros",
      categoryId: matched?.id ?? null,
      vencimento: parsed.vencimento || null,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      needsMoreInfo: parsed.needsMoreInfo ?? true,
      missingFields: parsed.missingFields || [],
      responseMessage: sanitizeAiResponseMessage(parsed),
    };
  } catch (err) {
    logger.error("[AIService] Erro na extração:", err);
    logger.debug("[AIService] Raw response:", raw);

    // ─── Fallback: extração por regex ─────────────────────────────────────────
    const normalized = userMessage.toLowerCase();

    // Detectar valor
    const valorMatch = normalized.match(/r?\$?\s*(\d{1,6}(?:[.,]\d{1,2})?)/);
    const valorRaw = valorMatch?.[1]?.replace(",", ".");
    const valor = valorRaw ? parseFloat(valorRaw) : null;

    // Detectar natureza
    const isReceita = /recebi|recebimento|entrada|salário|salario|faturei|venda|pix recebido/.test(normalized);
    const natureza: "PAGAR" | "RECEBER" = isReceita ? "RECEBER" : "PAGAR";

    // Detectar tipo/item a partir de palavras-chave
    const keywordCategoryMap: Array<{ keywords: RegExp; category: string; tipo: string }> = [
      // Transporte
      { keywords: /gasolina|combust[ií]vel|etanol|diesel|abasteci|posto de gasolina/, category: "Transporte", tipo: "Combustível" },
      { keywords: /uber|99|t[aá]xi|metr[oô]|[oô]nibus|passagem|pedágio|ipva|seguro do carro|troca de [oó]leo|pneu|alinhamento|amortecedor|bateria carro/, category: "Transporte", tipo: "Transporte" },
      // Alimentação
      { keywords: /mercado|supermercado|feira|hortifr[uú]ti|compra de alimento|comprei aliment|pa[oã]o de forma|mantiment/, category: "Alimentação e Mercado", tipo: "Compras no Mercado" },
      { keywords: /restaurante|lanchonete|delivery|ifood|rappi|pizza|hamburger|hamburguer|marmita|sorvete|lanche|fast.?food|caf[eé] na rua|sushi|rodizio/, category: "Refeições Fora / Delivery", tipo: "Refeição" },
      // Casa
      { keywords: /luz|energia el[eé]trica|cpfl|enel|cemig|conta de luz|elektro/, category: "Energia Elétrica", tipo: "Conta de Luz" },
      { keywords: /[aá]gua|esgoto|sabesp|sanepar|conta de [aá]gua|saneamento/, category: "Água e Saneamento", tipo: "Conta de Água" },
      { keywords: /g[aá]s|botij[aã]o|glp|g[aá]s de cozinha/, category: "Gás", tipo: "Gás" },
      { keywords: /internet|banda larga|fibra|tim|vivo|claro|oi\b|celular|plano m[oó]vel|recarga|chip/, category: "Internet e Telefone", tipo: "Internet / Telefone" },
      { keywords: /aluguel|financiamento im[oó]vel|presta[cç][aã]o do ap[eê]|hipoteca/, category: "Moradia", tipo: "Aluguel" },
      { keywords: /condom[ií]nio|taxa condominial/, category: "Condomínio", tipo: "Condomínio" },
      { keywords: /detergente|sab[aã]o|amaciante|vassoura|rodo|esponja|faxineira|diarista|dedetiza[cç][aã]o|limpeza casa/, category: "Limpeza e Conservação", tipo: "Limpeza" },
      // Sa[uú]de
      { keywords: /farm[aá]cia|rem[eé]dio|medicamento|m[eé]dico|m[eé]dica|sa[uú]de|plano de sa[uú]de|exame|cirurgia|psic[oó]logo|fisioterapia|consulta/, category: "Saúde e Bem-estar", tipo: "Saúde" },
      // Educa[cç][aã]o
      { keywords: /escola|faculdade|mensalidade|curso|ingl[eê]s|apostila|material escolar|cursinho/, category: "Educação", tipo: "Educação" },
      // Streaming
      { keywords: /netflix|spotify|amazon prime|disney|hbo|globoplay|apple tv|youtube premium|tv a cabo|academia|gympass|smart fit/, category: "Assinaturas e Streaming", tipo: "Assinatura" },
      // Presentes e Comemorações
      { keywords: /presente|carta.*namorad|comprei.*namorad|namorad.*present|aniversari[oó]|natal|dia das m[aã]es|dia das m[aã]ezinhas|namorad[oa]|casamento|formatura|lembrancinha/, category: "Presentes e Comemorações", tipo: "Presente" },
      // Vestu[aá]rio
      { keywords: /roupa|cal[cç]a|camisa|vestido|t[eê]nis|sapato|sandália|meia|cueca|suti[aã]|moda|brech[oó]|cal[cç]ado/, category: "Vestuário e Calçados", tipo: "Roupas" },
      // Higiene
      { keywords: /shampoo|sabonete|pasta de dente|desodorante|perfume|maquiagem|creme|protetor solar|manicure|sal[aã]o|cabeleireiro|barbearia|depila[cç][aã]o/, category: "Higiene e Beleza", tipo: "Higiene / Beleza" },
      // Pet
      { keywords: /ra[cç][aã]o|veterin[aá]rio|pet shop|vacina animal|banho e tosa|antipulgas|pet\b/, category: "Pet", tipo: "Pet" },
      // Lazer
      { keywords: /cinema|teatro|show|festival|parque|game|steam|xbox|playstation|ps\d|viagem lazer|hobby|ingresso/, category: "Lazer e Entretenimento", tipo: "Lazer" },
      // Doa[cç][oõ]es
      { keywords: /d[ií]zimo|oferta|doa[cç][aã]o|ong|vaquinha|cesta b[aá]sica/, category: "Doações e Solidariedade", tipo: "Doação" },
      // Reformas
      { keywords: /tinta|piso|reforma|tapete|cortina|m[oó]vel|decora[cç][aã]o|pedreiro|marceneiro/, category: "Reformas e Decoração", tipo: "Reforma" },
      // Imprevistos
      { keywords: /conserto urgente|chaveiro|vidra[cç]eiro|encanador urgente|guincho|multa por atraso|juro cart[aã]o|conserto/, category: "Emergências e Imprevistos", tipo: "Imprevisto" },
      // Renda
      { keywords: /sal[aá]rio|holerite|13[°o]|f[eé]rias recebidas|plr/, category: "Renda / Salário", tipo: "Salário" },
      { keywords: /freelance|bico|renda extra|trabalho extra|pix recebido/, category: "Renda Extra / Freelance", tipo: "Renda Extra" },
    ];

    let categoria = "";
    let tipo = "";
    for (const entry of keywordCategoryMap) {
      if (entry.keywords.test(normalized)) {
        categoria = entry.category;
        tipo = entry.tipo;
        break;
      }
    }

    // Resolver categoryId
    const ctx = allowedContexts[0] ?? "PESSOAL";
    const matchedCat = categoria
      ? dbCategories.find((c) => c.name === categoria) ?? null
      : dbCategories.find((c) => c.name.toLowerCase().includes("outros") && c.context === ctx) ?? null;

    if (valor !== null && valor > 0 && categoria) {
      // Conseguimos extrair pelo regex
      logger.info(`[AIService] Fallback regex extraiu: ${tipo} R$${valor} → ${categoria}`);
      return {
        tipo,
        valor,
        natureza,
        contexto: ctx,
        categoria: matchedCat?.name ?? categoria,
        categoryId: matchedCat?.id ?? null,
        vencimento: null,
        confidence: 0.6,
        needsMoreInfo: false,
        missingFields: [],
        responseMessage: `✅ *${tipo}* registrado!\n💰 R$ ${valor.toFixed(2).replace(".", ",")}\n📂 ${matchedCat?.name ?? categoria}`,
      };
    }

    const fallbackContext: "PESSOAL" | "COMERCIAL" | "NEUTRO" =
      allowedContexts.length === 1 ? normalizeContext(allowedContexts[0]) : "NEUTRO";

    const fallbackHeaderByContext: Record<"PESSOAL" | "COMERCIAL" | "NEUTRO", string> = {
      PESSOAL: "Recebi sua mensagem e quero te ajudar a registrar isso no seu controle pessoal.",
      COMERCIAL: "Recebi sua mensagem e quero te ajudar a registrar isso no financeiro da empresa.",
      NEUTRO: "Recebi sua mensagem e quero te ajudar a concluir isso agora.",
    };

    // Sem dados suficientes mesmo com regex
    return {
      tipo: tipo || "Conta",
      valor,
      natureza: "PAGAR",
      contexto: ctx,
      categoria: matchedCat?.name ?? "Outros",
      categoryId: matchedCat?.id ?? null,
      vencimento: null,
      confidence: 0,
      needsMoreInfo: true,
      missingFields: valor ? ["tipo"] : ["tipo", "valor"],
      responseMessage:
        `${fallbackHeaderByContext[fallbackContext]}\n` +
        "Para registrar corretamente, me envie em um formato parecido com estes exemplos:\n" +
        "- *gasolina 120*\n" +
        "- *luz 150 dia 20*\n" +
        "- *recebi 500 de salário*\n\n" +
        "Se for relatório por e-mail, pode pedir assim:\n" +
        "- *enviar pdf do resumo para email nome@dominio.com*",
    };
  }
}

// ─── Resposta Geral via IA (fallback inteligente) ────────────────────────────
export async function generateGeneralResponse(
  userMessage: string,
  history: AIMessage[] = [],
): Promise<string | null> {
  const systemPrompt =
    `Você é o *OZapTeConta*, um assistente financeiro e de saúde via WhatsApp. ` +
    `Suas capacidades:\n` +
    `• 💰 Registrar contas a pagar/receber: _"paguei 120 de mercado"_, _"recebi 500 de salário"_\n` +
    `• 📊 Resumos financeiros: _"resumo do mês"_, _"ver contas de hoje"_\n` +
    `• 🧮 Taxa Basal (TMB), IMC e metas calóricas\n` +
    `• 🥗 Plano alimentar personalizado e análise nutricional de alimentos\n` +
    `• 📈 Análise de ações da B3 e criptomoedas com dados reais\n` +
    `• 💹 Cotações: dólar, euro, Bitcoin, Selic, IPCA\n` +
    `• 🚗 Tabela FIPE de veículos\n\n` +
    `REGRAS:\n` +
    `1. Responda à pergunta do usuário de forma ÚTIL e CONTEXTUAL — nunca com mensagem genérica\n` +
    `2. Se for algo que você faz, explique como usar e dê um exemplo prático\n` +
    `3. Se for pergunta de conhecimento geral (saúde, nutrição, finanças, etc.), responda com informações precisas\n` +
    `4. Use formatação WhatsApp: *negrito*, _itálico_\n` +
    `5. Seja conciso: máximo 250 palavras\n` +
    `6. Responda em português brasileiro informal e amigável\n` +
    `7. NUNCA peça para o usuário formatar a mensagem de outra forma como resposta inicial — primeiro tente entender e ajudar`;

  const messages: AIMessage[] = [
    { role: "system", content: systemPrompt },
    ...history.slice(-6),
    { role: "user", content: userMessage },
  ];

  const chain = await getProviderChain("text");
  let lastError: unknown;

  for (const provider of chain) {
    if (provider.provider !== "OLLAMA" && !provider.apiKey) continue;
    const startedAt = Date.now();
    const attempt = chain.indexOf(provider) + 1;
    try {
      const providerResult = await callProvider(
        provider.provider,
        provider.apiKey || "",
        normalizeModelForProvider(provider.provider, provider.model),
        messages,
        provider.apiUrl,
      );
      const content = providerResult.content.trim();
      await writeAiUsageLog({
        ts: new Date().toISOString(),
        provider: provider.provider,
        model: normalizeModelForProvider(provider.provider, provider.model),
        channel: "text",
        stage: "general",
        success: Boolean(content),
        latencyMs: Date.now() - startedAt,
        fallbackUsed: attempt > 1,
        attempt,
        promptTokens: providerResult.usage?.promptTokens,
        completionTokens: providerResult.usage?.completionTokens,
        totalTokens: providerResult.usage?.totalTokens,
      });
      if (content) return content;
    } catch (err) {
      lastError = err;
      logger.warn(`[AIService] Resposta geral com ${provider.provider} falhou: ${String(err)}`);
    }
  }

  logger.warn(`[AIService] Resposta geral indisponível: ${String(lastError)}`);
  return null;
}

// ─── Teste de conexão com provedor ───────────────────────────────────────────
export async function testProvider(
  provider: string,
  apiKey: string,
  model: string,
  apiUrl?: string
): Promise<{ ok: boolean; message: string; latencyMs?: number }> {
  const start = Date.now();
  try {
    const messages: AIMessage[] = [
      { role: "user", content: "Responda apenas: OK" },
    ];
    const result = await callProvider(provider, apiKey, normalizeModelForProvider(provider, model), messages, apiUrl);
    const latencyMs = Date.now() - start;
    return { ok: true, message: `Conexão bem-sucedida (${latencyMs}ms). Resposta: "${result.content.substring(0, 50)}"`, latencyMs };
  } catch (err) {
    return { ok: false, message: String(err) };
  }
}
