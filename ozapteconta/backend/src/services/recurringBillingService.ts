import { CronJob } from "cron";
import { ClientPlan } from "@prisma/client";
import { prisma } from "../config/prisma";
import infinityPayService from "./infinityPayService";
import { sendMessage } from "./whatsappService";
import { sendEmail } from "./emailService";
import { logger } from "../utils/logger";
import {
  BILLING_CYCLE_DAYS,
  RENEWAL_REMINDER_DAYS_BEFORE,
  buildBillingCycleSnapshot,
  formatDatePtBr,
  isRenewalDueOrOverdue,
  isRenewalReminderWindow,
  resolveCycleAnchor,
  startOfLocalDay,
  syncAllActiveSubscriptionBillingDates,
  type BillingCycleSnapshot,
} from "./subscriptionBillingCycleService";
import {
  suspendSubscriptionIfOverdue,
  syncAllSubscriptionSuspensions,
} from "./subscriptionAccessService";

type RenewalLinkReason = "renewal_reminder" | "renewal_due_day" | "renewal_overdue";

/**
 * Cobrança recorrente via link InfinitePay.
 * Cron: 02:00 e 09:00 (Brasília) — detecta vencimento, gera link e envia WhatsApp/e-mail.
 */
class RecurringBillingService {
  private cronJobs: CronJob[] = [];

  private async getPixKey(): Promise<string> {
    try {
      const setting = await prisma.systemSetting.findUnique({ where: { key: "pix_key" } });
      return setting?.value || "Entre em contato com o suporte para obter a chave PIX";
    } catch {
      return "Entre em contato com o suporte para obter a chave PIX";
    }
  }

  start() {
    const schedules = ["0 2 * * *", "0 9 * * *"];
    for (const schedule of schedules) {
      const job = new CronJob(
        schedule,
        () => {
          void this.processPendingBillings();
        },
        null,
        true,
        "America/Sao_Paulo",
      );
      this.cronJobs.push(job);
    }

    logger.info("✅ [Recurring Billing] Cron agendado às 02:00 e 09:00 (Horário de Brasília)");
  }

  stop() {
    for (const job of this.cronJobs) {
      job.stop();
    }
    this.cronJobs = [];
    logger.info("Recurring billing cron jobs stopped");
  }

  /** Execução manual (painel admin ou script). */
  async runBillingNow(): Promise<{ processed: number; linksSent: number; errors: number }> {
    return this.processPendingBillings();
  }

  private async processPendingBillings(): Promise<{ processed: number; linksSent: number; errors: number }> {
    const stats = { processed: 0, linksSent: 0, errors: 0 };

    try {
      logger.info("[Recurring Billing] Iniciando verificação de renovações");

      const configured = await infinityPayService.isConfigured();
      if (!configured) {
        logger.error("[Recurring Billing] InfinitePay não configurado — configure Merchant Key no painel");
        return stats;
      }

      const syncedCount = await syncAllActiveSubscriptionBillingDates();
      logger.info(`[Recurring Billing] ${syncedCount} assinatura(ões) com datas sincronizadas`);

      const subscriptions = await prisma.clientSubscription.findMany({
        where: {
          status: { in: ["ACTIVE", "SUSPENDED", "PAST_DUE"] },
          autoRenew: true,
        },
        include: { client: true },
      });

      logger.info(`[Recurring Billing] ${subscriptions.length} assinatura(ões) no ciclo de renovação`);

      for (const subscription of subscriptions) {
        stats.processed += 1;
        const sent = await this.processSubscriptionBillingCycle(subscription);
        if (sent) stats.linksSent += 1;
      }

      const suspendedCount = await syncAllSubscriptionSuspensions();
      if (suspendedCount > 0) {
        logger.info(`[Recurring Billing] ${suspendedCount} assinatura(ões) suspensa(s) por inadimplência`);
      }

      logger.info(
        `[Recurring Billing] Concluído — processadas=${stats.processed} links=${stats.linksSent}`,
      );
    } catch (error) {
      stats.errors += 1;
      logger.error("[Recurring Billing] Erro ao processar cobranças:", error);
    }

    return stats;
  }

