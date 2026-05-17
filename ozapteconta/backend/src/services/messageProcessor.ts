import fs from "fs";
import path from "path";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { config } from "../config";
import { logger } from "../utils/logger";
import { extractTransaction, extractTransactionFromAudio, analyzeNutrition, generateDietPlan, generateInvestmentAdvice, generateGeneralResponse, AIMessage } from "./aiService";
import { sendMessage, downloadMedia, formatCurrency, formatDate } from "./whatsappService";
import { transcribeAudio } from "./transcriptionService";
import { issueClientPortalAccess } from "./clientAccessService";
import { detectMarketQuery, executeMarketQuery, getMarketHelp, detectInvestmentQuery, analyzeStockForInvestment, analyzeCryptoForInvestment, getTopB3Stocks, getTopCryptosReport, getInvestmentMenu, InvestmentQuery } from "./marketDataService";
import { detectFipeQuery, queryFipe, getFipeHelp } from "./fipeService";
import { resolveWhatsappIdentity } from "./whatsappIdentityService";
import infinityPayService from "./infinityPayService";
import { sendFinancialReportNow } from "./financialReportService";

const ONBOARDING_TIMEOUT_MINUTES = 10;
const AUDIO_PENDING_NOTICE_DELAY_MS = 2500;

function scheduleAudioPendingNotice(phone: string): { cancel: () => void } {
  const timeoutRef = setTimeout(() => {
    sendMessage(phone, "🎤 Recebemos seu áudio. Aguarde alguns instantes, por gentileza.")
      .catch((err) => logger.warn(`[Audio] Falha ao enviar aviso de processamento: ${String(err)}`));
  }, AUDIO_PENDING_NOTICE_DELAY_MS);

  return {
    cancel: () => clearTimeout(timeoutRef),
  };
}

// ─── Onboarding / Gates ────────────────────────────────────────────────────────

type RegData = {
  clientType?: "PF" | "PJ";
  fullName?: string;
  cpf?: string;
  cnpj?: string;
  email?: string;
  addressStreet?: string;
  addressNumber?: string;
  addressComplement?: string;
  addressNeighborhood?: string;
  addressCity?: string;
  addressState?: string;
  addressZipCode?: string;
  addressFromCnpj?: boolean;
  addressNumberFilled?: boolean;
  onboardingUpdatedAt?: string;
};

async function getPixKey(): Promise<string> {
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key: "pix_key" } });
    return setting?.value || "⚠️ Chave PIX não configurada — entre em contato com o suporte";
  } catch {
    return "⚠️ Chave PIX não configurada — entre em contato com o suporte";
  }
}

async function setRegistrationStep(phone: string, step: string | null, data?: RegData) {
  const payload = data !== undefined
    ? { ...data, onboardingUpdatedAt: new Date().toISOString() }
    : undefined;

  await prisma.whatsappUser.update({
    where: { phone },
    data: {
      registrationStep: step,
      ...(payload !== undefined ? { registrationData: payload as Prisma.InputJsonValue } : {}),
    },
  });
}

async function fetchCnpjData(cnpj: string): Promise<Record<string, string> | null> {
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, string>;
  } catch {
    return null;
  }
}

async function fetchCepData(cep: string): Promise<Record<string, string> | null> {
  try {
    const clean = cep.replace(/\D/g, "");
    const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    if (data.erro) return null;
    return data as Record<string, string>;
  } catch {
    return null;
  }
}

async function fetchCepDataWithRetries(cep: string, maxAttempts = 3): Promise<Record<string, string> | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const data = await fetchCepData(cep);
    if (data && data.logradouro) return data;
    logger.warn(`[Onboarding] Falha ao consultar CEP ${cep} (tentativa ${attempt}/${maxAttempts})`);
  }
  return null;
}

async function sendPlanOptions(phone: string) {
  const plans = await prisma.subscriptionPlan.findMany({ orderBy: { priceMonthly: "asc" } });
  const fmt = (planName: string, def: string) => {
    const p = plans.find((x) => x.plan === planName);
    return p ? Number(p.priceMonthly).toFixed(2).replace(".", ",") : def;
  };
  await sendMessage(
    phone,
    "🎯 *Escolha o seu plano:*\n\n" +
      `1️⃣ *BÁSICO* — R$ ${fmt("HOME", "4,90")}/mês\n   Contas a pagar/receber (PF e PJ)\n   _Sem FIPE e sem Mercado Financeiro_\n\n` +
      `2️⃣ *COMPLETO* — R$ ${fmt("FULL", "9,90")}/mês\n   Todos os recursos liberados\n\n` +
      "Digite *1* ou *2*:"
  );
}

