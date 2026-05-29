import { prisma } from "../config/prisma";
import { logger } from "../utils/logger";
import infinityPayService from "./infinityPayService";
import { sendMessage } from "./whatsappService";
import {
  buildBillingCycleSnapshot,
  formatDatePtBr,
  resolveCycleAnchor,
  startOfLocalDay,
  type BillingCycleSnapshot,
} from "./subscriptionBillingCycleService";

export interface SubscriptionAccessEvaluation {
  blocked: boolean;
  snapshot: BillingCycleSnapshot | null;
  amountDue: number;
  planDisplayName: string;
  checkoutUrl: string | null;
}

type SubscriptionWithClient = {
  id: number;
  status: string;
  plan: string;
  priceMonthly: unknown;
  lastBillingDate: Date | null;
  nextBillingDate: Date | null;
  createdAt: Date;
  client: {
    id: number;
    fullName: string;
    phone: string;
    email: string | null;
    cpf: string | null;
    activatedAt: Date | null;
    status: string;
  };
};

/** Pagamento aprovado na data de vencimento ou depois libera o ciclo. */
async function hasPaymentCoveringCurrentDue(
  subscriptionId: number,
  renewalDueDate: Date,
): Promise<boolean> {
  const dueDay = startOfLocalDay(renewalDueDate);

  const payment = await prisma.payment.findFirst({
    where: {
      subscriptionId,
      status: "APPROVED",
      chargedAt: { gte: dueDay },
    },
    orderBy: { chargedAt: "desc" },
  });

  return Boolean(payment);
}

export async function evaluateSubscriptionAccess(
  subscription: SubscriptionWithClient,
): Promise<SubscriptionAccessEvaluation> {
  const planRow = await prisma.subscriptionPlan.findUnique({
    where: { plan: subscription.plan as "HOME" | "OFFICE" | "FULL" | "TRAVEL" },
  });

  const planDisplayName = planRow?.displayName || subscription.plan;
  const amountDue = Number(subscription.priceMonthly);

  if (subscription.status === "PENDING") {
    return { blocked: false, snapshot: null, amountDue, planDisplayName, checkoutUrl: null };
  }

  const anchor = await resolveCycleAnchor(subscription, subscription.client);
  if (!anchor) {
    return { blocked: false, snapshot: null, amountDue, planDisplayName, checkoutUrl: null };
  }

  const snapshot = buildBillingCycleSnapshot(anchor);

  if (snapshot.daysUntilRenewal === null || snapshot.daysUntilRenewal > 0) {
    return { blocked: false, snapshot, amountDue, planDisplayName, checkoutUrl: null };
  }

  if (snapshot.renewalDueDate) {
    const paid = await hasPaymentCoveringCurrentDue(subscription.id, snapshot.renewalDueDate);
    if (paid) {
      return { blocked: false, snapshot, amountDue, planDisplayName, checkoutUrl: null };
    }
  }

  return { blocked: true, snapshot, amountDue, planDisplayName, checkoutUrl: null };
}

export async function evaluateSubscriptionAccessByPhone(phone: string): Promise<SubscriptionAccessEvaluation | null> {
  const profile = await prisma.clientProfile.findFirst({
    where: { phone },
    include: { subscription: true },
  });

  if (!profile?.subscription) {
    return null;
  }

  return evaluateSubscriptionAccess({
    ...profile.subscription,
    client: profile,
  });
}

export async function suspendSubscriptionIfOverdue(
  subscription: SubscriptionWithClient,
): Promise<boolean> {
  const access = await evaluateSubscriptionAccess(subscription);
  if (!access.blocked) {
    if (subscription.status === "SUSPENDED" || subscription.status === "PAST_DUE") {
      await prisma.clientSubscription.update({
        where: { id: subscription.id },
        data: { status: "ACTIVE" },
      });
    }
    return false;
  }

  if (subscription.status !== "SUSPENDED" && subscription.status !== "PAST_DUE") {
    await prisma.clientSubscription.update({
      where: { id: subscription.id },
      data: { status: "SUSPENDED" },
    });
    logger.info(
      `[Access] Sub #${subscription.id} suspensa por inadimplência (vencimento ${access.snapshot?.renewalDueDate?.toISOString().slice(0, 10) ?? "?"})`,
    );
  }

  return true;
}

async function resolveRecentBlockedCheckoutUrl(subscriptionId: number): Promise<string | null> {
  const recentLog = await prisma.paymentGatewayLog.findFirst({
    where: {
      provider: "infinitypay",
      action: { startsWith: `access_blocked_subscription_${subscriptionId}_` },
    },
    orderBy: { createdAt: "desc" },
  });

  const checkoutUrl = (recentLog?.requestData as { checkoutUrl?: string } | null)?.checkoutUrl;
  return checkoutUrl || null;
}

