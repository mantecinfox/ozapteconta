import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users, UserCheck, AlertTriangle, Clock, DollarSign,
  ChevronDown, ChevronUp, Search, RefreshCw, Trash2,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
  LineChart, Line, AreaChart, Area,
} from "recharts";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, Badge, Skeleton, Button, Input, Select } from "@/components/ui";
import {
  formatBRL, PLAN_COLORS, PLAN_LABELS, PIE_COLORS,
  CLIENT_STATUS_MAP, SUB_STATUS_MAP, PAYMENT_STATUS_MAP,
  SERVICE_LABELS, SERVICE_COLORS, GENDER_LABELS, formatPhone,
} from "@/lib/clientUtils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClientRow {
  id: number;
  fullName: string;
  phone: string;
  email: string | null;
  clientType: string;
  gender: string | null;
  cpf: string | null;
  cnpj: string | null;
  plan: string;
  status: string;
  activatedAt: string | null;
  createdAt: string;
  addressStreet: string;
  addressNumber: string;
  addressComplement: string | null;
  addressNeighborhood: string;
  addressCity: string;
  addressState: string;
  addressZipCode: string;
  subscription: {
    id: number;
    status: string;
    plan: string;
    priceMonthly: number;
    nextBillingDate: string | null;
    lastBillingDate: string | null;
  } | null;
}

interface AnalyticsOverview {
  inadimplentes: { id: number; fullName: string; daysOverdue: number; amount: number }[];
  proximosVencimento: { id: number; fullName: string; daysRemaining: number; amount: number }[];
  serviceDistribution: { service: string; count: number }[];
  peakHoursGlobal: { hour: number; count: number }[];
  demographicBreakdown: { label: string; count: number }[];
  growthTrend: { month: string; count: number }[];
}

interface ClientAnalytics {
  serviceUsage: { last30Days: { service: string; count: number }[]; last90Days: { service: string; count: number }[] };
  peakHours: { hour: number; count: number }[];
  usageTrend: { date: string; count: number }[];
  topServices: { service: string; count: number }[];
  subscriptionInfo: {
    status: string; plan: string; priceMonthly: number;
    nextBillingDate: string | null; lastBillingDate: string | null;
    daysRemaining: number | null; daysOfUse: number;
  } | null;
  paymentHistory: { id: number; amount: number; status: string; paymentMethod: string | null; chargedAt: string | null; createdAt: string }[];
  totalInteractions: number;
  avgPerDay: number;
  demographics: { gender: string | null; clientType: string };
}

interface ClientMetrics {
  totalClients: number;
  activeClients: number;
  pendingClients: number;
  inactiveClients: number;
  newThisMonth: number;
  mrr: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Clients() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"dados" | "financeiro" | "uso" | "relatorio">("dados");
  const perPage = 15;

  const { data: metrics, isLoading: loadingMetrics } = useQuery<ClientMetrics>({
    queryKey: ["client-metrics"],
    queryFn: () => api.get("/clients/metrics").then((r) => r.data),
    refetchInterval: 60000,
  });

  const { data: overview, isLoading: loadingOverview } = useQuery<AnalyticsOverview>({
    queryKey: ["client-analytics-overview"],
    queryFn: () => api.get("/clients/analytics/overview").then((r) => r.data),
    refetchInterval: 120000,
  });

  const { data: clientsData, isLoading: loadingClients, refetch } = useQuery<{ clients: ClientRow[]; total: number }>({
    queryKey: ["clients-list", page, search, statusFilter, planFilter],
    queryFn: () =>
      api.get("/clients", { params: { page, limit: perPage, search, status: statusFilter !== "all" ? statusFilter : undefined, plan: planFilter !== "all" ? planFilter : undefined } })
        .then((r) => r.data),
  });

  const clients = clientsData?.clients || [];
  const totalPages = Math.ceil((clientsData?.total || 0) / perPage);

  const inadimplenteCount = overview?.inadimplentes?.length || 0;
  const aVencerCount = overview?.proximosVencimento?.length || 0;