async function handleOnboarding(
  user: { registrationStep: string | null; registrationData: unknown; updatedAt: Date; createdAt: Date },
  phone: string,
  text: string,
  aliases: string[] = []
): Promise<boolean> {
  const candidatePhones = Array.from(new Set([phone, ...aliases].filter(Boolean)));
  const trimmed = text.trim();
  const nowMs = Date.now();
  let step = user.registrationStep;
  let regData = (user.registrationData || {}) as RegData;
  let expiredAndReset = false;

  // Se o cadastro ficar parado por 10 minutos, limpa o estado e reinicia do zero.
  if (step && step !== "pending") {
    const referenceTime =
      regData.onboardingUpdatedAt
        ? new Date(regData.onboardingUpdatedAt)
        : user.createdAt;
    const elapsedMs = nowMs - referenceTime.getTime();
    if (elapsedMs > ONBOARDING_TIMEOUT_MINUTES * 60 * 1000) {
      await prisma.whatsappUser.update({
        where: { phone },
        data: {
          registrationStep: null,
          registrationData: {} as Prisma.InputJsonValue,
          conversationContext: Prisma.JsonNull,
        },
      });
      step = null;
      regData = {};
      expiredAndReset = true;
    }
  }

  // 1. Verifica ClientProfile existente
  const profile = await prisma.clientProfile.findFirst({
    where: { phone: { in: candidatePhones } },
    include: { subscription: true },
  });

  if (profile?.phone && profile.phone !== phone) {
    await prisma.clientProfile.update({
      where: { id: profile.id },
      data: { phone },
    }).catch(() => null);
  }

  if (profile) {
    if (profile.status === "ACTIVE" && profile.subscription?.status === "ACTIVE") {
      if (user.registrationStep) await setRegistrationStep(phone, null);
      return false; // ativo — usa o sistema normalmente
    }

    if (profile.subscription?.status === "ACTIVE" && profile.status !== "ACTIVE") {
      await prisma.clientProfile.update({
        where: { id: profile.id },
        data: { status: "ACTIVE", activatedAt: new Date() },
      });
      await setRegistrationStep(phone, null);
      await sendMessage(
        phone,
        "🎉 *Conta ativada com sucesso!*\n\nBem-vindo ao ozapteconta! Agora você pode gerenciar suas finanças.\n\nDigite *ajuda* para ver os comandos disponíveis."
      );
      return true;
    }

    // Perfil existe mas aguarda pagamento
    const lower = trimmed.toLowerCase();
    if (lower.includes("comprovante") || lower.includes("paguei") ||
        (lower.includes("pagamento") && (lower.includes("fiz") || lower.includes("efetuei") || lower.includes("realizei")))) {
      await sendMessage(phone, "📨 *Comprovante recebido!*\n\nNosso time irá verificar e ativar sua conta em breve. ✅");
    } else {
      const price = profile.subscription ? Number(profile.subscription.priceMonthly) : 0;
      const priceStr = price.toFixed(2).replace(".", ",");

      // Tentar gerar link de pagamento InfinityPay
      let paymentLinkUrl: string | null = null;
      try {
        const linkResult = await infinityPayService.createPaymentLink({
          amount: price,
          description: `ozapteconta ${profile.plan} - ${profile.fullName} (ativação)`,
          customer_email: profile.email || phone,
          customer_name: profile.fullName,
          customer_cpf: profile.cpf || undefined,
          customer_phone: phone,
          payment_methods: ["pix", "credit_card", "boleto"],
          expires_in: 86400 * 3,
          metadata: { client_id: profile.id, plan: profile.plan, retry: true },
        });
        if (linkResult.success) {
          paymentLinkUrl = linkResult.data?.resolved_url || linkResult.data?.url || null;
          logger.info(`[Onboarding] Link de pagamento (reenvio) gerado para ${phone}: ${paymentLinkUrl}`);
        } else {
          logger.warn(`[Onboarding] Falha ao gerar link de pagamento (reenvio) para ${phone}: ${linkResult.error}`);
        }
      } catch (linkErr) {
        logger.error("[Onboarding] Erro ao gerar link de pagamento (reenvio):", linkErr);
      }

      if (paymentLinkUrl) {
        await sendMessage(
          phone,
          `⏳ *Sua conta ainda não foi ativada.*\n\n` +
            `Para ativar, realize o pagamento do plano *${profile.plan}* (R$ ${priceStr}/mês):\n\n` +
            `💳 *Link de Pagamento:*\n${paymentLinkUrl}\n\n` +
            `O link aceita PIX, cartão ou boleto. Válido por 3 dias.\n\n` +
            `Após o pagamento, sua conta será ativada automaticamente! ✅`
        );
      } else {
        const pixKey = await getPixKey();
        await sendMessage(
          phone,
          `⏳ *Aguardando confirmação de pagamento*\n\n` +
            `Seu cadastro está completo! Assim que o pagamento for confirmado, sua conta será ativada.\n\n` +
            `💳 Plano: *${profile.plan}* — R$ ${priceStr}/mês\n` +
            `📲 Chave PIX: *${pixKey}*\n\n` +
            `Se já pagou, envie o comprovante aqui. Dúvidas? Entre em contato com o suporte.`
        );
      }
    }
    return true;
  }

  // 2. Sem perfil — fluxo de cadastro passo a passo
  // Primeiro contato
  if (!step) {
    await setRegistrationStep(phone, "type", {});
    await sendMessage(
      phone,
      (expiredAndReset
        ? `⏱️ *Seu cadastro anterior expirou* por inatividade de mais de ${ONBOARDING_TIMEOUT_MINUTES} minutos.\n` +
          `🗑️ Os dados parciais foram *anulados* e o cadastro foi *reiniciado do zero*.\n\n`
        : "") +
        "👋 *Bem-vindo ao ozapteconta!*\n\n" +
        "Para usar nosso sistema, precisamos de um cadastro rápido.\n\n" +
        "Você é:\n1️⃣ *Pessoa Física* (CPF)\n2️⃣ *Pessoa Jurídica* (CNPJ)\n\nDigite *1* ou *2*:"
    );
    return true;
  }

  switch (step) {
    case "type": {
      const choice = trimmed.replace(/\D/g, "");
      if (choice !== "1" && choice !== "2") {
        await sendMessage(phone, "❌ Digite *1* para Pessoa Física ou *2* para Pessoa Jurídica:");
        return true;
      }
      const clientType: "PF" | "PJ" = choice === "1" ? "PF" : "PJ";
      const newData: RegData = { ...regData, clientType };
      if (clientType === "PJ") {
        await setRegistrationStep(phone, "cnpj", newData);
        await sendMessage(phone, "🏢 *Pessoa Jurídica*\n\nInforme o *CNPJ* da empresa (somente números):");
      } else {
        await setRegistrationStep(phone, "name", newData);
        await sendMessage(phone, "👤 *Pessoa Física*\n\nQual é o seu *nome completo*?");
      }
      return true;
    }

    case "cnpj": {
      const cnpj = trimmed.replace(/\D/g, "");
      if (cnpj.length !== 14) {
        await sendMessage(phone, "❌ CNPJ inválido. Informe os *14 dígitos* (somente números):");
        return true;
      }
      const existingCnpj = await prisma.clientProfile.findFirst({ where: { cnpj } });
      if (existingCnpj) {
        await sendMessage(phone, "⚠️ Já existe um cadastro com este CNPJ. Entre em contato com o suporte.");
        return true;
      }
      await sendMessage(phone, "🔍 Consultando CNPJ na Receita Federal...");
      const cnpjData = await fetchCnpjData(cnpj);
      let newData: RegData = { ...regData, cnpj };

      if (cnpjData && !cnpjData.message) {
        const name = String(cnpjData.razao_social || cnpjData.nome_fantasia || "").trim();
        const tipoLogradouro = String(cnpjData.descricao_tipo_de_logradouro || "").trim();
        const logradouro = String(cnpjData.logradouro || "").trim();
        const street = tipoLogradouro ? `${tipoLogradouro} ${logradouro}`.trim() : logradouro;
        const number = String(cnpjData.numero || "").trim();
        const complement = String(cnpjData.complemento || "").trim();
        const neighborhood = String(cnpjData.bairro || "").trim();
        const city = String(cnpjData.municipio || "").trim();
        const state = String(cnpjData.uf || "").trim();
        const zipRaw = String(cnpjData.cep || "").replace(/\D/g, "");
        const zip = zipRaw.length === 8 ? `${zipRaw.slice(0, 5)}-${zipRaw.slice(5)}` : "";

        const hasAddress = !!(street && city && state);

        newData = {
          ...newData,
          fullName: name || undefined,
          addressStreet: street || undefined,
          addressNumber: number || undefined,
          addressComplement: complement || undefined,
          addressNeighborhood: neighborhood || undefined,
          addressCity: city || undefined,
          addressState: state || undefined,
          addressZipCode: zip || undefined,
          addressFromCnpj: hasAddress ? true : undefined,
          addressNumberFilled: number ? true : undefined,
        };

        let msg = `✅ *CNPJ encontrado!*\n\n`;
        if (name) msg += `🏢 *${name}*\n`;
        if (hasAddress) {
          msg += `📍 ${street}, ${number}${complement ? ", " + complement : ""} — ${neighborhood ? neighborhood + ", " : ""}${city}/${state}${zip ? " · CEP " + zip : ""}\n`;
        }

        if (!name) {
          await setRegistrationStep(phone, "name", newData);
          await sendMessage(phone, msg + "\nNão encontrei o nome. Informe a *razão social*:");
        } else {
          await setRegistrationStep(phone, "email", newData);
          await sendMessage(phone, msg + "\nQual é o *e-mail de contato* da empresa?");
        }
      } else {
        await setRegistrationStep(phone, "name", newData);
        await sendMessage(phone, "⚠️ Não consegui consultar o CNPJ agora. Vamos continuar manualmente.\n\nInforme a *razão social* da empresa:");
      }
      return true;
    }

    case "name": {
      if (trimmed.length < 3) {
        await sendMessage(phone, "❌ Por favor, informe o nome completo (mínimo 3 caracteres):");
        return true;
      }
      const newData: RegData = { ...regData, fullName: trimmed };
      if (regData.clientType === "PF") {
        await setRegistrationStep(phone, "cpf", newData);
        await sendMessage(phone, `✅ Olá, *${trimmed.split(" ")[0]}*!\n\nAgora informe seu *CPF* (somente números):`);
      } else {
        await setRegistrationStep(phone, "email", newData);
        await sendMessage(phone, `✅ Nome registrado!\n\nQual é o *e-mail de contato*?`);
      }
      return true;
    }

    case "cpf": {
      const cpf = trimmed.replace(/\D/g, "");
      if (cpf.length !== 11) {
        await sendMessage(phone, "❌ CPF inválido. Informe os *11 dígitos* (somente números):");
        return true;
      }
      const existingCpf = await prisma.clientProfile.findFirst({ where: { cpf } });
      if (existingCpf) {
        await sendMessage(phone, "⚠️ Já existe um cadastro com este CPF. Entre em contato com o suporte se acreditar que é um erro.");
        return true;
      }
      const newData: RegData = { ...regData, cpf };
      await setRegistrationStep(phone, "email", newData);
      await sendMessage(phone, "✅ CPF registrado!\n\nQual é o seu *e-mail*?");
      return true;
    }

    case "email": {
      if (!trimmed.includes("@") || !trimmed.includes(".")) {
        await sendMessage(phone, "❌ E-mail inválido. Informe um e-mail válido:");
        return true;
      }
      const email = trimmed.toLowerCase();
      const newData: RegData = { ...regData, email };

      // Decide próximo passo com base no que já foi preenchido via API
      if (regData.addressFromCnpj && regData.addressCity) {
        // Se endereço via CNPJ veio incompleto, força completar antes de seguir
        if (!regData.addressZipCode) {
          await setRegistrationStep(phone, "addr_zip", newData);
          await sendMessage(phone, "✅ E-mail registrado!\n\nInforme o *CEP* do endereço (somente números):");
          return true;
        }
        if (!regData.addressStreet) {
          await setRegistrationStep(phone, "addr_manual", newData);
          await sendMessage(phone, "✅ E-mail registrado!\n\nNão consegui validar a rua. Informe *rua e número*:\n_Ex: Rua das Flores, 100_");
          return true;
        }
        if (!regData.addressNeighborhood) {
          await setRegistrationStep(phone, "addr_neighborhood", newData);
          await sendMessage(phone, "✅ E-mail registrado!\n\nQual é o *bairro*?");
          return true;
        }
        if (!regData.addressState || regData.addressState.length !== 2) {
          await setRegistrationStep(phone, "addr_city_state", newData);
          await sendMessage(phone, "✅ E-mail registrado!\n\nInforme a *cidade e estado*:\n_Ex: São Paulo, SP_");
          return true;
        }

        if (!regData.addressNumber) {
          await setRegistrationStep(phone, "addr_number", newData);
          await sendMessage(
            phone,
            `✅ E-mail registrado!\n\n` +
              `📍 Endereço: ${regData.addressStreet || ""}, ${regData.addressNeighborhood ? regData.addressNeighborhood + ", " : ""}${regData.addressCity}/${regData.addressState}\n\n` +
              `Informe o *número* do endereço (e complemento, se houver):\n_Ex: 100_ ou _100, sala 5_`
          );
        } else {
          await setRegistrationStep(phone, "plan", newData);
          await sendPlanOptions(phone);
        }
      } else {
        await setRegistrationStep(phone, "addr_zip", newData);
        await sendMessage(phone, "✅ E-mail registrado!\n\nInforme o *CEP* do endereço (somente números):");
      }
      return true;
    }

    case "addr_zip": {
      const cep = trimmed.replace(/\D/g, "");
      if (cep.length !== 8) {
        await sendMessage(phone, "❌ CEP inválido. Informe os *8 dígitos* (somente números):");
        return true;
      }
      await sendMessage(phone, "🔍 Consultando CEP (até 3 tentativas)...");
      const cepData = await fetchCepDataWithRetries(cep, 3);
      const zipFormatted = `${cep.slice(0, 5)}-${cep.slice(5)}`;

      if (cepData && cepData.logradouro) {
        const newData: RegData = {
          ...regData,
          addressZipCode: zipFormatted,
          addressStreet: cepData.logradouro,
          addressNeighborhood: cepData.bairro || undefined,
          addressCity: cepData.localidade,
          addressState: cepData.uf,
        };
        await setRegistrationStep(phone, "addr_number", newData);
        await sendMessage(
          phone,
          `✅ *CEP encontrado!*\n\n` +
            `📍 ${cepData.logradouro}, ${cepData.bairro ? cepData.bairro + " — " : ""}${cepData.localidade}/${cepData.uf}\n\n` +
            `Informe o *número* (e complemento, se houver):\n_Ex: 100_ ou _100, apto 12_`
        );
      } else {
        const newData: RegData = { ...regData, addressZipCode: zipFormatted };
        await setRegistrationStep(phone, "addr_manual", newData);
        await sendMessage(phone, "⚠️ Não consegui localizar o CEP após *3 tentativas*. Informe a *rua e o número* manualmente:\n_Ex: Rua das Flores, 100_");
      }
      return true;
    }

    case "addr_manual": {
      const parts = trimmed.split(",");
      const street = parts[0]?.trim();
      const number = parts[1]?.trim() || "S/N";
      if (!street || street.length < 3) {
        await sendMessage(phone, "❌ Por favor, informe a rua e o número:\n_Ex: Rua das Flores, 100_");
        return true;
      }
      const newData: RegData = { ...regData, addressStreet: street, addressNumber: number };
      await setRegistrationStep(phone, "addr_neighborhood", newData);
      await sendMessage(phone, "✅ Rua registrada!\n\nQual é o *bairro*?");
      return true;
    }

    case "addr_neighborhood": {
      if (trimmed.length < 2) {
        await sendMessage(phone, "❌ Por favor, informe o bairro:");
        return true;
      }
      const newData: RegData = { ...regData, addressNeighborhood: trimmed };
      await setRegistrationStep(phone, "addr_city_state", newData);
      await sendMessage(phone, "✅ Bairro registrado!\n\nInforme a *cidade e estado*:\n_Ex: São Paulo, SP_");
      return true;
    }

    case "addr_city_state": {
      const parts = trimmed.split(",");
      const city = parts[0]?.trim();
      const state = parts[1]?.trim().toUpperCase().slice(0, 2);
      if (!city || !state || state.length !== 2) {
        await sendMessage(phone, "❌ Por favor, informe cidade e estado:\n_Ex: São Paulo, SP_");
        return true;
      }
      const newData: RegData = { ...regData, addressCity: city, addressState: state };
      await setRegistrationStep(phone, "plan", newData);
      await sendPlanOptions(phone);
      return true;
    }

    case "addr_number": {
      const parts = trimmed.split(",");
      const number = parts[0]?.trim();
      const complement = parts.slice(1).join(",").trim() || undefined;
      if (!number || !/\d/.test(number)) {
        await sendMessage(phone, "❌ Informe o número do endereço:\n_Ex: 100_ ou _100, apto 12_");
        return true;
      }
      const newData: RegData = { ...regData, addressNumber: number, addressComplement: complement };
      await setRegistrationStep(phone, "plan", newData);
      await sendPlanOptions(phone);
      return true;
    }

    case "plan": {
      const choice = trimmed.replace(/\D/g, "");
      const planMap: Record<string, { plan: "HOME" | "FULL"; context: "PESSOAL" | "COMERCIAL" }> = {
        "1": { plan: "HOME", context: "PESSOAL" },
        "2": { plan: "FULL", context: "PESSOAL" },
      };
      const selected = planMap[choice];
      if (!selected) {
        await sendMessage(phone, "❌ Opção inválida. Digite *1* ou *2*:");
        return true;
      }
      const defaultPrices = { HOME: 4.9, FULL: 9.9 };
      const dbPlan = await prisma.subscriptionPlan.findUnique({ where: { plan: selected.plan } });
      const price = dbPlan ? Number(dbPlan.priceMonthly) : defaultPrices[selected.plan];
      const priceStr = price.toFixed(2).replace(".", ",");
      const d = regData;

      // Não permite salvar cadastro sem dados obrigatórios do cliente
      if (!d.fullName) {
        await setRegistrationStep(phone, "name", d);
        await sendMessage(phone, "❌ Falta o nome completo. Vamos continuar:\n\nQual é o *nome completo*?");
        return true;
      }
      if (d.clientType === "PF" && !d.cpf) {
        await setRegistrationStep(phone, "cpf", d);
        await sendMessage(phone, "❌ Falta o CPF. Informe seu *CPF* (somente números):");
        return true;
      }
      if (d.clientType === "PJ" && !d.cnpj) {
        await setRegistrationStep(phone, "cnpj", d);
        await sendMessage(phone, "❌ Falta o CNPJ. Informe o *CNPJ* (somente números):");
        return true;
      }
      if (!d.email) {
        await setRegistrationStep(phone, "email", d);
        await sendMessage(phone, "❌ Falta o e-mail. Informe um *e-mail válido*:");
        return true;
      }
      if (!d.addressZipCode) {
        await setRegistrationStep(phone, "addr_zip", d);
        await sendMessage(phone, "❌ Falta o CEP. Informe o *CEP* do endereço (somente números):");
        return true;
      }
      if (!d.addressStreet) {
        await setRegistrationStep(phone, "addr_manual", d);
        await sendMessage(phone, "❌ Falta a rua. Informe *rua e número*:\n_Ex: Rua das Flores, 100_");
        return true;
      }
      if (!d.addressNumber) {
        await setRegistrationStep(phone, "addr_number", d);
        await sendMessage(phone, "❌ Falta o número do endereço.\n\nInforme o *número* (e complemento, se houver):");
        return true;
      }
      if (!d.addressNeighborhood) {
        await setRegistrationStep(phone, "addr_neighborhood", d);
        await sendMessage(phone, "❌ Falta o bairro.\n\nQual é o *bairro*?");
        return true;
      }
      if (!d.addressCity || !d.addressState || d.addressState.length !== 2) {
        await setRegistrationStep(phone, "addr_city_state", d);
        await sendMessage(phone, "❌ Falta cidade/estado válidos.\n\nInforme a *cidade e estado*:\n_Ex: São Paulo, SP_");
        return true;
      }

      try {
        const created = await prisma.clientProfile.create({
          data: {
            clientType: d.clientType || "PF",
            fullName: d.fullName,
            phone,
            email: d.email,
            cpf: d.cpf || null,
            cnpj: d.cnpj || null,
            addressStreet: d.addressStreet,
            addressNumber: d.addressNumber,
            addressComplement: d.addressComplement || null,
            addressNeighborhood: d.addressNeighborhood,
            addressCity: d.addressCity,
            addressState: d.addressState,
            addressZipCode: d.addressZipCode,
            plan: selected.plan,
            status: "PENDING_ACTIVATION",
            primaryContext: selected.context,
          },
        });

        await prisma.clientSubscription.create({
          data: {
            clientId: created.id,
            plan: selected.plan,
            status: "PENDING",
            priceMonthly: price,
            nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        });

        const createdSubscription = await prisma.clientSubscription.findUnique({
          where: { clientId: created.id },
        });

        let pendingPaymentId: number | null = null;
        if (createdSubscription) {
          const pendingPayment = await prisma.payment.create({
            data: {
              subscriptionId: createdSubscription.id,
              amount: price,
              status: "PENDING",
              paymentMethod: "PIX",
              description: `ozapteconta ${selected.plan} - ${d.fullName} (1º mês)`,
            },
          });
          pendingPaymentId = pendingPayment.id;
        }

        const portalAccess = await issueClientPortalAccess(created.id, phone);

        await setRegistrationStep(phone, "pending", {});
        const pixKey = await getPixKey();

        // Tentar gerar link de pagamento InfinityPay
        let paymentLinkUrl: string | null = null;
        try {
          const linkResult = await infinityPayService.createPaymentLink({
            amount: price,
            description: `ozapteconta ${selected.plan} - ${d.fullName} (1º mês)`,
            customer_email: d.email || phone,
            customer_name: d.fullName,
            customer_cpf: d.cpf || undefined,
            customer_phone: phone,
            payment_methods: ["pix", "credit_card", "boleto"],
            expires_in: 86400 * 3,
            metadata: {
              client_id: created.id,
              subscription_id: createdSubscription?.id,
              payment_id: pendingPaymentId,
              plan: selected.plan,
              initial: true,
            },
          });
          if (linkResult.success) {
            paymentLinkUrl = linkResult.data?.resolved_url || linkResult.data?.url || null;
            if (pendingPaymentId) {
              await prisma.payment.update({
                where: { id: pendingPaymentId },
                data: { infinityPayTransactionId: linkResult.data?.id },
              });

              await prisma.paymentLog.create({
                data: {
                  paymentId: pendingPaymentId,
                  action: "payment_link_created",
                  details: linkResult.data,
                },
              });
            }
            logger.info(`[Onboarding] Payment link gerado para ${phone}: ${paymentLinkUrl}`);
          } else {
            if (pendingPaymentId) {
              await prisma.payment.update({
                where: { id: pendingPaymentId },
                data: {
                  status: "FAILED",
                  failureReason: linkResult.error || "Falha ao criar link de pagamento",
                },
              });
            }
            logger.warn(`[Onboarding] Falha ao gerar payment link para ${phone}: ${linkResult.error}`);
          }
        } catch (linkErr) {
          logger.error("[Onboarding] Erro ao gerar payment link:", linkErr);
        }

        // Enviar link de pagamento InfinityPay ANTES da mensagem de boas-vindas
        if (paymentLinkUrl) {
          await sendMessage(
            phone,
            `💳 *Link de Pagamento*\n\n` +
              `Clique para pagar com PIX, cartão ou boleto:\n` +
              `${paymentLinkUrl}\n\n` +
              `O link expira em 3 dias. Após o pagamento, sua conta será ativada automaticamente! ✅`
          );
        }

        await sendMessage(
          phone,
          `🎉 *Cadastro realizado com sucesso!*\n\n` +
            `Plano escolhido: *${selected.plan}* — R$ ${priceStr}/mês\n\n` +
            (paymentLinkUrl
              ? `💳 *Para ativar sua conta, use o link de pagamento enviado acima.*\n\n`
              : `💳 *Para ativar sua conta, efetue o pagamento via PIX:*\n\n` +
                `📲 Chave PIX: *${pixKey}*\n` +
                `💰 Valor: *R$ ${priceStr}*\n` +
                `📋 Descrição: ozapteconta ${selected.plan} - ${d.fullName}\n\n`) +
            `🔐 *Seu acesso web (somente leitura):*\n` +
            `Link: ${portalAccess.loginLink}\n` +
            `Login: *${portalAccess.username}*\n` +
            `Senha: *${portalAccess.password}*\n\n` +
            `Após o pagamento, *envie o comprovante* nesta conversa ou aguarde a confirmação do nosso time.\n\n` +
            `Em até 24 horas úteis sua conta será ativada! ✅`
        );
      } catch (err: unknown) {
        logger.error("[Onboarding] Erro ao criar ClientProfile", err);
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.toLowerCase().includes("unique")) {
          await sendMessage(phone, "⚠️ Já existe um cadastro com este CPF, CNPJ ou e-mail. Entre em contato com o suporte.");
        } else {
          await sendMessage(phone, "❌ Erro ao salvar cadastro. Tente novamente ou entre em contato com o suporte.");
        }
      }
      return true;
    }

    case "pending": {
      const lower = trimmed.toLowerCase();
      if (lower.includes("comprovante") || lower.includes("paguei") || lower.includes("pix") ||
          (lower.includes("pagamento") && (lower.includes("fiz") || lower.includes("efetuei") || lower.includes("realizei")))) {
        await sendMessage(phone, "📨 *Comprovante recebido!*\n\nNosso time irá verificar e ativar sua conta em breve. ✅");
      } else {
        // Buscar dados da assinatura para gerar/reenviar link de pagamento
        const clientProfile = await prisma.clientProfile.findFirst({
          where: { phone: { in: candidatePhones }, status: "PENDING_ACTIVATION" },
          include: { subscription: true },
        });

        let paymentLinkUrl: string | null = null;

        if (clientProfile?.subscription) {
          const sub = clientProfile.subscription;
          const planName = sub.plan;
          const planPrice = Number(sub.priceMonthly);
          const priceStr = planPrice.toFixed(2).replace(".", ",");

          const retryPayment = await prisma.payment.create({
            data: {
              subscriptionId: sub.id,
              amount: sub.priceMonthly,
              status: "PENDING",
              paymentMethod: "PIX",
              description: `ozapteconta ${planName} - ${clientProfile.fullName} (reativação)` ,
            },
          });

          try {
            const linkResult = await infinityPayService.createPaymentLink({
              amount: planPrice,
              description: `ozapteconta ${planName} - ${clientProfile.fullName} (ativação)`,
              customer_email: clientProfile.email || phone,
              customer_name: clientProfile.fullName,
              customer_cpf: clientProfile.cpf || undefined,
              customer_phone: phone,
              payment_methods: ["pix", "credit_card", "boleto"],
              expires_in: 86400 * 3,
              metadata: {
                client_id: clientProfile.id,
                subscription_id: sub.id,
                payment_id: retryPayment.id,
                plan: planName,
                retry: true,
              },
            });
            if (linkResult.success) {
              paymentLinkUrl = linkResult.data?.resolved_url || linkResult.data?.url || null;

              await prisma.payment.update({
                where: { id: retryPayment.id },
                data: { infinityPayTransactionId: linkResult.data?.id },
              });

              await prisma.paymentLog.create({
                data: {
                  paymentId: retryPayment.id,
                  action: "payment_link_created",
                  details: linkResult.data,
                },
              });

              logger.info(`[Onboarding] Link de pagamento (reenvio) gerado para ${phone}: ${paymentLinkUrl}`);
            } else {
              await prisma.payment.update({
                where: { id: retryPayment.id },
                data: {
                  status: "FAILED",
                  failureReason: linkResult.error || "Falha ao gerar link de pagamento (reenvio)",
                },
              });
              logger.warn(`[Onboarding] Falha ao gerar link de pagamento (reenvio) para ${phone}: ${linkResult.error}`);
            }
          } catch (linkErr) {
            logger.error("[Onboarding] Erro ao gerar link de pagamento (reenvio):", linkErr);
          }

          if (paymentLinkUrl) {
            await sendMessage(
              phone,
              `⏳ *Sua conta ainda não foi ativada.*\n\n` +
                `Para ativar, realize o pagamento do plano *${planName}* (R$ ${priceStr}/mês):\n\n` +
                `💳 *Link de Pagamento:*\n${paymentLinkUrl}\n\n` +
                `O link aceita PIX, cartão ou boleto. Válido por 3 dias.\n\n` +
                `Após o pagamento, sua conta será ativada automaticamente! ✅`
            );
          } else {
            const pixKey = await getPixKey();
            await sendMessage(
              phone,
              `⏳ *Aguardando confirmação de pagamento*\n\n` +
                `Plano: *${planName}* — R$ ${priceStr}/mês\n\n` +
                `📲 Chave PIX: *${pixKey}*\n` +
                `💰 Valor: *R$ ${priceStr}*\n\n` +
                `Se já pagou, envie o comprovante aqui.`
            );
          }
        } else {
          const pixKey = await getPixKey();
          await sendMessage(
            phone,
            `⏳ *Aguardando confirmação de pagamento*\n\n` +
              `Assim que confirmado, sua conta será ativada automaticamente.\n\n` +
              `📲 Chave PIX: *${pixKey}*\n\n` +
              `Se já pagou, envie o comprovante aqui.`
          );
        }
      }
      return true;
    }

    default: {
      await setRegistrationStep(phone, "type", {});
      await sendMessage(
        phone,
        "👋 Olá! Vamos iniciar seu cadastro.\n\nVocê é:\n1️⃣ *Pessoa Física* (CPF)\n2️⃣ *Pessoa Jurídica* (CNPJ)\n\nDigite *1* ou *2*:"
      );
      return true;
    }
  }
}