  /** @returns true se link enviado com sucesso */
  private async processSubscriptionBillingCycle(subscription: any): Promise<boolean> {
    const anchor = await resolveCycleAnchor(subscription, subscription.client);
    if (!anchor) {
      return false;
    }

    const snapshot = buildBillingCycleSnapshot(anchor);

    logger.info(
      `[Recurring Billing] Sub #${subscription.id} dia ${snapshot.cycleDay}/${BILLING_CYCLE_DAYS} fase=${snapshot.phase} venc=${snapshot.renewalDueDate?.toISOString().slice(0, 10) ?? "?"} diasRestantes=${snapshot.daysUntilRenewal}`,
    );

    if (isRenewalReminderWindow(snapshot)) {
      return this.sendRenewalPaymentLink(subscription, snapshot, "renewal_reminder");
    }

    if (isRenewalDueOrOverdue(snapshot)) {
      const sent = await this.sendRenewalPaymentLink(
        subscription,
        snapshot,
        snapshot.daysUntilRenewal === 0 ? "renewal_due_day" : "renewal_overdue",
      );
      await suspendSubscriptionIfOverdue({
        ...subscription,
        client: subscription.client,
      });
      return sent;
    }

    return false;
  }

  private renewalDueKey(snapshot: BillingCycleSnapshot): string {
    return snapshot.renewalDueDate?.toISOString().slice(0, 10) ?? "unknown";
  }

  private async wasBillingNoticeSent(actionKey: string, todayOnly = false): Promise<boolean> {
    const startOfDay = startOfLocalDay(new Date());

    const existing = await prisma.paymentGatewayLog.findFirst({
      where: {
        provider: "infinitypay",
        action: actionKey,
        ...(todayOnly ? { createdAt: { gte: startOfDay } } : {}),
      },
    });

    return Boolean(existing);
  }

