import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessageSquare, Bot, CheckCircle2, XCircle,
  Eye, EyeOff, Save, TestTube2, Bell, Play, CreditCard, PowerOff, Plus, X, Mic,
} from "lucide-react";
import api, { AiProvider, AudioModelChainSettings } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, Badge, Button, Input } from "@/components/ui";

type PaymentProvider = "infinitypay" | "mercadopago";

interface PaymentGatewayConfigView {
  id: number;
  provider: PaymentProvider;
  displayName: string;
  description?: string;
  isEnabled: boolean;
  isPrimary: boolean;
  environment: "sandbox" | "production" | string;
  webhookUrl?: string;
  timeoutSeconds: number;
  maxRetries: number;
}

const PROVIDER_INFO: Record<string, { color: string; desc: string; models: string[]; supportsAudio: boolean }> = {
  OPENAI:  { color: "bg-green-500/10 text-green-400",  desc: "ChatGPT — Excelente qualidade",       models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"],                          supportsAudio: true  },
  GEMINI:  { color: "bg-purple-500/10 text-purple-400", desc: "Google Gemini — Rápido e preciso",    models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],          supportsAudio: true  },
  GROQ:    { color: "bg-orange-500/10 text-orange-400", desc: "Groq — Ultra rápido (LLaMA)",         models: ["llama-3.1-8b-instant", "llama-3.3-70b-versatile", "gemma2-9b-it"], supportsAudio: true  },
  GROK:    { color: "bg-red-500/10 text-red-400",       desc: "Grok (xAI) — Modelo da X/Twitter",   models: ["grok-2-latest", "grok-3", "grok-3-mini"],                           supportsAudio: false },
  OLLAMA:  { color: "bg-yellow-500/10 text-yellow-400", desc: "Ollama — Modelos locais (sem custo)", models: ["hermes3:8b", "qwen2.5:7b", "mistral:7b", "llama3"],                 supportsAudio: true  },
  ABACUS:  { color: "bg-cyan-500/10 text-cyan-400",     desc: "Abacus AI — RouteLLM",               models: ["gpt-4o-mini", "gpt-4o", "claude-3-5-sonnet"],                      supportsAudio: true  },
};

