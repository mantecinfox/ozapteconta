import cron from "node-cron";
import { prisma } from "../config/prisma";
import { logger } from "../utils/logger";
import { sendMessage, formatCurrency, formatDate } from "./whatsappService";
import { processWeeklyFinancialReports } from "./financialReportService";

function pickVariant(seed: string, total: number): number {
  const normalized = String(seed || "").trim();
  if (!normalized) return 0;

  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  return hash % total;
}

function build48hTrialMessage(phone: string, plan: string, priceStr: string): string {
  const variants: string[] = [
    `⏰ *Seu teste grátis está em andamento!*\n\n` +
      `Você já está há *48 horas* testando o ozapteconta no plano *${plan}*.\n\n` +
      `🔥 Para não perder continuidade quando o trial terminar, garanta já sua assinatura.\n` +
      `💳 Valor do plano atual: *R$ ${priceStr}/mês*\n\n` +
      `Responda: *quero assinar meu plano agora*`,

    `🚀 *Metade do seu período grátis já passou!*\n\n` +
      `Você está no plano *${plan}* testando recursos reais do dia a dia.\n` +
      `Quem ativa cedo evita interrupção e mantém o ritmo.\n\n` +
      `💳 Plano atual: *R$ ${priceStr}/mês*\n` +
      `Responda: *quero contratar agora*`,

    `📈 *Você já sentiu a praticidade do trial!*\n\n` +
      `Em 48h, muita gente já consegue organizar melhor rotina e decisões.\n` +
      `Dê o próximo passo e mantenha tudo ativo sem pausas.\n\n` +
      `💳 Plano *${plan}*: *R$ ${priceStr}/mês*\n` +
      `Responda: *quero meu plano*`,

    `✅ *Seu teste está funcionando perfeitamente.*\n\n` +
      `Agora é o melhor momento para garantir permanência no plano *${plan}*.\n` +
      `Assim você não perde histórico, contexto e velocidade no atendimento.\n\n` +
      `💳 Valor mensal: *R$ ${priceStr}*\n` +
      `Responda: *quero continuar com o plano*`,

    `💬 *Passando para lembrar:* seu trial de *${plan}* já bateu 48h.\n\n` +
      `Você pode assegurar sua assinatura agora e evitar qualquer interrupção no final do teste.\n\n` +
      `💳 Investimento: *R$ ${priceStr}/mês*\n` +
      `Responda: *quero assinar*`,
  ];

  return variants[pickVariant(`${phone}:48h`, variants.length)] || variants[0];
}

function build60hTrialMessage(phone: string): string {
  const variants: string[] = [
    `🚨 *Últimas horas do seu teste grátis!*\n\n` +
      `Seu período promocional está acabando.\n` +
      `Se gostou da praticidade no WhatsApp, essa é a hora de garantir continuidade.\n\n` +
      `Responda: *quero contratar agora*`,

    `⏳ *Fase final do seu trial!*\n\n` +
      `Faltam poucas horas para o encerramento do acesso promocional.\n` +
      `Ative seu plano agora para não perder o ritmo.\n\n` +
      `Responda: *quero manter meu acesso*`,

    `⚡ *Aviso importante:* seu teste está terminando.\n\n` +
      `Garanta sua assinatura agora e continue usando tudo sem pausas.\n` +
      `Ativar antes do fim evita retrabalho depois.\n\n` +
      `Responda: *quero assinar agora*`,

    `🎯 *Momento de decisão:* últimas horas de trial.\n\n` +
      `Se o sistema já te ajudou nesses dias, vale consolidar isso com o plano ideal.\n` +
      `Seu próximo passo pode ser agora.\n\n` +
      `Responda: *quero contratar*`,

    `🔔 *Seu acesso promocional está quase no fim.*\n\n` +
      `Não deixe para depois: ative seu plano e siga com atendimento completo no WhatsApp.\n\n` +
      `Responda: *quero continuar*`,
  ];

  return variants[pickVariant(`${phone}:60h`, variants.length)] || variants[0];
}

// ─── Processar lembretes pendentes ────────────────────────────────────────────
export async function processReminders(): Promise<{ sent: number; failed: number }> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  logger.info("[Reminders] Verificando lembretes para hoje...");

  const pending = await prisma.reminderJob.findMany({
    where: {
      status: "PENDING",
      scheduledFor: { gte: todayStart, lte: todayEnd },
    },
    include: {
      transaction: true,
    },
  });

  logger.info(`[Reminders] ${pending.length} lembrete(s) para processar`);

  let sent = 0;
  let failed = 0;

  for (const reminder of pending) {
    const t = reminder.transaction;

    // Pula se a transação já foi paga
    if (t.status === "PAGO" || t.status === "CANCELADO") {
      await prisma.reminderJob.update({
        where: { id: reminder.id },
        data: { status: "SKIPPED" },
      });
      continue;
    }

    let message = "";

    if (reminder.reminderType === "THREE_DAYS_BEFORE") {
      message =
        `⏰ *Lembrete — Conta a vencer em 3 dias!*\n\n` +
        `📋 *${t.tipo}*\n` +
        `💰 Valor: ${formatCurrency(t.valor)}\n` +
        `📅 Vencimento: ${formatDate(t.vencimento)}\n` +
        `📂 Categoria: ${t.categoria}\n\n` +
        `_Para marcar como pago: *paguei #${t.id}*_`;
    } else {
      message =
        `🔔 *HOJE É O DIA DO VENCIMENTO!*\n\n` +
        `📋 *${t.tipo}*\n` +
        `💰 Valor: ${formatCurrency(t.valor)}\n` +
        `📅 Vencimento: ${formatDate(t.vencimento)}\n` +
        `📂 Categoria: ${t.categoria}\n\n` +
        `_Para marcar como pago: *paguei #${t.id}*_`;
    }

    const ok = await sendMessage(reminder.userPhone, message);

    await prisma.reminderJob.update({
      where: { id: reminder.id },
      data: {
        status: ok ? "SENT" : "FAILED",
        sentAt: ok ? new Date() : undefined,
      },
    });

    if (ok) {
      sent++;
      logger.info(`[Reminders] Lembrete enviado para ${reminder.userPhone} — ${t.tipo}`);
    } else {
      failed++;
      logger.warn(`[Reminders] Falha ao enviar lembrete para ${reminder.userPhone}`);
    }
  }

  // Marcar transações vencidas
  await prisma.financialTransaction.updateMany({
    where: {
      status: "PENDENTE",
      vencimento: { lt: todayStart },
    },
    data: { status: "VENCIDO" },
  });

  return { sent, failed };
}