  private async loadPlan(planCode: ClientPlan | string) {
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { plan: planCode as ClientPlan },
    });

    if (!plan) {
      logger.warn(`[Recurring Billing] Plano ${planCode} não encontrado`);
    }

    return plan;
  }

  private async sendRenewalPaymentLink(
    subscription: any,
    snapshot: BillingCycleSnapshot,
    reason: RenewalLinkReason,
    options?: { force?: boolean },
  ): Promise<boolean> {
    const dueKey = this.renewalDueKey(snapshot);
    const todayKey = startOfLocalDay(new Date()).toISOString().slice(0, 10);

    let actionKey = `renewal_${reason}_subscription_${subscription.id}_${dueKey}`;
    let todayOnly = false;

    if (reason === "renewal_overdue") {
      actionKey = `renewal_overdue_subscription_${subscription.id}_${todayKey}`;
      todayOnly = true;
    }

    if (options?.force) {
      actionKey = `renewal_manual_subscription_${subscription.id}_${Date.now()}`;
      todayOnly = false;
    }

    if (!options?.force && await this.wasBillingNoticeSent(actionKey, todayOnly)) {
      return false;
    }

    const plan = await this.loadPlan(subscription.plan);
    if (!plan) return false;

    const monthlyAmount = Number(subscription.priceMonthly);
    if (!Number.isFinite(monthlyAmount) || monthlyAmount <= 0) {
      logger.error(
        `[Recurring Billing] Valor mensal inválido na sub #${subscription.id}: ${subscription.priceMonthly}`,
      );
      return false;
    }

    const linkResult = await infinityPayService.createPaymentLink({
      amount: monthlyAmount,
      description: `${plan.displayName} - Renovação ozapteconta`,
      customer_email: subscription.client.email || `${subscription.client.phone}@ozapteconta.app`,
      customer_name: subscription.client.fullName,
      customer_cpf: subscription.client.cpf || undefined,
      customer_phone: subscription.client.phone,
      payment_methods: ["pix", "credit_card", "boleto"],
      expires_in: 86400 * 7,
      metadata: {
        subscription_id: subscription.id,
        client_id: subscription.client.id,
        plan: subscription.plan,
        renewal_reason: reason,
        order_nsu: `renewal-${subscription.id}-${Date.now()}`,
      },
    });

    if (!linkResult.success) {
      logger.warn(
        `[Recurring Billing] Falha ao gerar link sub #${subscription.id}: ${linkResult.error}`,
      );
      await prisma.paymentGatewayLog.create({
        data: {
          provider: "infinitypay",
          action: `${actionKey}_link_failed`,
          responseData: { error: linkResult.error || "unknown", reason },
        },
      });
      await this.sendPaymentFailedNotification(
        subscription.client.phone,
        plan.displayName,
        monthlyAmount,
        linkResult.error || "renewal_link_unavailable",
      );
      return false;
    }

    const checkoutUrl =
      linkResult.data?.resolved_url ||
      linkResult.data?.url ||
      linkResult.data?.checkout_url ||
      linkResult.data?.link ||
      null;

    if (!checkoutUrl) {
      await prisma.paymentGatewayLog.create({
        data: {
          provider: "infinitypay",
          action: `${actionKey}_empty_url`,
          responseData: linkResult.data ?? { error: "empty_url" },
        },
      });
      await this.sendPaymentFailedNotification(
        subscription.client.phone,
        plan.displayName,
        monthlyAmount,
        "checkout_url_empty",
      );
      return false;
    }

    const amountLabel = monthlyAmount.toFixed(2).replace(".", ",");
    const dueLabel = snapshot.renewalDueDate ? formatDatePtBr(snapshot.renewalDueDate) : "hoje";
    const daysLeft = snapshot.daysUntilRenewal ?? 0;

    let intro = `🔔 *Renovação do plano ozapteconta*\n\n`;
    if (reason === "renewal_reminder") {
      intro = `🔔 *Sua assinatura vence em ${daysLeft} dia(s)*\n\n`;
    } else if (reason === "renewal_due_day") {
      intro = `📅 *Seu plano vence hoje*\n\n🔒 *Sem pagamento, seu sistema será bloqueado.*\n\n`;
    } else {
      intro = `⏰ *Renovação em atraso*\n\n🔒 *Seu sistema está bloqueado até o pagamento.*\n\n`;
    }

    const message =
      `${intro}` +
      `Plano: *${plan.displayName}*\n` +
      `Valor: *R$ ${amountLabel}*\n` +
      `Vencimento: *${dueLabel}*\n\n` +
      `💳 *Pague aqui para renovar por mais ${BILLING_CYCLE_DAYS} dias:*\n${checkoutUrl}\n\n` +
      `Após a confirmação, seu acesso continua liberado automaticamente.`;

    await sendMessage(subscription.client.phone, message);

    if (subscription.client.email) {
      await sendEmail({
        to: subscription.client.email,
        subject: `Renovação ozapteconta - ${plan.displayName}`,
        text:
          `Olá, ${subscription.client.fullName}!\n\n` +
          `Plano: ${plan.displayName}\n` +
          `Valor: R$ ${amountLabel}\n` +
          `Vencimento: ${dueLabel}\n\n` +
          `Link de pagamento: ${checkoutUrl}\n\n` +
          `Após a confirmação, seu ciclo segue por mais ${BILLING_CYCLE_DAYS} dias.`,
      });
    }

    await prisma.paymentGatewayLog.create({
      data: {
        provider: "infinitypay",
        action: actionKey,
        requestData: {
          subscriptionId: subscription.id,
          clientId: subscription.client.id,
          reason,
          checkoutUrl,
          cycleDay: snapshot.cycleDay,
          daysUntilRenewal: snapshot.daysUntilRenewal,
        },
      },
    });

    logger.info(
      `[Recurring Billing] Link enviado sub #${subscription.id} (${reason}) → ${subscription.client.phone}`,
    );

    return true;
  }

  private async sendPaymentFailedNotification(
    phone: string,
    planName: string,
    amount: number,
    failureReason?: string,
  ): Promise<void> {
    try {
      const amountStr = amount.toFixed(2).replace(".", ",");
      const pixKey = await this.getPixKey();
      const todayKey = startOfLocalDay(new Date()).toISOString().slice(0, 10);
      const dedupeKey = `renewal_failed_${phone.replace(/\D/g, "").slice(-11)}_${todayKey}`;

      if (await this.wasBillingNoticeSent(dedupeKey, true)) {
        return;
      }

      logger.error(
        `[Recurring Billing] Link indisponível — plano ${planName} para ${phone}: ${failureReason || "unknown"}`,
      );

      const message =
        `⚠️ *Renovação do plano ozapteconta*\n\n` +
        `Plano: *${planName}*\n` +
        `Valor: *R$ ${amountStr}*\n\n` +
        `Não conseguimos gerar o link automático agora (${failureReason || "erro temporário"}).\n\n` +
        `Para manter seu acesso, pague via PIX:\n` +
        `📲 *Chave PIX:* ${pixKey}\n\n` +
        `Envie o comprovante aqui ou aguarde — tentaremos enviar um novo link amanhã.\n\n` +
        `Dúvidas? Fale com nosso suporte.`;

      await sendMessage(phone, message);

      await prisma.paymentGatewayLog.create({
        data: {
          provider: "infinitypay",
          action: dedupeKey,
          responseData: { failureReason: failureReason || null, planName, amount },
        },
      });
    } catch (error) {
      logger.error("Erro ao enviar notificação de falha:", error);
    }
  }

  async sendInitialPaymentLink(
    clientPhone: string,
    clientName: string,
    planName: string,
    amount: number,
    checkoutUrl: string,
  ): Promise<void> {
    try {
      const message = `👋 *Bem-vindo ao ozapteconta, ${clientName}!*\n\n📋 Plano Selecionado: *${planName}*\n💰 Valor Mensal: *R$ ${amount.toFixed(
        2,
      )}*\n\n💳 *Clique abaixo para concluir seu pagamento:*\n${checkoutUrl}\n\nApós a confirmação, sua conta estará ativa e pronta para usar! 🚀`;

      await sendMessage(clientPhone, message);
      logger.info(`Payment link enviado para ${clientPhone}`);
    } catch (error) {
      logger.error("Erro ao enviar link de pagamento:", error);
    }
  }

  /** Envio manual/teste de link de renovação para um cliente cadastrado. */
  async sendRenewalLinkToClient(clientId: number): Promise<{
    success: boolean;
    checkoutUrl?: string;
    whatsappSent?: boolean;
    emailSent?: boolean;
    error?: string;
  }> {
    const subscription = await prisma.clientSubscription.findFirst({
      where: { clientId },
      include: { client: true },
    });

    if (!subscription) {
      return { success: false, error: "Assinatura não encontrada" };
    }

    if (!subscription.client?.phone) {
      return { success: false, error: "Cliente sem telefone cadastrado" };
    }

    const anchor = await resolveCycleAnchor(subscription, subscription.client);
    const snapshot = anchor
      ? buildBillingCycleSnapshot(anchor)
      : buildBillingCycleSnapshot(
          startOfLocalDay(subscription.client.activatedAt || subscription.createdAt || new Date()),
        );

    const sent = await this.sendRenewalPaymentLink(subscription, snapshot, "renewal_due_day", {
      force: true,
    });
    if (!sent) {
      return { success: false, error: "Falha ao gerar ou enviar link de renovação" };
    }

    const lastLog = await prisma.paymentGatewayLog.findFirst({
      where: {
        provider: "infinitypay",
        action: { contains: `subscription_${subscription.id}` },
      },
      orderBy: { createdAt: "desc" },
    });

    const checkoutUrl =
      (lastLog?.requestData as { checkoutUrl?: string } | null)?.checkoutUrl ?? undefined;

    return {
      success: true,
      checkoutUrl,
      whatsappSent: true,
      emailSent: Boolean(subscription.client.email),
    };
  }
}

export default new RecurringBillingService();
