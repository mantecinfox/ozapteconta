export function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export const PLAN_COLORS: Record<string, string> = {
  HOME: "#3b82f6",
  OFFICE: "#8b5cf6",
  FULL: "#f59e0b",
  TRAVEL: "#06b6d4",
};

export const PLAN_LABELS: Record<string, string> = {
  HOME: "Básico",
  OFFICE: "Office",
  FULL: "Completo",
  TRAVEL: "Travel",
};

export type PlanCode = "HOME" | "OFFICE" | "FULL" | "TRAVEL";

export type PlanCatalogItem = {
  plan: PlanCode;
  displayName: string;
  description: string;
  priceMonthly: number;
  features: string[];
  highlighted?: boolean;
};

export const PLAN_CATALOG_FALLBACK: PlanCatalogItem[] = [
  {
    plan: "HOME",
    displayName: "Básico",
    description: "Contas a pagar e receber para pessoa física e empresa.",
    priceMonthly: 4.9,
    features: [
      "Contas PF e PJ pelo WhatsApp",
      "Lembretes de vencimento",
      "Relatórios e resumo financeiro",
      "Registro por texto ou áudio",
    ],
  },
  {
    plan: "FULL",
    displayName: "Completo",
    description: "Tudo do Básico + recursos avançados de consulta e mercado.",
    priceMonthly: 9.9,
    features: [
      "Tudo do plano Básico",
      "Tabela FIPE (carros, motos, caminhões)",
      "FipeZap imóveis e indicadores macro",
      "Mercado financeiro e comparador de preços",
    ],
    highlighted: true,
  },
  {
    plan: "TRAVEL",
    displayName: "Travel",
    description: "Tudo do Completo + assistente de viagens com busca de voos.",
    priceMonthly: 59.9,
    features: [
      "Tudo do plano Completo",
      "Busca de voos nacionais (texto ou áudio)",
      "Sugestão de destinos e melhores preços",
      "Assistente conversacional — sem precisar saber rota",
    ],
  },
];

export function formatPlanOptionLabel(plan: PlanCatalogItem): string {
  return `${plan.displayName} — ${formatBRL(plan.priceMonthly)}/mês`;
}

export function getPlanCatalogItem(planCode: string, priceMonthly?: number): PlanCatalogItem | undefined {
  const fallback = PLAN_CATALOG_FALLBACK.find((item) => item.plan === planCode);
  if (!fallback) return undefined;
  if (priceMonthly == null) return fallback;
  return { ...fallback, priceMonthly };
}

export function formatPlanSummary(planCode: string, priceMonthly?: number): string {
  const item = getPlanCatalogItem(planCode, priceMonthly);
  if (!item) return planCode;
  return `${item.displayName} · ${formatBRL(item.priceMonthly)}/mês`;
}

export const PIE_COLORS = ["#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#10b981", "#6366f1"];

export const CLIENT_STATUS_MAP: Record<string, { label: string; color: "success" | "warning" | "destructive" | "secondary" }> = {
  ACTIVE: { label: "Ativo", color: "success" },
  PENDING_ACTIVATION: { label: "Aguardando", color: "warning" },
  INACTIVE: { label: "Inativo", color: "secondary" },
};

export const SUB_STATUS_MAP: Record<string, { label: string; color: "success" | "warning" | "destructive" | "secondary" }> = {
  ACTIVE: { label: "Ativo", color: "success" },
  PENDING: { label: "Pendente", color: "warning" },
  PAST_DUE: { label: "Em atraso", color: "destructive" },
  SUSPENDED: { label: "Bloqueado", color: "destructive" },
  CANCELED: { label: "Cancelado", color: "secondary" },
};

export const PAYMENT_STATUS_MAP: Record<string, { label: string; color: "success" | "warning" | "destructive" | "secondary" }> = {
  APPROVED: { label: "Aprovado", color: "success" },
  PENDING: { label: "Pendente", color: "warning" },
  PROCESSING: { label: "Processando", color: "warning" },
  FAILED: { label: "Falhou", color: "destructive" },
  DECLINED: { label: "Recusado", color: "destructive" },
  REFUNDED: { label: "Estornado", color: "secondary" },
  EXPIRED: { label: "Expirado", color: "secondary" },
};

export const SERVICE_LABELS: Record<string, string> = {
  finance: "Financeiro",
  nutrition: "Nutrição",
  diet_plan: "Plano de Dieta",
  bmr: "TMB/IMC",
  fipe: "Tabela FIPE",
  fipezap: "FipeZap (Imóveis)",
  flight: "Busca de Voos",
  market: "Mercado Financeiro",
  priceSearch: "Comparador Preços",
  summary: "Resumo",
  list_pending: "Contas Pendentes",
  list_paid: "Contas Pagas",
  mark_paid: "Marcar Pago",
  report: "Relatório",
  help: "Ajuda",
  models: "Modelos",
  audio_message: "Áudio",
};

export const SERVICE_COLORS: Record<string, string> = {
  finance: "#3b82f6",
  nutrition: "#10b981",
  diet_plan: "#14b8a6",
  bmr: "#06b6d4",
  fipe: "#8b5cf6",
  fipezap: "#a855f7",
  flight: "#06b6d4",
  market: "#f59e0b",
  priceSearch: "#ef4444",
  summary: "#6366f1",
  report: "#ec4899",
  audio_message: "#64748b",
};

export const GENDER_LABELS: Record<string, string> = {
  MALE: "Homem",
  FEMALE: "Mulher",
};

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 13) return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return phone;
}
