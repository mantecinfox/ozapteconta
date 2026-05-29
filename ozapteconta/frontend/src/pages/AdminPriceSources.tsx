import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, RefreshCw, AlertCircle, Zap, ShoppingCart, Activity } from "lucide-react";
import api from "@/lib/api";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from "@/components/ui";

const LOGS_PER_PAGE = 25;

type PriceSource = {
  id: number;
  slug: string;
  displayName: string;
  enabled: boolean;
  requiresPlaywright: boolean;
  costPerQueryCents: number;
  rateLimitPerMin: number;
  timeoutMs: number;
  notes?: string | null;
  lastErrorAt?: string | null;
  lastErrorMessage?: string | null;
  updatedAt: string;
};

type PriceSearchLog = {
  id: number;
  whatsappPhone?: string | null;
  query: string;
  sourceSlug: string;
  offersCount: number;
  minPriceCents?: number | null;
  avgPriceCents?: number | null;
  maxPriceCents?: number | null;
  latencyMs?: number | null;
  fromCache: boolean;
  errorMessage?: string | null;
  createdAt: string;
};

type StatsBySource = {
  sourceSlug: string;
  totalQueries: number;
  totalErrors: number;
  totalOffers: number;
  avgLatencyMs: number;
  cacheHits: number;
};

type StatsResponse = {
  windowDays: number;
  generatedAt: string;
  totalQueries: number;
  bySource: StatsBySource[];
};

