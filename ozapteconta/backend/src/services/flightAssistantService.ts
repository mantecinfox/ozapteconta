/**
 * Assistente conversacional de voos — entende pedidos vagos e conduz o cliente
 * até uma busca completa sem exigir rota/data perfeitas.
 */
import { prisma } from "../config/prisma";
import type { FlightSearchQuery, FlightTripType } from "./flightSearchService";
import {
  defaultOutboundDate,
  detectFlightQuery,
  resolveAirportCodeFromText,
  parseTravelDateFromText,
  formatDatePtBr,
  CITY_LABELS,
} from "./flightSearchService";

export type FlightWizardState = {
  draft: {
    originCode?: string;
    destinationCode?: string;
    originLabel?: string;
    destinationLabel?: string;
    outboundDate?: string;
    returnDate?: string;
    tripType?: FlightTripType;
    budgetHint?: string;
    preferenceTags?: string[];
  };
  pendingQuestion?: "origin" | "destination" | "date" | "pick_destination";
  destinationOptions?: Array<{ label: string; code: string }>;
  updatedAt: string;
};

export type FlightAssistantTurn =
  | { kind: "none" }
  | { kind: "reply"; message: string }
  | { kind: "search"; query: FlightSearchQuery };

const WIZARD_TIMEOUT_MS = 30 * 60 * 1000;

const THEME_DESTINATIONS: Record<string, Array<{ code: string; label: string }>> = {
  praia: [
    { code: "SSA", label: "Salvador" },
    { code: "REC", label: "Recife" },
    { code: "FOR", label: "Fortaleza" },
    { code: "NAT", label: "Natal" },
    { code: "MCZ", label: "Maceió" },
    { code: "GIG", label: "Rio de Janeiro" },
    { code: "FLN", label: "Florianópolis" },
  ],
  nordeste: [
    { code: "SSA", label: "Salvador" },
    { code: "REC", label: "Recife" },
    { code: "FOR", label: "Fortaleza" },
    { code: "NAT", label: "Natal" },
    { code: "MCZ", label: "Maceió" },
  ],
  frio: [
    { code: "POA", label: "Porto Alegre" },
    { code: "CWB", label: "Curitiba" },
    { code: "FLN", label: "Florianópolis" },
  ],
  capital: [
    { code: "BSB", label: "Brasília" },
    { code: "SAO", label: "São Paulo" },
    { code: "RIO", label: "Rio de Janeiro" },
  ],
  turismo: [
    { code: "RIO", label: "Rio de Janeiro" },
    { code: "BSB", label: "Brasília" },
    { code: "SSA", label: "Salvador" },
    { code: "MAO", label: "Manaus" },
  ],
};

function normalizeText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function isCancelIntent(text: string): boolean {
  const normalized = normalizeText(text);
  return /^(cancelar|cancela|sair|parar|desistir|voltar)$/.test(normalized);
}

export function isTravelRelatedQuery(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized || normalized.length < 3) return false;

  const travelSignals = [
    /\b(voo|voos|passagem|passagens|aereo|aerea|aviacao|flight)\b/,
    /\b(viajar|viagem|viajo|viaja|ferias|turismo|turistar)\b/,
    /\b(bilhete|embarque|aeroporto|companhia aerea)\b/,
    /\b(preciso ir|quero ir|to indo|estou indo)\b/,
    /\b(destino|roteiro|fim de semana|final de semana)\b.*\b(viaj|passagem|voo|praia|ferias)\b/,
    /\b(barato|barata|promocao|promo|economico|economica|melhor preco|menor preco)\b.*\b(voo|passagem|viaj)\b/,
    /\b(voo|passagem|viaj)\b.*\b(barato|barata|promocao|economico|melhor)\b/,
    /\b(praia|nordeste|sul|centro oeste|capital)\b.*\b(viaj|ir|passagem|voo)\b/,
  ];

  return travelSignals.some((pattern) => pattern.test(normalized));
}

function extractPreferenceTags(text: string): string[] {
  const normalized = normalizeText(text);
  const tags: string[] = [];
  if (/\b(praia|mar|litoral|costa)\b/.test(normalized)) tags.push("praia");
  if (/\b(nordeste|nordestino)\b/.test(normalized)) tags.push("nordeste");
  if (/\b(frio|inverno|sul)\b/.test(normalized)) tags.push("frio");
  if (/\b(capital|capitais)\b/.test(normalized)) tags.push("capital");
  if (/\b(turismo|passear|conhecer)\b/.test(normalized)) tags.push("turismo");
  if (/\b(barato|barata|promocao|economico|economica|melhor preco|menor preco)\b/.test(normalized)) {
    tags.push("barato");
  }
  return tags;
}

