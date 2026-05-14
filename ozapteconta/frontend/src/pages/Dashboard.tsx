import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users, UserCheck, UserX, Clock, TrendingUp, DollarSign,
  RefreshCw, ArrowUpRight, ArrowDownRight, CreditCard, AlertCircle,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, Badge, Skeleton, Button } from "@/components/ui";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

const PLAN_COLORS: Record<string, string> = { HOME: "#3b82f6", OFFICE: "#22c55e", FULL: "#f59e0b" };
const PLAN_LABELS: Record<string, string> = { HOME: "Home", OFFICE: "Office", FULL: "Full" };
const PIE_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444"];

interface ClientMetrics {
  totalClients: number; activeClients: number; pendingClients: number; inactiveClients: number;
  newThisMonth: number; newLastMonth: number; growthRate: number; byPlan: Record<string, number>;
  mrr: number; revenueThisMonth: number; revenuePendingMonth: number;
  recentClients: Array<{ id: number; fullName: string; phone: string; plan: string; status: string; createdAt: string; subscription?: { status: string; priceMonthly: number } | null; }>;
  recentPayments: Array<{ id: number; amount: number; status: string; chargedAt: string | null; createdAt: string; subscription: { client: { fullName: string; phone: string } }; }>;
  growthLast6Months: Array<{ month: string; novos: number }>;
}

const STATUS_PAY_MAP: Record<string, { label: string; color: "success" | "warning" | "destructive" | "secondary" }> = {
  APPROVED: { label: "Aprovado", color: "success" }, PENDING: { label: "Pendente", color: "warning" },
  PROCESSING: { label: "Processando", color: "warning" }, FAILED: { label: "Falhou", color: "destructive" },
  DECLINED: { label: "Recusado", color: "destructive" }, REFUNDED: { label: "Estornado", color: "secondary" },
  EXPIRED: { label: "Expirado", color: "secondary" },
};
const CLIENT_STATUS_MAP: Record<string, { label: string; color: "success" | "warning" | "secondary" }> = {
  ACTIVE: { label: "Ativo", color: "success" }, PENDING_ACTIVATION: { label: "Aguardando", color: "warning" }, INACTIVE: { label: "Inativo", color: "secondary" },
};