// ─── Promoção de trial (3 dias grátis) ───────────────────────────────────────
export async function processTrialPromotions(): Promise<{ sent: number; expired: number; failed: number }> {
  const now = new Date();
  const clients = await prisma.clientProfile.findMany({
    where: {
      status: "ACTIVE",
      trialStartedAt: { not: null },
      trialEndsAt: { not: null },
    },
    include: {
      subscription: true,
    },
  });

  if (clients.length === 0) {
    return { sent: 0, expired: 0, failed: 0 };
  }

  const planPrices = await prisma.subscriptionPlan.findMany({
    select: { plan: true, priceMonthly: true, displayName: true },
  });
  const priceByPlan = new Map(planPrices.map((p) => [p.plan, Number(p.priceMonthly)]));

  let sent = 0;
  let expired = 0;
  let failed = 0;

  for (const client of clients) {
    const trialStartedAt = client.trialStartedAt;
    const trialEndsAt = client.trialEndsAt;
    if (!trialStartedAt || !trialEndsAt) continue;

    const elapsedHours = (now.getTime() - trialStartedAt.getTime()) / (1000 * 60 * 60);
    const currentPrice = priceByPlan.get(client.plan) ?? Number(client.subscription?.priceMonthly ?? 0);
    const currentPriceStr = Number(currentPrice).toFixed(2).replace(".", ",");

    if (elapsedHours >= 48 && !client.trialPromo48hSentAt && now < trialEndsAt) {
      const ok = await sendMessage(client.phone, build48hTrialMessage(client.phone, String(client.plan), currentPriceStr));

      if (ok) {
        sent += 1;
        await prisma.clientProfile.update({
          where: { id: client.id },
          data: { trialPromo48hSentAt: now },
        });
      } else {
        failed += 1;
      }
    }

    if (elapsedHours >= 60 && !client.trialPromo60hSentAt && now < trialEndsAt) {
      const ok = await sendMessage(client.phone, build60hTrialMessage(client.phone));

      if (ok) {
        sent += 1;
        await prisma.clientProfile.update({
          where: { id: client.id },
          data: { trialPromo60hSentAt: now },
        });
      } else {
        failed += 1;
      }
    }

    if (now >= trialEndsAt && !client.trialExpiredNotifiedAt) {
      const ok = await sendMessage(
        client.phone,
        `⌛ *Seu teste grátis encerrou.*\n\n` +
          `Para continuar com acesso completo, escolha seu plano ideal agora.\n` +
          `Responda: *quero assinar* e eu te ajudo a concluir rapidinho.`,
      );

      await prisma.clientProfile.update({
        where: { id: client.id },
        data: {
          status: "INACTIVE",
          trialExpiredNotifiedAt: now,
        },
      });

      if (client.subscription) {
        await prisma.clientSubscription.update({
          where: { id: client.subscription.id },
          data: {
            status: "PAST_DUE",
          },
        });
      }

      if (ok) {
        expired += 1;
      } else {
        failed += 1;
      }
    }
  }

  logger.info(`[TrialPromo] Processado: enviados=${sent}, expirados=${expired}, falhas=${failed}`);
  return { sent, expired, failed };
}

// ─── Iniciar cron job ─────────────────────────────────────────────────────────
export function startReminderCron() {
  // Executa todo dia às 09:00
  const job = cron.schedule("0 9 * * *", async () => {
    logger.info("[Reminders] Cron job iniciado");
    try {
      const result = await processReminders();
      logger.info(`[Reminders] Concluído: ${result.sent} enviados, ${result.failed} falhas`);
    } catch (err) {
      logger.error("[Reminders] Erro no cron job:", err);
    }
  }, {
    timezone: "America/Sao_Paulo",
  });

  const weeklyReportJob = cron.schedule("0 7 * * 1", async () => {
    logger.info("[Reports] Cron semanal iniciado");
    try {
      const result = await processWeeklyFinancialReports();
      logger.info(`[Reports] Concluído: ${result.sent} enviados, ${result.failed} falhas`);
    } catch (err) {
      logger.error("[Reports] Erro no cron semanal:", err);
    }
  }, {
    timezone: "America/Sao_Paulo",
  });

  const trialPromoJob = cron.schedule("0 * * * *", async () => {
    logger.info("[TrialPromo] Cron promocional iniciado");
    try {
      await processTrialPromotions();
    } catch (err) {
      logger.error("[TrialPromo] Erro no cron promocional:", err);
    }
  }, {
    timezone: "America/Sao_Paulo",
  });

  logger.info("[Reminders] Cron job agendado para 09:00 (Horário de Brasília)");
  logger.info("[Reports] Cron semanal agendado para segunda-feira às 07:00 (Horário de Brasília)");
  logger.info("[TrialPromo] Cron promocional agendado para cada hora cheia");
  return { job, weeklyReportJob, trialPromoJob };
}
