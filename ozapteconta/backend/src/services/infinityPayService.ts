import axios, { AxiosInstance } from "axios";
import { logger } from "../utils/logger";
import { prisma } from "../config/prisma";
import { applyBillingCycleFromPayment } from "./subscriptionBillingCycleService";
import { restoreSubscriptionAfterPayment } from "./subscriptionAccessService";
import { normalizePhoneToE164 } from "./whatsappHealthService";

// ─── Types InfinityPay ──────────────────────────────────────────────────────
export interface InfinityPayCustomer {
  id?: string;
  email: string;
  name: string;
  phone?: string;
  cpf?: string;
}

export interface InfinityPayCharge {
  amount: number;
  currency: string;
  customer_email: string;
  customer_name: string;
  customer_cpf?: string;
  description: string;
  payment_method: "credit_card" | "debit_card" | "pix" | "boleto";
  installments?: number;
  auto_capture?: boolean;
  metadata?: Record<string, any>;
}

export interface InfinityPayPaymentLinkData {
  amount: number;                      // em reais (ex: 15.99)
  description: string;
  customer_email: string;
  customer_name: string;
  customer_cpf?: string;
  customer_phone?: string;
  payment_methods?: Array<"pix" | "credit_card" | "debit_card" | "boleto">;
  expires_in?: number;                 // segundos, padrão 86400 (24h)
  metadata?: Record<string, any>;
}

export interface InfinityPayResponse {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
}

export class InfinityPayService {
  private baseURL: string;

  constructor() {
    this.baseURL = this.resolveCheckoutBaseUrl(process.env.INFINITYPAY_API_URL);
  }

  private resolveCheckoutBaseUrl(raw?: string): string {
    const fallback = "https://api.checkout.infinitepay.io";
    const value = String(raw || "").trim();
    if (!value) return fallback;

    // Compatibilidade com configuração legada que apontava para api.infinitypay.io/v1.
    if (value.includes("api.infinitypay.io")) {
      return fallback;
    }

    return value.replace(/\/+$/, "");
  }

  // ─── Carrega credenciais dinamicamente (DB → env) ──────────────────────────
  private async getCredentials(): Promise<{ apiKey?: string; merchantKey: string } | null> {
    try {
      // Busca qualquer registro com merchantKey configurada (isEnabled não bloqueia o serviço)
      const dbConfig = await prisma.paymentGatewayConfig.findFirst({
        where: {
          provider: "infinitypay",
          infinityPayMerchantKey: { not: null },
        },
        orderBy: { updatedAt: "desc" },
      });

      if (dbConfig?.infinityPayMerchantKey) {
        return {
          apiKey: dbConfig.infinityPayApiKey || undefined,
          merchantKey: dbConfig.infinityPayMerchantKey,
        };
      }
    } catch (err) {
      logger.warn("[InfinityPay] Erro ao carregar credenciais do DB:", err);
    }

    // Fallback para variáveis de ambiente
    const apiKey = process.env.INFINITYPAY_API_KEY || "";
    const merchantKey = process.env.INFINITYPAY_MERCHANT_KEY || "";
    if (merchantKey) return { apiKey: apiKey || undefined, merchantKey };

    return null;
  }

  private buildAxios(apiKey: string | undefined, merchantKey: string): AxiosInstance {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(merchantKey ? { "X-Merchant-Key": merchantKey } : {}),
    };

    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const instance = axios.create({
      baseURL: this.baseURL,
      headers,
      timeout: 30000,
    });

    instance.interceptors.response.use(
      (response) => response,
      (error) => {
        const status = error.response?.status;
        const msg = error.response?.data?.message || error.message;
        logger.error(`[InfinityPay] API Error ${status}:`, msg, error.response?.data);
        return Promise.reject(error);
      }
    );

