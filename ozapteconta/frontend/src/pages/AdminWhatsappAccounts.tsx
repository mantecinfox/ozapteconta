import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Trash2, AlertCircle, CheckCircle, RefreshCw, Unlink, Smartphone, MessageCircle } from "lucide-react";
import QRCode from "react-qr-code";
import api from "@/lib/api";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from "@/components/ui";

type GeneratedAccount = {
  id: number;
  label: string;
  phone?: string | null;
  referenceCode: string;
  isActive: boolean;
  whatsappConnectionStatus?: string;
  _count?: { clients: number };
};

type OfficialAccount = {
  id: number;
  label: string;
  phone: string;
  businessAccountId: string;
  isActive: boolean;
  whatsappConnectionStatus?: string;
};

type ActiveInviteLink = {
  accountId: number;
  label: string;
  phone?: string | null;
  referenceCode: string;
  isActive: boolean;
  connectionStatus?: string;
  connectionIcon: string;
  qrLink: string;
};

const EMPTY_OFFICIAL = {
  id: "",
  label: "",
  businessAccountId: "",
  phoneNumberId: "",
  phone: "",
  accessToken: "",
  permanentAccessToken: "",
  webhookVerifyToken: "",
  webhookSecret: "",
  maxClientsSupported: 1000,
  notes: "",
};

