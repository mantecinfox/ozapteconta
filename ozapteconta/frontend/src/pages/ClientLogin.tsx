import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";

export default function ClientLogin() {
  const { loginClient } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      await loginClient(username.trim(), password);
      navigate("/cliente/painel", { replace: true });
    } catch {
      setError("Credenciais inválidas. Verifique login e senha recebidos no cadastro.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 flex items-center justify-center">
      <Card className="w-full max-w-md border border-border/50">
        <CardHeader>
          <CardTitle>Portal do Cliente</CardTitle>
          <p className="text-sm text-muted-foreground">Acesso web de leitura para seus relatórios financeiros</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            label="Login"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="cliente123456"
          />
          <Input
            label="Senha"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
            placeholder="********"
          />

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button className="w-full" size="lg" loading={loading} onClick={handleSubmit}>
            Entrar no painel
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Ainda não tem cadastro?{" "}
            <a href="/cliente/cadastro" className="text-primary hover:underline">
              Ver planos e assinar
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