  // KPIs
  const kpis = [
    { title: "Total Clientes", value: metrics?.totalClients, icon: Users, color: "text-primary", bg: "bg-primary/10" },
    { title: "Ativos", value: metrics?.activeClients, icon: UserCheck, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/30" },
    { title: "Inadimplentes", value: inadimplenteCount, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30" },
    { title: "A Vencer (7d)", value: aVencerCount, icon: Clock, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30" },
    { title: "MRR", value: metrics ? formatBRL(metrics.mrr) : undefined, icon: DollarSign, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/30" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Gestão de Clientes</h1>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.title} className={`${kpi.bg} border-0`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                <span className="text-xs text-muted-foreground">{kpi.title}</span>
              </div>
              <p className={`text-xl font-bold ${kpi.color}`}>
                {loadingMetrics ? <Skeleton className="h-6 w-16" /> : (kpi.value ?? "—")}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Gráficos Gerais */}
      {!loadingOverview && overview && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* Uso por Serviço */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Uso por Serviço (30d)</CardTitle></CardHeader>
            <CardContent className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={overview.serviceDistribution.slice(0, 8).map((s) => ({ name: SERVICE_LABELS[s.service] || s.service, count: s.count, fill: SERVICE_COLORS[s.service] || "#6366f1" }))}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Uso" radius={[4, 4, 0, 0]}>
                    {overview.serviceDistribution.slice(0, 8).map((s, i) => (
                      <Cell key={i} fill={SERVICE_COLORS[s.service] || PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Demografia */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Perfil dos Clientes</CardTitle></CardHeader>
            <CardContent className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={overview.demographicBreakdown.filter((d) => d.count > 0)} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={70} label={({ label, count }) => `${label}: ${count}`}>
                    {overview.demographicBreakdown.filter((d) => d.count > 0).map((_, i) => (
                      <Cell key={i} fill={["#3b82f6", "#ec4899", "#8b5cf6"][i]} />
                    ))}
                  </Pie>
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Crescimento */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Novos Clientes/Mês</CardTitle></CardHeader>
            <CardContent className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={overview.growthTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Horários de Pico */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Horários de Pico</CardTitle></CardHeader>
            <CardContent className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={overview.peakHoursGlobal}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} tickFormatter={(h) => `${h}h`} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip labelFormatter={(h) => `${h}:00`} />
                  <Area type="monotone" dataKey="count" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Listas de Inadimplentes e A Vencer */}
      {overview && (inadimplenteCount > 0 || aVencerCount > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {inadimplenteCount > 0 && (
            <Card className="border-red-200 dark:border-red-900">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-red-600">Inadimplentes ({inadimplenteCount})</CardTitle></CardHeader>
              <CardContent className="max-h-48 overflow-y-auto space-y-1">
                {overview.inadimplentes.slice(0, 10).map((c) => (
                  <div key={c.id} className="flex justify-between text-sm py-1 border-b border-border/50 last:border-0">
                    <span className="font-medium truncate">{c.fullName}</span>
                    <span className="text-red-600 whitespace-nowrap">{c.daysOverdue}d atraso • {formatBRL(c.amount)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {aVencerCount > 0 && (
            <Card className="border-amber-200 dark:border-amber-900">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-amber-600">A Vencer em 7 dias ({aVencerCount})</CardTitle></CardHeader>
              <CardContent className="max-h-48 overflow-y-auto space-y-1">
                {overview.proximosVencimento.slice(0, 10).map((c) => (
                  <div key={c.id} className="flex justify-between text-sm py-1 border-b border-border/50 last:border-0">
                    <span className="font-medium truncate">{c.fullName}</span>
                    <span className="text-amber-600 whitespace-nowrap">{c.daysRemaining}d • {formatBRL(c.amount)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome, telefone ou email..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
            </div>
            <Select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              options={[
                { value: "all", label: "Todos status" },
                { value: "ACTIVE", label: "Ativos" },
                { value: "PENDING_ACTIVATION", label: "Aguardando" },
                { value: "INACTIVE", label: "Inativos" },
              ]}
            />
            <Select
              value={planFilter}
              onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }}
              options={[
                { value: "all", label: "Todos planos" },
                { value: "HOME", label: "Básico" },
                { value: "OFFICE", label: "Office" },
                { value: "FULL", label: "Completo" },
                { value: "TRAVEL", label: "Travel" },
              ]}
            />
          </div>
        </CardContent>
      </Card>

      {/* Lista de Clientes */}
      <Card>
        <CardContent className="p-0">
          {loadingClients ? (
            <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : clients.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Nenhum cliente encontrado.</div>
          ) : (
            <div className="divide-y divide-border">
              {/* Header */}
              <div className="hidden md:grid grid-cols-[1fr_140px_80px_100px_80px_120px_40px] gap-2 px-4 py-2 text-xs font-medium text-muted-foreground bg-muted/50">
                <span>Nome</span>
                <span>Telefone</span>
                <span>Plano</span>
                <span>Status Pgto</span>
                <span>Dias</span>
                <span>Serviço Top</span>
                <span></span>
              </div>
              {clients.map((client) => (
                <ClientRow
                  key={client.id}
                  client={client}
                  expanded={expandedId === client.id}
                  activeTab={activeTab}
                  onToggle={() => { setExpandedId(expandedId === client.id ? null : client.id); setActiveTab("dados"); }}
                  onTabChange={setActiveTab}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button>
          <span className="text-sm text-muted-foreground">Página {page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Próxima</Button>
        </div>
      )}
    </div>
  );
}

// ─── Client Row (expandível) ──────────────────────────────────────────────────

function ClientRow({ client, expanded, activeTab, onToggle, onTabChange }: {
  client: ClientRow;
  expanded: boolean;
  activeTab: "dados" | "financeiro" | "uso" | "relatorio";
  onToggle: () => void;
  onTabChange: (tab: "dados" | "financeiro" | "uso" | "relatorio") => void;
}) {
  const subStatus = client.subscription?.status || "—";
  const subMeta = SUB_STATUS_MAP[subStatus];
  const daysRemaining = client.subscription?.nextBillingDate
    ? Math.round((new Date(client.subscription.nextBillingDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : null;

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_80px_100px_80px_120px_40px] gap-2 px-4 py-3 items-center cursor-pointer hover:bg-muted/30 transition-colors" onClick={onToggle}>
        <div>
          <p className="font-medium text-sm">{client.fullName}</p>
          <p className="text-xs text-muted-foreground md:hidden">{formatPhone(client.phone)}</p>
        </div>
        <span className="hidden md:block text-sm">{formatPhone(client.phone)}</span>
        <Badge variant="outline" className="w-fit" style={{ borderColor: PLAN_COLORS[client.plan], color: PLAN_COLORS[client.plan] }}>
          {PLAN_LABELS[client.plan] || client.plan}
        </Badge>
        {subMeta ? <Badge variant={subMeta.color}>{subMeta.label}</Badge> : <span className="text-xs text-muted-foreground">—</span>}
        <span className={`text-sm font-medium ${daysRemaining !== null && daysRemaining < 0 ? "text-red-600" : daysRemaining !== null && daysRemaining <= 3 ? "text-amber-600" : ""}`}>
          {daysRemaining !== null ? `${daysRemaining}d` : "—"}
        </span>
        <span className="text-xs text-muted-foreground truncate">—</span>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </div>

      {expanded && <ClientDetail client={client} activeTab={activeTab} onTabChange={onTabChange} />}
    </div>
  );
}

// ─── Client Detail Panel ──────────────────────────────────────────────────────

function ClientDetail({ client, activeTab, onTabChange }: {
  client: ClientRow;
  activeTab: "dados" | "financeiro" | "uso" | "relatorio";
  onTabChange: (tab: "dados" | "financeiro" | "uso" | "relatorio") => void;
}) {
  const { data: analytics, isLoading } = useQuery<ClientAnalytics>({
    queryKey: ["client-analytics", client.id],
    queryFn: () => api.get(`/clients/${client.id}/analytics`).then((r) => r.data),
    staleTime: 30000,
  });

  const tabs = [
    { key: "dados" as const, label: "Dados" },
    { key: "financeiro" as const, label: "Financeiro" },
    { key: "uso" as const, label: "Uso de Serviços" },
    { key: "relatorio" as const, label: "Relatório" },
  ];

  return (
    <div className="border-t border-border bg-muted/20 px-4 py-4">
      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-border pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            className={`px-3 py-1.5 text-sm rounded-t transition-colors ${activeTab === tab.key ? "bg-background border border-b-0 border-border font-medium" : "text-muted-foreground hover:text-foreground"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
      ) : (
        <>
          {activeTab === "dados" && <TabDados client={client} analytics={analytics} />}
          {activeTab === "financeiro" && <TabFinanceiro analytics={analytics} />}
          {activeTab === "uso" && <TabUso analytics={analytics} />}
          {activeTab === "relatorio" && <TabRelatorio analytics={analytics} />}
        </>
      )}
    </div>
  );
}

// ─── Tab: Dados ───────────────────────────────────────────────────────────────

function TabDados({ client, analytics }: { client: ClientRow; analytics?: ClientAnalytics | null }) {
  const statusMeta = CLIENT_STATUS_MAP[client.status];
  const genderLabel = client.gender ? GENDER_LABELS[client.gender] || client.gender : "Não informado";

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
      <div><span className="text-muted-foreground">Nome:</span> <strong>{client.fullName}</strong></div>
      <div><span className="text-muted-foreground">Telefone:</span> <strong>{formatPhone(client.phone)}</strong></div>
      <div><span className="text-muted-foreground">Email:</span> <strong>{client.email || "—"}</strong></div>
      <div><span className="text-muted-foreground">Tipo:</span> <strong>{client.clientType === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"}</strong></div>
      <div><span className="text-muted-foreground">Gênero:</span> <strong>{genderLabel}</strong></div>
      <div><span className="text-muted-foreground">{client.clientType === "PJ" ? "CNPJ" : "CPF"}:</span> <strong>{client.cnpj || client.cpf || "—"}</strong></div>
      <div><span className="text-muted-foreground">Plano:</span> <Badge variant="outline" style={{ borderColor: PLAN_COLORS[client.plan] }}>{PLAN_LABELS[client.plan]}</Badge></div>
      <div><span className="text-muted-foreground">Status:</span> {statusMeta ? <Badge variant={statusMeta.color}>{statusMeta.label}</Badge> : client.status}</div>
      <div><span className="text-muted-foreground">Cadastro:</span> <strong>{format(new Date(client.createdAt), "dd/MM/yyyy", { locale: ptBR })}</strong></div>
      <div className="md:col-span-2 lg:col-span-3">
        <span className="text-muted-foreground">Endereço:</span>{" "}
        <strong>{client.addressStreet}, {client.addressNumber}{client.addressComplement ? ` - ${client.addressComplement}` : ""} — {client.addressNeighborhood}, {client.addressCity}/{client.addressState} - CEP {client.addressZipCode}</strong>
      </div>
      {client.activatedAt && (
        <div><span className="text-muted-foreground">Ativado em:</span> <strong>{format(new Date(client.activatedAt), "dd/MM/yyyy", { locale: ptBR })}</strong></div>
      )}
    </div>
  );
}

// ─── Tab: Financeiro ──────────────────────────────────────────────────────────

function TabFinanceiro({ analytics }: { analytics?: ClientAnalytics | null }) {
  if (!analytics) return <p className="text-muted-foreground text-sm">Sem dados.</p>;

  const sub = analytics.subscriptionInfo;

  return (
    <div className="space-y-4">
      {sub && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="p-3 rounded bg-background border">
            <p className="text-muted-foreground text-xs">Status</p>
            <Badge variant={SUB_STATUS_MAP[sub.status]?.color || "secondary"}>{SUB_STATUS_MAP[sub.status]?.label || sub.status}</Badge>
          </div>
          <div className="p-3 rounded bg-background border">
            <p className="text-muted-foreground text-xs">Valor Mensal</p>
            <p className="font-bold">{formatBRL(sub.priceMonthly)}</p>
          </div>
          <div className="p-3 rounded bg-background border">
            <p className="text-muted-foreground text-xs">Dias Restantes</p>
            <p className={`font-bold ${(sub.daysRemaining ?? 0) < 0 ? "text-red-600" : (sub.daysRemaining ?? 0) <= 3 ? "text-amber-600" : ""}`}>
              {sub.daysRemaining !== null ? `${sub.daysRemaining} dias` : "—"}
            </p>
          </div>
          <div className="p-3 rounded bg-background border">
            <p className="text-muted-foreground text-xs">Tempo de Uso</p>
            <p className="font-bold">{sub.daysOfUse} dias</p>
          </div>
        </div>
      )}

      <div>
        <h4 className="text-sm font-medium mb-2">Histórico de Pagamentos</h4>
        {analytics.paymentHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p>
        ) : (
          <div className="border rounded divide-y max-h-60 overflow-y-auto">
            {analytics.paymentHistory.map((p) => {
              const meta = PAYMENT_STATUS_MAP[p.status];
              return (
                <div key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium">{formatBRL(p.amount)}</span>
                    {p.paymentMethod && <span className="text-muted-foreground ml-2 text-xs">{p.paymentMethod}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={meta?.color || "secondary"}>{meta?.label || p.status}</Badge>
                    <span className="text-xs text-muted-foreground">{p.chargedAt ? format(new Date(p.chargedAt), "dd/MM/yy") : "—"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Uso de Serviços ─────────────────────────────────────────────────────

function TabUso({ analytics }: { analytics?: ClientAnalytics | null }) {
  if (!analytics) return <p className="text-muted-foreground text-sm">Sem dados.</p>;

  const chartData = analytics.serviceUsage.last30Days.map((s) => ({
    name: SERVICE_LABELS[s.service] || s.service,
    count: s.count,
    fill: SERVICE_COLORS[s.service] || "#6366f1",
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Barras de uso */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Serviços (últimos 30 dias)</CardTitle></CardHeader>
          <CardContent className="h-52">
            {chartData.length === 0 ? (
              <p className="text-sm text-muted-foreground pt-8 text-center">Sem interações registradas ainda.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {chartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Horários de pico */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Horários de Uso</CardTitle></CardHeader>
          <CardContent className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analytics.peakHours}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="hour" tick={{ fontSize: 10 }} tickFormatter={(h) => `${h}h`} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip labelFormatter={(h) => `${h}:00`} />
                <Area type="monotone" dataKey="count" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Tendência diária */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Tendência de Uso (30 dias)</CardTitle></CardHeader>
        <CardContent className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={analytics.usageTrend}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip labelFormatter={(d) => format(new Date(d), "dd/MM/yyyy")} />
              <Line type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab: Relatório ───────────────────────────────────────────────────────────

function TabRelatorio({ analytics }: { analytics?: ClientAnalytics | null }) {
  if (!analytics) return <p className="text-muted-foreground text-sm">Sem dados.</p>;

  const topService = analytics.topServices[0];
  const leastService = analytics.topServices.length > 1 ? analytics.topServices[analytics.topServices.length - 1] : null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="p-4 rounded border bg-background">
        <p className="text-xs text-muted-foreground mb-1">Serviço Mais Usado</p>
        <p className="font-bold text-lg">{topService ? (SERVICE_LABELS[topService.service] || topService.service) : "—"}</p>
        {topService && <p className="text-xs text-muted-foreground">{topService.count} interações (90d)</p>}
      </div>
      <div className="p-4 rounded border bg-background">
        <p className="text-xs text-muted-foreground mb-1">Serviço Menos Usado</p>
        <p className="font-bold text-lg">{leastService ? (SERVICE_LABELS[leastService.service] || leastService.service) : "—"}</p>
        {leastService && <p className="text-xs text-muted-foreground">{leastService.count} interações (90d)</p>}
      </div>
      <div className="p-4 rounded border bg-background">
        <p className="text-xs text-muted-foreground mb-1">Total de Interações</p>
        <p className="font-bold text-lg">{analytics.totalInteractions}</p>
        <p className="text-xs text-muted-foreground">desde a ativação</p>
      </div>
      <div className="p-4 rounded border bg-background">
        <p className="text-xs text-muted-foreground mb-1">Média Diária</p>
        <p className="font-bold text-lg">{analytics.avgPerDay}</p>
        <p className="text-xs text-muted-foreground">interações/dia</p>
      </div>

      {analytics.topServices.length > 0 && (
        <div className="md:col-span-2 lg:col-span-4">
          <h4 className="text-sm font-medium mb-2">Ranking Completo de Serviços (90 dias)</h4>
          <div className="border rounded divide-y">
            {analytics.topServices.map((s, i) => (
              <div key={s.service} className="flex items-center justify-between px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-5 text-right">{i + 1}.</span>
                  <span className="font-medium">{SERVICE_LABELS[s.service] || s.service}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-muted rounded overflow-hidden">
                    <div
                      className="h-full rounded"
                      style={{
                        width: `${Math.min(100, (s.count / (analytics.topServices[0]?.count || 1)) * 100)}%`,
                        backgroundColor: SERVICE_COLORS[s.service] || "#6366f1",
                      }}
                    />
                  </div>
                  <span className="text-muted-foreground w-10 text-right">{s.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