function formatCents(cents: number): string {
  if (!Number.isFinite(cents)) return "—";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatRelative(iso?: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function AdminPriceSources() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Record<string, Partial<PriceSource>>>({});
  const [logsPage, setLogsPage] = useState(1);

  const { data: sources = [], isLoading } = useQuery({
    queryKey: ["admin-price-sources"],
    queryFn: () => api.get("/admin/price-sources").then((r) => r.data as PriceSource[]),
  });

  const { data: logs = [] } = useQuery({
    queryKey: ["admin-price-search-logs"],
    queryFn: () =>
      api.get("/admin/price-search-logs?limit=50").then((r) => r.data as PriceSearchLog[]),
    refetchInterval: 30000,
  });

  const { data: stats } = useQuery({
    queryKey: ["admin-price-search-stats"],
    queryFn: () => api.get("/admin/price-search-stats").then((r) => r.data as StatsResponse),
    refetchInterval: 60000,
  });

  const patchMutation = useMutation({
    mutationFn: async (input: { slug: string; payload: Partial<PriceSource> }) =>
      api.patch(`/admin/price-sources/${input.slug}`, input.payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-price-sources"] });
      qc.invalidateQueries({ queryKey: ["admin-price-search-stats"] });
    },
  });

  const getDraft = (source: PriceSource): Partial<PriceSource> =>
    editing[source.slug] ?? {
      enabled: source.enabled,
      costPerQueryCents: source.costPerQueryCents,
      rateLimitPerMin: source.rateLimitPerMin,
      timeoutMs: source.timeoutMs,
      notes: source.notes ?? "",
    };

  const updateDraft = (slug: string, patch: Partial<PriceSource>) =>
    setEditing((prev) => ({ ...prev, [slug]: { ...prev[slug], ...patch } }));

  const save = (source: PriceSource) => {
    const draft = getDraft(source);
    patchMutation.mutate({ slug: source.slug, payload: draft });
  };

  const logsPageCount = Math.max(1, Math.ceil(logs.length / LOGS_PER_PAGE));
  const safeLogsPage = Math.min(logsPage, logsPageCount);
  const logsStartIndex = (safeLogsPage - 1) * LOGS_PER_PAGE;
  const currentLogs = logs.slice(logsStartIndex, logsStartIndex + LOGS_PER_PAGE);
  const visibleLogsStart = logs.length === 0 ? 0 : logsStartIndex + 1;
  const visibleLogsEnd = Math.min(logsStartIndex + currentLogs.length, logs.length);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-primary" />
            Comparador de Preços
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie as fontes do comparador, custos por consulta e veja a saúde nos últimos 7 dias.
          </p>
        </div>
      </div>

      {/* Estatísticas 7 dias */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Estatísticas (últimos 7 dias)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!stats ? (
            <p className="text-sm text-muted-foreground">Carregando estatísticas...</p>
          ) : stats.totalQueries === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sem consultas registradas nos últimos 7 dias.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {stats.bySource.map((s) => {
                const errPct = s.totalQueries > 0 ? (s.totalErrors / s.totalQueries) * 100 : 0;
                return (
                  <div
                    key={s.sourceSlug}
                    className="rounded-lg border border-border/50 bg-card/50 p-4 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{s.sourceSlug}</span>
                      <Badge variant={errPct > 25 ? "destructive" : errPct > 5 ? "warning" : "success"}>
                        {errPct.toFixed(0)}% erros
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Consultas: <strong>{s.totalQueries}</strong> · Ofertas: <strong>{s.totalOffers}</strong>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Latência média: <strong>{s.avgLatencyMs} ms</strong> · Cache hits: <strong>{s.cacheHits}</strong>
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lista de fontes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Fontes disponíveis
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando fontes...</p>
          ) : (
            <div className="space-y-4">
              {sources.map((source) => {
                const draft = getDraft(source);
                return (
                  <div
                    key={source.slug}
                    className="rounded-lg border border-border/50 bg-card/40 p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-foreground">
                            {source.displayName}
                          </h3>
                          <Badge variant="outline">{source.slug}</Badge>
                          {source.requiresPlaywright && (
                            <Badge variant="warning">Requer Playwright</Badge>
                          )}
                          <Badge variant={source.enabled ? "success" : "secondary"}>
                            {source.enabled ? "Habilitado" : "Desabilitado"}
                          </Badge>
                        </div>
                        {source.lastErrorMessage && (
                          <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            Último erro {formatRelative(source.lastErrorAt)}: {source.lastErrorMessage.slice(0, 120)}
                          </p>
                        )}
                      </div>
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={Boolean(draft.enabled)}
                          onChange={(e) => updateDraft(source.slug, { enabled: e.target.checked })}
                          className="h-4 w-4"
                        />
                        Ativa
                      </label>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <label className="text-xs space-y-1">
                        <span className="text-muted-foreground">Custo por consulta (centavos)</span>
                        <Input
                          type="number"
                          min={0}
                          value={Number(draft.costPerQueryCents ?? 0)}
                          onChange={(e) =>
                            updateDraft(source.slug, {
                              costPerQueryCents: parseInt(e.target.value || "0", 10),
                            })
                          }
                        />
                        <span className="text-[10px] text-muted-foreground">
                          Equivalente: {formatCents(Number(draft.costPerQueryCents ?? 0))}
                        </span>
                      </label>
                      <label className="text-xs space-y-1">
                        <span className="text-muted-foreground">Rate limit (req/min)</span>
                        <Input
                          type="number"
                          min={1}
                          value={Number(draft.rateLimitPerMin ?? 1)}
                          onChange={(e) =>
                            updateDraft(source.slug, {
                              rateLimitPerMin: parseInt(e.target.value || "1", 10),
                            })
                          }
                        />
                      </label>
                      <label className="text-xs space-y-1">
                        <span className="text-muted-foreground">Timeout (ms)</span>
                        <Input
                          type="number"
                          min={1000}
                          step={500}
                          value={Number(draft.timeoutMs ?? 8000)}
                          onChange={(e) =>
                            updateDraft(source.slug, {
                              timeoutMs: parseInt(e.target.value || "8000", 10),
                            })
                          }
                        />
                      </label>
                    </div>

                    <label className="text-xs space-y-1 block">
                      <span className="text-muted-foreground">Observações internas</span>
                      <Input
                        type="text"
                        value={String(draft.notes ?? "")}
                        onChange={(e) => updateDraft(source.slug, { notes: e.target.value })}
                      />
                    </label>

                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setEditing((prev) => {
                            const next = { ...prev };
                            delete next[source.slug];
                            return next;
                          })
                        }
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Descartar
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => save(source)}
                        loading={patchMutation.isPending}
                      >
                        <Save className="w-3.5 h-3.5" />
                        Salvar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Logs recentes */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>Últimas 50 consultas</CardTitle>
              {logs.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Exibindo {visibleLogsStart}-{visibleLogsEnd} de {logs.length} consultas
                </p>
              )}
            </div>

            {logs.length > LOGS_PER_PAGE && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={safeLogsPage === 1}
                  onClick={() => setLogsPage((page) => Math.max(1, page - 1))}
                >
                  Anterior
                </Button>
                <span className="text-xs text-muted-foreground min-w-[72px] text-center">
                  Página {safeLogsPage} de {logsPageCount}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={safeLogsPage === logsPageCount}
                  onClick={() => setLogsPage((page) => Math.min(logsPageCount, page + 1))}
                >
                  Próxima
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem logs recentes.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground border-b border-border/50">
                  <tr>
                    <th className="text-left py-2 pr-3">Quando</th>
                    <th className="text-left py-2 pr-3">Fonte</th>
                    <th className="text-left py-2 pr-3">Query</th>
                    <th className="text-right py-2 pr-3">Ofertas</th>
                    <th className="text-right py-2 pr-3">Mín</th>
                    <th className="text-right py-2 pr-3">Méd</th>
                    <th className="text-right py-2 pr-3">Latência</th>
                    <th className="text-left py-2 pr-3">Cache</th>
                    <th className="text-left py-2 pr-3">Erro</th>
                  </tr>
                </thead>
                <tbody>
                  {currentLogs.map((log) => (
                    <tr key={log.id} className="border-b border-border/30 last:border-0">
                      <td className="py-2 pr-3">{formatRelative(log.createdAt)}</td>
                      <td className="py-2 pr-3">
                        <Badge variant="outline">{log.sourceSlug}</Badge>
                      </td>
                      <td className="py-2 pr-3 max-w-[260px] truncate" title={log.query}>
                        {log.query}
                      </td>
                      <td className="py-2 pr-3 text-right">{log.offersCount}</td>
                      <td className="py-2 pr-3 text-right">
                        {log.minPriceCents ? formatCents(log.minPriceCents) : "—"}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {log.avgPriceCents ? formatCents(log.avgPriceCents) : "—"}
                      </td>
                      <td className="py-2 pr-3 text-right">{log.latencyMs ?? "—"} ms</td>
                      <td className="py-2 pr-3">{log.fromCache ? "✓" : ""}</td>
                      <td className="py-2 pr-3 text-destructive max-w-[180px] truncate" title={log.errorMessage ?? ""}>
                        {log.errorMessage ?? ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
