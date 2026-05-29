import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BILLING_CYCLE_DAYS,
  RENEWAL_REMINDER_DAYS_BEFORE,
  addCalendarDays,
  buildBillingCycleSnapshot,
  computeRenewalDueDate,
  diffCalendarDays,
  startOfLocalDay,
} from "../subscriptionBillingCycleService";

describe("subscriptionBillingCycleService", () => {
  it("calcula vencimento no 30º dia do ciclo", () => {
    const anchor = startOfLocalDay(new Date("2026-04-25T14:30:00"));
    const due = computeRenewalDueDate(anchor);
    assert.equal(due.toISOString().slice(0, 10), "2026-05-24");
  });

  it("identifica dia 27 como lembrete (3 dias antes do vencimento)", () => {
    const anchor = startOfLocalDay(new Date("2026-04-25"));
    const day27 = addCalendarDays(anchor, 26);
    const snapshot = buildBillingCycleSnapshot(anchor, day27);

    assert.equal(snapshot.cycleDay, 27);
    assert.equal(snapshot.daysUntilRenewal, RENEWAL_REMINDER_DAYS_BEFORE);
    assert.equal(snapshot.phase, "reminder_d27");
  });

  it("identifica dia 30 como vencimento", () => {
    const anchor = startOfLocalDay(new Date("2026-04-25"));
    const day30 = addCalendarDays(anchor, 29);
    const snapshot = buildBillingCycleSnapshot(anchor, day30);

    assert.equal(snapshot.cycleDay, 30);
    assert.equal(snapshot.daysUntilRenewal, 0);
    assert.equal(snapshot.phase, "due_d30");
  });

  it("identifica atraso após vencimento", () => {
    const anchor = startOfLocalDay(new Date("2026-04-25"));
    const day34 = addCalendarDays(anchor, 33);
    const snapshot = buildBillingCycleSnapshot(anchor, day34);

    assert.equal(snapshot.daysUntilRenewal, -4);
    assert.equal(snapshot.phase, "grace_overdue");
  });

  it("ciclo completo tem 30 dias inclusive entre âncora e vencimento", () => {
    const anchor = startOfLocalDay(new Date("2026-01-01"));
    const due = computeRenewalDueDate(anchor);
    assert.equal(diffCalendarDays(anchor, due), BILLING_CYCLE_DAYS - 1);
    const day30 = addCalendarDays(anchor, 29);
    assert.equal(buildBillingCycleSnapshot(anchor, day30).phase, "due_d30");
  });
});