function extractBudgetHint(text: string): string | undefined {
  const normalized = normalizeText(text);
  const match = normalized.match(/\b(?:ate|maximo|m[aá]ximo|por)\s*r?\$?\s*([\d.,]+)\b/);
  if (!match) return undefined;
  return match[1].replace(".", "").replace(",", ".");
}

function extractCitiesFromText(text: string): Array<{ code: string; label: string; index: number }> {
  const normalized = normalizeText(text);
  const found: Array<{ code: string; label: string; index: number }> = [];

  const sortedAliases = Object.entries(CITY_LABELS).sort((left, right) => right[0].length - left[0].length);
  for (const [alias, code] of sortedAliases) {
    const pattern = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    const match = pattern.exec(normalized);
    if (match) {
      const duplicate = found.some((entry) => entry.code === code && Math.abs(entry.index - match.index) < 3);
      if (!duplicate) {
        found.push({ code, label: alias, index: match.index ?? 0 });
      }
    }
  }

  return found.sort((left, right) => left.index - right.index);
}

function buildQueryFromDraft(draft: FlightWizardState["draft"], rawQuery: string): FlightSearchQuery | null {
  if (!draft.originCode || !draft.destinationCode) return null;
  if (draft.originCode === draft.destinationCode) return null;

  return {
    originCode: draft.originCode,
    destinationCode: draft.destinationCode,
    originLabel: draft.originLabel || draft.originCode,
    destinationLabel: draft.destinationLabel || draft.destinationCode,
    outboundDate: draft.outboundDate || defaultOutboundDate(),
    returnDate: draft.returnDate,
    tripType: draft.tripType || (draft.returnDate ? "round_trip" : "one_way"),
    rawQuery,
  };
}

function labelForCode(code: string): string {
  const entry = Object.entries(CITY_LABELS).find(([, airportCode]) => airportCode === code);
  return entry ? entry[0] : code;
}

function formatDestinationMenu(options: Array<{ label: string; code: string }>): string {
  return options
    .map((option, index) => `${index + 1}️⃣ *${option.label}* (${option.code})`)
    .join("\n");
}

function buildWelcomeMessage(originHint?: string): string {
  const originLine = originHint
    ? `Vi que você pode sair de *${originHint}* — se for outra cidade, me avise.\n\n`
    : "";

  return (
    `✈️ *Assistente de Viagens*\n\n` +
    `${originLine}` +
    `Pode escrever ou mandar *áudio* — do jeito que você fala no dia a dia.\n\n` +
    `*Exemplos (texto ou voz):*\n` +
    `• _quero passagem barata pro nordeste_\n` +
    `• _"preciso ir pro rio mês que vem"_ 🎤\n` +
    `• _melhor preço pra praia_\n\n` +
    `Eu pergunto o que faltar e busco preços, horários e companhias.`
  );
}

function buildMissingOriginMessage(): string {
  return (
    `📍 *De qual cidade você pretende sair?*\n\n` +
    `Pode mandar do jeito que fala no dia a dia:\n` +
    `• _São Paulo_\n` +
    `• _Belo Horizonte_\n` +
    `• _GRU_ ou _Confins_\n\n` +
    `_Se quiser cancelar, digite *cancelar*._`
  );
}

function buildMissingDestinationMessage(originLabel: string, options?: Array<{ label: string; code: string }>): string {
  if (options && options.length > 0) {
    return (
      `🌴 *Saindo de ${originLabel}* — estes destinos costumam ter boas opções:\n\n` +
      `${formatDestinationMenu(options)}\n\n` +
      `Digite o *número* ou o *nome da cidade* que te interessa.\n` +
      `_Também pode dizer: "quero o mais barato" ou "praia no nordeste"._`
    );
  }

  return (
    `🎯 *Para onde você quer ir?*\n\n` +
    `Saindo de *${originLabel}*, me diga a cidade ou região:\n` +
    `• _Rio de Janeiro_\n` +
    `• _Salvador_\n` +
    `• _praia barata no nordeste_\n\n` +
    `_Digite *cancelar* para desistir._`
  );
}

