import fs from "fs";
import path from "path";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { config } from "../config";
import { logger } from "../utils/logger";
import { extractTransaction, extractTransactionFromAudio, AIMessage } from "./aiService";
import { sendMessage, downloadMedia, formatCurrency, formatDate } from "./whatsappService";
import { transcribeAudio } from "./transcriptionService";
import { issueClientPortalAccess } from "./clientAccessService";
import infinityPayService from "./infinityPayService";
import { sendFinancialReportNow } from "./financialReportService";
import { detectMarketQuery, executeMarketQuery, getMarketHelp } from "./marketDataService";
import { detectFipeQuery, queryFipe, getFipeHelp } from "./fipeService";

const ONBOARDING_TIMEOUT_MINUTES = 10;

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
  text: string
): Promise<boolean> {
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
  const profile = await prisma.clientProfile.findUnique({
    where: { phone },
    include: { subscription: true },
  });

  if (profile) {
    if (profile.status === "ACTIVE" && profile.subscription?.status === "ACTIVE") {
      if (user.registrationStep) await setRegistrationStep(phone, null);
      return false; // ativo — usa o sistema normalmente
    }

    if (profile.subscription?.status === "ACTIVE" && profile.status !== "ACTIVE") {
      await prisma.clientProfile.update({
        where: { phone },
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
          where: { phone, status: "PENDING_ACTIVATION" },
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
async function getOrCreateUser(phone: string, name?: string) {
  return prisma.whatsappUser.upsert({
    where: { phone },
    update: name ? { name } : {},
    create: { phone, name: name || null },
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

  await prisma.financialTransaction.update({
    where: { id },
    data: { status: "PAGO", paidAt: new Date() },
  });

  // Cancela lembretes pendentes
  await prisma.reminderJob.updateMany({
    where: { transactionId: id, status: "PENDING" },
    data: { status: "SKIPPED" },
  });

  return `✅ *${t.tipo}* marcado como pago!\n💰 ${formatCurrency(t.valor)}\n📅 Pago em: ${formatDate(new Date())}`;
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

  return (
    `📊 *Resumo Financeiro*\n\n` +
    `💸 A Pagar: *${formatCurrency(totalPagar)}* (${pending.filter((t) => t.natureza === "PAGAR").length})\n` +
    `💰 A Receber: *${formatCurrency(totalReceber)}* (${pending.filter((t) => t.natureza === "RECEBER").length})\n` +
    `✅ Pago: *${formatCurrency(totalPago)}*\n` +
    (overdue.length > 0 ? `🔴 Vencidas: *${overdue.length} conta(s)*\n` : "") +
    `\n${saldo >= 0 ? "📈" : "📉"} Saldo projetado: *${formatCurrency(saldo)}*\n\n` +
    `_Use *ver contas* para detalhes_`
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
  const user = await getOrCreateUser(phone, senderName);

  // Gate 1: cadastro completo + Gate 2: plano ativo
  const intercepted = await handleOnboarding(user, phone, text);
  if (intercepted) return;

  const history = parseContext(user.conversationContext);
  const command = detectCommand(text);
  const clientProfile = await prisma.clientProfile.findUnique({
    where: { phone },
    select: { plan: true },
  });
  const isBasicPlan = clientProfile?.plan !== "FULL";

  let response = "";

  if (command === "help") {
    response = cmdHelp(text, senderName);
  } else if (command === "list_pending") {
    response = await cmdListPending(phone);
  } else if (command === "list_paid") {
    response = await cmdListPaid(phone);
  } else if (command === "mark_paid") {
    response = await cmdMarkPaid(phone, text);
  } else if (command === "summary") {
    response = await cmdSummary(phone);
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
        phone,
        `📨 Recebi seu pedido. Estou preparando seu resumo em PDF para *${email}*. ` +
          "Aguarde mais alguns instantes enquanto junto os dados.",
      );
      const reportResult = await sendFinancialReportNow(phone, email);
      response = reportResult.message;
    }
  } else if (command === "report_now") {
    await sendMessage(
      phone,
      "📄 Estou gerando seu relatório agora. Esse processo leva alguns segundos. Aguarde mais alguns instantes.",
    );
    const reportResult = await sendFinancialReportNow(phone);
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
    // ── Consulta FIPE (antes da IA) ───────────────────────────────────────────
    const fipeQuery = detectFipeQuery(text);
    if (fipeQuery) {
      if (isBasicPlan) {
        await sendMessage(
          phone,
          "🔒 A consulta FIPE é um recurso do plano *Completo (R$ 9,90)*.\n\nSeu plano atual continua com contas a pagar/receber para PF e PJ.",
        );
        return;
      }
      const fipeResult = await queryFipe(phone, fipeQuery.query, fipeQuery.vehicleType);
      await sendMessage(phone, fipeResult.message);
      return;
    }

    // ── Consulta de mercado financeiro (antes da IA) ──────────────────────────
    const marketQuery = detectMarketQuery(text);
    if (marketQuery) {
      if (isBasicPlan) {
        await sendMessage(
          phone,
          "🔒 Mercado Financeiro é um recurso do plano *Completo (R$ 9,90)*.\n\nSeu plano atual continua com contas a pagar/receber para PF e PJ.",
        );
        return;
      }
      response = await executeMarketQuery(marketQuery);
      await sendMessage(phone, response);
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
          userPhone: phone,
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
        where: { phone },
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
        `${tipoIcon} *${naturezaLabel.charAt(0).toUpperCase() + naturezaLabel.slice(1)} registrado!*\n\n` +
        `💰 Valor: *${formatCurrency(extracted.valor)}*\n` +
        `🏷️ Item: *${extracted.tipo}*\n` +
        `📂 Categoria: *${extracted.categoria}* [${extracted.contexto}]\n` +
        `🕐 Data/Hora: *${dataHora}*` +
        vencLine +
        `\n🆔 #${created.id}\n\n` +
        `_Para consultar seus gastos, envie: "resumo" ou "ver contas"_`;
    } else {
      // Sem transação — tenta base de conhecimento antes de responder com a IA
      const knowledgeAnswer = await findKnowledgeAnswer(text);
      response = knowledgeAnswer ?? extracted.responseMessage;
    }
  }

  // Salva contexto
  await saveContext(phone, [
    ...history,
    { role: "user", content: text },
    { role: "assistant", content: response },
  ]);

  await sendMessage(phone, response);
}

// ─── Processar áudio a partir de buffer (QR-paired / Baileys) ────────────────
export async function processAudioBuffer(
  phone: string,
  senderName: string | undefined,
  audioBuffer: Buffer,
  mimeType: string,
  mediaId = "local"
) {
  const user = await getOrCreateUser(phone, senderName);
  const intercepted = await handleOnboarding(user, phone, "[áudio]");
  if (intercepted) return;

  const audioDir = config.storage.audioPath;
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

  const ext = mimeType.includes("mp4") ? "mp4" : "ogg";
  const filename = `${phone}_${Date.now()}_${mediaId}.${ext}`;
  const audioPath = path.join(audioDir, filename);
  fs.writeFileSync(audioPath, audioBuffer);

  const audioRecord = await prisma.audioMessage.create({
    data: {
      userPhone: phone,
      storageKey: filename,
      storageUrl: `/storage/audios/${filename}`,
      mimeType,
      whatsappMediaId: mediaId,
    },
  });

  await sendMessage(phone, "🎤 Recebi seu áudio! Transcrevendo...");

  const history = parseContext(user.conversationContext);
  const cp = await prisma.clientProfile.findUnique({ where: { phone }, select: { plan: true } });
  const allowedContexts: ("PESSOAL" | "COMERCIAL")[] =
    cp?.plan === "OFFICE" ? ["PESSOAL", "COMERCIAL"] : ["PESSOAL", "COMERCIAL"];

  let extracted = await extractTransactionFromAudio(audioPath, history, allowedContexts);
  let transcription = extracted?.transcription?.trim() || null;

  if (!extracted) {
    transcription = await transcribeAudio(audioPath);

    if (!transcription) {
      await sendMessage(phone, "⚠️ Não consegui transcrever o áudio. Envie em texto.\n\nExemplo: *luz 150 dia 20*");
      return;
    }

    logger.info(`[Audio] Transcrição: "${transcription}"`);
    extracted = await extractTransaction(transcription, history, allowedContexts, "audio");
  }

  await prisma.audioMessage.update({ where: { id: audioRecord.id }, data: { transcription } });

  let response: string;
  if (!extracted.needsMoreInfo && extracted.valor !== null && extracted.valor > 0) {
    const now = new Date();
    const vencimentoDate = extracted.vencimento ? new Date(extracted.vencimento + "T12:00:00Z") : null;
    const created = await prisma.financialTransaction.create({
      data: {
        userPhone: phone,
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
    if (vencimentoDate) await scheduleReminders(phone, created.id, vencimentoDate);
    await prisma.whatsappUser.update({ where: { phone }, data: { totalTransactions: { increment: 1 } } });

    const tipoIcon = extracted.natureza === "PAGAR" ? "💸" : "💰";
    const naturezaLabel = extracted.natureza === "PAGAR" ? "Gasto" : "Recebimento";
    const dataHora = now.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
    const vencLine = vencimentoDate ? `\n📅 Vencimento: *${vencimentoDate.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}*` : "";
    const audioHeader = transcription ? `🎤 _"${transcription}"_\n\n` : "🎤 *Áudio processado com sucesso!*\n\n";
    response =
      `${audioHeader}${tipoIcon} *${naturezaLabel} registrado!*\n\n` +
      `💰 Valor: *${formatCurrency(extracted.valor!)}*\n` +
      `🏷️ Item: *${extracted.tipo}*\n` +
      `📂 Categoria: *${extracted.categoria}* [${extracted.contexto}]\n` +
      `🕐 Data/Hora: *${dataHora}*${vencLine}\n🆔 #${created.id}\n\n` +
      `_Para consultar: envie "resumo" ou "ver contas"_`;
  } else {
    response = transcription
      ? `🎤 _"${transcription}"_\n\n${extracted.responseMessage}`
      : `🎤 *Áudio processado*\n\n${extracted.responseMessage}`;
  }

  await saveContext(phone, [...history, { role: "user", content: `[áudio] ${transcription || "sem transcrição textual"}` }, { role: "assistant", content: response }]);
  await sendMessage(phone, response);
}

// ─── Processar mensagem de áudio ──────────────────────────────────────────────
export async function processAudio(
  phone: string,
  senderName: string | undefined,
  mediaId: string,
  mimeType: string
) {
  const user = await getOrCreateUser(phone, senderName);

  // Gate: cadastro completo + plano ativo
  const intercepted = await handleOnboarding(user, phone, "[áudio]");
  if (intercepted) return;

  // Baixa o áudio
  const media = await downloadMedia(mediaId);
  if (!media) {
    await sendMessage(phone, "⚠️ Não consegui baixar seu áudio. Tente enviar uma mensagem de texto.");
    return;
  }

  // Salva localmente
  const audioDir = config.storage.audioPath;
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

  const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "ogg";
  const filename = `${phone}_${Date.now()}_${mediaId}.${ext}`;
  const audioPath = path.join(audioDir, filename);
  fs.writeFileSync(audioPath, media.buffer);

  // Salva registro do áudio
  const audioRecord = await prisma.audioMessage.create({
    data: {
      userPhone: phone,
      storageKey: filename,
      storageUrl: `/storage/audios/${filename}`,
      mimeType: media.mimeType,
      whatsappMediaId: mediaId,
    },
  });

  await sendMessage(phone, "🎤 Recebi seu áudio! Processando...");

  // Extrai transação da transcrição
  const history = parseContext(user.conversationContext);

  const audioClientProfile = await prisma.clientProfile.findUnique({
    where: { phone },
    select: { plan: true },
  });
  const audioAllowedContexts: ("PESSOAL" | "COMERCIAL")[] =
    audioClientProfile?.plan === "OFFICE" ? ["PESSOAL", "COMERCIAL"] : ["PESSOAL", "COMERCIAL"];

  let extracted = await extractTransactionFromAudio(audioPath, history, audioAllowedContexts);
  let transcription = extracted?.transcription?.trim() || null;

  if (!extracted) {
    transcription = await transcribeAudio(audioPath);

    if (!transcription) {
      await sendMessage(
        phone,
        "⚠️ Não consegui transcrever o áudio. Por favor, envie uma mensagem de texto.\n\nExemplo: *luz 150 dia 20*"
      );
      return;
    }

    extracted = await extractTransaction(transcription, history, audioAllowedContexts, "audio");
  }

  // Atualiza transcrição no registro
  await prisma.audioMessage.update({
    where: { id: audioRecord.id },
    data: { transcription },
  });

  let response: string;

  if (!extracted.needsMoreInfo && extracted.valor !== null && extracted.valor > 0) {
    const nowAudio = new Date();
    const vencimentoDate = extracted.vencimento ? new Date(extracted.vencimento + "T12:00:00Z") : null;
    const created = await prisma.financialTransaction.create({
      data: {
        userPhone: phone,
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
      await scheduleReminders(phone, created.id, vencimentoDate);
    }

    await prisma.whatsappUser.update({
      where: { phone },
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
      `${tipoIconA} *${naturezaLabelA.charAt(0).toUpperCase() + naturezaLabelA.slice(1)} registrado!*\n\n` +
      `💰 Valor: *${formatCurrency(extracted.valor!)}*\n` +
      `🏷️ Item: *${extracted.tipo}*\n` +
      `📂 Categoria: *${extracted.categoria}* [${extracted.contexto}]\n` +
      `🕐 Data/Hora: *${dataHoraA}*` +
      vencLineA +
      `\n🆔 #${created.id}\n\n` +
      `_Para consultar seus gastos, envie: "resumo" ou "ver contas"_`;
  } else {
    response = transcription
      ? `🎤 _"${transcription}"_\n\n${extracted.responseMessage}`
      : `🎤 *Áudio processado*\n\n${extracted.responseMessage}`;
  }

  await saveContext(phone, [
    ...history,
    { role: "user", content: `[áudio] ${transcription || "sem transcrição textual"}` },
    { role: "assistant", content: response },
  ]);

  await sendMessage(phone, response);
}