async function createRenewalCheckoutUrl(
  subscription: SubscriptionWithClient,
  planDisplayName: string,
  amountDue: number,
): Promise<string | null> {
  const cachedUrl = await resolveRecentBlockedCheckoutUrl(subscription.id);
  if (cachedUrl) {
    return cachedUrl;
  }

  const linkResult = await infinityPayService.createPaymentLink({
    amount: amountDue,
    description: `${planDisplayName} - Renovação ozapteconta`,
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
      access_blocked: true,
    },
  });

  if (!linkResult.success) {
    logger.warn(`[Access] Falha ao gerar link de desbloqueio sub #${subscription.id}: ${linkResult.error}`);
    return null;
  }

  const checkoutUrl =
    linkResult.data?.resolved_url ||
    linkResult.data?.url ||
    linkResult.data?.checkout_url ||
    linkResult.data?.link ||
    null;

  if (checkoutUrl) {
    await prisma.paymentGatewayLog.create({
      data: {
        provider: "infinitypay",
        action: `access_blocked_subscription_${subscription.id}_${Date.now()}`,
        requestData: {
          subscriptionId: subscription.id,
          clientId: subscription.client.id,
          checkoutUrl,
        },
      },
    });
  }

  return checkoutUrl;
}

export function buildBlockedAccessMessage(
  planDisplayName: string,
  amountDue: number,
  renewalDueDate: Date | null,
  checkoutUrl: string | null,
): string {
  const amountLabel = amountDue.toFixed(2).replace(".", ",");
  const dueLabel = renewalDueDate ? formatDatePtBr(renewalDueDate) : "hoje";

  let message =
    `🔒 *Seu sistema está bloqueado até o pagamento do valor.*\n\n` +
    `Plano: *${planDisplayName}*\n` +
    `Valor: *R$ ${amountLabel}*\n` +
    `Vencimento: *${dueLabel}*\n\n`;

  if (checkoutUrl) {
    message += `💳 *Pague aqui para liberar seu acesso:*\n${checkoutUrl}\n\n`;
  } else {
    message += `Entre em contato com o suporte para obter o link de pagamento.\n\n`;
  }

  message += `Grato e ótima semana!`;

  return message;
}

/** Envia mensagem de bloqueio e retorna true se o acesso está bloqueado. */
export async function interceptIfSubscriptionBlocked(phone: string): Promise<boolean> {
  const profile = await prisma.clientProfile.findFirst({
    where: { phone },
    include: { subscription: true },
  });

  if (!profile?.subscription || profile.status !== "ACTIVE") {
    return false;
  }

  const subscriptionRow: SubscriptionWithClient = {
    ...profile.subscription,
    client: profile,
  };

  const access = await evaluateSubscriptionAccess(subscriptionRow);
  if (!access.blocked) {
    return false;
  }

  await suspendSubscriptionIfOverdue(subscriptionRow);

  const checkoutUrl = await createRenewalCheckoutUrl(
    subscriptionRow,
    access.planDisplayName,
    access.amountDue,
  );

  const message = buildBlockedAccessMessage(
    access.planDisplayName,
    access.amountDue,
    access.snapshot?.renewalDueDate ?? null,
    checkoutUrl,
  );

  await sendMessage(phone, message);
  return true;
}

export async function restoreSubscriptionAfterPayment(
  subscriptionId: number,
  clientPhone: string,
  planDisplayName: string,
): Promise<void> {
  await prisma.clientSubscription.update({
    where: { id: subscriptionId },
    data: { status: "ACTIVE" },
  });

  const unlockMessage =
    `✅ *Pagamento confirmado!*\n\n` +
    `Seu acesso ao ozapteconta foi *liberado*.\n` +
    `Plano: *${planDisplayName}*\n\n` +
    `Obrigado! Digite *ajuda* para ver os comandos disponíveis.`;

  await sendMessage(clientPhone, unlockMessage);
  logger.info(`[Access] Sub #${subscriptionId} liberada após pagamento (${clientPhone})`);
}

export async function syncAllSubscriptionSuspensions(): Promise<number> {
  const subscriptions = await prisma.clientSubscription.findMany({
    where: {
      status: { in: ["ACTIVE", "SUSPENDED", "PAST_DUE"] },
    },
    include: { client: true },
  });

  let suspended = 0;
  for (const sub of subscriptions) {
    const didSuspend = await suspendSubscriptionIfOverdue({
      ...sub,
      client: sub.client,
    });
    if (didSuspend) suspended += 1;
  }

  return suspended;
}
