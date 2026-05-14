import React from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Clock3, RefreshCw, ShieldAlert, Sigma, Waves } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";
import api, { AiUsageReport, AiUsageStage } from "@/lib/api";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from "@/components/ui";

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

function formatInt(value?: number) {
  return new Intl.NumberFormat("pt-BR").format(Number(value || 0));
}

export default function AiUsage() {
  const [days, setDays] = React.useState(7);
  const [stage, setStage] = React.useState<AiUsageStage>("all");

  const { data, isLoading, refetch, isFetching } = useQuery<AiUsageReport>({
    queryKey: ["ai-usage-report", days, stage],
    queryFn: () => api.get(`/settings/ai-usage-report?days=${days}&stage=${stage}`).then((r) => r.data),
    refetchInterval: 60000,
  });

  const stageLabel = stage === "extract" ? "Extração" : stage === "transcribe" ? "Transcrição" : "Todos";

  function exportCsv() {
    if (!data) return;

    const header = ["provider", "requests", "success", "failed", "avgLatencyMs", "totalTokens", "textRequests", "audioRequests", "fallbackRequests"];
    const rows = data.byProvider.map((r) => [
      r.provider,
      r.requests,
      r.success,
      r.failed,
      r.avgLatencyMs,
      r.totalTokens,
      r.textRequests,
      r.audioRequests,
      r.fallbackRequests,
    ]);

    const csv = [header, ...rows]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-usage-${stage}-${days}d.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    if (!data) return;

    const html = `
      <html>
        <head>
          <title>Relatorio IA</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
            h1 { margin: 0 0 6px; }
            p { margin: 2px 0 14px; color: #4b5563; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; font-size: 12px; }
            th { background: #f9fafb; }
            .kpi { margin: 10px 0; font-size: 13px; }
          </style>
        </head>
        <body>
          <h1>Relatorio de Uso de IA</h1>
          <p>Janela: ${days} dias | Estagio: ${stageLabel}</p>
          <div class="kpi">Total: ${formatInt(data.summary.totalRequests)} | Sucesso: ${formatInt(data.summary.successRequests)} | Falhas: ${formatInt(data.summary.failedRequests)} | Fallbacks: ${formatInt(data.summary.fallbackRequests)} | Tokens: ${formatInt(data.summary.totalTokens)}</div>
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Req</th>
                <th>Sucesso</th>
                <th>Falha</th>
                <th>Latencia ms</th>
                <th>Tokens</th>
                <th>Texto</th>
                <th>Audio</th>
                <th>Fallback</th>
              </tr>
            </thead>
            <tbody>
              ${data.byProvider
                .map((r) => `<tr><td>${r.provider}</td><td>${r.requests}</td><td>${r.success}</td><td>${r.failed}</td><td>${r.avgLatencyMs}</td><td>${r.totalTokens}</td><td>${r.textRequests}</td><td>${r.audioRequests}</td><td>${r.fallbackRequests}</td></tr>`)
                .join("")}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const win = window.open("", "_blank", "width=1000,height=700");
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }

  const splitData = React.useMemo(
    () => [
      {
        name: "Texto",
        value: data?.byProvider.reduce((s, p) => s + (p.textRequests || 0), 0) || 0,
      },
      {
        name: "Áudio",
        value: data?.byProvider.reduce((s, p) => s + (p.audioRequests || 0), 0) || 0,
      },
    ].filter((d) => d.value > 0),
    [data],
  );

  const kpiCards = [
    {
      title: "Requisições IA",
      value: formatInt(data?.summary.totalRequests),
      sub: `${formatInt(data?.summary.successRequests)} sucesso / ${formatInt(data?.summary.failedRequests)} falhas`,
      icon: BarChart3,
      tone: "text-primary",
    },
    {
      title: "Fallbacks",
      value: formatInt(data?.summary.fallbackRequests),
      sub: "Troca de provedor/modelo",
      icon: ShieldAlert,
      tone: "text-warning",
    },
    {
      title: "Latência Média",
      value: `${formatInt(data?.summary.avgLatencyMs)} ms`,
      sub: "Tempo médio de resposta",
      icon: Clock3,
      tone: "text-success",
    },
    {
      title: "Tokens Totais",
      value: formatInt(data?.summary.totalTokens),
      sub: `Janela de ${data?.days || days} dias`,
      icon: Sigma,
      tone: "text-primary",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Logs de IA</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Quem responde mais, uso por texto/áudio, fallback e tokens.</p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 15, 30].map((n) => (
            <Button
              key={n}
              size="sm"
              variant={days === n ? "default" : "outline"}
              onClick={() => setDays(n)}
            >
              {n}d
            </Button>
          ))}
          {(["all", "extract", "transcribe"] as AiUsageStage[]).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={stage === s ? "default" : "outline"}
              onClick={() => setStage(s)}
            >
              {s === "all" ? "Todos" : s === "extract" ? "Extração" : "Transcrição"}
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={exportCsv}>CSV</Button>
          <Button variant="outline" size="sm" onClick={exportPdf}>PDF</Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card) => (
          <Card key={card.title}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground">{card.title}</p>
                <card.icon className={`w-4 h-4 ${card.tone}`} />
              </div>
              {isLoading ? (
                <Skeleton className="h-7 w-24" />
              ) : (
                <p className="text-xl font-bold text-foreground">{card.value}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>IA que mais responde</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[260px]" />
            ) : (data?.byProvider?.length || 0) > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data!.byProvider} layout="vertical" margin={{ left: 12, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" />
                  <YAxis type="category" dataKey="provider" width={80} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    formatter={(value: number, name: string) => [formatInt(value), name]}
                  />
                  <Legend />
                  <Bar dataKey="requests" name="Requisições" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="fallbackRequests" name="Fallbacks" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">Sem dados de uso ainda</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Texto vs Áudio</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[260px]" />
            ) : splitData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={splitData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={86} innerRadius={52}>
                    {splitData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value: number) => [formatInt(value), "requisições"]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">Sem dados de texto/áudio</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Evolução diária de uso e tokens</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[300px]" />
          ) : (data?.timeline?.length || 0) > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data!.timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" />
                <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" />
                <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" />
                <Tooltip formatter={(value: number, name: string) => [formatInt(value), name]} />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="requests" name="Requisições" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="totalTokens" name="Tokens" stroke="#22c55e" strokeWidth={2} dot={false} />
                <Line yAxisId="left" type="monotone" dataKey="avgLatencyMs" name="Latência ms" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
              <Waves className="w-4 h-4" />
              Ainda não há métricas nesta janela
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Resumo por provedor</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(data?.byProvider || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem registros por provedor.</p>
            ) : (
              data!.byProvider.map((row) => (
                <div key={row.provider} className="p-3 rounded-lg border border-border/50 bg-secondary/20 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-medium text-sm text-foreground">{row.provider}</p>
                    <p className="text-xs text-muted-foreground">{formatInt(row.requests)} req • {formatInt(row.totalTokens)} tokens • {formatInt(row.avgLatencyMs)} ms</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="success">Texto {formatInt(row.textRequests)}</Badge>
                    <Badge variant="secondary">Áudio {formatInt(row.audioRequests)}</Badge>
                    <Badge variant="warning">Fallback {formatInt(row.fallbackRequests)}</Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
