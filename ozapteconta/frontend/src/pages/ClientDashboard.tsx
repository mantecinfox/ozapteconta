import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import api from "@/lib/api";
import { BarChart3, ArrowDownCircle, Mic } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type ReportResponse = {
  client: { id: number; fullName: string; plan: string; status: string };
  filters: {
    from: string | null;
    to: string | null;
    status: string | null;
    natureza: string | null;
    categoria: string | null;
    context: string | null;
    search: string | null;
  };
  totalRegistros: number;
  report: {
    contasReceber: {
      titulosEmAberto: Array<{ id: number; clienteNome: string; dataEmissao: string; dataVencimento: string | null; valorOriginal: number; saldoDevedor: number; status: string }>;
      inadimplenciaAging: {
        faixas: Array<{ label: string; count: number; total: number }>;
      };
      recebimentosRealizados: Array<{ id: number; tipo: string; valorRecebido: number; formaPagamento: string; contaDestino: string; recebidoEm: string }>;
    };
    contasPagar: {
      porFornecedor: Array<{ fornecedor: string; cnpjFornecedor: string | null; categoria: string; total: number; pendencias: number }>;
      fluxoCaixaPrevistoVsRealizado: {
        entradasPrevistas: number;
        saidasPrevistas: number;
        entradasRealizadas: number;
        saidasRealizadas: number;
        saldoFinalProjetado: number;
        saldoFinalRealizado: number;
      };
      despesasPorCentroCusto: Array<{ centroCusto: string; valor: number; percentualSobreGastos: number }>;
    };
    kpis: {
      ticketMedio: number;
      margemContribuicao: number;
      pmrDias: number;
      pmpDias: number;
      idealPmpMaiorQuePmr: boolean;
      receitaBruta: number;
      volumeTransacoes: number;
    };
    demonstrativos: {
      dre: { receitaBruta: number; deducoes: number; cpv: number; ebitda: number; lucroLiquido: number };
      balanceteFinanceiro: Array<{ conta: string; debitos: number; creditos: number; saldoAtual: number }>;
    };
  };
  transactions: Array<{ id: number; tipo: string; categoria: string; valor: string; natureza: string; status: string; context: string; createdAt: string; vencimento: string | null }>;
};

const money = (v: number) => `R$ ${v.toFixed(2)}`;

type Tab = "relatorio" | "transacoes" | "audios";

