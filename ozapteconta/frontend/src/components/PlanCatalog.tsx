import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Plane, Sparkles, Wallet } from "lucide-react";
import api from "@/lib/api";
import {
  formatBRL,
  formatPlanOptionLabel,
  PLAN_CATALOG_FALLBACK,
  PLAN_COLORS,
  type PlanCatalogItem,
  type PlanCode,
} from "@/lib/clientUtils";

type ApiPlan = {
  plan: PlanCode;
  displayName: string;
  description: string;
  priceMonthly: string | number;
};

const PLAN_ICONS: Record<string, React.ElementType> = {
  HOME: Wallet,
  FULL: Sparkles,
  TRAVEL: Plane,
};

const FEATURES_BY_PLAN: Record<string, string[]> = Object.fromEntries(
  PLAN_CATALOG_FALLBACK.map((item) => [item.plan, item.features]),
);

function normalizePlans(apiPlans: ApiPlan[]): PlanCatalogItem[] {
  const sellable = new Set<PlanCode>(["HOME", "FULL", "TRAVEL"]);
  return apiPlans
    .filter((item) => sellable.has(item.plan))
    .map((item) => ({
      plan: item.plan,
      displayName: item.displayName,
      description: item.description,
      priceMonthly: Number(item.priceMonthly),
      features: FEATURES_BY_PLAN[item.plan] || [],
      highlighted: item.plan === "FULL",
    }));
}

type PlanCatalogProps = {
  selectedPlan?: string;
  onSelectPlan: (plan: PlanCode) => void;
  compact?: boolean;
};

export function PlanCatalog({ selectedPlan, onSelectPlan, compact = false }: PlanCatalogProps) {
  const { data: plans = PLAN_CATALOG_FALLBACK } = useQuery({
    queryKey: ["subscription-plans-public"],
    queryFn: () =>
      api.get("/subscriptions/plans").then((response) => {
        const apiPlans = response.data as ApiPlan[];
        return normalizePlans(apiPlans);
      }),
    staleTime: 60_000,
    placeholderData: PLAN_CATALOG_FALLBACK,
  });

  return (
    <div className={`grid gap-4 ${compact ? "grid-cols-1 lg:grid-cols-3" : "grid-cols-1 md:grid-cols-3"}`}>
      {plans.map((planItem) => {
        const Icon = PLAN_ICONS[planItem.plan] || Wallet;
        const isSelected = selectedPlan === planItem.plan;
        const borderColor = PLAN_COLORS[planItem.plan] || "#64748b";

        return (
          <button
            key={planItem.plan}
            type="button"
            onClick={() => onSelectPlan(planItem.plan)}
            className={`text-left rounded-2xl border p-5 transition-all hover:shadow-md ${
              isSelected
                ? "ring-2 shadow-lg"
                : "border-border/60 bg-card/50 hover:border-border"
            }`}
            style={isSelected ? { borderColor, boxShadow: `0 10px 30px ${borderColor}22` } : undefined}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${borderColor}18`, color: borderColor }}
              >
                <Icon className="w-5 h-5" />
              </div>
              {planItem.highlighted && (
                <span className="text-[10px] uppercase tracking-wide font-semibold px-2 py-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
                  Popular
                </span>
              )}
              {planItem.plan === "TRAVEL" && (
                <span className="text-[10px] uppercase tracking-wide font-semibold px-2 py-1 rounded-full bg-cyan-500/15 text-cyan-700 dark:text-cyan-300">
                  Voos
                </span>
              )}
            </div>

            <h3 className="text-lg font-bold text-foreground">{planItem.displayName}</h3>
            <p className="text-2xl font-extrabold mt-1" style={{ color: borderColor }}>
              {formatBRL(planItem.priceMonthly)}
              <span className="text-sm font-normal text-muted-foreground">/mês</span>
            </p>
            <p className="text-sm text-muted-foreground mt-2 min-h-[40px]">{planItem.description}</p>

            <ul className="mt-4 space-y-2">
              {planItem.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-foreground/90">
                  <Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: borderColor }} />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            {isSelected && (
              <p className="mt-4 text-xs font-medium" style={{ color: borderColor }}>
                ✓ Plano selecionado
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function buildPlanSelectOptions(plans: PlanCatalogItem[] = PLAN_CATALOG_FALLBACK) {
  return plans.map((planItem) => ({
    value: planItem.plan,
    label: formatPlanOptionLabel(planItem),
  }));
}