export default function Dashboard() {
  const { data: m, isLoading, refetch } = useQuery<ClientMetrics>({
    queryKey: ["admin-metrics"],
    queryFn: () => api.get("/clients/metrics").then((r) => r.data),
    refetchInterval: 60000,
  });

  const planPieData = m ? Object.entries(m.byPlan).map(([plan, count]) => ({ name: PLAN_LABELS[plan] || plan, value: count, plan })) : [];
  const statusPieData = m ? [{ name: "Ativos", value: m.activeClients }, { name: "Pendentes", value: m.pendingClients }, { name: "Inativos", value: m.inactiveClients }].filter((d) => d.value > 0) : [];

  const kpis = [
    { title: "Total de Clientes", value: m?.totalClients, icon: Users, color: "text-primary", bg: "bg-primary/10", border: "border-primary/20", sub: `${m?.newThisMonth || 0} novos este mês`, up: (m?.newThisMonth || 0) > 0 },
    { title: "Clientes Ativos", value: m?.activeClients, icon: UserCheck, color: "text-success", bg: "bg-success/10", border: "border-success/20", sub: m?.totalClients ? `${Math.round(((m.activeClients || 0) / m.totalClients) * 100)}% do total` : "—", up: true },
    { title: "Aguard. Ativação", value: m?.pendingClients, icon: Clock, color: "text-warning", bg: "bg-warning/10", border: "border-warning/20", sub: "Novos cadastros", up: false },
    { title: "MRR", value: m != null ? formatBRL(m.mrr) : undefined, icon: DollarSign, color: "text-success", bg: "bg-success/10", border: "border-success/20", sub: "Receita mensal recorrente", up: true },
    { title: "Recebido no Mês", value: m != null ? formatBRL(m.revenueThisMonth) : undefined, icon: CreditCard, color: "text-primary", bg: "bg-primary/10", border: "border-primary/20", sub: "Pagamentos confirmados", up: true },
    { title: "Pendente no Mês", value: m != null ? formatBRL(m.revenuePendingMonth) : undefined, icon: AlertCircle, color: "text-warning", bg: "bg-warning/10", border: "border-warning/20", sub: "A receber ainda", up: false },
    { title: "Novos este Mês", value: m?.newThisMonth, icon: TrendingUp, color: "text-primary", bg: "bg-primary/10", border: "border-primary/20", sub: m != null ? `${m.growthRate >= 0 ? "+" : ""}${(m.growthRate * 100).toFixed(0)}% vs mês anterior` : "—", up: (m?.growthRate || 0) >= 0 },
    { title: "Inativos", value: m?.inactiveClients, icon: UserX, color: "text-muted-foreground", bg: "bg-secondary", border: "border-border/50", sub: "Cancelados ou inativos", up: false },
  ];

  const cs = (v: string) => CLIENT_STATUS_MAP[v] || { label: v, color: "secondary" as const };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="w-4 h-4" />Atualizar</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((card) => (
          <Card key={card.title} className={`border ${card.border}`}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className={`p-2 rounded-lg ${card.bg}`}><card.icon className={`w-4 h-4 ${card.color}`} /></div>
              </div>
              {isLoading ? <Skeleton className="h-7 w-20 mb-1" /> : <p className="text-xl font-bold text-foreground">{card.value != null ? String(card.value) : "—"}</p>}
              <p className="text-xs text-muted-foreground mt-0.5">{card.title}</p>
              <div className={`flex items-center gap-1 mt-2 text-xs ${card.up ? "text-success" : "text-warning"}`}>
                {card.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}{card.sub}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Novos Clientes — Últimos 6 Meses</CardTitle></CardHeader>
          <CardContent>
            {(m?.growthLast6Months?.length || 0) > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={m!.growthLast6Months} barSize={32}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} />
                  <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip formatter={(v: number) => [v, "Novos clientes"]} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} labelStyle={{ color: "hsl(var(--foreground))" }} />
                  <Bar dataKey="novos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">Sem dados disponíveis</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Por Plano</CardTitle></CardHeader>
          <CardContent>
            {planPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={planPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={4} dataKey="value">
                    {planPieData.map((entry) => <Cell key={entry.plan} fill={PLAN_COLORS[entry.plan] || "#94a3b8"} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => [v, "clientes"]} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                  <Legend formatter={(v) => <span style={{ color: "hsl(var(--muted-foreground))", fontSize: "12px" }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">Sem dados</div>}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle>Status dos Clientes</CardTitle></CardHeader>
          <CardContent>
            {statusPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={statusPieData} cx="50%" cy="50%" outerRadius={70} paddingAngle={3} dataKey="value">
                    {statusPieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => [v, "clientes"]} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                  <Legend formatter={(v) => <span style={{ color: "hsl(var(--muted-foreground))", fontSize: "12px" }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">Sem dados</div>}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Últimos Pagamentos</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {!m?.recentPayments?.length
                ? <p className="text-sm text-muted-foreground text-center py-8">Nenhum pagamento registrado ainda</p>
                : m.recentPayments.map((pay) => {
                  const s = STATUS_PAY_MAP[pay.status] || { label: pay.status, color: "secondary" as const };
                  return (
                    <div key={pay.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent/50 transition-colors">
                      <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center shrink-0"><CreditCard className="w-4 h-4 text-success" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{pay.subscription?.client?.fullName || "—"}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(pay.chargedAt || pay.createdAt), "dd/MM/yyyy", { locale: ptBR })}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-success">{formatBRL(Number(pay.amount))}</p>
                        <Badge variant={s.color}>{s.label}</Badge>
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Clientes Recentes</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {!m?.recentClients?.length
              ? <p className="text-sm text-muted-foreground text-center py-6">Nenhum cliente cadastrado ainda</p>
              : m.recentClients.map((c) => {
                const st = cs(c.status);
                return (
                  <div key={c.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent/50 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-primary uppercase">{c.fullName[0]}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{c.fullName}</p>
                      <p className="text-xs text-muted-foreground">{c.phone}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      <Badge variant="outline">{PLAN_LABELS[c.plan] || c.plan}</Badge>
                      <Badge variant={st.color}>{st.label}</Badge>
                      <span className="text-xs text-muted-foreground hidden sm:inline">{format(new Date(c.createdAt), "dd/MM/yy", { locale: ptBR })}</span>
                    </div>
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
