import cron from "node-cron";
import { prisma } from "../config/prisma";
import { logger } from "../utils/logger";
import { sendMessage, formatCurrency, formatDate } from "./whatsappService";
import { processWeeklyFinancialReports } from "./financialReportService";

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
      const ok = await sendMessage(
        client.phone,
        `⏰ *Seu teste grátis está em andamento!*\n\n` +
          `Você já está há *48 horas* testando o ozapteconta.\n` +
          `Até agora, sua conta está com o plano *${client.plan}* ativo no trial.\n\n` +
          `🔥 Para manter tudo funcionando sem interrupção após o teste, garanta já seu plano ideal.\n` +
          `💳 Valor do plano atual: *R$ ${currentPriceStr}/mês*\n\n` +
          `Responda aqui: *quero assinar meu plano agora*`,
      );

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
      const ok = await sendMessage(
        client.phone,
        `🚨 *Últimas horas do seu teste grátis!*\n\n` +
          `Seu período promocional está acabando.\n` +
          `Se você gostou da praticidade no WhatsApp, essa é a hora de garantir continuidade.\n\n` +
          `✅ Organize finanças\n` +
          `✅ Ganhe velocidade nas decisões\n` +
          `✅ Tenha suporte e inteligência no dia a dia\n\n` +
          `Responda: *quero contratar agora*`,
      );

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
