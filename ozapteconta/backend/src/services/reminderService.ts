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

  logger.info("[Reminders] Cron job agendado para 09:00 (Horário de Brasília)");
  logger.info("[Reports] Cron semanal agendado para segunda-feira às 07:00 (Horário de Brasília)");
  return { job, weeklyReportJob };
}
