import { CronJob } from "cron";
import { prisma } from "../config/prisma";
import infinityPayService from "./infinityPayService";
import { sendMessage } from "./whatsappService";
import { sendEmail } from "./emailService";
import { logger } from "../utils/logger";

/**
 * Serviço de Cobrança Recorrente
 * Executa a cada dia às 02:00 (Horário de Brasília)
 */

class RecurringBillingService {
  private cronJob: CronJob | null = null;

  private addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  /**
   * Iniciar cron job de cobrança recorrente
   */
  start() {
    // Executar todos os dias às 02:00 (horário de Brasília = UTC-3)
    this.cronJob = new CronJob(
      "0 2 * * *", // Todos os dias às 02:00 UTC
      () => this.processPendingBillings(),
      null,
      true,
      "America/Sao_Paulo"
    );

    logger.info("✅ [Recurring Billing] Cron job agendado para 02:00 (Horário de Brasília)");
  }

  /**
   * Parar o cron job
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      logger.info("Recurring billing cron job stopped");
    }
  }

  /**
   * Processar cobranças pendentes
   */
  private async processPendingBillings() {
    try {
      logger.info("[Recurring Billing] Iniciando processamento de cobranças recorrentes");

      await this.processUpcomingRenewalReminders();

      // Encontrar subscrições ativas com data de cobrança hoje
      const subscriptionsToCharge = await prisma.clientSubscription.findMany({
        where: {
          status: "ACTIVE",
          autoRenew: true,
          nextBillingDate: {
            lte: new Date(), // Data de cobrança <= hoje
          },
        },
        include: {
          client: true,
        },
      });

      logger.info(`[Recurring Billing] ${subscriptionsToCharge.length} subscrições para cobrar`);

      for (const subscription of subscriptionsToCharge) {
        await this.chargeSubscription(subscription);
      }

      logger.info("[Recurring Billing] Processamento concluído");
    } catch (error) {
      logger.error("[Recurring Billing] Erro ao processar cobranças:", error);
    }
  }

  /**
   * Enviar automaticamente link de renovação faltando 3 dias para vencer
   */
  private async processUpcomingRenewalReminders(): Promise<void> {
    const now = new Date();
    const targetStart = new Date(now);
    targetStart.setDate(targetStart.getDate() + 3);
    targetStart.setHours(0, 0, 0, 0);

    const targetEnd = new Date(targetStart);
    targetEnd.setHours(23, 59, 59, 999);

    const subs = await prisma.clientSubscription.findMany({
      where: {
        status: "ACTIVE",
        autoRenew: true,
        nextBillingDate: {
          gte: targetStart,
          lte: targetEnd,
        },
      },
      include: {
        client: true,
      },
    });

    logger.info(`[Recurring Billing] ${subs.length} subscrição(ões) com vencimento em 3 dias`);

    for (const sub of subs) {
      await this.sendRenewalReminderLink(sub, targetStart);
    }
  }