function ProviderCard({
  provider,
  textOrder,
  audioOrder,
  onSave,
}: {
  provider: AiProvider;
  textOrder?: number;
  audioOrder?: number;
  onSave: () => void;
}) {
  const [apiKey, setApiKey] = useState(provider.apiKey || "");
  const [model, setModel] = useState(provider.model || "");
  const [apiUrl, setApiUrl] = useState(provider.apiUrl || "");
  const [showKey, setShowKey] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const qc = useQueryClient();

  const info = PROVIDER_INFO[provider.provider] || { color: "bg-muted text-muted-foreground", desc: "", models: [], supportsAudio: false };

  const saveMutation = useMutation({
    mutationFn: (data: Partial<AiProvider>) =>
      api.put(`/settings/ai-providers/${provider.provider}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-providers"] });
      onSave();
    },
  });

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.post(`/settings/ai-providers/${provider.provider}/test`, {
        apiKey: apiKey && !apiKey.includes("...") ? apiKey : undefined,
        model,
        apiUrl: apiUrl || undefined,
      });
      setTestResult(res.data);
    } catch {
      setTestResult({ ok: false, message: "Erro na requisição" });
    } finally {
      setTesting(false);
    }
  };

  // Border color: gold=text-default, green=audio-default, cyan=fallback, gray=inactive
  const borderClass = provider.isDefault
    ? "border-primary/50"
    : provider.isAudioDefault
    ? "border-green-500/40"
    : provider.enabled
    ? "border-blue-500/30"
    : "border-border/50";

  return (
    <Card className={`border ${borderClass}`}>
      <CardContent className="p-5 space-y-4">

        {/* ── Header ── */}
        <div>
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${info.color}`}>
              {provider.provider}
            </span>
            {/* Text-priority badge */}
            {provider.isDefault && (
              <Badge variant="default" className="gap-1 text-xs">
                <MessageSquare className="w-2.5 h-2.5" /> Texto 1º
              </Badge>
            )}
            {provider.enabled && !provider.isDefault && textOrder && (
              <Badge variant="outline" className="border-blue-500/40 text-blue-400 gap-1 text-xs">
                <MessageSquare className="w-2.5 h-2.5" /> Texto {textOrder}º
              </Badge>
            )}
            {/* Audio-priority badge */}
            {provider.isAudioDefault && (
              <Badge variant="outline" className="border-green-500/40 text-green-400 gap-1 text-xs">
                <Mic className="w-2.5 h-2.5" /> Áudio {audioOrder ? `${audioOrder}º` : "Padrão"}
              </Badge>
            )}
          </div>
          <h3 className="font-semibold text-foreground">{provider.displayName}</h3>
          <p className="text-xs text-muted-foreground">{info.desc}</p>
        </div>

        {/* ── Credentials ── */}
        <div className="space-y-2">
          {provider.provider !== "OLLAMA" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">API Key</label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="flex h-9 w-full rounded-lg border border-input bg-secondary/50 px-3 pr-9 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}
          {provider.provider === "OLLAMA" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">URL Base</label>
              <input
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="http://localhost:11434"
                className="flex h-9 w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Modelo</label>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={info.models[0] || "modelo"}
              list={`models-${provider.provider}`}
              className="flex h-9 w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
            />
            <datalist id={`models-${provider.provider}`}>
              {info.models.map((m) => <option key={m} value={m} />)}
            </datalist>
          </div>
        </div>

        {/* ── Test result ── */}
        {testResult && (
          <div className={`flex items-start gap-2 p-2.5 rounded-lg text-xs ${
            testResult.ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
          }`}>
            {testResult.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
            {testResult.message}
          </div>
        )}

        {/* ── Test + Save config ── */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            loading={testing}
            onClick={handleTest}
            disabled={provider.provider !== "OLLAMA" && !apiKey}
          >
            <TestTube2 className="w-3.5 h-3.5" />
            Testar
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            loading={saveMutation.isPending}
            onClick={() => saveMutation.mutate({
              apiKey: apiKey && !apiKey.includes("...") ? apiKey : undefined,
              model,
              apiUrl: apiUrl || undefined,
            })}
          >
            <Save className="w-3.5 h-3.5" />
            Salvar Config
          </Button>
        </div>

        {/* ── Priority section ── */}
        <div className="border-t border-border/50 pt-3 grid grid-cols-2 gap-3">

          {/* TEXT column */}
          <div className="space-y-2">
            <div className="flex items-center gap-1 text-xs font-semibold text-foreground">
              <MessageSquare className="w-3 h-3" /> Texto
            </div>
            <div className="text-xs text-muted-foreground">
              {provider.isDefault ? (
                <span className="text-primary font-medium">★ 1º Padrão</span>
              ) : provider.enabled ? (
                <span className="text-blue-400">Fallback #{textOrder}</span>
              ) : (
                <span>Inativo</span>
              )}
            </div>
            <div className="space-y-1">
              {!provider.isDefault && (
                <Button
                  size="sm"
                  className="w-full text-xs h-7"
                  loading={saveMutation.isPending}
                  onClick={() => saveMutation.mutate({ isDefault: true, enabled: true })}
                >
                  ★ Definir 1º
                </Button>
              )}
              {!provider.enabled && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs h-7 border-blue-500/40 text-blue-400 hover:bg-blue-500/10"
                  loading={saveMutation.isPending}
                  onClick={() => saveMutation.mutate({ enabled: true, isDefault: false })}
                >
                  + Ativar Fallback
                </Button>
              )}
              {provider.enabled && !provider.isDefault && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs h-7 border-destructive/40 text-destructive hover:bg-destructive/10"
                  loading={saveMutation.isPending}
                  onClick={() => saveMutation.mutate({ enabled: false, isDefault: false })}
                >
                  <PowerOff className="w-3 h-3" /> Desativar
                </Button>
              )}
              {provider.isDefault && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs h-7"
                  loading={saveMutation.isPending}
                  onClick={() => saveMutation.mutate({ isDefault: false, enabled: true })}
                >
                  ↓ Rebaixar Fallback
                </Button>
              )}
            </div>
          </div>

          {/* AUDIO column */}
          <div className="space-y-2">
            <div className="flex items-center gap-1 text-xs font-semibold text-foreground">
              <Mic className="w-3 h-3" /> Áudio
            </div>
            {info.supportsAudio ? (
              <>
                <div className="text-xs text-muted-foreground">
                  {provider.isAudioDefault ? (
                    <span className="text-green-400 font-medium">★ Padrão</span>
                  ) : (
                    <span>Inativo</span>
                  )}
                </div>
                <div className="space-y-1">
                  {!provider.isAudioDefault && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs h-7 border-green-500/40 text-green-400 hover:bg-green-500/10"
                      loading={saveMutation.isPending}
                      onClick={() => saveMutation.mutate({ isAudioDefault: true })}
                    >
                      <Mic className="w-3 h-3" /> Definir Padrão
                    </Button>
                  )}
                  {provider.isAudioDefault && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs h-7 border-destructive/40 text-destructive hover:bg-destructive/10"
                      loading={saveMutation.isPending}
                      onClick={() => saveMutation.mutate({ isAudioDefault: false })}
                    >
                      <PowerOff className="w-3 h-3" /> Remover
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <div className="text-xs text-muted-foreground/50 flex items-center gap-1 pt-1">
                <XCircle className="w-3 h-3" /> Sem suporte
              </div>
            )}
          </div>

        </div>
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const [wppForm, setWppForm] = useState({ accessToken: "", phoneNumberId: "", verifyToken: "", enabled: false });
  const [wppLoaded, setWppLoaded] = useState(false);
  const [toast, setToast] = useState("");
  const [paymentLoaded, setPaymentLoaded] = useState(false);
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [addProviderKey, setAddProviderKey] = useState("");
  const [addDisplayName, setAddDisplayName] = useState("");
  const [addError, setAddError] = useState("");
  const [audioChainForm, setAudioChainForm] = useState<string[]>([]);
  const [audioChainLoaded, setAudioChainLoaded] = useState(false);
  const [paymentForms, setPaymentForms] = useState<Record<PaymentProvider, Record<string, unknown>>>({
    infinitypay: {
      provider: "infinitypay",
      displayName: "InfinityPay",
      description: "Gateway de pagamentos principal",
      isEnabled: false,
      isPrimary: true,
      environment: "sandbox",
      webhookUrl: "http://localhost:3001/api/webhooks/infinitypay",
      timeoutSeconds: 30,
      maxRetries: 3,
      infinityPayMerchantKey: "$mantecinfoxsystem",
      infinityPayApiKey: "",
      infinityPayWebhookSecret: "",
    },
    mercadopago: {
      provider: "mercadopago",
      displayName: "Mercado Pago",
      description: "Gateway de pagamentos secundário",
      isEnabled: false,
      isPrimary: false,
      environment: "sandbox",
      webhookUrl: "http://localhost:3001/api/webhooks/mercadopago",
      timeoutSeconds: 30,
      maxRetries: 3,
      mercadoPagoAccessToken: "",
      mercadoPagoPublicKey: "",
      mercadoPagoWebhookSecret: "",
    },
  });
  const qc = useQueryClient();

  const { data: providers = [] } = useQuery<AiProvider[]>({
    queryKey: ["ai-providers"],
    queryFn: () => api.get("/settings/ai-providers").then((r) => r.data),
  });

  const { data: audioChainData } = useQuery<AudioModelChainSettings>({
    queryKey: ["audio-model-chain"],
    queryFn: () => api.get("/settings/audio-model-chain").then((r) => r.data),
  });

  useEffect(() => {
    if (!audioChainData || audioChainLoaded) return;
    setAudioChainForm(audioChainData.models);
    setAudioChainLoaded(true);
  }, [audioChainData, audioChainLoaded]);

  // Provedores que existem no PROVIDER_INFO mas ainda não estão no banco
  const availableToAdd = Object.keys(PROVIDER_INFO).filter(
    (key) => !providers.some((p) => p.provider === key)
  );

  const addMutation = useMutation({
    mutationFn: (data: { provider: string; displayName: string; model: string }) =>
      api.post("/settings/ai-providers", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-providers"] });
      setShowAddProvider(false);
      setAddProviderKey("");
      setAddDisplayName("");
      setAddError("");
      setToast("Provedor adicionado com sucesso!");
      setTimeout(() => setToast(""), 3000);
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      setAddError(err?.response?.data?.error || "Erro ao adicionar provedor");
    },
  });

  const { data: wppConfigData } = useQuery<Record<string, unknown>>({
    queryKey: ["whatsapp-config"],
    queryFn: () => api.get("/settings/whatsapp").then((r) => r.data),
  });

  useEffect(() => {
    if (wppConfigData && !wppLoaded) {
      setWppForm({
        accessToken: (wppConfigData.accessToken as string) || "",
        phoneNumberId: (wppConfigData.phoneNumberId as string) || "",
        verifyToken: (wppConfigData.verifyToken as string) || "",
        enabled: (wppConfigData.enabled as boolean) || false,
      });
      setWppLoaded(true);
    }
  }, [wppConfigData, wppLoaded]);

  const { data: paymentGatewaysData } = useQuery<{ success: boolean; data: PaymentGatewayConfigView[] }>({
    queryKey: ["payment-gateways-settings"],
    queryFn: () => api.get("/admin/payment-gateways").then((r) => r.data),
  });

  useEffect(() => {
    if (!paymentGatewaysData || paymentLoaded) return;
    const entries = paymentGatewaysData?.data || [];
    const next = { ...paymentForms };
    for (const item of entries) {
      if (item.provider === "infinitypay") {
        next.infinitypay = {
          ...next.infinitypay,
          provider: item.provider,
          displayName: item.displayName,
          description: item.description || "Gateway de pagamentos principal",
          isEnabled: item.isEnabled,
          isPrimary: item.isPrimary,
          environment: item.environment,
          webhookUrl: item.webhookUrl || "http://localhost:3001/api/webhooks/infinitypay",
          timeoutSeconds: item.timeoutSeconds,
          maxRetries: item.maxRetries,
        };
      }
      if (item.provider === "mercadopago") {
        next.mercadopago = {
          ...next.mercadopago,
          provider: item.provider,
          displayName: item.displayName,
          description: item.description || "Gateway de pagamentos secundário",
          isEnabled: item.isEnabled,
          isPrimary: item.isPrimary,
          environment: item.environment,
          webhookUrl: item.webhookUrl || "http://localhost:3001/api/webhooks/mercadopago",
          timeoutSeconds: item.timeoutSeconds,
          maxRetries: item.maxRetries,
        };
      }
    }
    setPaymentForms(next);
    setPaymentLoaded(true);
  }, [paymentGatewaysData, paymentLoaded]);

  const saveWpp = useMutation({
    mutationFn: () => api.put("/settings/whatsapp", wppForm),
    onSuccess: () => { setToast("Configuração WhatsApp salva!"); setTimeout(() => setToast(""), 3000); },
  });

  const runReminders = useMutation({
    mutationFn: () => api.post("/settings/reminders/run"),
    onSuccess: (r) => {
      const d = r.data as { sent: number; failed: number };
      setToast(`Lembretes: ${d.sent} enviados, ${d.failed} falhas`);
      setTimeout(() => setToast(""), 4000);
    },
  });

  const saveAudioChain = useMutation({
    mutationFn: () => api.put("/settings/audio-model-chain", { models: audioChainForm }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audio-model-chain"] });
      setToast("Ordem de fallback de voz salva com sucesso!");
      setTimeout(() => setToast(""), 3000);
    },
    onError: () => {
      setToast("Falha ao salvar ordem de modelos de voz");
      setTimeout(() => setToast(""), 3000);
    },
  });

  function setAudioChainIndex(index: number, model: string) {
    const next = [...audioChainForm];
    next[index] = model;
    setAudioChainForm(next);
  }

  function gatewayPayload(provider: PaymentProvider) {
    const base = { ...(paymentForms[provider] as Record<string, unknown>) };

    if (provider === "infinitypay") {
      delete base.infinityPayApiKey;
      delete base.infinityPayWebhookSecret;
      base.environment = base.environment || "production";
    }

    return base;
  }

  const saveGatewayMutation = useMutation({
    mutationFn: (provider: PaymentProvider) => api.post("/admin/payment-gateways", gatewayPayload(provider)),
    onSuccess: (_resp, provider) => {
      setPaymentLoaded(false); // força recarregar do banco após salvar
      qc.invalidateQueries({ queryKey: ["payment-gateways-settings"] });
      const label = provider === "infinitypay" ? "InfinityPay" : "Mercado Pago";
      setToast(`${label} salvo com sucesso!`);
      setTimeout(() => setToast(""), 3500);
    },
    onError: () => {
      setToast("Falha ao salvar configuração de pagamento");
      setTimeout(() => setToast(""), 3500);
    },
  });

  const testGatewayMutation = useMutation({
    mutationFn: (provider: PaymentProvider) =>
      api.post(`/admin/payment-gateways/${provider}/test`, gatewayPayload(provider)),
    onSuccess: (resp, provider) => {
      const label = provider === "infinitypay" ? "InfinityPay" : "Mercado Pago";
      const payload = resp.data as { success?: boolean; message?: string; checkoutUrl?: string };
      const ok = payload.success;

      if (provider === "infinitypay" && ok && payload.checkoutUrl) {
        const popup = window.open(payload.checkoutUrl, "_blank", "noopener,noreferrer");
        if (!popup) {
          window.location.href = payload.checkoutUrl;
        }
      }

      setToast(payload.message || (ok ? `Teste OK em ${label}` : `Teste falhou em ${label}`));
      setTimeout(() => setToast(""), 3500);
    },
    onError: () => {
      setToast("Erro ao testar conexão do gateway");
      setTimeout(() => setToast(""), 3500);
    },
  });

  function setGatewayField(provider: PaymentProvider, field: string, value: unknown) {
    setPaymentForms((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        [field]: value,
      },
    }));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gerencie integrações e provedores de IA</p>
      </div>

      {toast && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-success/10 border border-success/20 text-success text-sm">
          <CheckCircle2 className="w-4 h-4" /> {toast}
        </div>
      )}

      {/* WhatsApp */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-green-400" />
            <CardTitle>WhatsApp Cloud API</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 rounded-lg bg-secondary/50 border border-border/50 text-xs text-muted-foreground">
            <strong className="text-foreground">Webhook URL:</strong>{" "}
            <code className="font-mono text-primary">http://SEU_IP:3001/api/webhook</code>
            <br />
            Configure esta URL no painel do Meta for Developers.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Access Token</label>
              <input
                type="password"
                value={wppForm.accessToken}
                onChange={(e) => setWppForm({ ...wppForm, accessToken: e.target.value })}
                placeholder="EAAxxxxxxx..."
                className="flex h-9 w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
              />
            </div>
            <Input
              label="Phone Number ID"
              value={wppForm.phoneNumberId}
              onChange={(e) => setWppForm({ ...wppForm, phoneNumberId: e.target.value })}
              placeholder="123456789"
            />
            <Input
              label="Verify Token"
              value={wppForm.verifyToken}
              onChange={(e) => setWppForm({ ...wppForm, verifyToken: e.target.value })}
              placeholder="meu_verify_token_secreto"
            />
            <div className="flex items-center gap-3 pt-5">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={wppForm.enabled}
                  onChange={(e) => setWppForm({ ...wppForm, enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-secondary rounded-full peer peer-checked:bg-primary transition-colors" />
                <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5" />
              </label>
              <span className="text-sm text-foreground">
                {wppForm.enabled ? "Webhook ativo" : "Webhook inativo"}
              </span>
            </div>
          </div>
          <Button loading={saveWpp.isPending} onClick={() => saveWpp.mutate()}>
            <Save className="w-4 h-4" />
            Salvar Configuração
          </Button>
        </CardContent>
      </Card>

      {/* Reminders */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-warning" />
            <CardTitle>Lembretes Automáticos</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Os lembretes são enviados automaticamente todo dia às <strong className="text-foreground">09:00 (Brasília)</strong>:
            3 dias antes do vencimento e no dia do vencimento.
          </p>
          <Button variant="outline" loading={runReminders.isPending} onClick={() => runReminders.mutate()}>
            <Play className="w-4 h-4" />
            Executar Lembretes Agora
          </Button>
        </CardContent>
      </Card>

      {/* AI Providers */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Provedores de IA</h2>
          </div>
          <Button size="sm" variant="outline" onClick={() => { setAddProviderKey(availableToAdd[0] || ""); setShowAddProvider(true); }}>
            <Plus className="w-3.5 h-3.5" />
            Adicionar
          </Button>
        </div>

        {/* Modal de adicionar provedor */}
        {showAddProvider && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <Card className="w-full max-w-sm mx-4 border border-border shadow-2xl">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Adicionar Provedor</CardTitle>
                  <button onClick={() => { setShowAddProvider(false); setAddError(""); }} className="text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Provedor</label>
                  <select
                    value={addProviderKey}
                    onChange={(e) => setAddProviderKey(e.target.value)}
                    className="flex h-9 w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {availableToAdd.length === 0 && <option value="">Todos os provedores já adicionados</option>}
                    {availableToAdd.map((key) => (
                      <option key={key} value={key}>{key} — {PROVIDER_INFO[key].desc}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Nome de exibição</label>
                  <input
                    value={addDisplayName}
                    onChange={(e) => setAddDisplayName(e.target.value)}
                    placeholder={addProviderKey}
                    className="flex h-9 w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                {addError && <p className="text-xs text-destructive">{addError}</p>}
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => { setShowAddProvider(false); setAddError(""); }}>Cancelar</Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={!addProviderKey || availableToAdd.length === 0}
                    loading={addMutation.isPending}
                    onClick={() => addMutation.mutate({ provider: addProviderKey, displayName: addDisplayName || addProviderKey, model: PROVIDER_INFO[addProviderKey]?.models[0] })}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(() => {
            // Compute text ordering: isDefault=1st, then enabled fallbacks by id
            const textOrdered = [...providers]
              .filter((p) => p.isDefault || p.enabled)
              .sort((a, b) => {
                if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
                return a.id - b.id;
              });
            const textOrderMap: Record<string, number> = {};
            textOrdered.forEach((p, i) => { textOrderMap[p.provider] = i + 1; });

            // Compute audio ordering: isAudioDefault providers by id
            const audioOrdered = [...providers].filter((p) => p.isAudioDefault).sort((a, b) => a.id - b.id);
            const audioOrderMap: Record<string, number> = {};
            audioOrdered.forEach((p, i) => { audioOrderMap[p.provider] = i + 1; });

            return providers.map((p) => (
              <ProviderCard
                key={p.provider}
                provider={p}
                textOrder={textOrderMap[p.provider]}
                audioOrder={audioOrderMap[p.provider]}
                onSave={() => { setToast(`${p.displayName} atualizado!`); setTimeout(() => setToast(""), 3000); }}
              />
            ));
          })()}
        </div>

        <Card className="mt-4 border border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mic className="w-4 h-4 text-green-400" />
              Ordem dos Modelos de Áudio
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Sequência de modelos ABACUS usados na transcrição de áudio. Se o 1º falhar, tenta o próximo automaticamente.
            </p>

            {(audioChainData?.allowedModels || []).length > 0 && audioChainForm.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {audioChainForm.map((model, idx) => (
                  <div key={`${model}-${idx}`} className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Prioridade {idx + 1}</label>
                    <select
                      value={model}
                      onChange={(e) => setAudioChainIndex(idx, e.target.value)}
                      className="flex h-9 w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm"
                    >
                      {(audioChainData?.allowedModels || []).map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}

            <Button loading={saveAudioChain.isPending} onClick={() => saveAudioChain.mutate()}>
              <Save className="w-4 h-4" />
              Salvar Ordem de Voz
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Payment Gateways */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <CreditCard className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Pagamentos</h2>
          <Badge variant="outline">InfinityPay + Mercado Pago</Badge>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card className="border border-border/50">
            <CardHeader>
              <CardTitle>InfinityPay</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input
                  label="Display Name"
                  value={String(paymentForms.infinitypay.displayName || "")}
                  onChange={(e) => setGatewayField("infinitypay", "displayName", e.target.value)}
                />
                <Input
                  label="Merchant Key"
                  value={String(paymentForms.infinitypay.infinityPayMerchantKey || "")}
                  onChange={(e) => setGatewayField("infinitypay", "infinityPayMerchantKey", e.target.value)}
                  placeholder="$mantecinfoxsystem"
                />
              </div>

              <div className="p-3 rounded-lg bg-secondary/50 border border-border/50 text-xs text-muted-foreground">
                Fluxo atual: link de pagamento para Pessoa Fisica. Neste modo, API Key e Webhook Secret nao sao necessarios na tela.
              </div>

              <Input
                label="Webhook URL"
                value={String(paymentForms.infinitypay.webhookUrl || "")}
                onChange={(e) => setGatewayField("infinitypay", "webhookUrl", e.target.value)}
                placeholder="http://localhost:3001/api/webhooks/infinitypay"
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Ambiente</label>
                  <select
                    value={String(paymentForms.infinitypay.environment || "sandbox")}
                    onChange={(e) => setGatewayField("infinitypay", "environment", e.target.value)}
                    className="flex h-9 w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm"
                  >
                    <option value="sandbox">sandbox</option>
                    <option value="production">production</option>
                  </select>
                </div>
                <div className="flex items-center gap-4 pt-6">
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={Boolean(paymentForms.infinitypay.isEnabled)}
                      onChange={(e) => setGatewayField("infinitypay", "isEnabled", e.target.checked)}
                    />
                    Ativo
                  </label>
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={Boolean(paymentForms.infinitypay.isPrimary)}
                      onChange={(e) => {
                        setGatewayField("infinitypay", "isPrimary", e.target.checked);
                        if (e.target.checked) setGatewayField("mercadopago", "isPrimary", false);
                      }}
                    />
                    Primário
                  </label>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  loading={testGatewayMutation.isPending}
                  onClick={() => testGatewayMutation.mutate("infinitypay")}
                >
                  <TestTube2 className="w-4 h-4" />
                  Testar
                </Button>
                <Button
                  loading={saveGatewayMutation.isPending}
                  onClick={() => saveGatewayMutation.mutate("infinitypay")}
                >
                  <Save className="w-4 h-4" />
                  Salvar InfinityPay
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border/50">
            <CardHeader>
              <CardTitle>Mercado Pago</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input
                  label="Display Name"
                  value={String(paymentForms.mercadopago.displayName || "")}
                  onChange={(e) => setGatewayField("mercadopago", "displayName", e.target.value)}
                />
                <Input
                  label="Public Key"
                  value={String(paymentForms.mercadopago.mercadoPagoPublicKey || "")}
                  onChange={(e) => setGatewayField("mercadopago", "mercadoPagoPublicKey", e.target.value)}
                  placeholder="APP_USR-..."
                />
              </div>

              <Input
                label="Access Token"
                type="password"
                value={String(paymentForms.mercadopago.mercadoPagoAccessToken || "")}
                onChange={(e) => setGatewayField("mercadopago", "mercadoPagoAccessToken", e.target.value)}
                placeholder="APP_USR-..."
              />

              <Input
                label="Webhook Secret"
                type="password"
                value={String(paymentForms.mercadopago.mercadoPagoWebhookSecret || "")}
                onChange={(e) => setGatewayField("mercadopago", "mercadoPagoWebhookSecret", e.target.value)}
                placeholder="Secret de assinatura"
              />

              <Input
                label="Webhook URL"
                value={String(paymentForms.mercadopago.webhookUrl || "")}
                onChange={(e) => setGatewayField("mercadopago", "webhookUrl", e.target.value)}
                placeholder="http://localhost:3001/api/webhooks/mercadopago"
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Ambiente</label>
                  <select
                    value={String(paymentForms.mercadopago.environment || "sandbox")}
                    onChange={(e) => setGatewayField("mercadopago", "environment", e.target.value)}
                    className="flex h-9 w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm"
                  >
                    <option value="sandbox">sandbox</option>
                    <option value="production">production</option>
                  </select>
                </div>
                <div className="flex items-center gap-4 pt-6">
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={Boolean(paymentForms.mercadopago.isEnabled)}
                      onChange={(e) => setGatewayField("mercadopago", "isEnabled", e.target.checked)}
                    />
                    Ativo
                  </label>
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={Boolean(paymentForms.mercadopago.isPrimary)}
                      onChange={(e) => {
                        setGatewayField("mercadopago", "isPrimary", e.target.checked);
                        if (e.target.checked) setGatewayField("infinitypay", "isPrimary", false);
                      }}
                    />
                    Primário
                  </label>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  loading={testGatewayMutation.isPending}
                  onClick={() => testGatewayMutation.mutate("mercadopago")}
                >
                  <TestTube2 className="w-4 h-4" />
                  Testar
                </Button>
                <Button
                  loading={saveGatewayMutation.isPending}
                  onClick={() => saveGatewayMutation.mutate("mercadopago")}
                >
                  <Save className="w-4 h-4" />
                  Salvar Mercado Pago
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