// ─── Detectar comando do usuário ──────────────────────────────────────────────
function detectCommand(text: string): string | null {
  const t = text.toLowerCase().trim();

  if (/(email|e-mail)/.test(t) && /(pdf|relat[oó]rio|resumo)/.test(t) && /(enviar|envia|envie|manda|mandar|gerar|gera)/.test(t)) {
    return "report_email";
  }

  if (/^(gerar|gera|enviar|envia)\s+(pdf|relat[oó]rio)(\s+agora)?$/.test(t) || /^(pdf|relat[oó]rio)\s+agora$/.test(t)) {
    return "report_now";
  }

  if (/^(ver|listar|contas|o que|oque|pendente|vencer|mes|mês|pagar|receber)/.test(t) ||
      /contas (do mes|do mês|a pagar|a receber|pendentes|vencendo|abertas)/.test(t) ||
      /o que (tenho|tem) (para|pra) pagar/.test(t)) return "list_pending";

  if (/contas (pagas|pago|quitadas|hist[oó]rico)/.test(t) ||
      /^(hist[oó]rico|pagas|pago|quitadas)/.test(t)) return "list_paid";

  if (/^(paguei|marcar|marca|quitar|quitei)\s*(#?\d+)/.test(t) ||
      /marcar\s+#?\d+\s+(como\s+)?(pago|paga|quitado)/.test(t)) return "mark_paid";

  if (/^(resumo|saldo|total|financeiro|balanço|balanco)/.test(t)) return "summary";

  if (/^(ajuda|help|comandos|menu|oi|olá|ola|inicio|início|start|boa|bom)/.test(t)) return "help";

  if (/\b(mercado|financeiro|cotacoes?)\b/.test(t) ||
      /^(mercado|financeiro)/.test(t)) return "market_help";

  if (/^(fipe|tabela fipe|consulta fipe|ajuda fipe|como consultar fipe)$/.test(t)) return "fipe_help";

  return null;
}

function extractEmailFromText(text: string): string | null {
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : null;
}

// ─── Obter ou criar usuário WhatsApp ─────────────────────────────────────────
async function getOrCreateUser(phone: string, name?: string, aliases: string[] = []) {
  const candidates = Array.from(new Set([phone, ...aliases].filter(Boolean)));

  const existing = await prisma.whatsappUser.findFirst({
    where: { phone: { in: candidates } },
    select: {
      id: true,
      phone: true,
      name: true,
      conversationContext: true,
      isActive: true,
      totalTransactions: true,
      registrationStep: true,
      registrationData: true,
      updatedAt: true,
      createdAt: true,
    },
  });

  if (existing) {
    if (existing.phone !== phone || (name && existing.name !== name)) {
      return prisma.whatsappUser.update({
        where: { id: existing.id },
        data: {
          ...(existing.phone !== phone ? { phone } : {}),
          ...(name && existing.name !== name ? { name } : {}),
        },
        select: {
          id: true,
          phone: true,
          name: true,
          conversationContext: true,
          isActive: true,
          totalTransactions: true,
          registrationStep: true,
          registrationData: true,
          updatedAt: true,
          createdAt: true,
        },
      });
    }
    return existing;
  }

  return prisma.whatsappUser.create({
    data: { phone, name: name || null },
    select: {
      id: true,
      phone: true,
      name: true,
      conversationContext: true,
      isActive: true,
      totalTransactions: true,
      registrationStep: true,
      registrationData: true,
      updatedAt: true,
      createdAt: true,
    },
  });
}

// ─── Contexto de conversa ─────────────────────────────────────────────────────
function parseContext(ctx: unknown): AIMessage[] {
  if (!ctx || !Array.isArray(ctx)) return [];
  return ctx as AIMessage[];
}

async function saveContext(phone: string, history: AIMessage[]) {
  await prisma.whatsappUser.update({
    where: { phone },
    data: { conversationContext: history.slice(-10) as unknown as Prisma.InputJsonValue },
  });
}

// ─── Resposta por base de conhecimento treinada no admin ────────────────────
async function findKnowledgeAnswer(text: string): Promise<string | null> {
  const normalized = text.toLowerCase();
  const entries = await prisma.botKnowledgeEntry.findMany({
    where: { enabled: true },
    orderBy: [{ priority: "asc" }, { id: "asc" }],
  });

  for (const entry of entries) {
    const keywords = entry.keywords
      .split(",")
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);

    if (keywords.some((k) => normalized.includes(k))) {
      return `📚 *${entry.title}*\n\n${entry.content}`;
    }
  }

  return null;
}

function isNutritionQuery(text: string): boolean {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const nutritionIntent = /caloria|kcal|proteina|carbo|gordura|fibra|saudavel|engorda|emagrece|dieta|indice glicemico|sodio|colesterol|vitamina|mineral|porcao|quantidade|pode comer|deve comer|faz bem|faz mal|refeicao|alimento|alimentacao|comida|lanche|janta|jantar|cafe da manha|cafe da tarde|ceia|quantas vezes|quanto tempo posso comer|tmb|metabolismo|metabolismo basal|taxa basal|taxa metabolica|taxa metab|imc|indice de massa|tdee|gasto calorico|calorias.*dia|proteina.*dia|quanto.*proteina|deficit calorico|superavit|bulking|cutting|hipertrofia|musculacao|calistenia|crossfit|treino.*comer|comer.*treino|pre.*treino|pos.*treino/;
  const foodTerms = /arroz|feijao|frango|ovo|banana|maca|pao|queijo|leite|carne|peixe|batata|mandioca|salada|alface|tomate|abacate|aveia|iogurte|whey|way|suplemento|pizza|hamburguer|hamburger|sushi|refrigerante|bolo|chocolate|biscoito|bolacha|macarrao|pastel|coxinha|acai|suco|cafe|marmita|lanche|cottage|granola|tapioca|inhame|quinoa|brocolis|espinafre|atum|salmao|tilapia|peito.*frango|clara.*ovo/;

  if (nutritionIntent.test(normalized)) return true;
  return foodTerms.test(normalized) && /(quant|caloria|saudavel|engorda|emagrece|pode comer|deve comer|faz bem|faz mal|porcao|quantidade|proteina|macro)/.test(normalized);
}

// ─── Calculadora de Métricas Corporais ────────────────────────────────────────

interface BodyMetrics {
  genero: "M" | "F" | null;
  peso: number | null;    // kg
  altura: number | null;  // cm
  idade: number | null;   // anos
  nivel: "sedentario" | "leve" | "moderado" | "ativo" | "muito_ativo" | null;
  objetivo: "emagrecer" | "manter" | "ganhar" | null;
  treino: "musculacao" | "calistenia" | "crossfit" | "cardio" | null;
}

function extractBodyMetrics(text: string): BodyMetrics {
  const n = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const genero: "M" | "F" | null =
    /\b(homem|masculino|sou h\b|menino|macho)\b/.test(n) ? "M" :
    /\b(mulher|feminino|sou m\b|menina|femea)\b/.test(n) ? "F" : null;

  // Peso: "80kg", "80 kg", "peso 80", "80,5 kg"
  let peso: number | null = null;
  const pesoMatch = n.match(/(?:peso\s+|pesando\s+)?(\d{2,3}(?:[.,]\d{1,2})?)\s*kg/);
  if (pesoMatch) peso = parseFloat(pesoMatch[1].replace(",", "."));

  // Altura: "1.75m", "175cm", "1m75", "1,75"
  let altura: number | null = null;
  const alturaMetro = n.match(/(\d[.,]\d{2})\s*m(?:etros?)?(?!\w)/);
  const alturaCm = n.match(/(\d{3})\s*cm/);
  const alturaM2 = n.match(/(\d)\s*m\s*e?\s*(\d{2})\b/);
  if (alturaMetro) altura = parseFloat(alturaMetro[1].replace(",", ".")) * 100;
  else if (alturaCm) altura = parseFloat(alturaCm[1]);
  else if (alturaM2) altura = parseFloat(alturaM2[1]) * 100 + parseFloat(alturaM2[2]);

  // Idade
  let idade: number | null = null;
  const idadeMatch = n.match(/(\d{1,2})\s*anos?/);
  if (idadeMatch) idade = parseInt(idadeMatch[1]);

  // Nível de atividade
  const nivel: BodyMetrics["nivel"] =
    /sedentario|nao pratico|nao faz|nao treino/.test(n) ? "sedentario" :
    /\b(1|2)\s*vez(?:es)?\s*(?:por\s*)?semana|caminhada\s+leve|pouco\s+ativo/.test(n) ? "leve" :
    /\b(3|4)\s*vez(?:es)?\s*(?:por\s*)?semana|3x|4x|moderado/.test(n) ? "moderado" :
    /\b(5|6)\s*vez(?:es)?\s*(?:por\s*)?semana|5x|6x|ativo|diariamente/.test(n) ? "ativo" :
    /\b7\s*vez(?:es)?|7x|muito\s*ativo|trabalho\s*pesado|todo\s*dia/.test(n) ? "muito_ativo" : null;

  // Objetivo
  const objetivo: BodyMetrics["objetivo"] =
    /emagrec|perder\s*peso|deficit|secar|definir|cutting/.test(n) ? "emagrecer" :
    /ganhar\s*massa|hipertrofia|crescer|engordar|bulking|aumentar\s*massa/.test(n) ? "ganhar" :
    /manter\s*peso|manutencao|equilibrio/.test(n) ? "manter" : null;

  // Tipo de treino
  const treino: BodyMetrics["treino"] =
    /musculacao|academia|halter|barra\s*fixa\s*com\s*peso|supino|agachamento\s*com\s*barra/.test(n) ? "musculacao" :
    /calistenia|calisthenics|barra\s*fixa|flexao|prancha\s*longa|street\s*workout/.test(n) ? "calistenia" :
    /crossfit|wod|functional|funcional/.test(n) ? "crossfit" :
    /cardio|corrida|ciclismo|natacao|aerobico|caminhada/.test(n) ? "cardio" : null;

  return { genero, peso, altura, idade, nivel, objetivo, treino };
}

function calculateIMC(peso: number, alturaCm: number): { imc: number; categoria: string; emoji: string; orientacao: string } {
  const alturaM = alturaCm / 100;
  const imc = peso / (alturaM * alturaM);
  const imcRound = Math.round(imc * 100) / 100;

  let categoria: string; let emoji: string; let orientacao: string;
  if (imc < 18.5)      { categoria = "Abaixo do peso";      emoji = "⚠️";  orientacao = "Aumente a ingestão calórica com foco em proteínas e gorduras boas."; }
  else if (imc < 25.0) { categoria = "Peso normal";         emoji = "✅";  orientacao = "Excelente! Mantenha a alimentação equilibrada e pratique atividade física."; }
  else if (imc < 30.0) { categoria = "Sobrepeso";           emoji = "⚠️";  orientacao = "Reduza carboidratos refinados, aumente proteínas e crie déficit calórico moderado."; }
  else if (imc < 35.0) { categoria = "Obesidade Grau I";    emoji = "🔴";  orientacao = "Déficit calórico de 400–500 kcal/dia com acompanhamento. Priorize proteínas e movimento diário."; }
  else if (imc < 40.0) { categoria = "Obesidade Grau II";   emoji = "🔴";  orientacao = "Consulte um profissional de saúde. Alimentação com déficit e exercício supervisionado são essenciais."; }
  else                  { categoria = "Obesidade Grau III";  emoji = "🚨";  orientacao = "Acompanhamento médico e nutricional urgente. Mudança de estilo de vida é fundamental."; }

  return { imc: imcRound, categoria, emoji, orientacao };
}

interface BMRResult {
  tmb: number;
  tdee: number;
  deficit: number;
  surplus: number;
  nivelTexto: string;
}

function calculateBMR(metrics: BodyMetrics): BMRResult | null {
  if (!metrics.peso || !metrics.altura || !metrics.idade || !metrics.genero) return null;

  // Fórmula Mifflin-St Jeor (mais precisa para adultos)
  let tmb: number;
  if (metrics.genero === "M") {
    tmb = (10 * metrics.peso) + (6.25 * metrics.altura) - (5 * metrics.idade) + 5;
  } else {
    tmb = (10 * metrics.peso) + (6.25 * metrics.altura) - (5 * metrics.idade) - 161;
  }

  const multipliers: Record<string, number> = {
    sedentario:   1.20,
    leve:         1.375,
    moderado:     1.55,
    ativo:        1.725,
    muito_ativo:  1.90,
  };
  const nivelLabels: Record<string, string> = {
    sedentario:   "Sedentário (sem exercício)",
    leve:         "Levemente ativo (1–3x/semana)",
    moderado:     "Moderadamente ativo (3–5x/semana)",
    ativo:        "Muito ativo (6–7x/semana)",
    muito_ativo:  "Extremamente ativo (trabalho físico + treino)",
  };

  const mult = multipliers[metrics.nivel ?? "sedentario"];
  const tdee = Math.round(tmb * mult);

  return {
    tmb: Math.round(tmb),
    tdee,
    deficit:  tdee - 500,  // −0,5kg/semana
    surplus:  tdee + 300,  // ganho limpo controlado
    nivelTexto: nivelLabels[metrics.nivel ?? "sedentario"],
  };
}

function getProteinGuide(metrics: BodyMetrics): string {
  if (!metrics.peso) return "";

  const protRanges: Record<string, [number, number]> = {
    musculacao: [1.8, 2.2],
    crossfit:   [1.8, 2.4],
    calistenia: [1.6, 2.0],
    cardio:     [1.4, 1.8],
    default:    [1.2, 1.6],
  };
  const [protMin, protMax] = protRanges[metrics.treino ?? "default"];
  const protMinG = Math.round(metrics.peso * protMin);
  const protMaxG = Math.round(metrics.peso * protMax);

  const treinoLabel: Record<string, string> = {
    musculacao: "🏋️ Musculação",
    crossfit:   "🏅 CrossFit",
    calistenia: "🤸 Calistenia",
    cardio:     "🏃 Cardio/Aeróbico",
  };
  const treinoTexto = metrics.treino ? treinoLabel[metrics.treino] : "💪 Geral";

  const proteinas_M = `🥩 Frango grelhado — 31g/100g\n🥚 Ovos inteiros — 13g/100g\n🐟 Atum em lata — 25g/100g\n🥩 Patinho/Alcatra — 27g/100g\n🧀 Cottage cheese — 12g/100g\n🥛 Whey Protein — 22–25g/dose\n🐟 Salmão/Tilápia — 20–22g/100g\n🫘 Lentilha — 9g/100g\n🥜 Pasta de amendoim — 25g/100g`;
  const proteinas_F = `🍗 Frango grelhado — 31g/100g\n🥚 Ovo cozido — 13g/100g\n🐟 Tilápia/Merluza — 20g/100g\n🧀 Iogurte grego — 10g/100g\n🧀 Cottage cheese — 12g/100g\n🥛 Whey isolado — 25g/dose\n🫘 Grão-de-bico — 9g/100g\n🥜 Pasta de amendoim — 25g/100g\n🥩 Carne magra — 24g/100g`;
  const proteinas = metrics.genero === "F" ? proteinas_F : proteinas_M;
  const genLabel = metrics.genero === "F" ? " — Mulher" : metrics.genero === "M" ? " — Homem" : "";

  return `\n\n💪 *Proteína diária — ${treinoTexto}${genLabel}*\n` +
    `Meta: *${protMinG}g – ${protMaxG}g/dia* _(${protMin}–${protMax}g × ${metrics.peso}kg)_\n\n` +
    `🏆 *Melhores fontes proteicas:*\n${proteinas}\n\n` +
    `💡 *Dica prática:* Distribua em 4–5 refeições ao longo do dia.\n` +
    `Proteína > Carboidrato = mais saciedade, mais músculo, menos gordura.`;
}

function formatBMRResponse(text: string): string {
  const metrics = extractBodyMetrics(text);

  if (!metrics.peso || !metrics.altura || !metrics.idade) {
    const missing: string[] = [];
    if (!metrics.genero)  missing.push("• ⚥ *Sexo* — homem ou mulher");
    if (!metrics.peso)    missing.push("• ⚖️ *Peso* — ex: 75kg");
    if (!metrics.altura)  missing.push("• 📏 *Altura* — ex: 1,72m ou 172cm");
    if (!metrics.idade)   missing.push("• 🎂 *Idade* — ex: 28 anos");

    return `🧮 *Calculadora de Taxa Basal (TMB)*\n\n` +
      `Sim! Posso calcular sua taxa metabólica basal 💪\n\n` +
      `Me manda em uma mensagem só:\n` +
      `• Sexo (homem/mulher)\n` +
      `• Peso (ex: 75kg)\n` +
      `• Altura (ex: 1,72m)\n` +
      `• Idade (ex: 28 anos)\n\n` +
      `📝 _Exemplo: "Sou mulher, 65kg, 1,62m, 27 anos"_\n\n` +
      `Opcional: informe seu treino (musculação, crossfit, calistenia) e objetivo (emagrecer/ganhar massa) para um resultado ainda mais completo!`;
  }

  const bmr = calculateBMR(metrics);
  const imcData = calculateIMC(metrics.peso, metrics.altura);
  const proteinGuide = getProteinGuide(metrics);
  const genEmoji = metrics.genero === "M" ? "👨" : metrics.genero === "F" ? "👩" : "🧑";

  let resp = `🧮 *Resultado — Metabolismo Basal*\n\n`;
  resp += `${genEmoji} *Seus dados:* ${metrics.peso}kg | ${(metrics.altura / 100).toFixed(2)}m | ${metrics.idade} anos\n`;
  if (bmr) resp += `🏃 *Nível de atividade:* ${bmr.nivelTexto}\n`;
  resp += `━━━━━━━━━━━━━━━━\n`;

  if (bmr) {
    resp += `🔥 *TMB (repouso total):* *${bmr.tmb} kcal/dia*\n`;
    resp += `⚡ *TDEE (gasto real/dia):* *${bmr.tdee} kcal/dia*\n`;
  }
  resp += `━━━━━━━━━━━━━━━━\n`;
  resp += `📊 *IMC:* ${imcData.imc} kg/m² ${imcData.emoji}\n`;
  resp += `📋 *Classificação:* ${imcData.categoria}\n`;
  resp += `💬 ${imcData.orientacao}\n`;
  resp += `━━━━━━━━━━━━━━━━\n`;

  if (bmr) {
    resp += `🎯 *Metas calóricas diárias:*\n`;
    resp += `🔻 *Emagrecer* (−0,5kg/sem): *${bmr.deficit} kcal*\n`;
    resp += `⚖️ *Manter peso:* *${bmr.tdee} kcal*\n`;
    resp += `📈 *Ganhar massa limpa:* *${bmr.surplus} kcal*\n`;
    resp += `━━━━━━━━━━━━━━━━\n`;
  }

  resp += `📐 *Como o IMC é calculado:*\n`;
  resp += `IMC = peso ÷ (altura × altura)\n`;
  resp += `= ${metrics.peso} ÷ (${(metrics.altura / 100).toFixed(2)} × ${(metrics.altura / 100).toFixed(2)})\n`;
  resp += `= *${imcData.imc}*\n`;
  resp += `━━━━━━━━━━━━━━━━\n`;
  resp += `💡 *Regra de ouro:* Proteína > Carboidrato${proteinGuide}\n`;
  resp += `━━━━━━━━━━━━━━━━\n`;
  resp += `⚕️ _Estimativas baseadas em Mifflin-St Jeor. Para acompanhamento preciso, consulte um nutricionista._`;

  return resp;
}

function isBMRQuery(text: string): boolean {
  const n = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const explicitBMR = /\b(tmb|taxa basal|taxa metabolica|taxa metab|metabolismo basal|metabolismo|imc|indice de massa|calcular.*metabolismo|calcular.*imc|meu.*metabolismo|minha.*taxa|tdee|gasto calorico|necessidade calorica|calorias.*dia|quantas calorias.*preciso|quanto.*caloria.*preciso|taxa.*basal|basal)\b/.test(n);
  const implicitBMR = /(peso|kg|altura|metros|cm|anos)/.test(n) && /(metabolismo|imc|caloria|tmb|tdee|emagrec|ganhar|treino|deficit|superavit|basal)/.test(n);
  return explicitBMR || implicitBMR;
}

/**
 * Detecta resposta de continuação ao prompt da Calculadora Basal.
 * Quando o último turno do bot foi o template pedindo sexo/peso/altura/idade,
 * a próxima mensagem do usuário com esses dados deve ir para a calculadora,
 * NÃO para o extrator de transação financeira.
 */
function isBMRFollowUp(text: string, history: AIMessage[]): boolean {
  // Encontra a última mensagem do assistente
  const lastAssistant = [...history].reverse().find((m) => m.role === "assistant");
  if (!lastAssistant) return false;
  const a = String(lastAssistant.content || "");
  const promptedBMR =
    /Calculadora de Taxa Basal|taxa metab[óo]lica basal/i.test(a) &&
    /Sexo \(homem\/mulher\)|Peso \(ex|Altura \(ex|Idade \(ex/i.test(a);
  if (!promptedBMR) return false;

  // A resposta do usuário precisa conter pelo menos 2 dos 4 indicadores corporais
  const n = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  let hits = 0;
  if (/\b(homem|mulher|masculino|feminino|macho|femea|menino|menina)\b/.test(n)) hits++;
  if (/\b\d{2,3}\s*kg\b|\bpeso\s*[:\-]?\s*\d{2,3}|\bpesando\b/.test(n)) hits++;
  if (/\d[.,]\d{2}\s*m(?!\w)|\d{3}\s*cm|\baltura\s*[:\-]?\s*\d|\d\s*m\s*\d{2}\b/.test(n)) hits++;
  if (/\d{1,2}\s*anos?\b|\bidade\s*[:\-]?\s*\d{1,2}/.test(n)) hits++;
  return hits >= 2;
}

// ─── Detecção de Intenção Nutricional Ampla ────────────────────────────────────

function isAmbiguousNutritionIntent(text: string, history: AIMessage[]): boolean {
  // Se é uma query BMR direta, vai direto para o calculador — não mostra menu
  if (isBMRQuery(text)) return false;

  const n = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  // Se tem dados corporais suficientes, não é ambíguo — vai direto ao cálculo
  const hasBodyData = /(\d{2,3}\s*kg)|(\d[.,]\d{2}\s*m)|(\d{3}\s*cm)|(\d{1,2}\s*anos)/.test(n);
  if (hasBodyData) return false;

  // Se é alimento específico, não é ambíguo
  const isSpecificFood = /\b(arroz|feijao|frango|ovo|banana|pao|queijo|leite|carne|peixe|batata|salada|aveia|iogurte|whey|pizza|chocolate|bolo|sushi|acai|tapioca|atum|salmao)\b/.test(n);
  if (isSpecificFood) return false;

  // Se está respondendo ao menu de nutrição, não é ambíguo
  if (isRespondingToNutritionMenu(text, history)) return false;

  // Intenção ambígua: saúde, peso, dieta de forma geral sem dados
  return /\b(taxa basal|metabolismo|tmb|imc|indice de massa|emagrec|perder peso|ganhar massa|ganhar peso|quero emagrecer|quero ganhar|dieta|plano alimentar|cardapio|alimentacao saudavel|como comer|nutri|quero saber.*peso|quero saber.*caloria|quero saber.*dieta|organizar.*alimentacao|melhorar.*alimentacao|como.*perder|como.*ganhar|deficit calorico|calcular.*caloria|resultado.*treino|treino.*resultado|ajuda.*saude|saude.*alimentar|perder gordura|ganhar musculo|hipertrofia|emagrecer rapido|secar|definir corpo|shape|forma fisica)\b/.test(n);
}

function isRespondingToNutritionMenu(text: string, history: AIMessage[]): boolean {
  if (!history.length) return false;
  const lastBot = [...history].reverse().find(m => m.role === "assistant");
  if (!lastBot) return false;
  return lastBot.content.includes("NUTRIÇÃO E SAÚDE") ||
         lastBot.content.includes("*Calcular minha Taxa Basal") ||
         lastBot.content.includes("*Montar meu plano de dieta") ||
         lastBot.content.includes("menu_nutricional");
}

function isDietPlanRequest(text: string, history: AIMessage[]): boolean {
  const n = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const directDiet = /\b(plano alimentar|cardapio|dieta completa|monta.*dieta|quero.*dieta|preciso.*dieta|me.*da.*dieta|plano.*dieta|dieta.*personalizada|o que comer|o que devo comer|refeicao.*dia|montar.*cardapio|quero um cardapio)\b/.test(n);
  if (directDiet) return true;

  // Respondendo ao menu com opção de dieta
  if (isRespondingToNutritionMenu(text, history)) {
    return /\b(2|dieta|plano|montar|cardapio|os dois|ambos|tudo|completo|junto|3)\b/.test(n);
  }
  return false;
}

function isChoosingBMRFromMenu(text: string, history: AIMessage[]): boolean {
  if (!isRespondingToNutritionMenu(text, history)) return false;
  const n = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /\b(1|calcular|tmb|imc|metabolismo|taxa|basal)\b/.test(n);
}

function getNutritionMenu(): string {
  return (
    `🍏 *NUTRIÇÃO E SAÚDE — Como posso te ajudar?*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `*📊 Calcular minha Taxa Basal (TMB/IMC)*\n` +
    `→ Descubro quantas calorias seu corpo gasta por dia, calculo seu IMC, metas de emagrecimento e ganho de massa com precisão\n\n` +
    `*🥗 Montar meu plano de dieta completo*\n` +
    `→ Crio um cardápio personalizado com café da manhã, almoço, jantar e lanches — com base no seu objetivo e tipo de treino\n\n` +
    `*💪 Os dois juntos*\n` +
    `→ Calculo seu metabolismo E monto seu plano alimentar completo de uma vez só\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `Responda:\n` +
    `• _"calcular"_ → TMB e IMC\n` +
    `• _"dieta"_ → plano alimentar\n` +
    `• _"completo"_ → os dois\n\n` +
    `Ou me conta direto:\n` +
    `_"Sou homem, 82kg, 1,78m, 32 anos, musculação 4x, quero emagrecer"_ 💬\n` +
    `━━━━━━━━━━━━━━━━`
  );
}

// ─── Mensagens de Aguarde ─────────────────────────────────────────────────────

type LoadingType = "investment_data" | "investment_ai" | "diet_plan" | "nutrition_ai" | "market_data" | "general_ai";

const LOADING_MESSAGES: Record<LoadingType, string[]> = {
  investment_data: [
    `📊 *Buscando dados do mercado...*\n_Consultando preços, histórico e tendências em tempo real. Aguarde!_ ⏳`,
    `🔍 *Analisando o mercado...*\n_Coletando dados dos últimos 3 meses. Só um instante!_ 📈`,
    `📡 *Conectando às bolsas...*\n_Buscando cotações, variações e histórico semanal..._ ⏳`,
    `🏦 *Verificando os dados...*\n_Consultando B3, CoinGecko e indicadores de tendência. Quase lá!_ 📊`,
  ],
  investment_ai: [
    `🤖 *Nossa IA está analisando os dados...*\n_Processando indicadores, tendências e gerando insights. Pode demorar até 20 segundos!_ ⏳`,
    `🧠 *Inteligência Artificial trabalhando...*\n_Cruzando dados históricos com padrões de mercado. Aguarde!_ 📈`,
    `⚡ *Gerando análise personalizada...*\n_Nossa IA está revisando cada detalhe para você. Um instante!_ 🤖`,
    `💡 *Processando sua análise de investimento...*\n_Isso leva alguns segundos. Que tal respirar fundo? 😄 Já já chega!_ ⏳`,
  ],
  diet_plan: [
    `🥗 *Montando seu plano alimentar...*\n_Nossa IA está calculando macros, montando refeições e criando sua lista de compras. Aguarde!_ ⏳`,
    `👩‍🍳 *Preparando seu cardápio personalizado...*\n_Calculando proteínas, carboidratos e calorias para o seu perfil. Já já fica pronto!_ 🥦`,
    `🍽️ *Seu nutricionista IA está trabalhando...*\n_Criando um plano completo com café da manhã, almoço, jantar e lanches. Um instante!_ ⏳`,
    `⚖️ *Calculando seu plano alimentar ideal...*\n_Analisando seu objetivo, metabolismo e preferências. Pode levar até 20 segundos!_ 🥗`,
  ],
  nutrition_ai: [
    `🔍 *Consultando nossa base nutricional...*\n_Verificando calorias, macros e informações do alimento. Aguarde!_ ⏳`,
    `🥦 *Nossa IA nutricional está analisando...*\n_Buscando dados de proteínas, carboidratos e gorduras. Só um instante!_ 💪`,
    `📊 *Calculando os macros...*\n_Verificando a composição nutricional completa. Quase pronto!_ 🍎`,
  ],
  market_data: [
    `💹 *Buscando cotações em tempo real...*\n_Conectando ao Banco Central e bolsas. Aguarde!_ ⏳`,
    `📡 *Consultando o mercado...*\n_Buscando os dados mais recentes. Um instante!_ 💰`,
    `🌐 *Atualizando dados financeiros...*\n_Conectando às fontes de mercado. Já já!_ 📊`,
  ],
  general_ai: [
    `🤔 *Deixa eu pensar...*\n_Nossa IA está processando sua mensagem. Um segundo!_ ⏳`,
    `💬 *Entendendo sua pergunta...*\n_Consultando nossa inteligência artificial. Já já!_ 🤖`,
    `🧠 *Analisando...*\n_Preparando a melhor resposta para você. Aguarde!_ ⏳`,
  ],
};

async function sendLoadingMessage(phone: string, type: LoadingType): Promise<void> {
  const msgs = LOADING_MESSAGES[type];
  const msg = msgs[Math.floor(Math.random() * msgs.length)];
  await sendMessage(phone, msg);
}

function getNutritionClarificationPrompt(text: string): string | null {
  const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (!normalized || isNutritionQuery(text)) return null;
  if (normalized.length > 80) return null;
  if (/\b(r\$|reais|vence|vencimento|dia\s+\d+|aluguel|conta|boleto|paguei|pagar|recebi|receber)\b/.test(normalized)) return null;

  const foodOrDrinkTerms = /\b(agua|suco|cafe|cha|leite|refrigerante|vitamina|banana|maca|pao|queijo|ovo|arroz|feijao|frango|carne|peixe|batata|mandioca|salada|alface|tomate|abacate|aveia|iogurte|whey|way|suplemento|pizza|hamburguer|hamburger|sushi|bolo|chocolate|biscoito|bolacha|macarrao|pastel|coxinha|acai|marmita|lanche|cottage|granola|tapioca|atum|salmao|tilapia)\b/;
  const fillerOnly = /\b(um|uma|uns|umas|o|a|os|as|de|do|da|com|sem|e|copo|xicara|prato|pedaco|pedaço|fatia|porcao)\b/g;
  const meaningfulContent = normalized.replace(fillerOnly, " ").replace(/\s+/g, " ").trim();

  if (!foodOrDrinkTerms.test(normalized)) return null;
  if (meaningfulContent.split(" ").filter(Boolean).length > 4) return null;

  const subject = text.trim().replace(/\s+/g, " ");
  const asksCalories = /caloria|kcal|engorda|emagrece/.test(normalized);
  const asksMacro = /proteina|carbo|gordura|fibra|macro/.test(normalized);
  const asksRoutine = /quantas vezes|frequencia|frequ[eê]ncia|todo dia|diario|di[aá]rio/.test(normalized);
  const asksTreino = /treino|musculacao|academia|calistenia|crossfit|pre.treino|pos.treino/.test(normalized);

  if (asksTreino) {
    return (
      `💪 *${subject}* — boa escolha para treino!\n\n` +
      `Me conta mais para personalizar melhor:\n` +
      `• 🎯 Qual seu objetivo? emagrecer / manter / ganhar massa\n` +
      `• ⚖️ Peso aproximado? (ex: 75kg)\n` +
      `• 🏋️ Tipo de treino? musculação / calistenia / crossfit\n\n` +
      `Assim te dou as quantidades certas de proteína e calorias!`
    );
  }

  if (asksCalories) {
    return (
      `🔥 Posso calcular as calorias de *${subject}*!\n` +
      `Me diz a quantidade para ser mais preciso:\n` +
      `Exemplo: *2 fatias de ${subject}* ou *100g de ${subject}*\n\n` +
      `💡 _Lembre: proteína tem 4 kcal/g, carbo 4 kcal/g, gordura 9 kcal/g_`
    );
  }

  if (asksMacro) {
    return (
      `💪 *${subject}* tem perfil de macros interessante!\n\n` +
      `Qual detalhe você quer?\n` +
      `• 🥩 Quantidade de proteína\n` +
      `• 🍞 Carboidratos e impacto glicêmico\n` +
      `• 🫒 Gorduras (boas ou ruins?)\n` +
      `• 📊 Perfil completo de macros\n\n` +
      `Manda a quantidade e te passo tudo!`
    );
  }

  if (asksRoutine) {
    return (
      `📅 Frequência ideal de *${subject}* depende do seu objetivo.\n\n` +
      `Me diz:\n` +
      `• 🎯 Emagrecer, manter ou ganhar massa?\n` +
      `• 🏃 Você pratica exercício?\n\n` +
      `Com isso te passo a frequência e porção certa para o seu caso!`
    );
  }

  return (
    `🥗 Posso te ajudar com *${subject}*! O que você quer saber?\n\n` +
    `• 🔥 Calorias e macros\n` +
    `• ✅ Se faz bem ou não\n` +
    `• ⏱️ Frequência e porção ideal\n` +
    `• 💪 Relação com treino\n\n` +
    `Manda assim: _"quantas calorias tem ${subject}?"_ ou _"${subject} engorda?"_`
  );
}

async function resolveNutritionAnswer(text: string, history: AIMessage[]): Promise<string | null> {
  const nutritionAnswer = await analyzeNutrition(text, history);
  if (nutritionAnswer) return nutritionAnswer;

  return findKnowledgeAnswer(text);
}

// ─── Comando: listar contas pendentes ─────────────────────────────────────────
async function cmdListPending(phone: string): Promise<string> {
  const now = new Date();

  const transactions = await prisma.financialTransaction.findMany({
    where: {
      userPhone: phone,
      status: { in: ["PENDENTE", "VENCIDO"] },
    },
    orderBy: [{ vencimento: "asc" }, { createdAt: "desc" }],
  });

  if (transactions.length === 0) {
    return "✅ Você não tem contas pendentes! 🎉\n\n_Para registrar uma conta, envie algo como:_\n• *luz 150 dia 20*\n• *aluguel 1200 vence dia 5*";
  }

  const toPay = transactions.filter((t) => t.natureza === "PAGAR");
  const toReceive = transactions.filter((t) => t.natureza === "RECEBER");

  let msg = `📋 *Suas Contas — ${now.toLocaleString("pt-BR", { month: "long", year: "numeric" })}*\n\n`;

  if (toPay.length > 0) {
    msg += `💸 *A PAGAR (${toPay.length})*\n`;
    for (const t of toPay) {
      const isOverdue = t.vencimento && t.vencimento < now;
      const icon = isOverdue ? "🔴" : "🟡";
      msg += `${icon} *#${t.id}* ${t.tipo} — ${formatCurrency(t.valor)}`;
      if (t.vencimento) msg += ` · 📅 ${formatDate(t.vencimento)}`;
      msg += "\n";
    }
    const total = toPay.reduce((s, t) => s + t.valor.toNumber(), 0);
    msg += `\n   *Total: ${formatCurrency(total)}*\n\n`;
  }

  if (toReceive.length > 0) {
    msg += `💰 *A RECEBER (${toReceive.length})*\n`;
    for (const t of toReceive) {
      msg += `🟢 *#${t.id}* ${t.tipo} — ${formatCurrency(t.valor)}`;
      if (t.vencimento) msg += ` · 📅 ${formatDate(t.vencimento)}`;
      msg += "\n";
    }
    const total = toReceive.reduce((s, t) => s + t.valor.toNumber(), 0);
    msg += `\n   *Total: ${formatCurrency(total)}*\n`;
  }

  msg += `\n_Para marcar como pago: *paguei #ID*_\n_Para resumo: *resumo*_`;
  return msg;
}

// ─── Comando: listar contas pagas ─────────────────────────────────────────────
async function cmdListPaid(phone: string): Promise<string> {
  const transactions = await prisma.financialTransaction.findMany({
    where: { userPhone: phone, status: "PAGO" },
    orderBy: { paidAt: "desc" },
    take: 20,
  });

  if (transactions.length === 0) {
    return "📭 Nenhuma conta marcada como paga ainda.\n\n_Use *paguei #ID* para marcar uma conta como paga._";
  }

  let msg = `✅ *Contas Pagas (últimas ${transactions.length})*\n\n`;
  for (const t of transactions) {
    const icon = t.natureza === "PAGAR" ? "💸" : "💰";
    msg += `${icon} #${t.id} *${t.tipo}* — ${formatCurrency(t.valor)}`;
    if (t.paidAt) msg += ` _(${formatDate(t.paidAt)})_`;
    msg += "\n";
  }
  return msg;
}

// ─── Mapear método de pagamento do texto ──────────────────────────────────────
function parsePaymentMethod(text: string): string | null {
  const t = text.toLowerCase().trim();
  if (/cr[ée]d(ito)?/.test(t) || /cart[aã]o\s+(de\s+)?cr[ée]d/.test(t)) return "CREDITO";
  if (/d[ée]b(ito)?/.test(t) || /cart[aã]o\s+(de\s+)?d[ée]b/.test(t)) return "DEBITO";
  if (/dinheiro|espécie|especie|cash/.test(t)) return "DINHEIRO";
  if (/pix/.test(t)) return "PIX";
  if (/^[12]$/.test(t.trim())) return t.trim() === "1" ? "CREDITO" : "DEBITO";
  if (/^3$/.test(t.trim())) return "PIX";
  if (/^4$/.test(t.trim())) return "DINHEIRO";
  return null;
}

function paymentMethodLabel(method: string | null): string {
  if (method === "CREDITO") return "💳 Cartão de Crédito";
  if (method === "DEBITO") return "💳 Cartão de Débito";
  if (method === "DINHEIRO") return "💵 Dinheiro";
  if (method === "PIX") return "⚡ Pix";
  return "—";
}

// ─── Executar marcação como pago ──────────────────────────────────────────────
async function executeMarkPaid(
  phone: string,
  id: number,
  tipo: string,
  valor: { toNumber(): number } | number,
  paymentMethod: string,
): Promise<string> {
  const valorNum = typeof valor === "number" ? valor : valor.toNumber();

  await prisma.financialTransaction.update({
    where: { id },
    data: { status: "PAGO", paidAt: new Date(), paymentMethod },
  });

  // Cancela lembretes pendentes
  await prisma.reminderJob.updateMany({
    where: { transactionId: id, status: "PENDING" },
    data: { status: "SKIPPED" },
  });

  // Limpa estado pendente
  await prisma.whatsappUser.update({
    where: { phone },
    data: { registrationData: {}, registrationStep: null },
  });

  return (
    `✅ *${tipo}* marcado como pago!\n` +
    `💰 ${formatCurrency(valorNum)}\n` +
    `${paymentMethodLabel(paymentMethod)}\n` +
    `📅 Pago em: ${formatDate(new Date())}`
  );
}

// ─── Comando: marcar como pago ────────────────────────────────────────────────
async function cmdMarkPaid(phone: string, text: string): Promise<string> {
  const match = text.match(/#?(\d+)/);
  if (!match) {
    return "❓ Informe o ID da conta.\nExemplo: *paguei #123*\n\nUse *ver contas* para ver os IDs.";
  }

  const id = parseInt(match[1]);
  const t = await prisma.financialTransaction.findFirst({
    where: { id, userPhone: phone },
  });

  if (!t) {
    return `❌ Conta *#${id}* não encontrada.\nUse *ver contas* para listar suas contas.`;
  }

  if (t.status === "PAGO") {
    return `ℹ️ A conta *${t.tipo}* (${formatCurrency(t.valor)}) já está marcada como paga.`;
  }

  // Tenta extrair método de pagamento da mensagem ("paguei #3 crédito")
  const inlineMethod = parsePaymentMethod(text);

  if (!inlineMethod) {
    // Nenhum método informado → salva estado pendente e pergunta
    await prisma.whatsappUser.update({
      where: { phone },
      data: {
        registrationData: { pendingPaymentId: id },
        registrationStep: "pending_payment_method",
      },
    });
    return (
      `✅ Conta *#${id} — ${t.tipo}* (${formatCurrency(t.valor)}) localizada!\n\n` +
      `💳 Como foi o pagamento?\n\n` +
      `1️⃣ *crédito* — Cartão de Crédito\n` +
      `2️⃣ *débito* — Cartão de Débito\n` +
      `3️⃣ *pix* — Pix\n` +
      `4️⃣ *dinheiro* — Dinheiro / Espécie\n\n` +
      `_Responda com uma das opções acima_`
    );
  }

  return await executeMarkPaid(phone, id, t.tipo, t.valor, inlineMethod);
}

// ─── Comando: resumo financeiro ───────────────────────────────────────────────
async function cmdSummary(phone: string): Promise<string> {
  const now = new Date();
  const all = await prisma.financialTransaction.findMany({
    where: { userPhone: phone },
  });

  const pending = all.filter((t) => t.status === "PENDENTE" || t.status === "VENCIDO");
  const paid = all.filter((t) => t.status === "PAGO");
  const overdue = pending.filter((t) => t.vencimento && t.vencimento < now);

  const totalPagar = pending.filter((t) => t.natureza === "PAGAR").reduce((s, t) => s + t.valor.toNumber(), 0);
  const totalReceber = pending.filter((t) => t.natureza === "RECEBER").reduce((s, t) => s + t.valor.toNumber(), 0);
  const totalPago = paid.filter((t) => t.natureza === "PAGAR").reduce((s, t) => s + t.valor.toNumber(), 0);
  const saldo = totalReceber - totalPagar;
  const qtdPagar = pending.filter((t) => t.natureza === "PAGAR").length;
  const qtdReceber = pending.filter((t) => t.natureza === "RECEBER").length;

  return (
    `📊 *Acabei de fechar seu resumo:*\n\n` +
    `• 💸 A pagar: *${formatCurrency(totalPagar)}* em *${qtdPagar}* conta(s)\n` +
    `• 💰 A receber: *${formatCurrency(totalReceber)}* em *${qtdReceber}* conta(s)\n` +
    `• ✅ Já pago: *${formatCurrency(totalPago)}*\n` +
    (overdue.length > 0 ? `• 🔴 Vencidas: *${overdue.length}*\n` : "") +
    `\n${saldo >= 0 ? "📈" : "📉"} Saldo projetado de hoje: *${formatCurrency(saldo)}*\n\n` +
    `Se quiser, já te mostro os detalhes. É só enviar *ver contas*.`
  );
}

// ─── Comando: ajuda ───────────────────────────────────────────────────────────
type GreetingTone = "morning" | "afternoon" | "night" | "hello" | "default";

function detectGreetingTone(text: string): GreetingTone {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  if (/\bbom\s+dia\b/.test(normalized)) return "morning";
  if (/\bboa\s+tarde\b/.test(normalized)) return "afternoon";
  if (/\bboa\s+noite\b/.test(normalized)) return "night";
  if (/^(oi|ola|opa|e ai|eai)\b/.test(normalized)) return "hello";
  return "default";
}

function buildGreetingLine(text: string, senderName?: string): string {
  const firstName = senderName?.trim()?.split(" ")[0];
  const nameSuffix = firstName ? `, ${firstName}` : "";
  const tone = detectGreetingTone(text);

  if (tone === "morning") return `Bom dia${nameSuffix}! Que bom falar com você. ☀️`;
  if (tone === "afternoon") return `Boa tarde${nameSuffix}! Vamos organizar suas finanças juntos. 🌤️`;
  if (tone === "night") return `Boa noite${nameSuffix}! Conte comigo para deixar tudo em dia. 🌙`;
  if (tone === "hello") return `Oi${nameSuffix}! Prazer em te ajudar hoje. 🙂`;
  return `Olá${nameSuffix}! Estou aqui para facilitar sua rotina financeira. 🤝`;
}

function cmdHelp(text: string, senderName?: string): string {
  const greetingLine = buildGreetingLine(text, senderName);

  return (
    `🤖 *ozapteconta — Assistente Financeiro*\n\n` +
    `${greetingLine}\n\n` +
    `Abaixo estão *modelos de exemplo* para você copiar e adaptar do seu jeito.\n` +
    `_Esses comandos são exemplos de como digitar para obter as informações._\n\n` +
    `📝 *Modelos para registrar conta:*\n` +
    `   • _luz 150 dia 20_\n` +
    `   • _aluguel 1200 vence dia 5_\n` +
    `   • _recebi 500 de salário_\n` +
    `   • _cartão 350 vence amanhã_\n\n` +
    `📋 *Modelos para consultar:*\n` +
    `   • _ver contas_ — pendentes do mês\n` +
    `   • _contas pagas_ — histórico\n` +
    `   • _resumo_ — visão geral\n` +
    `   • _gerar pdf agora_ — relatório diário em PDF\n\n` +
    `📧 *Modelo para enviar por e-mail:*\n` +
    `   • _enviar pdf do resumo para email nome@dominio.com_\n` +
    `   • _leva alguns segundos para juntar os dados e enviar_\n\n` +
    `✅ *Modelo para marcar como pago:*\n` +
    `   • _paguei #123_\n\n` +
    `💹 *Modelos de mercado financeiro:*\n` +
    `   • _dólar hoje_ / _bitcoin_ / _selic_\n` +
    `   • _PETR4_ / _VALE3_ / _IBOVESPA_\n` +
    `   • _mercado hoje_ — resumo completo\n\n` +
    `🚗 *Modelos para Tabela FIPE:*\n` +
    `   • _fipe volkswagen gol 2020_ / _fipe honda civic 2019_\n` +
    `   • _fipe moto honda cg 160 2022_\n` +
    `   • _fipe toyota corolla xei 2021_\n` +
    `   • Digite _fipe_ para ver mais exemplos\n\n` +
    `🎤 *Áudio:* Pode enviar mensagens de voz!\n\n` +
    `_Dica: Você pode escrever como fala no dia a dia. Eu entendo linguagem natural. 😊_\n\n` +
    `📈`
  );
}

// ─── Agendar lembretes ────────────────────────────────────────────────────────
async function scheduleReminders(phone: string, transactionId: number, vencimento: Date) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const threeDaysBefore = new Date(vencimento);
  threeDaysBefore.setDate(threeDaysBefore.getDate() - 3);
  threeDaysBefore.setHours(9, 0, 0, 0);

  const dueDay = new Date(vencimento);
  dueDay.setHours(9, 0, 0, 0);

  const reminders = [];

  if (threeDaysBefore >= now) {
    reminders.push({ transactionId, userPhone: phone, reminderType: "THREE_DAYS_BEFORE" as const, scheduledFor: threeDaysBefore });
  }

  if (dueDay >= now) {
    reminders.push({ transactionId, userPhone: phone, reminderType: "ON_DUE_DATE" as const, scheduledFor: dueDay });
  }

  if (reminders.length > 0) {
    await prisma.reminderJob.createMany({ data: reminders });
    logger.info(`[Reminders] Agendados ${reminders.length} lembrete(s) para transação #${transactionId}`);
  }
}

// ─── Processar mensagem de texto ──────────────────────────────────────────────
export async function processText(phone: string, senderName: string | undefined, text: string) {
  const identity = await resolveWhatsappIdentity(phone);
  const canonicalPhone = identity.canonicalPhone || phone;
  const user = await getOrCreateUser(canonicalPhone, senderName, identity.aliases);

  // Gate 1: cadastro completo + Gate 2: plano ativo
  const intercepted = await handleOnboarding(user, canonicalPhone, text, identity.aliases);
  if (intercepted) return;


  // Gate 3: resposta a método de pagamento pendente
  if (user.registrationStep === "pending_payment_method") {
    const regData = (user.registrationData ?? {}) as Record<string, unknown>;
    const pendingId = typeof regData.pendingPaymentId === "number" ? regData.pendingPaymentId : null;
    const method = parsePaymentMethod(text);
    if (pendingId !== null && method) {
      const t = await prisma.financialTransaction.findFirst({
        where: { id: pendingId, userPhone: canonicalPhone },
      });
      if (t && t.status !== "PAGO") {
        const result = await executeMarkPaid(canonicalPhone, pendingId, t.tipo, t.valor, method);
        await sendMessage(canonicalPhone, result);
        return;
      }
    }
    if (!method) {
      await sendMessage(
        canonicalPhone,
        `❓ Não entendi. Responda com uma das opções:\n\n` +
        `1️⃣ *crédito*\n2️⃣ *débito*\n3️⃣ *pix*\n4️⃣ *dinheiro*`,
      );
      return;
    }
  }

  const history = parseContext(user.conversationContext);
  const command = detectCommand(text);
  const clientProfile = await prisma.clientProfile.findUnique({
    where: { phone: canonicalPhone },
    select: { plan: true },
  });
  const isBasicPlan = clientProfile?.plan !== "FULL";

  let response = "";

  if (command === "help") {
    response = cmdHelp(text, senderName);
  } else if (command === "list_pending") {
    response = await cmdListPending(canonicalPhone);
  } else if (command === "list_paid") {
    response = await cmdListPaid(canonicalPhone);
  } else if (command === "mark_paid") {
    response = await cmdMarkPaid(canonicalPhone, text);
  } else if (command === "summary") {
    response = await cmdSummary(canonicalPhone);
  } else if (command === "report_email") {
    const email = extractEmailFromText(text);

    if (!email) {
      response =
        "📧 Para enviar o resumo por e-mail, preciso do endereço completo.\n\n" +
        "Exemplos corretos:\n" +
        "• *enviar pdf do resumo para email nome@dominio.com*\n" +
        "• *quero o relatório no e-mail financeiro@empresa.com.br*\n\n" +
        "_Leva alguns segundos para juntar os dados e concluir o envio._";
    } else {
      await sendMessage(
        canonicalPhone,
        `📨 Recebi seu pedido. Estou preparando seu resumo em PDF para o e-mail ${email}. ` +
          "Aguarde mais alguns instantes enquanto junto os dados.",
      );
      const reportResult = await sendFinancialReportNow(canonicalPhone, email);
      response = reportResult.message;
    }
  } else if (command === "report_now") {
    await sendMessage(
      canonicalPhone,
      "📄 Estou gerando seu relatório agora. Esse processo leva alguns segundos. Aguarde mais alguns instantes.",
    );
    const reportResult = await sendFinancialReportNow(canonicalPhone);
    response = reportResult.message;
  } else if (command === "market_help") {
    response = isBasicPlan
      ? "🔒 Recurso disponível apenas no plano *Completo (R$ 9,90)*.\n\nNo plano básico você pode usar contas a pagar e a receber normalmente."
      : getMarketHelp();
  } else if (command === "fipe_help") {
    response = isBasicPlan
      ? "🔒 Consulta FIPE disponível apenas no plano *Completo (R$ 9,90)*.\n\nNo plano básico você pode usar contas a pagar e a receber normalmente."
      : getFipeHelp();
  } else {
    // ── Calculadora de Metabolismo/IMC (prioridade máxima — antes do menu) ──────
    if (isBMRQuery(text) || isChoosingBMRFromMenu(text, history) || isBMRFollowUp(text, history)) {
      response = formatBMRResponse(text);

      await saveContext(canonicalPhone, [
        ...history,
        { role: "user", content: text },
        { role: "assistant", content: response },
      ]);

      await sendMessage(canonicalPhone, response);
      return;
    }

    // ── Menu inteligente de nutrição (intenção ambígua) ───────────────────────
    if (isAmbiguousNutritionIntent(text, history)) {
      response = getNutritionMenu();

      await saveContext(canonicalPhone, [
        ...history,
        { role: "user", content: text },
        { role: "assistant", content: response },
      ]);

      await sendMessage(canonicalPhone, response);
      return;
    }

    // ── Plano de Dieta Completo via IA ────────────────────────────────────────
    if (isDietPlanRequest(text, history)) {
      await sendLoadingMessage(canonicalPhone, "diet_plan");
      response =
        (await generateDietPlan(text, history)) ??
        `🥗 Para montar seu plano alimentar ideal, me diz:\n\n` +
        `• 🎯 *Objetivo:* emagrecer, manter ou ganhar massa?\n` +
        `• ⚖️ *Peso e altura?*\n` +
        `• 🏋️ *Pratica exercício?* (tipo e frequência)\n` +
        `• 🚫 *Tem restrição alimentar?* (ex: sem glúten, vegetariano)\n\n` +
        `Exemplo: _"Sou mulher, 68kg, 1,65m, quero emagrecer, faço caminhada 3x"_`;

      await saveContext(canonicalPhone, [
        ...history,
        { role: "user", content: text },
        { role: "assistant", content: response },
      ]);

      await sendMessage(canonicalPhone, response);
      return;
    }

    // (isBMRQuery check moved above isAmbiguousNutritionIntent — see above)

    if (isNutritionQuery(text)) {
      await sendLoadingMessage(canonicalPhone, "nutrition_ai");
      response =
        (await resolveNutritionAnswer(text, history)) ??
        "🥗 Posso analisar alimentos, calorias e macros, mas preciso que você diga o alimento e, se possível, a quantidade.\n\nExemplo: *2 ovos, arroz, feijão e bife no almoço*";

      await saveContext(canonicalPhone, [
        ...history,
        { role: "user", content: text },
        { role: "assistant", content: response },
      ]);

      await sendMessage(canonicalPhone, response);
      return;
    }

    const nutritionClarification = getNutritionClarificationPrompt(text);
    if (nutritionClarification) {
      await saveContext(canonicalPhone, [
        ...history,
        { role: "user", content: text },
        { role: "assistant", content: nutritionClarification },
      ]);

      await sendMessage(canonicalPhone, nutritionClarification);
      return;
    }

    // ── Consulta FIPE (antes da IA) ───────────────────────────────────────────
    const fipeQuery = detectFipeQuery(text);
    if (fipeQuery) {
      if (isBasicPlan) {
        await sendMessage(
          canonicalPhone,
          "🔒 A consulta FIPE é um recurso do plano *Completo (R$ 9,90)*.\n\nSeu plano atual continua com contas a pagar/receber para PF e PJ.",
        );
        return;
      }
      const fipeResult = await queryFipe(canonicalPhone, fipeQuery.query, fipeQuery.vehicleType);
      await sendMessage(canonicalPhone, fipeResult.message);
      return;
    }

    // ── Análise de Investimentos (IA + dados reais) ───────────────────────────
    const investQuery = detectInvestmentQuery(text);
    if (investQuery) {
      if (isBasicPlan) {
        await sendMessage(
          canonicalPhone,
          "🔒 Análise de Investimentos é um recurso do plano *Completo (R$ 9,90)*.\n\nAtualize seu plano para acessar análises de ações, criptomoedas e sugestões de investimento.",
        );
        return;
      }

      let investResponse = "";

      switch (investQuery.type) {
        case "investment_menu":
          investResponse = getInvestmentMenu();
          break;

        case "top_stocks":
          await sendLoadingMessage(canonicalPhone, "investment_data");
          investResponse = await getTopB3Stocks();
          break;

        case "top_cryptos":
          await sendLoadingMessage(canonicalPhone, "investment_data");
          investResponse = await getTopCryptosReport();
          break;

        case "stock_analysis": {
          const ticker = investQuery.ticker!;
          await sendLoadingMessage(canonicalPhone, "investment_data");
          const rawData = await analyzeStockForInvestment(ticker);
          await sendLoadingMessage(canonicalPhone, "investment_ai");
          const aiAnalysis = await generateInvestmentAdvice(text, rawData, history);
          investResponse = rawData + (aiAnalysis ? "\n\n" + aiAnalysis : "");
          break;
        }

        case "crypto_analysis": {
          await sendLoadingMessage(canonicalPhone, "investment_data");
          const rawData = await analyzeCryptoForInvestment(
            investQuery.coinId!,
            investQuery.displayName!,
            investQuery.symbol!,
          );
          await sendLoadingMessage(canonicalPhone, "investment_ai");
          const aiAnalysis = await generateInvestmentAdvice(text, rawData, history);
          investResponse = rawData + (aiAnalysis ? "\n\n" + aiAnalysis : "");
          break;
        }
      }

      if (investResponse) {
        await saveContext(canonicalPhone, [
          ...history,
          { role: "user", content: text },
          { role: "assistant", content: investResponse },
        ]);
        await sendMessage(canonicalPhone, investResponse);
        return;
      }
    }

    // ── Consulta de mercado financeiro (antes da IA) ──────────────────────────
    const marketQuery = detectMarketQuery(text);
    if (marketQuery) {
      if (isBasicPlan) {
        await sendMessage(
          canonicalPhone,
          "🔒 Mercado Financeiro é um recurso do plano *Completo (R$ 9,90)*.\n\nSeu plano atual continua com contas a pagar/receber para PF e PJ.",
        );
        return;
      }
      // Cotações e resumo de mercado precisam buscar dados externos
      if (marketQuery.type !== "help_market") {
        await sendLoadingMessage(canonicalPhone, "market_data");
      }
      response = await executeMarketQuery(marketQuery);
      await sendMessage(canonicalPhone, response);
      return;
    }
    // Extração via IA tem prioridade — determina contextos permitidos pelo plano
    const allowedContexts: ("PESSOAL" | "COMERCIAL")[] =
      clientProfile?.plan === "OFFICE" ? ["PESSOAL", "COMERCIAL"] : ["PESSOAL", "COMERCIAL"];

    const extracted = await extractTransaction(text, history, allowedContexts, "text");

    if (!extracted.needsMoreInfo && extracted.valor !== null && extracted.valor > 0) {
      // Transação identificada — salva imediatamente
      const now = new Date();
      const vencimentoDate = extracted.vencimento ? new Date(extracted.vencimento + "T12:00:00Z") : null;

      const created = await prisma.financialTransaction.create({
        data: {
          userPhone: canonicalPhone,
          tipo: extracted.tipo,
          valor: extracted.valor,
          natureza: extracted.natureza,
          context: extracted.contexto,
          categoria: extracted.categoria,
          ...(extracted.categoryId ? { categoryId: extracted.categoryId } : {}),
          vencimento: vencimentoDate,
          status: "PENDENTE",
          fonte: "TEXTO",
          rawMessage: text,
          extractedConfidence: extracted.confidence,
          needsHumanReview: extracted.confidence < 0.6,
        },
      });

      if (vencimentoDate) {
        await scheduleReminders(phone, created.id, vencimentoDate);
      }

      await prisma.whatsappUser.update({
        where: { phone: canonicalPhone },
        data: { totalTransactions: { increment: 1 } },
      });

      // Confirmação explícita ao usuário
      const tipoIcon = extracted.natureza === "PAGAR" ? "💸" : "💰";
      const naturezaLabel = extracted.natureza === "PAGAR" ? "gasto" : "recebimento";
      const dataHora = now.toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
        timeZone: "America/Sao_Paulo",
      });
      const vencLine = vencimentoDate
        ? `\n📅 Vencimento: *${vencimentoDate.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}*`
        : "";
      response =
        `Perfeito! Já deixei isso registrado pra você. ✅\n\n` +
        `${tipoIcon} Tipo: *${naturezaLabel}*\n` +
        `💰 Valor: *${formatCurrency(extracted.valor)}*\n` +
        `🏷️ Descrição: *${extracted.tipo}*\n` +
        `📂 Categoria: *${extracted.categoria}* (${extracted.contexto.toLowerCase()})\n` +
        `🕐 Registro: *${dataHora}*` +
        vencLine +
        `\n🆔 ID: *#${created.id}*\n\n` +
        `Se quiser conferir agora, pode mandar *resumo* ou *ver contas*.`;
    } else {
      // Sem transação — tenta base de conhecimento antes de responder com a IA
      const nutritionClarification = getNutritionClarificationPrompt(text);
      if (nutritionClarification) {
        response = nutritionClarification;
      } else {
        const knowledgeAnswer = await findKnowledgeAnswer(text);
        if (knowledgeAnswer) {
          response = knowledgeAnswer;
        } else {
          // IA generalista — responde qualquer pergunta contextualmente
          await sendLoadingMessage(canonicalPhone, "general_ai");
          response =
            (await generateGeneralResponse(text, history)) ??
            `❓ Não entendi o que você quer fazer.\n\n` +
            `Posso te ajudar com:\n` +
            `• 💰 Registrar contas a pagar ou receber\n` +
            `• 📊 Ver seu resumo financeiro\n` +
            `• 🥗 Calorias e informações de alimentos\n` +
            `• 🧮 Calcular IMC ou taxa basal\n\n` +
            `Exemplos:\n` +
            `_"Paguei 150 reais de mercado"_\n` +
            `_"Quantas calorias tem frango?"_\n` +
            `_"Calcule meu IMC, sou mulher 65kg 1,62m 28 anos"_`;
        }
      }
    }
  }

  // Salva contexto
  await saveContext(canonicalPhone, [
    ...history,
    { role: "user", content: text },
    { role: "assistant", content: response },
  ]);

  await sendMessage(canonicalPhone, response);
}

// ─── Processar áudio a partir de buffer (QR-paired / Baileys) ────────────────
export async function processAudioBuffer(
  phone: string,
  senderName: string | undefined,
  audioBuffer: Buffer,
  mimeType: string,
  mediaId = "local"
) {
  const identity = await resolveWhatsappIdentity(phone);
  const canonicalPhone = identity.canonicalPhone || phone;
  const user = await getOrCreateUser(canonicalPhone, senderName, identity.aliases);
  const intercepted = await handleOnboarding(user, canonicalPhone, "[áudio]", identity.aliases);
  if (intercepted) return;

  const audioDir = config.storage.audioPath;
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

  const ext = mimeType.includes("mp4") ? "mp4" : "ogg";
  const filename = `${canonicalPhone}_${Date.now()}_${mediaId}.${ext}`;
  const audioPath = path.join(audioDir, filename);
  fs.writeFileSync(audioPath, audioBuffer);

  const audioRecord = await prisma.audioMessage.create({
    data: {
      userPhone: canonicalPhone,
      storageKey: filename,
      storageUrl: `/storage/audios/${filename}`,
      mimeType,
      whatsappMediaId: mediaId,
    },
  });
  const pendingNotice = scheduleAudioPendingNotice(canonicalPhone);


  const history = parseContext(user.conversationContext);
  const cp = await prisma.clientProfile.findUnique({ where: { phone: canonicalPhone }, select: { plan: true } });
  const allowedContexts: ("PESSOAL" | "COMERCIAL")[] =
    cp?.plan === "OFFICE" ? ["PESSOAL", "COMERCIAL"] : ["PESSOAL", "COMERCIAL"];

  let extracted = await extractTransactionFromAudio(audioPath, history, allowedContexts);
  let transcription = extracted?.transcription?.trim() || null;

  if (transcription) {
    logger.info(`[Audio] Transcrição: "${transcription}"`);
  }

  await prisma.audioMessage.update({ where: { id: audioRecord.id }, data: { transcription } });

  if (!extracted) {
    transcription = await transcribeAudio(audioPath);
    if (transcription) {
      await prisma.audioMessage.update({ where: { id: audioRecord.id }, data: { transcription } });
      logger.info(`[Audio] Transcrição fallback: "${transcription}"`);
      extracted = await extractTransaction(transcription, history, allowedContexts, "audio");
    } else {
      pendingNotice.cancel();
      await sendMessage(canonicalPhone, "⚠️ Não consegui entender o áudio. Pode reenviar ou mandar em texto simples?");
      return;
    }
  }

  if (transcription && (isBMRQuery(transcription) || isChoosingBMRFromMenu(transcription, history) || isBMRFollowUp(transcription, history))) {
    const response = `🎤 _"${transcription}"_\n\n${formatBMRResponse(transcription)}`;
    await saveContext(canonicalPhone, [...history, { role: "user", content: `[áudio] ${transcription}` }, { role: "assistant", content: response }]);
    pendingNotice.cancel();
    await sendMessage(canonicalPhone, response);
    return;
  }

  let response: string;
  if (transcription && isNutritionQuery(transcription)) {
    const nutritionResponse = await resolveNutritionAnswer(transcription, history);
    response = nutritionResponse
      ? `🎤 _"${transcription}"_\n\n${nutritionResponse}`
      : `🎤 _"${transcription}"_\n\n🥗 Consigo analisar calorias e se a refeição é saudável, mas preciso do alimento e de uma quantidade aproximada.`;
  } else if (!extracted.needsMoreInfo && extracted.valor !== null && extracted.valor > 0) {
    const now = new Date();
    const vencimentoDate = extracted.vencimento ? new Date(extracted.vencimento + "T12:00:00Z") : null;
    const created = await prisma.financialTransaction.create({
      data: {
          userPhone: canonicalPhone,
        tipo: extracted.tipo,
        valor: extracted.valor,
        natureza: extracted.natureza,
        context: extracted.contexto,
        categoria: extracted.categoria,
        ...(extracted.categoryId ? { categoryId: extracted.categoryId } : {}),
        vencimento: vencimentoDate,
        status: "PENDENTE",
        fonte: "VOZ",
        rawMessage: transcription,
        audioStorageKey: filename,
        audioTranscription: transcription,
        extractedConfidence: extracted.confidence,
        needsHumanReview: extracted.confidence < 0.7,
      },
    });

    await prisma.audioMessage.update({ where: { id: audioRecord.id }, data: { transactionId: created.id } });
    if (vencimentoDate) await scheduleReminders(canonicalPhone, created.id, vencimentoDate);
    await prisma.whatsappUser.update({ where: { phone: canonicalPhone }, data: { totalTransactions: { increment: 1 } } });

    const tipoIcon = extracted.natureza === "PAGAR" ? "💸" : "💰";
    const naturezaLabel = extracted.natureza === "PAGAR" ? "Gasto" : "Recebimento";
    const dataHora = now.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
    const vencLine = vencimentoDate ? `\n📅 Vencimento: *${vencimentoDate.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}*` : "";
    const audioHeader = transcription ? `🎤 _"${transcription}"_\n\n` : "🎤 *Áudio processado com sucesso!*\n\n";
    response =
      `${audioHeader}Perfeito, registrei com base no seu áudio. ✅\n\n` +
      `${tipoIcon} Tipo: *${naturezaLabel.toLowerCase()}*\n` +
      `💰 Valor: *${formatCurrency(extracted.valor!)}*\n` +
      `🏷️ Descrição: *${extracted.tipo}*\n` +
      `📂 Categoria: *${extracted.categoria}* (${extracted.contexto.toLowerCase()})\n` +
      `🕐 Registro: *${dataHora}*${vencLine}\n🆔 ID: *#${created.id}*\n\n` +
      `Se quiser, eu já te mostro um *resumo* ou a lista com *ver contas*.`;
  } else {
    const nutritionClarification = transcription ? getNutritionClarificationPrompt(transcription) : null;
    response = nutritionClarification
      ? `🎤 _"${transcription}"_\n\n${nutritionClarification}`
      : transcription
        ? `🎤 _"${transcription}"_\n\n${extracted.responseMessage}`
        : `🎤 *Áudio processado*\n\n${extracted.responseMessage}`;
  }

  await saveContext(canonicalPhone, [...history, { role: "user", content: `[áudio] ${transcription || "sem transcrição textual"}` }, { role: "assistant", content: response }]);
  pendingNotice.cancel();
  await sendMessage(canonicalPhone, response);
}

// ─── Processar mensagem de áudio ──────────────────────────────────────────────
export async function processAudio(
  phone: string,
  senderName: string | undefined,
  mediaId: string,
  mimeType: string
) {
  const identity = await resolveWhatsappIdentity(phone);
  const canonicalPhone = identity.canonicalPhone || phone;
  const user = await getOrCreateUser(canonicalPhone, senderName, identity.aliases);

  // Gate: cadastro completo + plano ativo
  const intercepted = await handleOnboarding(user, canonicalPhone, "[áudio]", identity.aliases);
  if (intercepted) return;

  // Baixa o áudio
  const media = await downloadMedia(mediaId);
  if (!media) {
    await sendMessage(canonicalPhone, "⚠️ Não consegui baixar seu áudio. Tente enviar uma mensagem de texto.");
    return;
  }

  // Salva localmente
  const audioDir = config.storage.audioPath;
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

  const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "ogg";
  const filename = `${canonicalPhone}_${Date.now()}_${mediaId}.${ext}`;
  const audioPath = path.join(audioDir, filename);
  fs.writeFileSync(audioPath, media.buffer);

  // Salva registro do áudio
  const audioRecord = await prisma.audioMessage.create({
    data: {
      userPhone: canonicalPhone,
      storageKey: filename,
      storageUrl: `/storage/audios/${filename}`,
      mimeType: media.mimeType,
      whatsappMediaId: mediaId,
    },
  });
  const pendingNotice = scheduleAudioPendingNotice(canonicalPhone);

  // Extrai transação da transcrição
  const history = parseContext(user.conversationContext);

  const audioClientProfile = await prisma.clientProfile.findUnique({
    where: { phone: canonicalPhone },
    select: { plan: true },
  });
  const audioAllowedContexts: ("PESSOAL" | "COMERCIAL")[] =
    audioClientProfile?.plan === "OFFICE" ? ["PESSOAL", "COMERCIAL"] : ["PESSOAL", "COMERCIAL"];

  let extracted = await extractTransactionFromAudio(audioPath, history, audioAllowedContexts);
  let transcription = extracted?.transcription?.trim() || null;

  if (transcription) {
    logger.info(`[Audio] Transcrição: "${transcription}"`);
  }

  await prisma.audioMessage.update({
    where: { id: audioRecord.id },
    data: { transcription },
  });

  if (!extracted) {
    transcription = await transcribeAudio(audioPath);
    if (transcription) {
      await prisma.audioMessage.update({ where: { id: audioRecord.id }, data: { transcription } });
      logger.info(`[Audio] Transcrição fallback: "${transcription}"`);
      extracted = await extractTransaction(transcription, history, audioAllowedContexts, "audio");
    } else {
      pendingNotice.cancel();
      await sendMessage(
        canonicalPhone,
        "⚠️ Não consegui entender o áudio. Pode reenviar ou mandar em texto simples?"
      );
      return;
    }
  }

  if (transcription && (isBMRQuery(transcription) || isChoosingBMRFromMenu(transcription, history) || isBMRFollowUp(transcription, history))) {
    const response = `🎤 _"${transcription}"_\n\n${formatBMRResponse(transcription)}`;
    await saveContext(canonicalPhone, [...history, { role: "user", content: `[áudio] ${transcription}` }, { role: "assistant", content: response }]);
    pendingNotice.cancel();
    await sendMessage(canonicalPhone, response);
    return;
  }

  let response: string;

  pendingNotice.cancel();
  if (transcription && isNutritionQuery(transcription)) {
    const nutritionResponse = await resolveNutritionAnswer(transcription, history);
    response = nutritionResponse
      ? `🎤 _"${transcription}"_\n\n${nutritionResponse}`
      : `🎤 _"${transcription}"_\n\n🥗 Consigo analisar calorias e se a refeição é saudável, mas preciso do alimento e de uma quantidade aproximada.`;
  } else if (!extracted.needsMoreInfo && extracted.valor !== null && extracted.valor > 0) {
    const nowAudio = new Date();
    const vencimentoDate = extracted.vencimento ? new Date(extracted.vencimento + "T12:00:00Z") : null;
    const created = await prisma.financialTransaction.create({
      data: {
          userPhone: canonicalPhone,
        tipo: extracted.tipo,
        valor: extracted.valor,
        natureza: extracted.natureza,
        context: extracted.contexto,
        categoria: extracted.categoria,
        ...(extracted.categoryId ? { categoryId: extracted.categoryId } : {}),
        vencimento: vencimentoDate,
        status: "PENDENTE",
        fonte: "VOZ",
        rawMessage: transcription,
        audioStorageKey: filename,
        audioTranscription: transcription,
        extractedConfidence: extracted.confidence,
        needsHumanReview: extracted.confidence < 0.7,
      },
    });

    // Vincula áudio à transação
    await prisma.audioMessage.update({
      where: { id: audioRecord.id },
      data: { transactionId: created.id },
    });

    if (vencimentoDate) {
      await scheduleReminders(canonicalPhone, created.id, vencimentoDate);
    }

    await prisma.whatsappUser.update({
      where: { phone: canonicalPhone },
      data: { totalTransactions: { increment: 1 } },
    });

    // Confirmação explícita para áudio
    const tipoIconA = extracted.natureza === "PAGAR" ? "💸" : "💰";
    const naturezaLabelA = extracted.natureza === "PAGAR" ? "gasto" : "recebimento";
    const dataHoraA = nowAudio.toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
    const vencLineA = vencimentoDate
      ? `\n📅 Vencimento: *${vencimentoDate.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}*`
      : "";
    const audioHeader = transcription ? `🎤 _"${transcription}"_\n\n` : "🎤 *Áudio processado com sucesso!*\n\n";
    response =
      `${audioHeader}` +
      `Perfeito, registrei com base no seu áudio. ✅\n\n` +
      `${tipoIconA} Tipo: *${naturezaLabelA}*\n` +
      `💰 Valor: *${formatCurrency(extracted.valor!)}*\n` +
      `🏷️ Descrição: *${extracted.tipo}*\n` +
      `📂 Categoria: *${extracted.categoria}* (${extracted.contexto.toLowerCase()})\n` +
      `🕐 Registro: *${dataHoraA}*` +
      vencLineA +
      `\n🆔 ID: *#${created.id}*\n\n` +
      `Se quiser, eu já te mostro um *resumo* ou a lista com *ver contas*.`;
  } else {
    const nutritionClarification = transcription ? getNutritionClarificationPrompt(transcription) : null;
    response = nutritionClarification
      ? `🎤 _"${transcription}"_\n\n${nutritionClarification}`
      : transcription
        ? `🎤 _"${transcription}"_\n\n${extracted.responseMessage}`
        : `🎤 *Áudio processado*\n\n${extracted.responseMessage}`;
  }

  await saveContext(canonicalPhone, [
    ...history,
    { role: "user", content: `[áudio] ${transcription || "sem transcrição textual"}` },
    { role: "assistant", content: response },
  ]);

  await sendMessage(canonicalPhone, response);
}
