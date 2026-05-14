import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, RefreshCw, QrCode, CheckCircle, Users, UserCheck, Clock, UserX, TrendingUp, DollarSign, AlertTriangle } from "lucide-react";
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import api, { ClientProfile } from "@/lib/api";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Skeleton } from "@/components/ui";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ClientsResponse { clients: ClientProfile[]; total: number; page: number; }
interface ClientMetrics {
  totalClients: number; activeClients: number; pendingClients: number; inactiveClients: number;
  newThisMonth: number; mrr: number; byPlan: Record<string, number>;
  growthLast6Months: Array<{ month: string; novos: number }>;
}

function formatBRL(v: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v); }

const PLAN_COLORS: Record<string, string> = { HOME: "#3b82f6", OFFICE: "#64748b", FULL: "#f59e0b" };
const PLAN_LABELS: Record<string, string> = { HOME: "Basico (R$ 4,90)", OFFICE: "Legacy Office", FULL: "Completo (R$ 9,90)" };
const STATUS_PIE_COLORS = ["#22c55e", "#f59e0b", "#94a3b8"];

export default function Clients() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [clientToDelete, setClientToDelete] = useState<ClientProfile | null>(null);
  const [deleteConfirmationName, setDeleteConfirmationName] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["clients", page, search],
    queryFn: () => api.get("/clients", { params: { page, search } }).then((r) => r.data as ClientsResponse),
  });

  const { data: metrics, isLoading: metricsLoading } = useQuery<ClientMetrics>({
    queryKey: ["admin-metrics"],
    queryFn: () => api.get("/clients/metrics").then((r) => r.data),
    staleTime: 60000,
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, confirmationName }: { id: number; confirmationName: string }) =>
      api.delete(`/clients/${id}`, {
        data: {
          confirmDelete: true,
          confirmationName,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["admin-metrics"] });
      setClientToDelete(null);
      setDeleteConfirmationName("");
    },
  });
  const activateMutation = useMutation({
    mutationFn: (id: number) => api.post(`/clients/${id}/activate`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clients"] }); qc.invalidateQueries({ queryKey: ["admin-metrics"] }); },
  });
  const regenerateMutation = useMutation({
    mutationFn: (id: number) => api.post(`/clients/${id}/regenerate-qr`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });

  const totalPages = useMemo(() => Math.max(1, Math.ceil((data?.total || 0) / 20)), [data?.total]);

  const planPieData = metrics ? Object.entries(metrics.byPlan).map(([plan, count]) => ({ name: PLAN_LABELS[plan] || plan, value: count, plan })) : [];
  const statusPieData = metrics ? [{ name: "Ativos", value: metrics.activeClients }, { name: "Pendentes", value: metrics.pendingClients }, { name: "Inativos", value: metrics.inactiveClients }].filter((d) => d.value > 0) : [];

  const statusColor = (s: string) => s === "ACTIVE" ? "success" : s === "INACTIVE" ? "secondary" : "warning";
  const statusLabel = (s: string) => s === "ACTIVE" ? "Ativo" : s === "INACTIVE" ? "Inativo" : "Aguard.";
  const canConfirmDelete = clientToDelete != null && deleteConfirmationName.trim() === clientToDelete.fullName;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Visão geral e gestão dos seus clientes</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { icon: Users, label: "Total", value: metrics?.totalClients, color: "text-primary", bg: "bg-primary/10" },
          { icon: UserCheck, label: "Ativos", value: metrics?.activeClients, color: "text-success", bg: "bg-success/10" },
          { icon: Clock, label: "Aguardando", value: metrics?.pendingClients, color: "text-warning", bg: "bg-warning/10" },
          { icon: TrendingUp, label: "Novos no Mês", value: metrics?.newThisMonth, color: "text-primary", bg: "bg-primary/10" },
          { icon: UserX, label: "Inativos", value: metrics?.inactiveClients, color: "text-muted-foreground", bg: "bg-secondary" },
          { icon: DollarSign, label: "MRR", value: metrics != null ? formatBRL(metrics.mrr) : undefined, color: "text-success", bg: "bg-success/10" },
        ].map((c) => (
          <Card key={c.label} className="border border-border/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg shrink-0 ${c.bg}`}><c.icon className={`w-4 h-4 ${c.color}`} /></div>
              <div>
                {metricsLoading ? <Skeleton className="h-5 w-12" /> : <p className="text-lg font-bold text-foreground">{c.value != null ? String(c.value) : "—"}</p>}
                <p className="text-xs text-muted-foreground">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Novos Clientes — Últimos 6 Meses</CardTitle></CardHeader>
          <CardContent>
            {(metrics?.growthLast6Months?.length || 0) > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={metrics!.growthLast6Months} barSize={28}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                  <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip formatter={(v: number) => [v, "Novos"]} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} labelStyle={{ color: "hsl(var(--foreground))" }} />
                  <Bar dataKey="novos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">{metricsLoading ? "Carregando..." : "Sem dados"}</div>}
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Por Plano</CardTitle></CardHeader>
            <CardContent>
              {planPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie data={planPieData} cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={3} dataKey="value">
                      {planPieData.map((entry) => <Cell key={entry.plan} fill={PLAN_COLORS[entry.plan] || "#94a3b8"} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => [v, "clientes"]} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                    <Legend formatter={(v) => <span style={{ color: "hsl(var(--muted-foreground))", fontSize: "11px" }}>{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <div className="h-[150px] flex items-center justify-center text-muted-foreground text-sm">Sem dados</div>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Por Status</CardTitle></CardHeader>
            <CardContent>
              {statusPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={130}>
                  <PieChart>
                    <Pie data={statusPieData} cx="50%" cy="50%" outerRadius={48} paddingAngle={3} dataKey="value">
                      {statusPieData.map((_, i) => <Cell key={i} fill={STATUS_PIE_COLORS[i % STATUS_PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => [v, "clientes"]} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                    <Legend formatter={(v) => <span style={{ color: "hsl(var(--muted-foreground))", fontSize: "11px" }}>{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <div className="h-[130px] flex items-center justify-center text-muted-foreground text-sm">Sem dados</div>}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle>Lista de clientes{data?.total != null && <span className="text-sm font-normal text-muted-foreground ml-1">({data.total})</span>}</CardTitle>
            <div className="w-full max-w-sm">
              <Input placeholder="Buscar por nome, telefone, email ou CPF/CNPJ" value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando clientes...</p>}
          {!isLoading && data?.clients?.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum cliente encontrado. Os cadastros feitos pelo WhatsApp aparecem aqui automaticamente.</p>
          )}
          {data?.clients?.map((client) => (
            <div key={client.id} className="rounded-lg border border-border/50 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-semibold text-foreground">{client.fullName}<span className="ml-2 text-xs text-muted-foreground font-normal">{client.clientType === "PJ" ? "PJ" : "PF"}</span></p>
                  <p className="text-xs text-muted-foreground">
                    📱 {client.phone}{client.email ? ` · ✉️ ${client.email}` : ""}{client.cpf ? ` · CPF: ${client.cpf}` : ""}{client.cnpj ? ` · CNPJ: ${client.cnpj}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Cadastro: {format(new Date(client.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={statusColor(client.status) as "success" | "secondary" | "warning"}>{statusLabel(client.status)}</Badge>
                  <Badge variant="outline" style={{ borderColor: PLAN_COLORS[client.plan], color: PLAN_COLORS[client.plan] }}>{PLAN_LABELS[client.plan] || client.plan}</Badge>
                  {client.subscription && <Badge variant={client.subscription.status === "ACTIVE" ? "success" : "warning"}>Sub: {client.subscription.status === "ACTIVE" ? "Ativa" : "Pendente"}</Badge>}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                📍 {client.addressStreet}, {client.addressNumber}{client.addressComplement ? `, ${client.addressComplement}` : ""}{client.addressNeighborhood ? ` — ${client.addressNeighborhood}` : ""}, {client.addressCity}/{client.addressState}{client.addressZipCode ? ` · CEP ${client.addressZipCode}` : ""}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {client.status === "PENDING_ACTIVATION" && (
                  <Button size="sm" variant="default" loading={activateMutation.isPending} onClick={() => activateMutation.mutate(client.id)}><CheckCircle className="w-3.5 h-3.5" />Ativar</Button>
                )}
                <Button size="sm" variant="outline" loading={regenerateMutation.isPending} onClick={() => regenerateMutation.mutate(client.id)}><RefreshCw className="w-3.5 h-3.5" />Novo QR</Button>
                <a href={`/cliente/qr/${client.qrToken}`} target="_blank" rel="noreferrer" className="inline-flex">
                  <Button size="sm" variant="outline"><QrCode className="w-3.5 h-3.5" />Ver QR</Button>
                </a>
                <Button
                  size="sm"
                  variant="destructive"
                  loading={deleteMutation.isPending && clientToDelete?.id === client.id}
                  onClick={() => {
                    setClientToDelete(client);
                    setDeleteConfirmationName("");
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />Excluir
                </Button>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-muted-foreground">{data?.total || 0} clientes</p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
              <span className="text-xs text-muted-foreground">Página {page} / {totalPages}</span>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {clientToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl">
            <div className="p-5 border-b border-border/60 flex items-start gap-3">
              <div className="shrink-0 rounded-xl bg-destructive/10 p-2">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Confirmar exclusão definitiva</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Esta ação vai excluir o cliente, transações, lembretes, áudios, usuário do WhatsApp, assinatura e arquivos armazenados.
                </p>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground">
                <p><strong>Cliente:</strong> {clientToDelete.fullName}</p>
                <p><strong>Telefone:</strong> {clientToDelete.phone}</p>
                <p><strong>Plano:</strong> {PLAN_LABELS[clientToDelete.plan] || clientToDelete.plan}</p>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-foreground">
                  Para confirmar, digite exatamente o nome do cliente:
                </p>
                <p className="text-sm font-semibold text-foreground">{clientToDelete.fullName}</p>
                <Input
                  value={deleteConfirmationName}
                  onChange={(e) => setDeleteConfirmationName(e.target.value)}
                  placeholder="Digite o nome completo para confirmar"
                />
              </div>
            </div>

            <div className="p-5 border-t border-border/60 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  if (deleteMutation.isPending) return;
                  setClientToDelete(null);
                  setDeleteConfirmationName("");
                }}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                disabled={!canConfirmDelete}
                loading={deleteMutation.isPending}
                onClick={() => {
                  if (!clientToDelete) return;
                    deleteMutation.mutate({
                      id: clientToDelete.id,
                      confirmationName: deleteConfirmationName.trim(),
                    });
                }}
              >
                Excluir definitivamente
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
