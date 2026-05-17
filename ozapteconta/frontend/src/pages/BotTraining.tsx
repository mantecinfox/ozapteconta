import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Trash2 } from "lucide-react";
import api, { BotKnowledgeEntry } from "@/lib/api";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@/components/ui";

const EMPTY = {
  title: "",
  keywords: "",
  content: "",
  enabled: true,
  priority: 100,
};

export default function BotTraining() {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [toast, setToast] = useState("");

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(""), 3500);
  };

  const normalizedForm = {
    title: form.title.trim(),
    keywords: form.keywords.trim(),
    content: form.content.trim(),
    enabled: form.enabled,
    priority: Number.isFinite(form.priority) ? form.priority : 100,
  };

  const isFormValid =
    normalizedForm.title.length > 0 &&
    normalizedForm.keywords.length > 0 &&
    normalizedForm.content.length > 0 &&
    Number.isFinite(normalizedForm.priority);

  const { data = [] } = useQuery({
    queryKey: ["bot-knowledge"],
    queryFn: () => api.get("/bot-knowledge").then((r) => r.data as BotKnowledgeEntry[]),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!isFormValid) {
        throw new Error("Preencha título, palavras-chave e conteúdo antes de salvar.");
      }
      if (editingId !== null) return api.put(`/bot-knowledge/${editingId}`, normalizedForm);
      return api.post("/bot-knowledge", normalizedForm);
    },
    onSuccess: () => {
      setEditingId(null);
      setForm(EMPTY);
      qc.invalidateQueries({ queryKey: ["bot-knowledge"] });
      showToast("Parâmetro salvo com sucesso!");
    },
    onError: (err: { response?: { data?: { error?: string } }; message?: string }) => {
      showToast(err.response?.data?.error || err.message || "Falha ao salvar parâmetro.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/bot-knowledge/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bot-knowledge"] });
      if (editingId !== null) {
        setEditingId(null);
        setForm(EMPTY);
      }
      showToast("Parâmetro excluído com sucesso!");
    },
    onError: (err: { response?: { data?: { error?: string } }; message?: string }) => {
      showToast(err.response?.data?.error || err.message || "Falha ao excluir parâmetro.");
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Treinamento do Bot</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Adicione contexto, parâmetros e respostas que o ozapteconta deve seguir</p>
      </div>

      {toast && (
        <div className="rounded-lg border border-success/20 bg-success/10 p-3 text-sm text-success">
          {toast}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Editar parâmetro" : "Novo parâmetro"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input label="Título" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Input label="Palavras-chave (separadas por vírgula)" value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} />
            <Input label="Prioridade (menor = mais forte)" type="number" value={String(form.priority)} onChange={(e) => setForm({ ...form, priority: Number(e.target.value || 100) })} />
            <label className="flex items-center gap-2 text-sm text-foreground pt-7">
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
              Entrada ativa
            </label>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Conteúdo de resposta/contexto</label>
            <textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              className="w-full min-h-32 rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm"
              placeholder="Ex: explicações sobre IPTU, INSS, regras fiscais, política de resposta..."
            />
          </div>

          <div className="flex gap-2">
            <Button loading={saveMutation.isPending} disabled={!isFormValid} onClick={() => saveMutation.mutate()}>
              {editingId ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {editingId ? "Salvar" : "Adicionar"}
            </Button>
            {editingId && <Button variant="outline" onClick={() => { setEditingId(null); setForm(EMPTY); }}>Cancelar</Button>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Parâmetros treinados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.map((item) => (
            <div key={item.id} className="rounded-lg border border-border/50 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-foreground">{item.title}</p>
                  <p className="text-xs text-muted-foreground">keywords: {item.keywords} · prioridade {item.priority}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => {
                    setEditingId(item.id);
                    setForm({
                      title: item.title,
                      keywords: item.keywords,
                      content: item.content,
                      enabled: item.enabled,
                      priority: item.priority,
                    });
                  }}>Editar</Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    loading={deleteMutation.isPending}
                    onClick={() => {
                      if (window.confirm("Tem certeza que deseja excluir este parâmetro de treinamento?")) {
                        deleteMutation.mutate(item.id);
                      }
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Excluir
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.content}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
