import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search, Filter, Edit2, Trash2, CheckCircle2, X,
  TrendingDown, TrendingUp, Mic, MessageSquare, ChevronLeft, ChevronRight,
} from "lucide-react";
import api, { Transaction } from "@/lib/api";
import { Card, CardContent, Badge, Button, Input, Select, Skeleton } from "@/components/ui";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function formatBRL(v: string | number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "success" | "warning" | "destructive" | "secondary" }> = {
    PENDENTE: { label: "Pendente", variant: "warning" },
    PAGO: { label: "Pago", variant: "success" },
    VENCIDO: { label: "Vencido", variant: "destructive" },
    CANCELADO: { label: "Cancelado", variant: "secondary" },
  };
  const s = map[status] || { label: status, variant: "secondary" as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

interface EditModalProps {
  transaction: Transaction;
  onClose: () => void;
  onSave: (data: Partial<Transaction>) => void;
  saving: boolean;
}

function EditModal({ transaction: t, onClose, onSave, saving }: EditModalProps) {
  const [form, setForm] = useState({
    tipo: t.tipo,
    valor: t.valor,
    natureza: t.natureza,
    categoria: t.categoria,
    vencimento: t.vencimento ? t.vencimento.split("T")[0] : "",
    status: t.status,
    notes: t.notes || "",
  });

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="glass-card w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border/50">
          <h3 className="font-semibold text-foreground">Editar Transação #{t.id}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <Input label="Descrição" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Valor (R$)" type="number" step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
            <Select
              label="Natureza"
              value={form.natureza}
              onChange={(e) => setForm({ ...form, natureza: e.target.value as "PAGAR" | "RECEBER" })}
              options={[{ value: "PAGAR", label: "A Pagar" }, { value: "RECEBER", label: "A Receber" }]}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Categoria"
              value={form.categoria}
              onChange={(e) => setForm({ ...form, categoria: e.target.value })}
              options={[
                { value: "casa", label: "Casa" },
                { value: "alimentação", label: "Alimentação" },
                { value: "transporte", label: "Transporte" },
                { value: "saúde", label: "Saúde" },
                { value: "educação", label: "Educação" },
                { value: "lazer", label: "Lazer" },
                { value: "trabalho", label: "Trabalho" },
                { value: "impostos", label: "Impostos" },
                { value: "outros", label: "Outros" },
              ]}
            />
            <Select
              label="Status"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as Transaction["status"] })}
              options={[
                { value: "PENDENTE", label: "Pendente" },
                { value: "PAGO", label: "Pago" },
                { value: "VENCIDO", label: "Vencido" },
                { value: "CANCELADO", label: "Cancelado" },
              ]}
            />
          </div>
          <Input
            label="Vencimento"
            type="date"
            value={form.vencimento}
            onChange={(e) => setForm({ ...form, vencimento: e.target.value })}
          />
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Observações</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="flex w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors resize-none"
            />
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t border-border/50">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" loading={saving} onClick={() => onSave(form)}>Salvar</Button>
        </div>
      </div>
    </div>
  );
}

export default function Transactions() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [natureza, setNatureza] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["transactions", page, search, status, natureza],
    queryFn: () =>
      api.get("/transactions", {
        params: { page, limit: 15, search: search || undefined, status: status || undefined, natureza: natureza || undefined },
      }).then((r) => r.data as { transactions: Transaction[]; total: number; pages: number }),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Transaction> }) =>
      api.patch(`/transactions/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["metrics"] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/transactions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["metrics"] });
    },
  });

  const editing = data?.transactions.find((t) => t.id === editingId);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Transações</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {data?.total ?? 0} transações no total
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Buscar por descrição..."
                className="flex h-9 w-full rounded-lg border border-input bg-secondary/50 pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
              />
            </div>
            <Select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              options={[
                { value: "", label: "Todos os status" },
                { value: "PENDENTE", label: "Pendente" },
                { value: "PAGO", label: "Pago" },
                { value: "VENCIDO", label: "Vencido" },
                { value: "CANCELADO", label: "Cancelado" },
              ]}
              className="w-44"
            />
            <Select
              value={natureza}
              onChange={(e) => { setNatureza(e.target.value); setPage(1); }}
              options={[
                { value: "", label: "Pagar e Receber" },
                { value: "PAGAR", label: "A Pagar" },
                { value: "RECEBER", label: "A Receber" },
              ]}
              className="w-44"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">#</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Descrição</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Usuário</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Valor</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Vencimento</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Status</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Fonte</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/30">
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                : data?.transactions.map((t) => (
                    <tr key={t.id} className="border-b border-border/30 hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-3 text-xs text-muted-foreground font-mono">#{t.id}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                            t.natureza === "PAGAR" ? "bg-destructive/10" : "bg-success/10"
                          }`}>
                            {t.natureza === "PAGAR"
                              ? <TrendingDown className="w-3 h-3 text-destructive" />
                              : <TrendingUp className="w-3 h-3 text-success" />}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{t.tipo}</p>
                            <p className="text-xs text-muted-foreground capitalize">{t.categoria}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                        {t.user?.name || t.userPhone}
                      </td>
                      <td className={`px-4 py-3 text-sm font-semibold text-right ${
                        t.natureza === "PAGAR" ? "text-destructive" : "text-success"
                      }`}>
                        {t.natureza === "PAGAR" ? "-" : "+"}{formatBRL(t.valor)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {t.vencimento
                          ? format(new Date(t.vencimento), "dd/MM/yyyy", { locale: ptBR })
                          : "—"}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                      <td className="px-4 py-3">
                        {t.fonte === "VOZ"
                          ? <Badge variant="secondary"><Mic className="w-3 h-3" />Voz</Badge>
                          : <Badge variant="secondary"><MessageSquare className="w-3 h-3" />Texto</Badge>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setEditingId(t.id)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => { if (confirm(`Deletar transação #${t.id}?`)) deleteMutation.mutate(t.id); }}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border/50">
            <p className="text-xs text-muted-foreground">
              Página {page} de {data.pages} ({data.total} registros)
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Edit Modal */}
      {editing && (
        <EditModal
          transaction={editing}
          onClose={() => setEditingId(null)}
          onSave={(d) => editMutation.mutate({ id: editing.id, data: d })}
          saving={editMutation.isPending}
        />
      )}
    </div>
  );
}
