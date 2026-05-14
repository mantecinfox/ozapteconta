import React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import QRCode from "react-qr-code";
import api from "@/lib/api";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

interface ClientQrResponse {
  id: number;
  fullName: string;
  plan: "HOME" | "OFFICE" | "FULL";
  status: "PENDING_ACTIVATION" | "ACTIVE" | "INACTIVE";
  qrToken: string;
  qrLink: string;
  portalLink: string;
  whatsappLink: string | null;
  assignedWhatsappAccount: {
    id: number;
    label: string;
    phone: string;
    referenceCode: string;
  } | null;
}

interface ClientReportResponse {
  client: {
    id: number;
    fullName: string;
    plan: "HOME" | "OFFICE" | "FULL";
    status: "PENDING_ACTIVATION" | "ACTIVE" | "INACTIVE";
  };
  metrics: {
    totalPagar: number;
    totalReceber: number;
    saldoProjetado: number;
    pagos: number;
    recebidos: number;
    totalLancamentos: number;
  };
  transactions: Array<{
    id: number;
    tipo: string;
    valor: string;
    natureza: "PAGAR" | "RECEBER";
    status: "PENDENTE" | "PAGO" | "VENCIDO" | "CANCELADO";
    createdAt: string;
  }>;
}

export default function ClientQr() {
  const { token = "" } = useParams();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["client-qr", token],
    queryFn: () => api.get(`/client-portal/${token}`).then((r) => r.data as ClientQrResponse),
    enabled: Boolean(token),
  });

  const { data: report } = useQuery({
    queryKey: ["client-report", token],
    queryFn: () => api.get(`/client-portal/${token}/reports`).then((r) => r.data as ClientReportResponse),
    enabled: Boolean(token),
  });

  const activateMutation = useMutation({
    mutationFn: () => api.post(`/client-portal/${token}/activate`),
    onSuccess: () => refetch(),
  });

  if (isLoading) {
    return <div className="min-h-screen bg-background p-6 text-sm text-muted-foreground">Carregando QR Code...</div>;
  }

  if (!data) {
    return <div className="min-h-screen bg-background p-6 text-sm text-destructive">Token inválido.</div>;
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-xl mx-auto space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Ativação via QR Code</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-foreground">{data.fullName}</p>
                <p className="text-xs text-muted-foreground">Plano {data.plan}</p>
              </div>
              <Badge variant={data.status === "ACTIVE" ? "success" : data.status === "INACTIVE" ? "secondary" : "warning"}>
                {data.status}
              </Badge>
            </div>

            <div className="rounded-xl bg-white p-4 mx-auto w-fit">
              <QRCode value={data.qrLink} size={220} />
            </div>

            <p className="text-sm text-muted-foreground">
              Este QR abre o próprio ozapteconta para concluir sua ativação.
            </p>

            <div className="flex flex-wrap gap-2">
              <a href={data.portalLink} target="_blank" rel="noreferrer">
                <Button>Abrir ozapteconta</Button>
              </a>
              <Button variant="outline" loading={activateMutation.isPending} onClick={() => activateMutation.mutate()}>
                Já escaneei, ativar agora
              </Button>
            </div>

            {report && (
              <div className="space-y-4 pt-3 border-t border-border/50">
                <h3 className="text-sm font-semibold text-foreground">Seus resultados financeiros</h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="rounded-lg border border-border/50 p-3">
                    <p className="text-xs text-muted-foreground">Total a pagar</p>
                    <p className="text-lg font-bold text-foreground">R$ {report.metrics.totalPagar.toFixed(2)}</p>
                  </div>
                  <div className="rounded-lg border border-border/50 p-3">
                    <p className="text-xs text-muted-foreground">Total a receber</p>
                    <p className="text-lg font-bold text-foreground">R$ {report.metrics.totalReceber.toFixed(2)}</p>
                  </div>
                  <div className="rounded-lg border border-border/50 p-3">
                    <p className="text-xs text-muted-foreground">Saldo projetado</p>
                    <p className="text-lg font-bold text-foreground">R$ {report.metrics.saldoProjetado.toFixed(2)}</p>
                  </div>
                  <div className="rounded-lg border border-border/50 p-3">
                    <p className="text-xs text-muted-foreground">Lançamentos</p>
                    <p className="text-lg font-bold text-foreground">{report.metrics.totalLancamentos}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Últimos lançamentos</p>
                  {report.transactions.slice(0, 8).map((t) => (
                    <div key={t.id} className="rounded-lg border border-border/50 p-2.5 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{t.tipo}</p>
                        <p className="text-xs text-muted-foreground">{new Date(t.createdAt).toLocaleDateString("pt-BR")}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-foreground">R$ {Number(t.valor).toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">{t.natureza} · {t.status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