export default function AdminWhatsappAccounts() {
  const qc = useQueryClient();
  const [newLabel, setNewLabel] = useState("");
  const [officialForm, setOfficialForm] = useState(EMPTY_OFFICIAL);
  const [pairingState, setPairingState] = useState<{ accountId: number; label: string; qr?: string | null; status: string }>({
    accountId: 0,
    label: "",
    qr: null,
    status: "IDLE",
  });
  const [copiedInviteId, setCopiedInviteId] = useState<number | null>(null);

  const { data: generatedAccounts = [], isLoading } = useQuery({
    queryKey: ["admin-whatsapp-accounts"],
    queryFn: () => api.get("/admin-whatsapp-accounts").then((r) => r.data as GeneratedAccount[]),
  });

  const { data: officialAccounts = [] } = useQuery({
    queryKey: ["official-whatsapp-accounts"],
    queryFn: async () => {
      const r = await api.get("/admin/whatsapp/official");
      return ((r.data as { data?: OfficialAccount[] })?.data || []) as OfficialAccount[];
    },
  });

  const { data: activeInviteLinks = [] } = useQuery({
    queryKey: ["admin-whatsapp-active-invite-links"],
    queryFn: async () => {
      const r = await api.get("/admin-whatsapp-accounts/qr-links/active");
      return ((r.data as { links?: ActiveInviteLink[] })?.links || []) as ActiveInviteLink[];
    },
  });

  useEffect(() => {
    if (!pairingState.accountId) return;
    const timer = setInterval(async () => {
      try {
        const r = await api.get(`/admin-whatsapp-accounts/${pairingState.accountId}/pairing/status`);
        const data = r.data as { status: string; qr?: string | null };
        setPairingState((prev) => ({ ...prev, status: data.status || prev.status, qr: data.qr || null }));
      } catch {
        // ignore polling error
      }
    }, 2500);

    return () => clearInterval(timer);
  }, [pairingState.accountId]);

  // Cria conta e inicia pareamento de uma vez
  const addAndPairMutation = useMutation({
    mutationFn: async () => {
      const createResp = await api.post("/admin-whatsapp-accounts", { label: newLabel.trim() });
      const created = createResp.data as GeneratedAccount;
      const pairResp = await api.post(`/admin-whatsapp-accounts/${created.id}/pairing/start`, {});
      const pairData = pairResp.data as { status: string; qr?: string };
      return { account: created, pair: pairData };
    },
    onSuccess: ({ account, pair }) => {
      setNewLabel("");
      setPairingState({
        accountId: account.id,
        label: account.label,
        status: pair.status || "PAIRING",
        qr: pair.qr || null,
      });
      qc.invalidateQueries({ queryKey: ["admin-whatsapp-accounts"] });
      qc.invalidateQueries({ queryKey: ["admin-whatsapp-active-invite-links"] });
    },
  });

  const saveOfficialMutation = useMutation({
    mutationFn: () => api.post("/admin/whatsapp/official", {
      ...officialForm,
      id: officialForm.id ? Number(officialForm.id) : undefined,
      maxClientsSupported: Number(officialForm.maxClientsSupported || 1000),
    }),
    onSuccess: () => {
      setOfficialForm(EMPTY_OFFICIAL);
      qc.invalidateQueries({ queryKey: ["official-whatsapp-accounts"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/admin-whatsapp-accounts/${id}`),
    onSuccess: () => {
      if (pairingState.accountId === (deleteMutation.variables as number)) {
        setPairingState({ accountId: 0, label: "", qr: null, status: "IDLE" });
      }
      qc.invalidateQueries({ queryKey: ["admin-whatsapp-accounts"] });
      qc.invalidateQueries({ queryKey: ["admin-whatsapp-active-invite-links"] });
    },
  });

  const startPairingMutation = useMutation({
    mutationFn: (id: number) => api.post(`/admin-whatsapp-accounts/${id}/pairing/start`, {}),
    onSuccess: (resp, id) => {
      const acc = generatedAccounts.find((a) => a.id === id);
      const data = resp.data as { status: string; qr?: string };
      setPairingState({
        accountId: id,
        label: acc?.label || "Conta",
        status: data.status || "PAIRING",
        qr: data.qr || null,
      });
      qc.invalidateQueries({ queryKey: ["admin-whatsapp-accounts"] });
      qc.invalidateQueries({ queryKey: ["admin-whatsapp-active-invite-links"] });
    },
  });

  const disconnectPairingMutation = useMutation({
    mutationFn: (id: number) => api.post(`/admin-whatsapp-accounts/${id}/pairing/disconnect`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-whatsapp-accounts"] });
      qc.invalidateQueries({ queryKey: ["admin-whatsapp-active-invite-links"] });
      setPairingState({ accountId: 0, label: "", status: "DISCONNECTED", qr: null });
    },
  });

  async function copyInviteLink(accountId: number, qrLink: string) {
    try {
      await navigator.clipboard.writeText(qrLink);
      setCopiedInviteId(accountId);
      setTimeout(() => setCopiedInviteId((current) => (current === accountId ? null : current)), 1800);
    } catch {
      // fallback simples
      const input = document.createElement("input");
      input.value = qrLink;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
      setCopiedInviteId(accountId);
      setTimeout(() => setCopiedInviteId((current) => (current === accountId ? null : current)), 1800);
    }
  }

  function shareInviteOnWhatsApp(label: string, qrLink: string) {
    const message =
      `Oi! 👋\n\n` +
      `Você foi convidado(a) para usar o sistema ${label ? `pela conta ${label}` : ""}.\n` +
      `Acesse por este link: ${qrLink}`;
    const encoded = encodeURIComponent(message);
    const webShareUrl = `https://wa.me/?text=${encoded}`;
    window.open(webShareUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Contas WhatsApp</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Pareamento QR (aparelhos conectados) e API Oficial Meta</p>
      </div>

      {/* ─── Seção QR (primeiro) ─── */}
      <Card>
        <CardHeader>
          <CardTitle>Convite por Link e QR das Contas Ativas</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Use estes links para convidar pessoas para o sistema. Se houver mais de uma conta ativa, cada uma terá seu próprio convite.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {activeInviteLinks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma conta ativa para gerar convite.</p>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {activeInviteLinks.map((item) => (
                <div key={item.accountId} className="rounded-xl border border-border/50 p-4 flex flex-col md:flex-row gap-4">
                  <div className="bg-white rounded-lg p-3 w-fit">
                    <QRCode value={item.qrLink} size={128} />
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground">{item.label}</p>
                      <Badge variant="success">Ativa</Badge>
                      <Badge variant={item.connectionStatus === "CONNECTED" ? "success" : "secondary"}>
                        {item.connectionIcon} {item.connectionStatus || "UNKNOWN"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{item.phone || "Sem número pareado"} · ref {item.referenceCode}</p>
                    <Input value={item.qrLink} readOnly />
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button size="sm" variant="outline" onClick={() => copyInviteLink(item.accountId, item.qrLink)}>
                        {copiedInviteId === item.accountId ? "Copiado" : "Copiar link"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => window.open(item.qrLink, "_blank", "noopener,noreferrer")}>Abrir link</Button>
                      <Button size="sm" variant="success" onClick={() => shareInviteOnWhatsApp(item.label, item.qrLink)}>
                        <MessageCircle className="w-3.5 h-3.5" />
                        Compartilhar WhatsApp
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5" />
            Pareamento QR — Aparelhos conectados
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Conecte qualquer número via QR. O nome e o número são preenchidos automaticamente após o pareamento.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Formulário simplificado */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Input
                label="Nome da conta (opcional)"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Ex: Vendas, Suporte — deixe vazio para auto-gerar"
              />
            </div>
            <Button
              loading={addAndPairMutation.isPending}
              onClick={() => addAndPairMutation.mutate()}
            >
              <Plus className="w-4 h-4" />
              Adicionar e Parear
            </Button>
          </div>

          {addAndPairMutation.isError && (
            <p className="text-xs text-red-600">Erro ao criar conta. Tente novamente.</p>
          )}

          {/* QR ativo */}
          {pairingState.accountId > 0 && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-emerald-900">{pairingState.label}</p>
                  <p className="text-xs text-emerald-700">
                    Status: <strong>{pairingState.status}</strong> — escaneie com WhatsApp → Aparelhos conectados
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    loading={startPairingMutation.isPending}
                    onClick={() => startPairingMutation.mutate(pairingState.accountId)}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Novo QR
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    loading={disconnectPairingMutation.isPending}
                    onClick={() => disconnectPairingMutation.mutate(pairingState.accountId)}
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    Desconectar
                  </Button>
                </div>
              </div>
              {pairingState.qr ? (
                <div className="rounded-xl bg-white p-4 w-fit shadow-sm">
                  <QRCode value={pairingState.qr} size={200} />
                </div>
              ) : (
                <p className="text-xs text-emerald-700">
                  {pairingState.status === "CONNECTED" ? "✅ Conta conectada! Número preenchido automaticamente." : "Aguardando QR..."}
                </p>
              )}
            </div>
          )}

          {/* Lista de contas QR */}
          <div className="space-y-2">
            {isLoading && <p className="text-sm text-muted-foreground">Carregando contas...</p>}
            {!isLoading && generatedAccounts.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma conta adicionada. Clique em "Adicionar e Parear" para começar.</p>
            )}
            {generatedAccounts.map((acc: GeneratedAccount) => (
              <div key={acc.id} className="rounded-lg border border-border/50 p-4 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-foreground truncate">{acc.label}</p>
                    {acc.whatsappConnectionStatus === "CONNECTED" && (
                      <Badge variant="success">
                        <CheckCircle className="w-3 h-3 mr-1" /> Conectado
                      </Badge>
                    )}
                    {acc.whatsappConnectionStatus === "DISCONNECTED" && (
                      <Badge variant="secondary">
                        <AlertCircle className="w-3 h-3 mr-1" /> Desconectado
                      </Badge>
                    )}
                    {(!acc.whatsappConnectionStatus || acc.whatsappConnectionStatus === "UNKNOWN") && (
                      <Badge variant="secondary">Não verificado</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    📱 {acc.phone || "Número preenchido após pareamento"}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {acc.whatsappConnectionStatus !== "CONNECTED" && (
                    <Button
                      size="sm"
                      variant="outline"
                      loading={startPairingMutation.isPending && pairingState.accountId === acc.id}
                      onClick={() => startPairingMutation.mutate(acc.id)}
                    >
                      Parear QR
                    </Button>
                  )}
                  {acc.whatsappConnectionStatus === "CONNECTED" && (
                    <Button
                      size="sm"
                      variant="outline"
                      loading={disconnectPairingMutation.isPending}
                      onClick={() => disconnectPairingMutation.mutate(acc.id)}
                    >
                      <Unlink className="w-3.5 h-3.5" /> Desconectar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    loading={deleteMutation.isPending && (deleteMutation.variables as number) === acc.id}
                    onClick={() => deleteMutation.mutate(acc.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ─── Seção API Oficial (segundo) ─── */}
      <Card>
        <CardHeader>
          <CardTitle>API Oficial (Meta WhatsApp Cloud)</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Cadastre credenciais oficiais separadamente do pareamento QR.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input label="Nome da conta oficial" value={officialForm.label} onChange={(e) => setOfficialForm({ ...officialForm, label: e.target.value })} />
            <Input label="Telefone (+55...)" value={officialForm.phone} onChange={(e) => setOfficialForm({ ...officialForm, phone: e.target.value })} />
            <Input label="Business Account ID" value={officialForm.businessAccountId} onChange={(e) => setOfficialForm({ ...officialForm, businessAccountId: e.target.value })} />
            <Input label="Phone Number ID" value={officialForm.phoneNumberId} onChange={(e) => setOfficialForm({ ...officialForm, phoneNumberId: e.target.value })} />
            <Input label="Access Token" type="password" value={officialForm.accessToken} onChange={(e) => setOfficialForm({ ...officialForm, accessToken: e.target.value })} />
            <Input label="Webhook Verify Token" value={officialForm.webhookVerifyToken} onChange={(e) => setOfficialForm({ ...officialForm, webhookVerifyToken: e.target.value })} />
          </div>

          <Button loading={saveOfficialMutation.isPending} onClick={() => saveOfficialMutation.mutate()}>
            <Save className="w-4 h-4" />
            Salvar API Oficial
          </Button>

          <div className="space-y-2">
            {officialAccounts.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma conta oficial cadastrada.</p>}
            {officialAccounts.map((off) => (
              <div key={off.id} className="rounded-lg border border-border/50 p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{off.label}</p>
                  <p className="text-xs text-muted-foreground">{off.phone} · BAID {off.businessAccountId}</p>
                </div>
                <Badge variant={off.whatsappConnectionStatus === "CONNECTED" ? "success" : "secondary"}>{off.whatsappConnectionStatus || "UNKNOWN"}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
