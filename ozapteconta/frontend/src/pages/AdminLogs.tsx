import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, CheckCircle2, Search, ShieldAlert, XCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import api, { AdminAuditLog } from "@/lib/api";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Skeleton } from "@/components/ui";

type LogsResponse = {
  logs: AdminAuditLog[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: {
    total: number;
    byAction: Array<{ action: string; count: number }>;
  };
};

function prettifyJson(value: unknown) {
  if (!value) return "—";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function methodVariant(method: string): "default" | "secondary" | "warning" | "success" | "destructive" {
  if (method === "GET") return "secondary";
  if (method === "POST") return "success";
  if (method === "DELETE") return "destructive";
  if (method === "PATCH") return "warning";
  return "default";
}

export default function AdminLogs() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [method, setMethod] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const params = useMemo(
    () => ({
      page,
      pageSize: 20,
      ...(search ? { search } : {}),
      ...(action ? { action } : {}),
      ...(method ? { method } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    }),
    [page, search, action, method, from, to]
  );

  const { data, isLoading } = useQuery({
    queryKey: ["admin-audit-logs", params],
    queryFn: () => api.get("/admin/audit-logs", { params }).then((response) => response.data as LogsResponse),
    staleTime: 15000,
  });

  const successCount = data?.logs.filter((log) => log.success).length || 0;
  const failureCount = data?.logs.filter((log) => !log.success).length || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Logs Administrativos</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Auditoria central das ações executadas por usuários do painel admin.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10"><Activity className="w-4 h-4 text-primary" /></div>
            <div><p className="text-lg font-bold">{data?.summary.total ?? 0}</p><p className="text-xs text-muted-foreground">Eventos</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-success/10"><CheckCircle2 className="w-4 h-4 text-success" /></div>
            <div><p className="text-lg font-bold">{successCount}</p><p className="text-xs text-muted-foreground">Sucesso na página atual</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive/10"><ShieldAlert className="w-4 h-4 text-destructive" /></div>
            <div><p className="text-lg font-bold">{failureCount}</p><p className="text-xs text-muted-foreground">Falhas na página atual</p></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Usuário, rota ou entidade"
          />
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Ação</label>
            <select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} className="flex h-9 w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm">
              <option value="">Todas</option>
              <option value="LOGIN">LOGIN</option>
              <option value="LOGIN_FAILED">LOGIN_FAILED</option>
              <option value="READ">READ</option>
              <option value="CREATE">CREATE</option>
              <option value="UPDATE">UPDATE</option>
              <option value="PATCH">PATCH</option>
              <option value="DELETE">DELETE</option>
              <option value="ACTIVATE">ACTIVATE</option>
              <option value="REGENERATE_QR">REGENERATE_QR</option>
              <option value="CHANGE_PASSWORD">CHANGE_PASSWORD</option>
              <option value="STATUS_CHANGE">STATUS_CHANGE</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Método</label>
            <select value={method} onChange={(e) => { setMethod(e.target.value); setPage(1); }} className="flex h-9 w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm">
              <option value="">Todos</option>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>
          <Input label="De" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          <Input label="Até" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
          <div className="flex items-end">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setSearch("");
                setAction("");
                setMethod("");
                setFrom("");
                setTo("");
                setPage(1);
              }}
            >
              Limpar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Eventos de Auditoria</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}

          {!isLoading && data?.logs.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum log encontrado para os filtros atuais.</p>
          )}

          {data?.logs.map((log) => (
            <div key={log.id} className="rounded-xl border border-border/60 p-4 space-y-3 bg-card/60">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={methodVariant(log.method)}>{log.method}</Badge>
                  <Badge variant={log.success ? "success" : "destructive"}>{log.success ? "Sucesso" : `Erro ${log.statusCode}`}</Badge>
                  <Badge variant="outline">{log.action}</Badge>
                  {log.entityType && <Badge variant="secondary">{log.entityType}{log.entityId ? ` #${log.entityId}` : ""}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(log.createdAt), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Usuário admin</p>
                  <p className="font-medium text-foreground">{log.adminUsername || "—"}</p>
                  <p className="text-xs text-muted-foreground">{log.adminRole || "—"}</p>
                </div>
                <div className="lg:col-span-2">
                  <p className="text-xs text-muted-foreground">Rota</p>
                  <p className="font-mono text-xs break-all text-foreground">{log.path}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className="rounded-lg border border-border/50 p-3 bg-secondary/20">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Body</p>
                  <pre className="text-[11px] whitespace-pre-wrap break-all text-foreground max-h-44 overflow-auto">{prettifyJson(log.requestBody)}</pre>
                </div>
                <div className="rounded-lg border border-border/50 p-3 bg-secondary/20">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Query</p>
                  <pre className="text-[11px] whitespace-pre-wrap break-all text-foreground max-h-44 overflow-auto">{prettifyJson(log.queryParams)}</pre>
                </div>
                <div className="rounded-lg border border-border/50 p-3 bg-secondary/20">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Detalhes</p>
                  <pre className="text-[11px] whitespace-pre-wrap break-all text-foreground max-h-44 overflow-auto">{prettifyJson(log.details)}</pre>
                </div>
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between pt-2 gap-3 flex-wrap">
            <p className="text-xs text-muted-foreground">{data?.total ?? 0} eventos</p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={(data?.page || 1) <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</Button>
              <span className="text-xs text-muted-foreground">Página {data?.page || 1} / {data?.totalPages || 1}</span>
              <Button size="sm" variant="outline" disabled={(data?.page || 1) >= (data?.totalPages || 1)} onClick={() => setPage((current) => current + 1)}>Próxima</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}