    return instance;
  }

  /** Retorna instância axios configurada ou null se não houver credenciais */
  private async api(): Promise<AxiosInstance | null> {
    const creds = await this.getCredentials();
    if (!creds) {
      logger.warn("[InfinityPay] Sem credenciais configuradas. Configure em Configurações > Gateway de Pagamento.");
      return null;
    }
    return this.buildAxios(creds.apiKey, creds.merchantKey);
  }

  // ─── Verificar se está configurado ────────────────────────────────────────
  async isConfigured(): Promise<boolean> {
    const creds = await this.getCredentials();
    return creds !== null;
  }

  /**
   * Criar link de pagamento (para enviar via WhatsApp ao cliente)
   * Retorna uma URL pública onde o cliente paga por PIX, cartão ou boleto.
   */
  async createPaymentLink(data: InfinityPayPaymentLinkData): Promise<InfinityPayResponse> {
    const creds = await this.getCredentials();
    if (!creds) {
      return {
        success: false,
        error: "InfinityPay não configurado. Acesse Configurações > Gateway de Pagamento e informe a Merchant Key.",
      };
    }

    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { success: false, error: `Valor inválido para link de pagamento: ${data.amount}` };
    }

    const http = this.buildAxios(creds.apiKey, creds.merchantKey);

    if (!creds.apiKey) {
      logger.info("[InfinityPay] Modo checkout: apenas Merchant Key (sem API Key) — suficiente para links de pagamento.");
    }

    const normalizedHandle = creds.merchantKey.replace(/^\$/, "").trim();
    if (!normalizedHandle) {
      return { success: false, error: "Handle da InfinitePay não informado (Merchant Key)." };
    }

    const amountInCents = Math.round(amount * 100);
    const orderNsu =
      String(data.metadata?.order_nsu || data.metadata?.subscription_id || data.metadata?.client_id || "") ||
      `ozapteconta-${Date.now()}`;

    const basePayload = {
      handle: normalizedHandle,
      items: [
        {
          quantity: 1,
          price: amountInCents,
          description: String(data.description || "ozapteconta").slice(0, 200),
        },
      ],
      order_nsu: orderNsu,
    };

    const customerEmail = String(data.customer_email || "").trim();
    const customerName = String(data.customer_name || "").trim();
    const customerPhone = data.customer_phone
      ? normalizePhoneToE164(String(data.customer_phone))
      : "";

    const payloads: Array<Record<string, unknown>> = [];

    if (customerName || customerEmail || customerPhone) {
      payloads.push({
        ...basePayload,
        customer: {
          ...(customerName ? { name: customerName } : {}),
          ...(customerEmail ? { email: customerEmail } : {}),
          ...(customerPhone ? { phone_number: customerPhone } : {}),
        },
      });
    }

    payloads.push(basePayload);

    let lastError = "Falha ao criar link InfinitePay";

    for (let attempt = 0; attempt < payloads.length; attempt += 1) {
      try {
        const response = await http.post("/links", payloads[attempt]);
        const linkData = response.data;
        const url = this.extractCheckoutUrl(linkData);

        if (!url) {
          lastError = "InfinitePay respondeu sem URL de checkout";
          logger.error("[InfinityPay] Resposta sem URL:", JSON.stringify(linkData)?.slice(0, 500));
          continue;
        }

        logger.info(`[InfinityPay] Payment link criado: ${linkData.id ?? orderNsu} → ${url}`);

        await prisma.paymentGatewayLog.create({
          data: {
            provider: "infinitypay",
            action: "payment_link_created",
            requestData: {
              orderNsu,
              amount,
              attempt: attempt + 1,
              checkoutUrl: url,
            },
            responseData: linkData,
          },
        }).catch((logErr) => {
          logger.warn("[InfinityPay] Falha ao registrar log de link:", logErr);
        });

        return {
          success: true,
          data: { ...linkData, resolved_url: url },
        };
      } catch (error: any) {
        const msg = error.response?.data?.message || error.response?.data?.error || error.message;
        lastError = String(msg);
        logger.warn(
          `[InfinityPay] Tentativa ${attempt + 1}/${payloads.length} falhou ao criar link: ${lastError}`,
          error.response?.data,
        );
      }
    }

    await prisma.paymentGatewayLog.create({
      data: {
        provider: "infinitypay",
        action: "payment_link_failed",
        requestData: { orderNsu, amount, description: data.description },
        responseData: { error: lastError },
      },
    }).catch(() => null);

    return { success: false, error: lastError };
  }

  private extractCheckoutUrl(linkData: Record<string, unknown> | null | undefined): string {
    if (!linkData || typeof linkData !== "object") return "";

    const candidates = [
      linkData.url,
      linkData.checkout_url,
      linkData.payment_url,
      linkData.link,
      linkData.short_url,
      (linkData.data as Record<string, unknown> | undefined)?.url,
    ];

    for (const candidate of candidates) {
      const value = String(candidate || "").trim();
      if (value.startsWith("http")) return value;
    }

    return "";
  }

  /**
   * Criar cliente na InfinityPay
   */
  async createCustomer(customer: InfinityPayCustomer): Promise<InfinityPayResponse> {
    const http = await this.api();
    if (!http) return { success: false, error: "InfinityPay não configurado" };

    try {
      const response = await http.post("/customers", {
        email: customer.email,
        name: customer.name,
        phone: customer.phone,
        document: customer.cpf ? { type: "cpf", number: customer.cpf.replace(/\D/g, "") } : undefined,
      });

      return { success: true, data: response.data };
    } catch (error: any) {
      logger.error("Failed to create InfinityPay customer:", error.response?.data);
      return { success: false, error: error.response?.data?.message || error.message };
    }
  }

  /**
   * Criar cobrança direta (usado para recorrência — não gera link)
   */
  async createCharge(charge: InfinityPayCharge): Promise<InfinityPayResponse> {
    const http = await this.api();
    if (!http) return { success: false, error: "InfinityPay não configurado" };

    try {
      const payload = {
        amount: Math.round(charge.amount * 100),
        currency: charge.currency,
        customer: {
          email: charge.customer_email,
          name: charge.customer_name,
          document: charge.customer_cpf
            ? { type: "cpf", number: charge.customer_cpf.replace(/\D/g, "") }
            : undefined,
        },
        description: charge.description,
        payment_method: charge.payment_method,
        installments: charge.installments || 1,
        auto_capture: charge.auto_capture !== false,
        metadata: charge.metadata || {},
      };

      const response = await http.post("/charges", payload);
      return { success: true, data: response.data };
    } catch (error: any) {
      logger.error("Failed to create charge:", error.response?.data);
      return { success: false, error: error.response?.data?.message || error.message };
    }
  }

  /**
   * Criar subscrição recorrente
   */
  async createSubscription(
    customerId: string,
    planData: {
      amount: number;
      interval: "monthly" | "yearly";
      description: string;
      metadata?: Record<string, any>;
    }
  ): Promise<InfinityPayResponse> {
    const http = await this.api();
    if (!http) return { success: false, error: "InfinityPay não configurado" };

    try {
      const payload = {
        customer_id: customerId,
        plan: {
          amount: Math.round(planData.amount * 100),
          interval: planData.interval,
          description: planData.description,
        },
        metadata: planData.metadata || {},
      };

      const response = await http.post("/subscriptions", payload);
      return { success: true, data: response.data };
    } catch (error: any) {
      logger.error("Failed to create subscription:", error.response?.data);
      return { success: false, error: error.response?.data?.message || error.message };
    }
  }

  /**
   * Cancelar subscrição
   */
  async cancelSubscription(subscriptionId: string): Promise<InfinityPayResponse> {
    const http = await this.api();
    if (!http) return { success: false, error: "InfinityPay não configurado" };

    try {
      const response = await http.post(`/subscriptions/${subscriptionId}/cancel`);
      return { success: true, data: response.data };
    } catch (error: any) {
      logger.error("Failed to cancel subscription:", error.response?.data);
      return { success: false, error: error.response?.data?.message || error.message };
    }
  }

  /**
   * Obter status de cobrança
   */
  async getChargeStatus(chargeId: string): Promise<InfinityPayResponse> {
    const http = await this.api();
    if (!http) return { success: false, error: "InfinityPay não configurado" };

    try {
      const response = await http.get(`/charges/${chargeId}`);
      return { success: true, data: response.data };
    } catch (error: any) {
      logger.error("Failed to get charge status:", error.response?.data);
      return { success: false, error: error.response?.data?.message || error.message };
    }
  }

  /**
   * Reembolsar transação
   */
  async refund(chargeId: string, amount?: number): Promise<InfinityPayResponse> {
    const http = await this.api();
    if (!http) return { success: false, error: "InfinityPay não configurado" };

    try {
      const payload = amount ? { amount: Math.round(amount * 100) } : {};
      const response = await http.post(`/charges/${chargeId}/refund`, payload);
      return { success: true, data: response.data };
    } catch (error: any) {
      logger.error("Failed to refund charge:", error.response?.data);
      return { success: false, error: error.response?.data?.message || error.message };
    }
  }

  /**
   * Validar assinatura de webhook
   */
  validateWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const crypto = require("crypto");
    const hash = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    return hash === signature;
  }

  /**
   * Processar evento de webhook
   */
  async processWebhookEvent(event: any): Promise<void> {
    logger.info("Processing InfinityPay webhook event:", event.type);

    switch (event.type) {
      case "charge.success":
      case "charge.paid":
      case "charge.approved":
      case "payment_link.paid":
        await this.handleChargeSuccess(event.data);
        break;
      case "charge.failed":
        await this.handleChargeFailed(event.data);
        break;
      case "charge.refunded":
        await this.handleChargeRefunded(event.data);
        break;
      case "subscription.created":
        await this.handleSubscriptionCreated(event.data);
        break;
      case "subscription.canceled":
        await this.handleSubscriptionCanceled(event.data);
        break;
      default:
        logger.warn("Unknown webhook event type:", event.type);
    }
  }

  private async handleChargeSuccess(data: any): Promise<void> {
    try {
      const metadata = data?.metadata || {};
      const paymentIdRaw = metadata.payment_id;
      const subscriptionIdRaw = metadata.subscription_id;
      const clientIdRaw = metadata.client_id;
      const chargeId = data?.id ? String(data.id) : null;

      let payment = null as Awaited<ReturnType<typeof prisma.payment.findUnique>>;

      if (Number.isFinite(Number(paymentIdRaw))) {
        payment = await prisma.payment.findUnique({
          where: { id: Number(paymentIdRaw) },
        });
      }

      if (!payment && chargeId) {
        payment = await prisma.payment.findFirst({
          where: { infinityPayTransactionId: chargeId },
          orderBy: { id: "desc" },
        });
      }

      let subscription = null as Awaited<ReturnType<typeof prisma.clientSubscription.findUnique>>;

      if (payment) {
        subscription = await prisma.clientSubscription.findUnique({
          where: { id: payment.subscriptionId },
        });
      }

      if (!subscription && Number.isFinite(Number(subscriptionIdRaw))) {
        subscription = await prisma.clientSubscription.findUnique({
          where: { id: Number(subscriptionIdRaw) },
        });
      }

      if (!subscription && Number.isFinite(Number(clientIdRaw))) {
        subscription = await prisma.clientSubscription.findFirst({
          where: { clientId: Number(clientIdRaw) },
          orderBy: { id: "desc" },
        });
      }

      if (!subscription) {
        logger.warn("[InfinityPay] charge success webhook without resolvable subscription", {
          chargeId,
          metadata,
        });
        return;
      }

      const chargedAt = new Date();
      const webhookAmount =
        typeof data?.amount === "number"
          ? data.amount > 1000
            ? data.amount / 100
            : data.amount
          : Number(subscription.priceMonthly);

      if (!payment) {
        payment = await prisma.payment.create({
          data: {
            subscriptionId: subscription.id,
            infinityPayTransactionId: chargeId || undefined,
            amount: webhookAmount,
            status: "APPROVED",
            paymentMethod: this.mapPaymentMethod(data?.payment_method),
            description: "Pagamento confirmado via webhook InfinityPay",
            chargedAt,
          },
        });
      } else {
        payment = await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: "APPROVED",
            infinityPayTransactionId: chargeId || payment.infinityPayTransactionId,
            chargedAt,
            failureReason: null,
          },
        });
      }

      if (subscription) {
        const wasBlocked =
          subscription.status === "SUSPENDED" ||
          subscription.status === "PAST_DUE" ||
          Boolean(metadata.renewal_reason) ||
          Boolean(metadata.access_blocked);

        await applyBillingCycleFromPayment(subscription.id, chargedAt);

        await prisma.clientProfile.update({
          where: { id: subscription.clientId },
          data: { status: "ACTIVE", activatedAt: chargedAt },
        });

        if (wasBlocked) {
          const client = await prisma.clientProfile.findUnique({
            where: { id: subscription.clientId },
            select: { phone: true },
          });
          const planRow = await prisma.subscriptionPlan.findUnique({
            where: { plan: subscription.plan },
            select: { displayName: true },
          });
          if (client?.phone) {
            await restoreSubscriptionAfterPayment(
              subscription.id,
              client.phone,
              planRow?.displayName || subscription.plan,
            );
          }
        }
      }

      await prisma.paymentLog.create({
        data: { paymentId: payment.id, action: "approved", details: data },
      });

      logger.info(`[InfinityPay] Payment approved: ${payment.id}`);
    } catch (error) {
      logger.error("Error handling charge success:", error);
    }
  }

  private async handleChargeFailed(data: any): Promise<void> {
    try {
      const paymentId = data.metadata?.payment_id;
      if (!paymentId) return;

      const payment = await prisma.payment.findUnique({ where: { id: parseInt(paymentId) } });
      if (!payment) return;

      const newAttempt = payment.attemptNumber + 1;

      if (newAttempt <= payment.maxRetries) {
        const retryDate = new Date();
        retryDate.setDate(retryDate.getDate() + 3);
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: "PENDING", attemptNumber: newAttempt, nextRetryDate: retryDate, failureReason: data.failure_reason },
        });
      } else {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: "FAILED", failureReason: data.failure_reason },
        });
        await prisma.clientSubscription.update({
          where: { id: payment.subscriptionId },
          data: { status: "SUSPENDED" },
        });
      }

      await prisma.paymentLog.create({
        data: { paymentId: payment.id, action: "failed", details: data },
      });
    } catch (error) {
      logger.error("Error handling charge failure:", error);
    }
  }

  private async handleChargeRefunded(data: any): Promise<void> {
    try {
      const paymentId = data.metadata?.payment_id;
      if (!paymentId) return;

      const payment = await prisma.payment.findUnique({ where: { id: parseInt(paymentId) } });
      if (!payment) return;

      await prisma.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED" } });
      await prisma.paymentLog.create({
        data: { paymentId: payment.id, action: "refunded", details: data },
      });
    } catch (error) {
      logger.error("Error handling refund:", error);
    }
  }

  private async handleSubscriptionCreated(data: any): Promise<void> {
    try {
      const subscriptionId = data.metadata?.subscription_id;
      if (!subscriptionId) return;

      await prisma.clientSubscription.update({
        where: { id: parseInt(subscriptionId) },
        data: { infinityPaySubscriptionId: data.id, status: "ACTIVE" },
      });
    } catch (error) {
      logger.error("Error handling subscription creation:", error);
    }
  }

  private async handleSubscriptionCanceled(data: any): Promise<void> {
    try {
      const subscriptionId = data.metadata?.subscription_id;
      if (!subscriptionId) return;

      await prisma.clientSubscription.update({
        where: { id: parseInt(subscriptionId) },
        data: { status: "CANCELED", cancellationDate: new Date() },
      });
    } catch (error) {
      logger.error("Error handling subscription cancellation:", error);
    }
  }

  private addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  private mapPaymentMethod(method?: string):
    | "CREDIT_CARD"
    | "DEBIT_CARD"
    | "PIX"
    | "BOLETO"
    | "BANK_TRANSFER"
    | undefined {
    const normalized = String(method || "").trim().toLowerCase();

    if (normalized === "credit_card") return "CREDIT_CARD";
    if (normalized === "debit_card") return "DEBIT_CARD";
    if (normalized === "pix") return "PIX";
    if (normalized === "boleto") return "BOLETO";
    if (normalized === "bank_transfer") return "BANK_TRANSFER";

    return undefined;
  }
}

export default new InfinityPayService();
