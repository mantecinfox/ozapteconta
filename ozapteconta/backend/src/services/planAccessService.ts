import type { ClientPlan } from "@prisma/client";

export type PlanCode = ClientPlan | string;

export function hasFullFeatures(plan: PlanCode): boolean {
  return plan === "FULL" || plan === "TRAVEL";
}

export function hasFlightSearch(plan: PlanCode): boolean {
  return plan === "TRAVEL";
}

export function isBasicFinancePlan(plan: PlanCode): boolean {
  return plan === "HOME" || plan === "OFFICE";
}

export async function buildTravelPlanBlockMessage(
  loadPrice: () => Promise<string>,
): Promise<string> {
  const price = await loadPrice();
  return (
    `🔒 *Busca de voos* é exclusiva do plano *Travel (R$ ${price}/mês)*.\n\n` +
    `Com ele você consulta passagens aéreas nacionais com preços, horários e companhias — além de *todos* os recursos do plano Completo.\n\n` +
    `Para contratar, fale com o suporte ou refaça seu cadastro escolhendo a opção *3* no plano Travel.`
  );
}