  /**
   * Efetuar cobrança de uma subscrição
   */
  private async chargeSubscription(subscription: any): Promise<void> {
    try {
      const { id: subscriptionId, client, priceMonthly, infinityPayCustomerId } = subscription;

      logger.info(`[Recurring Billing] Cobrando subscrição ${subscriptionId} - Cliente: ${client.fullName}`);

      // Obter plano
      const plan = await prisma.subscriptionPlan.findUnique({
        where: { plan: subscription.plan },
      });

      if (!plan) {
        logger.error(`[Recurring Billing] Plano ${subscription.plan} não encontrado`);
        return;
      }

      // Criar cobrança na InfinityPay
      const chargeResult = await infinityPayService.createCharge({
        amount: priceMonthly,
        currency: "BRL",
        customer_email: client.email || client.phone,
        customer_name: client.fullName,
        customer_cpf: client.cpf,
        description: `${plan.displayName} Plan - Recorrência - ozapteconta`,
        payment_method: "credit_card", // Usar cartão para recorrência
        auto_capture: true,
        metadata: {
          subscription_id: subscriptionId,
          client_id: client.id,
          plan: subscription.plan,
          recurring: true,
        },
      });

      if (!chargeResult.success) {
        logger.error(`[Recurring Billing] Erro ao criar cobrança: ${chargeResult.error}`);

        // Registrar tentativa falha
        const payment = await prisma.payment.create({
          data: {
            subscriptionId,
            amount: priceMonthly,
            status: "FAILED",
            failureReason: chargeResult.error,
            description: `${plan.displayName} Plan - Recorrência`,
          },
        });

        // Agendar retry em 3 dias
        await prisma.clientSubscription.update({
          where: { id: subscriptionId },
          data: {
            nextBillingDate: this.addDays(new Date(), 3),
          },
        });

        // Enviar notificação via WhatsApp
        await this.sendPaymentFailedNotification(client.phone, plan.displayName);

        return;
      }

      // Criar registro de pagamento
      const payment = await prisma.payment.create({
        data: {
          subscriptionId,
          infinityPayTransactionId: chargeResult.data?.id,
          amount: priceMonthly,
          status: "PROCESSING",
          description: `${plan.displayName} Plan - Recorrência`,
        },
      });

      // Log
      await prisma.paymentLog.create({
        data: {
          paymentId: payment.id,
          action: "initiated",
          details: chargeResult.data,
        },
      });

      logger.info(`[Recurring Billing] Cobrança criada para subscrição ${subscriptionId}`);

      // Enviar notificação via WhatsApp
      await this.sendPaymentChargeNotification(
        client.phone,
        plan.displayName,
        priceMonthly,
        chargeResult.data?.checkout_url
      );
    } catch (error) {
      logger.error(`[Recurring Billing] Erro ao cobrar subscrição:`, error);
    }
  }

  private async sendRenewalReminderLink(subscription: any, targetDate: Date): Promise<void> {
    const dayKey = targetDate.toISOString().slice(0, 10);
    const actionKey = `renewal_link_sent_3d_subscription_${subscription.id}_${dayKey}`;

    const alreadySent = await prisma.paymentGatewayLog.findFirst({
      where: {
        provider: "infinitypay",
        action: actionKey,
      },
    });

    if (alreadySent) {
      return;
    }

    const plan = await prisma.subscriptionPlan.findUnique({
      where: { plan: subscription.plan },
    });

    if (!plan) {
      logger.warn(`[Recurring Billing] Plano ${subscription.plan} não encontrado para lembrete de renovação`);
      return;
    }

    const linkResult = await infinityPayService.createPaymentLink({
      amount: Number(subscription.priceMonthly),
      description: `${plan.displayName} - Renovação ozapteconta`,
      customer_email: subscription.client.email || subscription.client.phone,
      customer_name: subscription.client.fullName,
      customer_cpf: subscription.client.cpf || undefined,
      customer_phone: subscription.client.phone,
      payment_methods: ["pix", "credit_card", "boleto"],
      expires_in: 86400 * 3,
      metadata: {
        subscription_id: subscription.id,
        client_id: subscription.client.id,
        plan: subscription.plan,
        renewal_reminder_3_days: true,
      },
    });

    if (!linkResult.success) {
      await prisma.paymentGatewayLog.create({
        data: {
          provider: "infinitypay",
          action: `renewal_link_failed_3d_subscription_${subscription.id}_${dayKey}`,
          responseData: { error: linkResult.error || "unknown" },
        },
      });
      logger.warn(`[Recurring Billing] Falha ao gerar link de renovação para subscrição ${subscription.id}: ${linkResult.error}`);
      return;
    }

    const checkoutUrl = linkResult.data?.resolved_url || linkResult.data?.url || linkResult.data?.checkout_url || null;
    const nextBilling = subscription.nextBillingDate
      ? new Date(subscription.nextBillingDate).toLocaleDateString("pt-BR")
      : "em breve";
    const amount = Number(subscription.priceMonthly).toFixed(2).replace(".", ",");

    const message =
      `🔔 *Sua assinatura vence em 3 dias*\n\n` +
      `Plano: *${plan.displayName}*\n` +
      `Valor: *R$ ${amount}*\n` +
      `Vencimento: *${nextBilling}*\n\n` +
      (checkoutUrl ? `💳 Pague aqui para renovar por mais 30 dias:\n${checkoutUrl}\n\n` : "") +
      `Após a confirmação, seu acesso permanece liberado automaticamente.`;

    await sendMessage(subscription.client.phone, message);

    if (subscription.client.email) {
      await sendEmail({
        to: subscription.client.email,
        subject: `Renovação em 3 dias - ${plan.displayName}`,
        text:
          `Olá, ${subscription.client.fullName}!\n\n` +
          `Sua assinatura vence em 3 dias.\n` +
          `Plano: ${plan.displayName}\n` +
          `Valor: R$ ${amount}\n` +
          `Vencimento: ${nextBilling}\n\n` +
          (checkoutUrl ? `Pague aqui para renovar por mais 30 dias: ${checkoutUrl}\n\n` : "") +
          `Após a confirmação, seu acesso permanece liberado automaticamente.`,
        html:
          `<p>Olá, ${subscription.client.fullName}!</p>` +
          `<p>Sua assinatura vence em 3 dias.</p>` +
          `<p><strong>Plano:</strong> ${plan.displayName}<br/>` +
          `<strong>Valor:</strong> R$ ${amount}<br/>` +
          `<strong>Vencimento:</strong> ${nextBilling}</p>` +
          (checkoutUrl ? `<p><a href="${checkoutUrl}">Pague aqui para renovar por mais 30 dias</a></p>` : "") +
          `<p>Após a confirmação, seu acesso permanece liberado automaticamente.</p>`,
      });
    }

    await prisma.paymentGatewayLog.create({
      data: {
        provider: "infinitypay",
        action: actionKey,
        requestData: {
          subscriptionId: subscription.id,
          clientId: subscription.client.id,
          checkoutUrl,
        },
      },
    });
  }

