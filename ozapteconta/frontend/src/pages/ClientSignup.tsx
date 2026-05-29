import React, { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import { PlanCatalog, buildPlanSelectOptions } from "@/components/PlanCatalog";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Select } from "@/components/ui";
import { PLAN_CATALOG_FALLBACK, type PlanCode } from "@/lib/clientUtils";

type RegisterResponse = {
  qrToken: string;
  qrLink: string;
  portalLink: string;
  portalAccess: {
    username: string;
    password: string;
    loginLink: string;
  };
};

const EMPTY_FORM = {
  fullName: "",
  phone: "",
  email: "",
  cpf: "",
  addressStreet: "",
  addressNumber: "",
  addressComplement: "",
  addressNeighborhood: "",
  addressCity: "",
  addressState: "",
  addressZipCode: "",
  plan: "HOME" as PlanCode,
};

export default function ClientSignup() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const referenceCode = (searchParams.get("ref") || "").toUpperCase();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<RegisterResponse | null>(null);

  const planOptions = useMemo(() => buildPlanSelectOptions(PLAN_CATALOG_FALLBACK), []);

  const mutation = useMutation({
    mutationFn: () => api.post("/client-portal/register", {
      ...form,
      ...(referenceCode ? { referenceCode } : {}),
    }),
    onSuccess: (res) => {
      setCreated(res.data as RegisterResponse);
    },
    onError: () => setError("Não foi possível concluir seu cadastro. Verifique os campos e tente novamente."),
  });

  if (created) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-3xl mx-auto space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Cadastro concluído com sucesso</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">Guarde seus dados de acesso. Este painel é somente leitura para consulta e relatórios.</p>
              <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 space-y-1">
                <p className="text-sm"><strong>Link:</strong> {created.portalAccess.loginLink}</p>
                <p className="text-sm"><strong>Login:</strong> {created.portalAccess.username}</p>
                <p className="text-sm"><strong>Senha:</strong> {created.portalAccess.password}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={created.portalAccess.loginLink} target="_blank" rel="noreferrer">
                  <Button>Acessar portal web</Button>
                </a>
                <Button variant="outline" onClick={() => navigate(`/cliente/qr/${created.qrToken}`)}>
                  Ir para ativação QR
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Cadastro ozapteconta</h1>
          <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
            Escolha seu plano, preencha os dados e conecte pelo WhatsApp. Preços atualizados direto do sistema.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Planos disponíveis</CardTitle>
            <p className="text-sm text-muted-foreground">
              Clique no plano desejado. O Travel inclui busca de voos por texto ou áudio no WhatsApp.
            </p>
          </CardHeader>
          <CardContent>
            <PlanCatalog
              selectedPlan={form.plan}
              onSelectPlan={(plan) => setForm({ ...form, plan })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dados do cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {referenceCode && (
              <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs text-foreground">
                Atendimento direcionado automaticamente pela referência: <strong>{referenceCode}</strong>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              <Input label="Nome completo" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
              <Input label="Telefone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <Input label="CPF" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} />
              <Input label="Rua" value={form.addressStreet} onChange={(e) => setForm({ ...form, addressStreet: e.target.value })} />
              <Input label="Número" value={form.addressNumber} onChange={(e) => setForm({ ...form, addressNumber: e.target.value })} />
              <Input label="Complemento" value={form.addressComplement} onChange={(e) => setForm({ ...form, addressComplement: e.target.value })} />
              <Input label="Bairro" value={form.addressNeighborhood} onChange={(e) => setForm({ ...form, addressNeighborhood: e.target.value })} />
              <Input label="Cidade" value={form.addressCity} onChange={(e) => setForm({ ...form, addressCity: e.target.value })} />
              <Input label="Estado (UF)" value={form.addressState} onChange={(e) => setForm({ ...form, addressState: e.target.value })} />
              <Input label="CEP" value={form.addressZipCode} onChange={(e) => setForm({ ...form, addressZipCode: e.target.value })} />
              <Select
                label="Plano confirmado"
                value={form.plan}
                onChange={(e) => setForm({ ...form, plan: e.target.value as PlanCode })}
                options={planOptions}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button size="lg" loading={mutation.isPending} onClick={() => mutation.mutate()}>
              Finalizar cadastro e gerar QR Code
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