function buildMissingDateMessage(originLabel: string, destinationLabel: string): string {
  return (
    `📅 *Quando você quer viajar?*\n\n` +
    `Rota: *${originLabel} → ${destinationLabel}*\n\n` +
    `Pode responder assim:\n` +
    `• _15/07_\n` +
    `• _mês que vem_\n` +
    `• _final de semana_\n` +
    `• _julho_\n\n` +
    `Se não souber ainda, digite *qualquer data* ou *não sei* que uso uma sugestão ~2 semanas à frente.`
  );
}

function buildConfirmMessage(query: FlightSearchQuery): string {
  return (
    `✅ *Vou buscar as melhores opções para você:*\n\n` +
    `🛫 *${query.originLabel}* → 🛬 *${query.destinationLabel}*\n` +
    `📅 Ida: *${formatDatePtBr(query.outboundDate)}*\n` +
    (query.returnDate ? `🔁 Volta: *${formatDatePtBr(query.returnDate)}*\n` : "") +
    `\nAguarde um instante enquanto consulto preços, horários e companhias…`
  );
}

function pickDestinationOptions(tags: string[]): Array<{ label: string; code: string }> {
  for (const tag of tags) {
    const themed = THEME_DESTINATIONS[tag];
    if (themed?.length) return themed.slice(0, 5);
  }
  return THEME_DESTINATIONS.turismo.slice(0, 5);
}

function parseDestinationChoice(
  text: string,
  options: Array<{ label: string; code: string }>,
): { code: string; label: string } | null {
  const normalized = normalizeText(text);
  const numeric = normalized.replace(/\D/g, "");
  if (numeric && Number(numeric) >= 1 && Number(numeric) <= options.length) {
    return options[Number(numeric) - 1];
  }

  const city = resolveAirportCodeFromText(text);
  if (city) {
    return { code: city.code, label: city.label };
  }

  for (const option of options) {
    if (normalized.includes(normalizeText(option.label))) {
      return option;
    }
  }

  return null;
}

function mergeTextIntoDraft(
  draft: FlightWizardState["draft"],
  text: string,
  pendingQuestion?: FlightWizardState["pendingQuestion"],
): FlightWizardState["draft"] {
  const next = { ...draft };
  const preferences = extractPreferenceTags(text);
  if (preferences.length) {
    next.preferenceTags = Array.from(new Set([...(next.preferenceTags || []), ...preferences]));
  }

  const budgetHint = extractBudgetHint(text);
  if (budgetHint) next.budgetHint = budgetHint;

  const cities = extractCitiesFromText(text);
  if (cities.length >= 2) {
    next.originCode = cities[0].code;
    next.originLabel = labelForCode(cities[0].code);
    next.destinationCode = cities[1].code;
    next.destinationLabel = labelForCode(cities[1].code);
  } else if (cities.length === 1) {
    const city = cities[0];
    if (!next.originCode && !next.destinationCode) {
      next.destinationCode = city.code;
      next.destinationLabel = labelForCode(city.code);
    } else if (next.destinationCode && !next.originCode) {
      next.originCode = city.code;
      next.originLabel = labelForCode(city.code);
    } else if (next.originCode && !next.destinationCode) {
      next.destinationCode = city.code;
      next.destinationLabel = labelForCode(city.code);
    }
  }

  const resolvedCity = resolveAirportCodeFromText(text);
  if (resolvedCity) {
    if (pendingQuestion === "origin" || (!next.originCode && next.destinationCode)) {
      next.originCode = resolvedCity.code;
      next.originLabel = resolvedCity.label;
    } else if (!next.destinationCode) {
      next.destinationCode = resolvedCity.code;
      next.destinationLabel = resolvedCity.label;
    }
  }

  const parsedDate = parseTravelDateFromText(text);
  if (parsedDate) next.outboundDate = parsedDate;

  if (/\b(id[ae] e volta|volta|round trip)\b/.test(normalizeText(text))) {
    next.tripType = "round_trip";
  }

  if (/\b(nao sei|nao tenho|tanto faz|qualquer|quando der)\b/.test(normalizeText(text)) && !next.outboundDate) {
    next.outboundDate = defaultOutboundDate();
  }

  return next;
}

