import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

const ADMIN_TOKEN_KEY = "ozapteconta_admin_token";
const CLIENT_TOKEN_KEY = "ozapteconta_client_token";

function isClientArea() {
  return window.location.pathname.startsWith("/cliente");
}

// Injeta token em todas as requisições
api.interceptors.request.use((cfg) => {
  const token = isClientArea()
    ? localStorage.getItem(CLIENT_TOKEN_KEY)
    : localStorage.getItem(ADMIN_TOKEN_KEY);
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// Redireciona para login em 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      if (isClientArea()) {
        localStorage.removeItem(CLIENT_TOKEN_KEY);
        window.location.href = "/cliente/login";
      } else {
        localStorage.removeItem(ADMIN_TOKEN_KEY);
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export default api;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Transaction {
  id: number;
  userPhone: string;
  tipo: string;
  valor: string;
  natureza: "PAGAR" | "RECEBER";
  categoria: string;
  vencimento: string | null;
  status: "PENDENTE" | "PAGO" | "VENCIDO" | "CANCELADO";
  fonte: "TEXTO" | "VOZ";
  rawMessage: string | null;
  extractedConfidence: string | null;
  needsHumanReview: boolean;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  user?: { name: string | null; phone: string };
}

export interface Metrics {
  totalPagar: number;
  totalReceber: number;
  saldoProjetado: number;
  contasVencidas: number;
  contasVencendo7Dias?: number;
  contasMes: number;
  pagosNoMes: number;
  recebidosNoMes: number;
  usuariosAtivos: number;
  taxaInadimplencia?: number;
  aderenciaPagamentoMes?: number;
  ticketMedioPagarMes?: number;
  ticketMedioReceberMes?: number;
  topCategoriasPagarMes?: Array<{
    categoria: string;
    total: number;
    quantidade: number;
  }>;
  fluxo14dias?: Array<{
    date: string;
    valor: number;
  }>;
}

export interface AudioMessage {
  id: number;
  transactionId: number | null;
  userPhone: string;
  storageKey: string;
  storageUrl: string | null;
  transcription: string | null;
  mimeType: string;
  reviewed: boolean;
  reviewedAt: string | null;
  createdAt: string;
  user?: { name: string | null; phone: string };
  transaction?: { tipo: string; valor: string } | null;
}

export interface WhatsappUser {
  id: number;
  phone: string;
  resolvedPhone?: string | null;
  displayPhone?: string;
  name: string | null;
  isActive: boolean;
  totalTransactions: number;
  createdAt: string;
  _count?: { transactions: number; audioMessages: number };
}

export interface AiProvider {
  id: number;
  provider: string;
  displayName: string;
  apiKey: string | null;
  apiUrl: string | null;
  model: string | null;
  enabled: boolean;
  isDefault: boolean;
  isAudioDefault: boolean;
  textPriority: number;
  audioPriority: number;
}

export interface AudioModelChainSettings {
  models: string[];
  allowedModels: string[];
}

export interface AiUsageProviderRow {
  provider: string;
  requests: number;
  success: number;
  failed: number;
  avgLatencyMs: number;
  totalTokens: number;
  textRequests: number;
  audioRequests: number;
  fallbackRequests: number;
}

export interface AiUsageTimelineRow {
  day: string;
  requests: number;
  success: number;
  totalTokens: number;
  avgLatencyMs: number;
}

export type AiUsageStage = "all" | "extract" | "transcribe";

export interface AiUsageReport {
  days: number;
  stage: AiUsageStage;
  summary: {
    totalRequests: number;
    successRequests: number;
    failedRequests: number;
    avgLatencyMs: number;
    totalTokens: number;
    fallbackRequests: number;
  };
  byProvider: AiUsageProviderRow[];
  timeline: AiUsageTimelineRow[];
}

export interface ClientProfile {
  id: number;
  clientType: "PF" | "PJ";
  fullName: string;
  phone: string;
  email: string | null;
  cpf: string | null;
  cnpj: string | null;
  addressStreet: string;
  addressNumber: string;
  addressComplement: string | null;
  addressNeighborhood: string;
  addressCity: string;
  addressState: string;
  addressZipCode: string;
  plan: "HOME" | "OFFICE" | "FULL" | "TRAVEL";
  status: "PENDING_ACTIVATION" | "ACTIVE" | "INACTIVE";
  qrToken: string;
  assignedWhatsappAccountId?: number | null;
  assignedWhatsappAccount?: AdminWhatsappAccount | null;
  subscription?: { status: string; priceMonthly: string } | null;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminWhatsappAccount {
  id: number;
  label: string;
  phone: string;
  apiAccessToken?: string;
  phoneNumberId?: string;
  referenceCode: string;
  isActive: boolean;
  maxClients: number;
  whatsappConnectionStatus?: string;
  lastHealthCheck?: string;
  lastHealthCheckError?: string;
  notes: string | null;
  _count?: { clients: number };
}

export interface BotKnowledgeEntry {
  id: number;
  title: string;
  keywords: string;
  content: string;
  enabled: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAuditLog {
  id: number;
  adminUserId: string | null;
  adminUsername: string | null;
  adminRole: string | null;
  method: string;
  path: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  statusCode: number;
  success: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  requestBody: Record<string, unknown> | null;
  queryParams: Record<string, unknown> | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}
