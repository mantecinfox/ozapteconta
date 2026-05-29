export type OnboardingTone = "formal" | "informal";
export type OnboardingWelcomeScenario = "new" | "returning";

export type OnboardingWelcomeOptions = {
  clientMessage: string;
  displayName?: string;
  scenario: OnboardingWelcomeScenario;
  expiredReset?: boolean;
  timeoutMinutes?: number;
};

function normalizeForMatch(text: string): string {
  if (typeof text !== "string") return "";
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function isOnboardingGreeting(text: string): boolean {
  const normalized = normalizeForMatch(text);
  if (!normalized || normalized.length > 120) return false;

  const exactGreetings = [
    /^(oi|ola|hey|hello|hi|salve|opa|fala|eai|e ai|td bem|tudo bem|blz|beleza)[!.?,\s]*$/,
    /^(bom dia|boa tarde|boa noite)[!.?,\s]*$/,
  ];
  if (exactGreetings.some((pattern) => pattern.test(normalized))) return true;

  const prefixGreetings = [
    /^(oi|ola|bom dia|boa tarde|boa noite)\b/,
    /\b(oi|ola)\b.*\b(tudo bem|td bem|blz)?$/,
  ];
  return prefixGreetings.some((pattern) => pattern.test(normalized));
}

export function isOnboardingRestartRequest(text: string): boolean {
  const normalized = normalizeForMatch(text);
  if (!normalized) return false;
  return /\b(recomecar|recomeçar|inicio|cancelar|desistir|voltar ao inicio|do zero|cadastro novo|comecar de novo|comecar novamente)\b/.test(
    normalized,
  );
}

export function shouldRestartOnboardingFlow(text: string): boolean {
  return isOnboardingGreeting(text) || isOnboardingRestartRequest(text);
}

export function detectOnboardingTone(text: string): OnboardingTone {
  const normalized = normalizeForMatch(text);
  if (!normalized) return "informal";

  const formalSignals = /\b(prezad\w*|senhor|senhora|cordial|vossa|atenciosamente|att)\b/;
  const informalSignals = /\b(tudo bem|td bem|blz|beleza|e ai|eai|salve|opa|fala)\b/;

  if (formalSignals.test(normalized)) return "formal";
  if (informalSignals.test(normalized)) return "informal";
  if (/^(bom dia|boa tarde|boa noite)\b/.test(normalized)) return "formal";
  return "informal";
}

export function resolveOnboardingDisplayName(
  storedName?: string | null,
  senderName?: string,
): string | undefined {
  const candidate = (storedName || senderName || "").trim();
  if (!candidate || candidate.length < 2) return undefined;

  const digitsOnly = candidate.replace(/\D/g, "");
  if (digitsOnly.length >= 10 && digitsOnly.length === candidate.replace(/\s/g, "").length) {
    return undefined;
  }

  return candidate;
}

function buildTypeQuestion(tone: OnboardingTone): string {
  if (tone === "formal") {
    return (
      "Informe, por favor, se você é:\n" +
      "1️⃣ *Pessoa Física* (CPF)\n" +
      "2️⃣ *Pessoa Jurídica* (CNPJ)\n\n" +
      "Digite *1* ou *2*:"
    );
  }
  return (
    "Para começarmos, me diga:\n" +
    "1️⃣ *Pessoa Física* (CPF)\n" +
    "2️⃣ *Pessoa Jurídica* (CNPJ)\n\n" +
    "Digite *1* ou *2*:"
  );
}

export function buildOnboardingWelcomeMessage(options: OnboardingWelcomeOptions): string {
  const tone = detectOnboardingTone(options.clientMessage);
  const timeoutMinutes = options.timeoutMinutes ?? 10;
  const name = options.displayName?.trim();
  const parts: string[] = [];

  if (options.expiredReset) {
    parts.push(
      `⏱️ Passou mais de *${timeoutMinutes} minutos* desde nossa última conversa, então recomeçamos seu cadastro do zero — sem problemas!\n`,
    );
  }

  if (options.scenario === "returning") {
    if (tone === "formal") {
      parts.push(
        name
          ? `Prezado(a) *${name}*, é um prazer recebê-lo(a) novamente. Agradecemos por retornar ao *ozapteconta*.\n`
          : "Prezado(a), é um prazer recebê-lo(a) novamente. Agradecemos por retornar ao *ozapteconta*.\n",
      );
      parts.push(
        "Retomaremos seu cadastro para que você possa usar nosso assistente financeiro pelo WhatsApp.\n",
      );
    } else {
      parts.push(
        name
          ? `Olá, *${name}*! Que bom ter você de volta — obrigado por retornar. 🙏\n`
          : "Olá! Que bom ter você de volta — obrigado por retornar. 🙏\n",
      );
      parts.push("Vamos continuar seu cadastro no *ozapteconta*, seu assistente financeiro pelo WhatsApp.\n");
    }
  } else if (tone === "formal") {
    parts.push("Prezado(a), seja bem-vindo(a) ao *ozapteconta*.\n");
    parts.push("Somos um assistente financeiro via WhatsApp. Para iniciarmos, faremos um cadastro breve.\n");
  } else {
    parts.push("Olá! 👋 Seja bem-vindo(a) ao *ozapteconta* — seu assistente financeiro pelo WhatsApp.\n");
    parts.push("Para começarmos, preciso de um cadastro rápido.\n");
  }

  parts.push(buildTypeQuestion(tone));
  return parts.join("\n");
}

export function buildTypeStepRetryMessage(options: {
  clientMessage: string;
  displayName?: string;
}): string {
  const tone = detectOnboardingTone(options.clientMessage);
  const name = options.displayName?.trim();

  if (tone === "formal") {
    return (
      (name ? `Prezado(a) *${name}*, ` : "") +
      "para seguirmos com seu cadastro, informe se você é *Pessoa Física* (digite *1*) ou *Pessoa Jurídica* (digite *2*)."
    );
  }

  return (
    (name ? `Sem problemas, *${name}*! ` : "Sem problemas! ") +
    "Para seguir com seu cadastro no *ozapteconta*, me diga:\n\n" +
    "1️⃣ *Pessoa Física* (CPF)\n" +
    "2️⃣ *Pessoa Jurídica* (CNPJ)\n\n" +
    "Digite *1* ou *2*:"
  );
}

export function resolveWelcomeScenario(input: {
  registrationStep: string | null;
  registrationData: Record<string, unknown>;
  createdAt: Date;
  expiredReset: boolean;
  greetingRestart: boolean;
}): OnboardingWelcomeScenario {
  const partialKeys = ["clientType", "fullName", "cpf", "cnpj", "email", "addressZipCode"];
  const hasPartialData = partialKeys.some((key) => {
    const value = input.registrationData[key];
    return typeof value === "string" ? value.trim().length > 0 : value != null;
  });

  const accountAgeMs = Date.now() - input.createdAt.getTime();
  const isEstablishedContact = accountAgeMs > 5 * 60 * 1000;

  if (input.greetingRestart && (input.registrationStep || hasPartialData || isEstablishedContact)) {
    return "returning";
  }
  if (input.expiredReset && (hasPartialData || isEstablishedContact)) {
    return "returning";
  }
  if (!input.registrationStep && (hasPartialData || isEstablishedContact)) {
    return "returning";
  }
  return "new";
}