async function resolveDefaultOrigin(phone: string): Promise<{ code: string; label: string } | undefined> {
  const profile = await prisma.clientProfile.findFirst({
    where: { phone },
    select: { addressCity: true, addressState: true },
  });
  if (!profile?.addressCity) return undefined;

  const cityText = `${profile.addressCity} ${profile.addressState || ""}`.trim();
  const resolved = resolveAirportCodeFromText(cityText);
  return resolved ? { code: resolved.code, label: profile.addressCity } : undefined;
}

export async function loadFlightWizard(phone: string): Promise<FlightWizardState | null> {
  const user = await prisma.whatsappUser.findUnique({
    where: { phone },
    select: { registrationData: true },
  });
  if (!user?.registrationData || typeof user.registrationData !== "object") return null;

  const payload = user.registrationData as Record<string, unknown>;
  const wizard = payload.flightWizard as FlightWizardState | undefined;
  if (!wizard?.updatedAt) return null;

  const elapsedMs = Date.now() - new Date(wizard.updatedAt).getTime();
  if (elapsedMs > WIZARD_TIMEOUT_MS) {
    await saveFlightWizard(phone, null);
    return null;
  }

  return wizard;
}

export async function saveFlightWizard(phone: string, wizard: FlightWizardState | null): Promise<void> {
  const user = await prisma.whatsappUser.findUnique({
    where: { phone },
    select: { registrationData: true },
  });

  const current =
    user?.registrationData && typeof user.registrationData === "object"
      ? (user.registrationData as Record<string, unknown>)
      : {};

  const nextData = { ...current };
  if (wizard) {
    nextData.flightWizard = wizard;
  } else {
    delete nextData.flightWizard;
  }

  /* SANITY CHECK: persiste wizard sem apagar outros dados do usuário */
  await prisma.whatsappUser.update({
    where: { phone },
    data: { registrationData: nextData as object },
  });
}

function resolveNextStep(draft: FlightWizardState["draft"]): FlightWizardState["pendingQuestion"] | null {
  if (!draft.originCode) return "origin";
  if (!draft.destinationCode) return "destination";
  if (!draft.outboundDate) return "date";
  return null;
}