  /**
   * Enviar notificação de cobrança via WhatsApp
   */
  private async sendPaymentChargeNotification(
    phone: string,
    planName: string,
    amount: number,
    checkoutUrl?: string
  ): Promise<void> {
    try {
      const message = `💳 *Cobrança Mensal - ozapteconta*\n\nPlano: *${planName}*\nValor: *R$ ${amount.toFixed(2)}*\n\n${
        checkoutUrl ? `Pagar: ${checkoutUrl}\n\n` : ""
      }Sua subscrição foi renovada com sucesso! ✅`;

      await sendMessage(phone, message);
    } catch (error) {
      logger.error("Erro ao enviar notificação de cobrança:", error);
    }
  }

  /**
   * Enviar notificação de falha de pagamento
   */
  private async sendPaymentFailedNotification(phone: string, planName: string): Promise<void> {
    try {
      const message = `⚠️ *Falha na Cobrança - ozapteconta*\n\nPlano: *${planName}*\n\nHouve um erro ao processar seu pagamento. Tentaremos novamente em 3 dias.\n\nSe o problema persistir, entre em contato com nosso suporte.`;

      await sendMessage(phone, message);
    } catch (error) {
      logger.error("Erro ao enviar notificação de falha:", error);
    }
  }

  /**
   * Enviar link de pagamento inicial para novo cliente
   */
  async sendInitialPaymentLink(
    clientPhone: string,
    clientName: string,
    planName: string,
    amount: number,
    checkoutUrl: string
  ): Promise<void> {
    try {
      const message = `👋 *Bem-vindo ao ozapteconta, ${clientName}!*\n\n📋 Plano Selecionado: *${planName}*\n💰 Valor Mensal: *R$ ${amount.toFixed(
        2
      )}*\n\n💳 *Clique abaixo para concluir seu pagamento:*\n${checkoutUrl}\n\nApós a confirmação, sua conta estará ativa e pronta para usar! 🚀`;

      await sendMessage(clientPhone, message);
      logger.info(`Payment link enviado para ${clientPhone}`);
    } catch (error) {
      logger.error("Erro ao enviar link de pagamento:", error);
    }
  }
}

export default new RecurringBillingService();
