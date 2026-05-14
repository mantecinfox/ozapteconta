import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Mic, CheckCircle2, ChevronLeft, ChevronRight, Play } from "lucide-react";
import api, { AudioMessage } from "@/lib/api";
import { Card, CardContent, Badge, Button, Skeleton } from "@/components/ui";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Audios() {
  const [page, setPage] = useState(1);
  const [reviewed, setReviewed] = useState<string>("");
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["audios", page, reviewed],
    queryFn: () =>
      api.get("/settings/audios", {
        params: { page, reviewed: reviewed || undefined },
      }).then((r) => r.data as { audios: AudioMessage[]; total: number }),
  });

  const reviewMutation = useMutation({
    mutationFn: (id: number) => api.patch(`/settings/audios/${id}/review`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["audios"] }),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Histórico de Áudios</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {data?.total ?? 0} áudios recebidos
        </p>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {[{ v: "", l: "Todos" }, { v: "false", l: "Pendentes" }, { v: "true", l: "Revisados" }].map((f) => (
          <button
            key={f.v}
            onClick={() => { setReviewed(f.v); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              reviewed === f.v
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.l}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
            ))
          : data?.audios.map((audio) => (
              <Card key={audio.id} className={audio.reviewed ? "opacity-70" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Mic className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-medium text-foreground font-mono">
                          {audio.user?.name || audio.userPhone}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(audio.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </span>
                        {audio.reviewed && <Badge variant="success"><CheckCircle2 className="w-3 h-3" />Revisado</Badge>}
                      {audio.transaction && (
                          <Badge variant="default">{audio.transaction.tipo} · R$ {Number(audio.transaction.valor).toFixed(2)}</Badge>
                        )}
                      </div>
                      {/* Transcrição visível apenas para admins — não exibida ao cliente */}
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-medium w-fit">
                          <Mic className="w-3 h-3" />
                          Áudio recebido
                        </div>
                        {!audio.transaction && (
                          <span className="text-xs text-muted-foreground">Nenhuma transação identificada</span>
                        )}
                      </div>
                    </div>
                    {!audio.reviewed && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => reviewMutation.mutate(audio.id)}
                        loading={reviewMutation.isPending}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Revisar
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
      </div>

      {data && Math.ceil(data.total / 20) > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-muted-foreground">Página {page}</span>
          <Button variant="outline" size="sm" disabled={page >= Math.ceil(data.total / 20)} onClick={() => setPage(page + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