export async function handleFlightAssistantTurn(
  phone: string,
  text: string,
): Promise<FlightAssistantTurn> {
  const trimmed = String(text || "").trim();
  if (!trimmed) return { kind: "none" };

  if (isCancelIntent(trimmed)) {
    const existing = await loadFlightWizard(phone);
    if (existing) {
      await saveFlightWizard(phone, null);
      return {
        kind: "reply",
        message: "✈️ Busca de viagem cancelada. Quando quiser, é só me chamar de novo — do seu jeito mesmo.",
      };
    }
    return { kind: "none" };
  }

  const completeQuery = detectFlightQuery(trimmed);
  if (completeQuery) {
    await saveFlightWizard(phone, null);
    return { kind: "search", query: completeQuery };
  }

  const existingWizard = await loadFlightWizard(phone);
  const defaultOrigin = await resolveDefaultOrigin(phone);
  const travelRelated = isTravelRelatedQuery(trimmed);

  if (!existingWizard && !travelRelated) {
    return { kind: "none" };
  }

  if (!existingWizard && /^(voo|voos|passagem|passagens|ajuda voo|ajuda voos|busca voo|buscar voos?)$/.test(normalizeText(trimmed))) {
    return { kind: "reply", message: buildWelcomeMessage(defaultOrigin?.label) };
  }

  let wizard: FlightWizardState = existingWizard || {
    draft: {},
    updatedAt: new Date().toISOString(),
  };

  if (wizard.pendingQuestion === "pick_destination" && wizard.destinationOptions?.length) {
    const picked = parseDestinationChoice(trimmed, wizard.destinationOptions);
    if (picked) {
      wizard.draft.destinationCode = picked.code;
      wizard.draft.destinationLabel = picked.label;
      wizard.pendingQuestion = undefined;
      wizard.destinationOptions = undefined;
    }
  }

  wizard.draft = mergeTextIntoDraft(wizard.draft, trimmed, wizard.pendingQuestion);

  if (!wizard.draft.originCode && defaultOrigin && !wizard.pendingQuestion) {
    wizard.draft.originCode = defaultOrigin.code;
    wizard.draft.originLabel = defaultOrigin.label;
  }

  if (!wizard.draft.destinationCode && wizard.draft.originCode) {
    const tags = wizard.draft.preferenceTags || extractPreferenceTags(trimmed);
    if (tags.length > 0 && !extractCitiesFromText(trimmed).length) {
      wizard.destinationOptions = pickDestinationOptions(tags);
      wizard.pendingQuestion = "pick_destination";
      wizard.updatedAt = new Date().toISOString();
      await saveFlightWizard(phone, wizard);
      return {
        kind: "reply",
        message: buildMissingDestinationMessage(
          wizard.draft.originLabel || wizard.draft.originCode || "sua cidade",
          wizard.destinationOptions,
        ),
      };
    }
  }

  const nextStep = resolveNextStep(wizard.draft);
  if (nextStep === "origin") {
    wizard.pendingQuestion = "origin";
    wizard.updatedAt = new Date().toISOString();
    await saveFlightWizard(phone, wizard);
    return { kind: "reply", message: buildMissingOriginMessage() };
  }

  if (nextStep === "destination") {
    wizard.pendingQuestion = "destination";
    wizard.destinationOptions = pickDestinationOptions(wizard.draft.preferenceTags || []);
    wizard.updatedAt = new Date().toISOString();
    await saveFlightWizard(phone, wizard);
    return {
      kind: "reply",
      message: buildMissingDestinationMessage(
        wizard.draft.originLabel || wizard.draft.originCode || "sua cidade",
        wizard.destinationOptions,
      ),
    };
  }

  if (nextStep === "date") {
    wizard.pendingQuestion = "date";
    wizard.updatedAt = new Date().toISOString();
    await saveFlightWizard(phone, wizard);
    return {
      kind: "reply",
      message: buildMissingDateMessage(
        wizard.draft.originLabel || wizard.draft.originCode || "Origem",
        wizard.draft.destinationLabel || wizard.draft.destinationCode || "Destino",
      ),
    };
  }

  const finalQuery = buildQueryFromDraft(wizard.draft, trimmed);
  if (!finalQuery) {
    wizard.updatedAt = new Date().toISOString();
    await saveFlightWizard(phone, wizard);
    return { kind: "reply", message: buildWelcomeMessage(defaultOrigin?.label) };
  }

  await saveFlightWizard(phone, null);
  return {
    kind: "search",
    query: finalQuery,
  };
}

export function buildFlightTravelExamplesBlock(compact = false): string {
  const br = compact ? "\n" : "\n\n";
  const indent = compact ? "   " : "";

  return (
    `✈️ *Viagens / passagens (Plano Travel):*${br}` +
    `${indent}📝 *Por texto* — escreva como fala:${br}` +
    `${indent}• _quero passagem barata pro nordeste_${br}` +
    `${indent}• _preciso ir pro rio mês que vem_${br}` +
    `${indent}• _voo de bh pra salvador dia 15/07_${br}` +
    `${indent}• _melhor preço pra praia saindo de sp_${br}` +
    `${indent}• _voos_ — abre o assistente de viagens${br}` +
    `${br}` +
    `${indent}🎤 *Por áudio* — fale naturalmente (mesmas frases):${br}` +
    `${indent}• _"quero viajar barato, qual melhor destino?"_${br}` +
    `${indent}• _"preciso de passagem pra fortaleza mês que vem"${br}` +
    `${indent}• _"quanto custa voo de belo horizonte pro rio?"_${br}` +
    `${indent}• _"passagem mais em conta pro nordeste saindo daqui"${br}` +
    `${indent}• _"2"_ ou _"recife"_ — responde quando eu listar opções${br}` +
    `${br}` +
    `${indent}💡 Não precisa saber aeroporto nem data exata — eu pergunto o que faltar.${br}` +
    `${indent}Digite *cancelar* para parar a busca.`
  );
}

export function getFlightHelp(): string {
  return (
    `✈️ *Assistente de Viagens — Plano Travel*\n\n` +
    `Funciona por *texto* ou *áudio*. Fale do seu jeito — eu completo origem, destino e data.\n\n` +
    `${buildFlightTravelExamplesBlock(true)}\n\n` +
    `_Plano Travel — R$ 59,90/mês._`
  );
}

export function buildFlightSearchIntro(query: FlightSearchQuery): string {
  return buildConfirmMessage(query);
}
