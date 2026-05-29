import { prisma } from "../config/prisma";
import { logger } from "../utils/logger";

/** Dias do ciclo mensal contados a partir da ativação ou último pagamento. */
export const BILLING_CYCLE_DAYS = 30;

/** Aviso de renovação no 27º dia (3 dias antes de completar 30). */
export const RENEWAL_REMINDER_DAYS_BEFORE = 3;

/** Dias de tolerância após o vencimento antes de suspender. */
export const RENEWAL_GRACE_DAYS = 3;

export type BillingCyclePhase =
  | "inactive"
  | "active"
  | "reminder_d27"
  | "due_d30"
  | "grace_overdue";

export interface BillingCycleSnapshot {
  cycleAnchor: Date | null;
  renewalDueDate: Date | null;
  daysUntilRenewal: number | null;
  daysSinceAnchor: number | null;
  cycleDay: number | null;
  phase: BillingCyclePhase;
}

export function addCalendarDays(baseDate: Date, days: number): Date {
  const next = new Date(baseDate);
  next.setDate(next.getDate() + days);
  return next;
}

/** Meia-noite local (servidor) — cron roda em America/Sao_Paulo. */
export function startOfLocalDay(date: Date): Date {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

export function diffCalendarDays(fromDate: Date, toDate: Date): number {
  const from = startOfLocalDay(fromDate).getTime();
  const to = startOfLocalDay(toDate).getTime();
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

export function computeRenewalDueDate(cycleAnchor: Date): Date {
  // Dia 30 do ciclo (30 dias inclusive: âncora = dia 1).
  return addCalendarDays(startOfLocalDay(cycleAnchor), BILLING_CYCLE_DAYS - 1);
}

export function buildBillingCycleSnapshot(
  cycleAnchor: Date | null,
  referenceDate: Date = new Date(),
): BillingCycleSnapshot {
  if (!cycleAnchor) {
    return {
      cycleAnchor: null,
      renewalDueDate: null,
      daysUntilRenewal: null,
      daysSinceAnchor: null,
      cycleDay: null,
      phase: "inactive",
    };
  }

  const anchor = startOfLocalDay(cycleAnchor);
  const renewalDueDate = computeRenewalDueDate(anchor);
  const daysUntilRenewal = diffCalendarDays(referenceDate, renewalDueDate);
  const daysSinceAnchor = diffCalendarDays(anchor, referenceDate) + 1;
  const cycleDay = Math.max(1, daysSinceAnchor);

  let phase: BillingCyclePhase = "active";
  if (daysUntilRenewal > 0 && daysUntilRenewal <= RENEWAL_REMINDER_DAYS_BEFORE) {
    phase = "reminder_d27";
  } else if (daysUntilRenewal === 0) {
    phase = "due_d30";
  } else if (daysUntilRenewal < 0) {
    phase = "grace_overdue";
  }

  return {
    cycleAnchor: anchor,
    renewalDueDate,
    daysUntilRenewal,
    daysSinceAnchor,
    cycleDay,
    phase,
  };
}

type SubscriptionRow = {
  id: number;
  lastBillingDate: Date | null;
  nextBillingDate: Date | null;
  createdAt: Date;
};

type ClientRow = {
  id: number;
  activatedAt: Date | null;
  status: string;
};

/** Âncora do ciclo: último pagamento → ativação → último pagamento aprovado no banco. */
export async function resolveCycleAnchor(
  subscription: SubscriptionRow,
  client: ClientRow,
): Promise<Date | null> {
  if (subscription.lastBillingDate) {
    return subscription.lastBillingDate;
  }

  if (client.activatedAt) {
    return client.activatedAt;
  }

  const lastApproved = await prisma.payment.findFirst({
    where: {
      subscriptionId: subscription.id,
      status: "APPROVED",
      chargedAt: { not: null },
    },
    orderBy: { chargedAt: "desc" },
    select: { chargedAt: true },
  });

  if (lastApproved?.chargedAt) {
    return lastApproved.chargedAt;
  }

  return null;
}

/** Recalcula nextBillingDate = âncora + 30 dias (não altera a âncora). */
export async function syncSubscriptionBillingDates(
  subscriptionId: number,
): Promise<BillingCycleSnapshot | null> {
  const subscription = await prisma.clientSubscription.findUnique({
    where: { id: subscriptionId },
    include: { client: true },
  });

  if (!subscription || !["ACTIVE", "SUSPENDED", "PAST_DUE"].includes(subscription.status)) {
    return null;
  }

  const anchor = await resolveCycleAnchor(subscription, subscription.client);
  if (!anchor) {
    return buildBillingCycleSnapshot(null);
  }

  const renewalDueDate = computeRenewalDueDate(anchor);
  const snapshot = buildBillingCycleSnapshot(anchor);

  const storedDue = subscription.nextBillingDate
    ? startOfLocalDay(subscription.nextBillingDate).getTime()
    : null;
  const computedDue = startOfLocalDay(renewalDueDate).getTime();

  const patch: { nextBillingDate: Date; lastBillingDate?: Date } = {
    nextBillingDate: renewalDueDate,
  };

  if (!subscription.lastBillingDate) {
    patch.lastBillingDate = startOfLocalDay(anchor);
  }

  if (storedDue !== computedDue || !subscription.lastBillingDate) {
    await prisma.clientSubscription.update({
      where: { id: subscriptionId },
      data: patch,
    });
    logger.info(
      `[BillingCycle] Sub #${subscriptionId} sincronizada: âncora=${anchor.toISOString().slice(0, 10)} vencimento=${renewalDueDate.toISOString().slice(0, 10)} (dia ${snapshot.cycleDay}/${BILLING_CYCLE_DAYS})`,
    );
  }

  return snapshot;
}

/** Ao ativar ou confirmar pagamento: reinicia ciclo de 30 dias. */
export async function applyBillingCycleFromPayment(
  subscriptionId: number,
  paidAt: Date,
): Promise<void> {
  const paidDay = startOfLocalDay(paidAt);
  const nextDue = computeRenewalDueDate(paidDay);

  await prisma.clientSubscription.update({
    where: { id: subscriptionId },
    data: {
      status: "ACTIVE",
      lastBillingDate: paidDay,
      nextBillingDate: nextDue,
    },
  });
}

export async function syncAllActiveSubscriptionBillingDates(): Promise<number> {
  const subs = await prisma.clientSubscription.findMany({
    where: {
      status: { in: ["ACTIVE", "SUSPENDED", "PAST_DUE"] },
      autoRenew: true,
    },
    select: { id: true },
  });

  let synced = 0;
  for (const sub of subs) {
    const snapshot = await syncSubscriptionBillingDates(sub.id);
    if (snapshot?.cycleAnchor) synced += 1;
  }
  return synced;
}

export function formatDatePtBr(date: Date): string {
  return date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/** Assinatura com vencimento hoje ou no passado (rede de segurança do cron). */
export function isRenewalDueOrOverdue(snapshot: BillingCycleSnapshot): boolean {
  if (snapshot.daysUntilRenewal === null) return false;
  return snapshot.daysUntilRenewal <= 0;
}

export function isRenewalReminderWindow(snapshot: BillingCycleSnapshot): boolean {
  if (snapshot.daysUntilRenewal === null) return false;
  return snapshot.daysUntilRenewal > 0 && snapshot.daysUntilRenewal <= RENEWAL_REMINDER_DAYS_BEFORE;
}