// ── Aba: Transações ──────────────────────────────────────────────────────────
function ClientTransactions() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [natureza, setNatureza] = useState("");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["client-transactions", page, status, natureza, search],
    queryFn: () =>
      api.get("/client-portal/transactions", { params: { page, status: status || undefined, natureza: natureza || undefined, search: search || undefined } })
        .then((r) => r.data as { transactions: Array<{ id: number; tipo: string; valor: string; natureza: string; categoria: string; status: string; context: string; vencimento: string | null; paidAt: string | null; createdAt: string }>; total: number; page: number; pages: number }),
  });

  const statusMap: Record<string, { label: string; color: string }> = {
    PENDENTE: { label: "Pendente", color: "#f59e0b" },
    PAGO: { label: "Pago", color: "#10b981" },
    VENCIDO: { label: "Vencido", color: "#ef4444" },
    CANCELADO: { label: "Cancelado", color: "#6b7280" },
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Status</label>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="flex h-9 rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm">
            <option value="">Todos</option>
            <option value="PENDENTE">Pendente</option>
            <option value="PAGO">Pago</option>
            <option value="VENCIDO">Vencido</option>
            <option value="CANCELADO">Cancelado</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Natureza</label>
          <select value={natureza} onChange={(e) => { setNatureza(e.target.value); setPage(1); }} className="flex h-9 rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm">
            <option value="">Todas</option>
            <option value="RECEBER">Receber</option>
            <option value="PAGAR">Pagar</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Buscar</label>
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="tipo, categoria…" className="flex h-9 rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm" />
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando transações…</p>}

      {!isLoading && data && (
        <>
          <p className="text-sm text-muted-foreground">{data.total} transações encontradas</p>
          <div className="space-y-2">
            {data.transactions.map((t) => {
              const s = statusMap[t.status] || { label: t.status, color: "#6b7280" };
              return (
                <div key={t.id} className="border border-border/50 rounded-lg p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{t.tipo}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.categoria} · {t.natureza} · {format(new Date(t.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                      {t.vencimento && ` · Vence ${format(new Date(t.vencimento), "dd/MM/yyyy", { locale: ptBR })}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-semibold">R$ {Number(t.valor).toFixed(2)}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: s.color + "22", color: s.color }}>{s.label}</span>
                  </div>
                </div>
              );
            })}
            {data.transactions.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma transação encontrada.</p>}
          </div>
          {data.pages > 1 && (
            <div className="flex items-center gap-2 pt-2">
              <Button variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Anterior</Button>
              <span className="text-sm">{page} / {data.pages}</span>
              <Button variant="outline" onClick={() => setPage((p) => Math.min(data.pages, p + 1))} disabled={page >= data.pages}>Próximo</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Aba: Áudios ──────────────────────────────────────────────────────────────
function ClientAudios() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["client-audios", page],
    queryFn: () =>
      api.get("/client-portal/audios", { params: { page } })
        .then((r) => r.data as { audios: Array<{ id: number; storageKey: string; storageUrl: string | null; durationSeconds: number | null; mimeType: string | null; reviewed: boolean; createdAt: string; transaction: { id: number; tipo: string; valor: string; natureza: string; status: string } | null }>; total: number; pages: number }),
  });

  return (
    <div className="space-y-4">
      {isLoading && <p className="text-sm text-muted-foreground">Carregando áudios…</p>}
      {!isLoading && data && (
        <>
          <p className="text-sm text-muted-foreground">{data.total} áudios recebidos</p>
          <div className="space-y-2">
            {data.audios.map((a) => (
              <div key={a.id} className="border border-border/50 rounded-lg p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Mic className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Áudio #{a.id}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(a.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      {a.durationSeconds != null && ` · ${a.durationSeconds}s`}
                    </p>
                    {a.transaction && (
                      <p className="text-xs text-muted-foreground">Transação #{a.transaction.id} · {a.transaction.tipo} · R$ {Number(a.transaction.valor).toFixed(2)}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {a.reviewed ? (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#10b98122", color: "#10b981" }}>Revisado</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#f59e0b22", color: "#f59e0b" }}>Pendente</span>
                  )}
                  {a.storageUrl && (
                    <a href={a.storageUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">Ouvir</a>
                  )}
                </div>
              </div>
            ))}
            {data.audios.length === 0 && <p className="text-sm text-muted-foreground">Nenhum áudio encontrado.</p>}
          </div>
          {data.pages > 1 && (
            <div className="flex items-center gap-2 pt-2">
              <Button variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Anterior</Button>
              <span className="text-sm">{page} / {data.pages}</span>
              <Button variant="outline" onClick={() => setPage((p) => Math.min(data.pages, p + 1))} disabled={page >= data.pages}>Próximo</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ClientDashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("relatorio");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [natureza, setNatureza] = useState("");
  const [context, setContext] = useState("");

  const params = useMemo(
    () => ({
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(search ? { search } : {}),
      ...(status ? { status } : {}),
      ...(natureza ? { natureza } : {}),
      ...(context ? { context } : {}),
    }),
    [from, to, search, status, natureza, context]
  );

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["client-reports", params],
    queryFn: () => api.get("/client-portal/reports", { params }).then((r) => r.data as ReportResponse),
  });

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Painel do Cliente</h1>
            <p className="text-sm text-muted-foreground">
              {data?.client?.fullName || user?.name || "Cliente"} · Plano {data?.client?.plan || user?.plan || "-"}
            </p>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline">Somente leitura</Badge>
            <Button variant="outline" onClick={logout}>Sair</Button>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex gap-1 border-b border-border/50">
          {([
            { id: "relatorio", label: "Relatório", icon: BarChart3 },
            { id: "transacoes", label: "Transações", icon: ArrowDownCircle },
            { id: "audios", label: "Áudios", icon: Mic },
          ] as { id: Tab; label: string; icon: React.ElementType }[]).map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === "transacoes" && (
          <Card className="border border-border/50">
            <CardHeader><CardTitle>Minhas Transações</CardTitle></CardHeader>
            <CardContent><ClientTransactions /></CardContent>
          </Card>
        )}

        {activeTab === "audios" && (
          <Card className="border border-border/50">
            <CardHeader><CardTitle>Meus Áudios</CardTitle></CardHeader>
            <CardContent><ClientAudios /></CardContent>
          </Card>
        )}

        {activeTab === "relatorio" && (
        <><Card className="border border-border/50">
          <CardHeader><CardTitle>Filtros e Pesquisa</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-2">
            <Input label="De" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input label="Até" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            <Input label="Buscar" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="tipo, categoria, observação" />
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="flex h-9 w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm">
                <option value="">Todos</option>
                <option value="PENDENTE">Pendente</option>
                <option value="PAGO">Pago</option>
                <option value="VENCIDO">Vencido</option>
                <option value="CANCELADO">Cancelado</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Natureza</label>
              <select value={natureza} onChange={(e) => setNatureza(e.target.value)} className="flex h-9 w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm">
                <option value="">Todas</option>
                <option value="RECEBER">Receber</option>
                <option value="PAGAR">Pagar</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Unidade</label>
              <select value={context} onChange={(e) => setContext(e.target.value)} className="flex h-9 w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm">
                <option value="">Todas</option>
                <option value="PESSOAL">Pessoal</option>
                <option value="COMERCIAL">Comercial</option>
              </select>
            </div>
            <div className="md:col-span-3 xl:col-span-6 flex gap-2 pt-1">
              <Button onClick={() => refetch()} loading={isLoading}>Aplicar filtros</Button>
              <Button
                variant="outline"
                onClick={() => {
                  setFrom("");
                  setTo("");
                  setSearch("");
                  setStatus("");
                  setNatureza("");
                  setContext("");
                }}
              >
                Limpar
              </Button>
            </div>
          </CardContent>
        </Card>

        {isLoading && <p className="text-sm text-muted-foreground">Carregando relatórios...</p>}

        {data && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Ticket médio</p><p className="text-xl font-bold">{money(data.report.kpis.ticketMedio)}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Margem contribuição</p><p className="text-xl font-bold">{data.report.kpis.margemContribuicao}%</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">PMR / PMP</p><p className="text-xl font-bold">{data.report.kpis.pmrDias}d / {data.report.kpis.pmpDias}d</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Receita bruta</p><p className="text-xl font-bold">{money(data.report.kpis.receitaBruta)}</p></CardContent></Card>
            </div>

            <Card className="border border-border/50">
              <CardHeader><CardTitle>1. Gestão de Contas a Receber</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-semibold">Títulos em aberto</p>
                  <div className="space-y-2 mt-2">
                    {data.report.contasReceber.titulosEmAberto.slice(0, 20).map((row) => (
                      <div key={row.id} className="border border-border/50 rounded-lg p-2.5 flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{row.clienteNome}</p>
                          <p className="text-xs text-muted-foreground">Emissão {new Date(row.dataEmissao).toLocaleDateString("pt-BR")} · Vence {row.dataVencimento ? new Date(row.dataVencimento).toLocaleDateString("pt-BR") : "-"}</p>
                        </div>
                        <p className="text-sm font-semibold">{money(row.saldoDevedor)}</p>
                      </div>
                    ))}
                    {data.report.contasReceber.titulosEmAberto.length === 0 && <p className="text-sm text-muted-foreground">Sem títulos em aberto no filtro atual.</p>}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold">Inadimplência (Aging)</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                    {data.report.contasReceber.inadimplenciaAging.faixas.map((f) => (
                      <div key={f.label} className="border border-border/50 rounded-lg p-2.5">
                        <p className="text-xs text-muted-foreground">{f.label} dias</p>
                        <p className="text-sm font-semibold">{f.count} títulos</p>
                        <p className="text-xs">{money(f.total)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold">Recebimentos realizados</p>
                  <p className="text-xs text-muted-foreground mt-1">Inclui valor recebido, forma de pagamento e conta destino (quando informado).</p>
                  <div className="space-y-2 mt-2">
                    {data.report.contasReceber.recebimentosRealizados.slice(0, 12).map((row) => (
                      <div key={row.id} className="border border-border/50 rounded-lg p-2.5 flex items-center justify-between">
                        <p className="text-sm">{row.tipo}</p>
                        <p className="text-sm font-semibold">{money(row.valorRecebido)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-border/50">
              <CardHeader><CardTitle>2. Gestão de Contas a Pagar</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-semibold">Contas a pagar por fornecedor</p>
                  <div className="space-y-2 mt-2">
                    {data.report.contasPagar.porFornecedor.slice(0, 20).map((row, idx) => (
                      <div key={`${row.fornecedor}-${idx}`} className="border border-border/50 rounded-lg p-2.5 flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{row.fornecedor}</p>
                          <p className="text-xs text-muted-foreground">CNPJ {row.cnpjFornecedor || "não informado"} · {row.categoria} · Pendências: {row.pendencias}</p>
                        </div>
                        <p className="text-sm font-semibold">{money(row.total)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="border border-border/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">Fluxo previsto</p>
                    <p className="text-sm">Entradas: {money(data.report.contasPagar.fluxoCaixaPrevistoVsRealizado.entradasPrevistas)}</p>
                    <p className="text-sm">Saídas: {money(data.report.contasPagar.fluxoCaixaPrevistoVsRealizado.saidasPrevistas)}</p>
                    <p className="text-sm font-semibold">Saldo: {money(data.report.contasPagar.fluxoCaixaPrevistoVsRealizado.saldoFinalProjetado)}</p>
                  </div>
                  <div className="border border-border/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">Fluxo realizado</p>
                    <p className="text-sm">Entradas: {money(data.report.contasPagar.fluxoCaixaPrevistoVsRealizado.entradasRealizadas)}</p>
                    <p className="text-sm">Saídas: {money(data.report.contasPagar.fluxoCaixaPrevistoVsRealizado.saidasRealizadas)}</p>
                    <p className="text-sm font-semibold">Saldo: {money(data.report.contasPagar.fluxoCaixaPrevistoVsRealizado.saldoFinalRealizado)}</p>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold">Despesas por centro de custo</p>
                  <div className="space-y-2 mt-2">
                    {data.report.contasPagar.despesasPorCentroCusto.slice(0, 20).map((row) => (
                      <div key={row.centroCusto} className="border border-border/50 rounded-lg p-2.5 flex items-center justify-between">
                        <p className="text-sm">{row.centroCusto}</p>
                        <p className="text-sm font-semibold">{money(row.valor)} · {row.percentualSobreGastos}%</p>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-border/50">
              <CardHeader><CardTitle>3. KPIs e 4. Demonstrativos</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm">PMP maior que PMR: <strong>{data.report.kpis.idealPmpMaiorQuePmr ? "Sim" : "Não"}</strong></p>
                <div className="border border-border/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">DRE simplificada</p>
                  <p className="text-sm">Receita Bruta: {money(data.report.demonstrativos.dre.receitaBruta)}</p>
                  <p className="text-sm">CPV: {money(data.report.demonstrativos.dre.cpv)}</p>
                  <p className="text-sm">EBITDA: {money(data.report.demonstrativos.dre.ebitda)}</p>
                  <p className="text-sm font-semibold">Lucro Líquido: {money(data.report.demonstrativos.dre.lucroLiquido)}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-border/50">
              <CardHeader><CardTitle>Lançamentos (consulta completa)</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {data.transactions.slice(0, 100).map((t) => (
                  <div key={t.id} className="border border-border/50 rounded-lg p-2.5 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{t.tipo}</p>
                      <p className="text-xs text-muted-foreground">{t.categoria} · {t.natureza} · {t.status} · {new Date(t.createdAt).toLocaleDateString("pt-BR")}</p>
                    </div>
                    <p className="text-sm font-semibold">R$ {Number(t.valor).toFixed(2)}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
        </>
        )}
      </div>
    </div>
  );
}
