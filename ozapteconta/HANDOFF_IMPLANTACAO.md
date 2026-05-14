# Handoff de implantação — ozapteconta

Documento para outra IA ou desenvolvedor assumir o projeto com contexto completo do que foi analisado, alterado e implantado até **14/05/2026**.

---

## 1. Resumo executivo

O `ozapteconta` é um monorepo:

| Camada | Stack |
|--------|--------|
| Backend | Node.js, Express, TypeScript, Prisma, PM2 |
| Frontend | React 18, Vite, Tailwind |
| Banco | PostgreSQL 12 |
| Proxy | Nginx (porta 80 → app Node 3001) |
| WhatsApp QR | Baileys (versão fixada em 6.7.21) |
| IA | Gemini, Abacus, Groq, Grok, OpenAI, Ollama (configurável no painel) |

**Ambiente de produção atual:** Ubuntu 20.04 em `192.168.4.100`, usuário `pc`, app em `/home/pc/ozapteconta`, processo PM2 `ozapteconta`.

**URL de acesso:** `http://192.168.4.100`

Foi tentada implantação na Hostinger (Cloud compartilhado), mas o ambiente não era adequado (sem Node persistente/root). A estratégia final adotada foi **VPS/Ubuntu local na rede**.

---

## 2. Arquitetura em produção (Ubuntu)

```text
Internet/LAN
    |
    v
Nginx :80  (192.168.4.100)
    |
    v
Node/Express :3001  (PM2: ozapteconta)
    |-- API /api/*
    |-- frontend/dist (mesmo processo, NODE_ENV=production)
    |
    v
PostgreSQL :5432 (localhost)
    banco: ozapteconta
    usuario: ozapteconta

Ollama (opcional, ainda pendente rede)
    Windows 192.168.4.3:11434
    modelo desejado: hermes3:8b
```

Arquivo Nginx: `/etc/nginx/sites-available/ozapteconta` → symlink em `sites-enabled/ozapteconta`.

Health check: `GET http://192.168.4.100/api/health` → `{"status":"ok",...}`

---

## 3. O que existia antes no Ubuntu (removido)

Antes da implantação do `ozapteconta`, o servidor tinha:

| Item | Detalhe |
|------|---------|
| PM2 | `pdv-admin`, `pdv-front`, `servidorlicenca` |
| Pastas | `/home/pc/pdvmetamorfose`, `/home/pc/apps/servidorlicenca` |
| PostgreSQL | bancos `pdv_sistema`, `pdv_sistema_test`, role `pdv` |
| Portas em uso | 3000, 3001 (antigo), 80, 5432, 11434 (Ollama local vazio) |

### Backup criado antes da remoção

```
/home/pc/backups/pre-ozapteconta-20260514-155228/
├── pdvmetamorfose.tar.gz
├── apps/servidorlicenca.tar.gz
├── pdv_sistema.dump
├── pdv_sistema_test.dump
├── nginx-etc.tar.gz
├── pm2-list.txt
└── pm2-jlist.json
```

O usuário autorizou **remoção total** do sistema antigo e limpeza dos bancos antigos.

---

## 4. Implantação realizada no Ubuntu

### 4.1 Cópia do projeto

- Origem: workspace local `ozapteajuda/ozapteconta`
- Destino: `/home/pc/ozapteconta`
- Método: tarball `ozapteconta-deploy.tgz` via SCP

### 4.2 PostgreSQL

- Banco: `ozapteconta`
- Usuário: `ozapteconta`
- Senha: gerada no deploy (armazenada em `/home/pc/ozapteconta/backend/.env` — **não commitar**)
- Schema: `prisma db push` + `prisma seed`
- **Não há** pasta `backend/prisma/migrations` versionada no repositório; primeiro deploy usou `db push`

### 4.3 Build e PM2

```bash
cd /home/pc/ozapteconta
npm ci --prefix backend --legacy-peer-deps
npm ci --prefix frontend --legacy-peer-deps
npm run build --prefix frontend
npm run prisma:generate --prefix backend
npm run build --prefix backend
cd backend && pm2 start npm --name ozapteconta -- start
pm2 save --force
```

Serviço systemd relacionado: `pm2-pc.service` (ativo).

### 4.4 Variáveis em produção (`backend/.env`)

Principais (valores reais no servidor, não no Git):

- `NODE_ENV=production`
- `PORT=3001`
- `DATABASE_URL=postgresql://ozapteconta:***@localhost:5432/ozapteconta`
- `JWT_SECRET=<gerado no deploy>`
- `FRONTEND_URL=http://192.168.4.100`
- `AUDIO_STORAGE_PATH=/home/pc/ozapteconta/storage/audios`
- `REPORTS_STORAGE_PATH=/home/pc/ozapteconta/storage/reports`
- `LOG_FILE=/home/pc/ozapteconta/logs/app.log`

### 4.5 Login admin inicial (seed)

- Usuário: `admin`
- Senha: `admin123` (trocar em produção)

---

## 5. Acesso SSH ao Ubuntu

| Campo | Valor |
|-------|--------|
| IP | `192.168.4.100` |
| Porta | `22` |
| Usuário | `pc` |
| Senha | definida pelo usuário no chat (rotacionar se necessário) |
| Host key SSH | `SHA256:HgYOyG848dSLLlCprrY7xMiNqJ+vl34RMth8OsGyk3g` |

Comandos úteis:

```bash
ssh pc@192.168.4.100
pm2 list
pm2 logs ozapteconta --lines 100
pm2 restart ozapteconta --update-env
sudo systemctl status nginx
sudo systemctl status postgresql
```

---

## 6. Alterações feitas no repositório (código)

### 6.1 Scripts e deploy (raiz `ozapteconta/`)

| Arquivo | Função |
|---------|--------|
| `package.json` | Scripts `hostinger:*`, `build`, `start` |
| `scripts/hostinger-build.cjs` | Valida env, build frontend + backend |
| `scripts/hostinger-db-push.cjs` | `prisma db push` + seed opcional |
| `scripts/validate-hostinger-env.cjs` | Valida variáveis obrigatórias |
| `scripts/validate-hostinger-deploy.cjs` | Testa `/api/health` e HTML do frontend |
| `.env.hostinger.example` | Checklist de variáveis |
| `.nvmrc` | Node 20 |
| `HOSTINGER_DEPLOY.md` | Guia Hostinger (alternativa cloud) |
| `storage/audios/.gitkeep`, `storage/reports/.gitkeep`, `logs/.gitkeep` | Pastas persistentes |

### 6.2 Backend — WhatsApp / Baileys

**Problema:** `@whiskeysockets/baileys@7.0.0-rc10` usava `whatsapp-rust-bridge` com erro WASM SIMD no servidor Ubuntu.

**Correções em** `backend/src/services/whatsappQrPairingService.ts`:

1. Downgrade Baileys para **`6.7.21`** (`backend/package.json`)
2. Import dinâmico do Baileys (evita crash no boot)
3. `fetchLatestBaileysVersion()` antes de criar socket (corrige erro 405 no pareamento)
4. Sessões antigas em `backend/storage/wa-sessions/` foram limpas em testes

**Problema secundário:** UI mostrava "Erro ao criar conta" quando na verdade a conta era criada (`201`) e falhava só no `pairing/start`.

### 6.3 Backend — IA (`aiService.ts`, `transcriptionService.ts`, `routes/settings.ts`)

| Problema | Correção |
|----------|----------|
| Gemini `gemini-1.5-flash` 404 | Default e seed → `gemini-2.5-flash` |
| Abacus `gpt-5` | Default → `gpt-4o-mini` |
| Groq `llama3-8b-8192` descontinuado | Normalização → `llama-3.1-8b-instant` |
| Grok `grok-beta` | Normalização → `grok-2-latest` |
| Áudio usava `gemini-2.5-pro` na cadeia Abacus | Removido; cadeia só modelos de áudio OpenAI |
| Groq Whisper usava `whisper-1` | Groq → `whisper-large-v3` |
| Ollama sem modelos no Ubuntu | `ensureOllamaModelAvailable()` + mensagem clara |
| Modelos obsoletos salvos pela UI | `normalizeAiProviderModel()` em `settings.ts` |

Funções importantes em `aiService.ts`:

- `normalizeModelForProvider()` — mapeia modelos antigos
- `ensureOllamaModelAvailable()` — consulta `/api/tags` antes de chamar Ollama
- `getProviderChain()` — ordem de fallback texto/áudio

### 6.4 Frontend

`frontend/src/pages/Settings.tsx` — listas de modelos atualizadas (Gemini 2.5, Groq novos, Abacus `gpt-4o-mini`, etc.)

### 6.5 Seed Prisma

`backend/prisma/seed.ts` — defaults de provedores IA e Ollama desabilitado por padrão (sem modelos locais no Ubuntu).

---

## 7. Estado atual dos provedores de IA (servidor)

Última validação conhecida:

| Provedor | Modelo | Habilitado | Observação |
|----------|--------|------------|------------|
| GEMINI | gemini-2.5-flash | sim | Teste OK |
| ABACUS | gpt-4o-mini | sim | Teste OK; precisa API key no painel |
| GROQ | llama-3.1-8b-instant | variável | Normalização de modelos antigos ativa |
| GROK | grok-2-latest | não | Sem chave |
| OPENAI | gpt-4o-mini | não | Sem chave |
| OLLAMA | hermes3:8b | **não** | `apiUrl=http://192.168.4.3:11434` — ver seção 8 |

Cadeia de áudio (`abacus_audio_model_chain`):

```text
gpt-4o-audio-preview,gpt-4o-mini-audio-preview
```

---

## 8. Ollama no Windows (pendência de rede)

O usuário informou que o Ollama está no PC Windows:

- IP: `192.168.4.3`
- Porta: `11434`
- Modelo desejado: `hermes3:8b` (confirmado instalado localmente)

### O que já foi feito

1. `OLLAMA_HOST=0.0.0.0:11434` definido no Windows (variável de usuário)
2. Ollama reiniciado; passou a escutar em `0.0.0.0:11434` (além de instância antiga em 127.0.0.1)
3. `apiUrl` do provedor OLLAMA no banco apontando para `http://192.168.4.3:11434`
4. Ollama mantido **desabilitado** no painel para não quebrar a cadeia de IA

### O que ainda falta

Do Ubuntu (`192.168.4.100`) para o Windows (`192.168.4.3:11434`) ainda ocorre **timeout** — firewall do Windows bloqueando entrada na porta 11434.

**Comando para liberar (PowerShell como Administrador no Windows):**

```powershell
New-NetFirewallRule -DisplayName "Ollama 11434 LAN" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 11434 -Profile Any
```

**Teste do Ubuntu após liberar:**

```bash
curl -fsS http://192.168.4.3:11434/api/tags
```

**Depois habilitar Ollama no banco/painel:**

```sql
-- ou via API PUT /api/settings/ai-providers/OLLAMA
enabled=true, apiUrl=http://192.168.4.3:11434, model=hermes3:8b
```

Modelos disponíveis no Ollama Windows (quando acessível): `hermes3:8b`, `qwen2.5:7b`, `mistral:7b`, `deepseek-r1:8b`, `qwen3.5:4b`, `gemma4:e4b`.

---

## 9. Tentativa Hostinger (histórico)

Foi analisado ambiente Hostinger compartilhado (`u326559829@82.197.88.197:65002`):

- CloudLinux/CageFS, PHP, sem Node/PostgreSQL no PATH padrão
- Domínio `ozapteconta.com.br` com `public_html` estático
- **Não adequado** para este stack sem VPS/App Node

Foi criado guia [`HOSTINGER_DEPLOY.md`](HOSTINGER_DEPLOY.md) e scripts `hostinger:*` para deploy futuro em App Node.js + PostgreSQL gerenciado.

---

## 10. Comandos de operação

### Desenvolvimento local (Windows)

```powershell
cd ozapteconta
npm run dev
```

### Build local

```powershell
cd ozapteconta
npm run hostinger:build
```

### Atualizar servidor Ubuntu após mudanças no código

1. Gerar tarball (excluir `node_modules`, `.env`):

```powershell
tar --exclude='ozapteconta/backend/.env' --exclude='ozapteconta/**/node_modules' --exclude='ozapteconta/**/dist' -czf ozapteconta-deploy.tgz -C "caminho\ozapteajuda" ozapteconta
```

2. Enviar e aplicar:

```bash
# no servidor
cd /home/pc
tar -xzf ozapteconta-deploy.tgz
cd ozapteconta
npm ci --prefix backend --legacy-peer-deps
npm ci --prefix frontend --legacy-peer-deps
npm run build --prefix frontend
npm run prisma:generate --prefix backend
npm run build --prefix backend
pm2 restart ozapteconta --update-env
```

### Banco (sem migrations versionadas)

```bash
cd /home/pc/ozapteconta/backend
npm run prisma:push
# opcional:
npm run prisma:seed
```

---

## 11. Validações recomendadas

```bash
# Saúde
curl http://192.168.4.100/api/health

# Login admin
curl -X POST http://192.168.4.100/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Provedores IA (com token)
curl http://192.168.4.100/api/settings/ai-providers -H "Authorization: Bearer <token>"

# Cadeia áudio
curl http://192.168.4.100/api/settings/audio-model-chain -H "Authorization: Bearer <token>"
```

No painel: Configurações → testar cada provedor; WhatsApp → Adicionar e Parear (QR).

---

## 12. Problemas conhecidos e soluções

| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| App reinicia em loop PM2 | Baileys 7 + WASM | Usar Baileys 6.7.21 |
| QR não aparece / erro 405 | Versão WA desatualizada | `fetchLatestBaileysVersion` (já no código) |
| Gemini 404 model not found | Modelo 1.5 | Usar `gemini-2.5-flash` |
| Groq model decommissioned | `llama3-8b-8192` | Normalização para `llama-3.1-8b-instant` |
| Ollama model not found | Sem modelos no host Ubuntu | Apontar para Windows ou instalar modelo local |
| Ollama timeout do Ubuntu | Firewall Windows | Regra inbound porta 11434 |
| "Erro ao criar conta" WhatsApp | Falha no pairing após create 201 | Ver logs PM2; corrigir Baileys/rede |

Logs:

```bash
tail -f /home/pc/ozapteconta/logs/app.log
pm2 logs ozapteconta
```

---

## 13. Pendências para o próximo responsável

1. **Liberar firewall Windows** para Ollama (`192.168.4.3:11434`) e habilitar OLLAMA no painel
2. **Trocar senha admin** e `JWT_SECRET` se expostos
3. **Versionar migrations Prisma** (`prisma migrate dev` + commit de `prisma/migrations/`)
4. **HTTPS/SSL** se expor na internet (Certbot + domínio)
5. **Commitar `ozapteconta/` no Git** — no momento do handoff o diretório aparecia como não rastreado (`?? ozapteconta/`) no repositório pai `ozapteajuda`
6. Revisar `npm audit` no backend (vulnerabilidades reportadas)
7. Confirmar chaves API reais de GEMINI, ABACUS, GROQ no painel de produção
8. Testar fluxo completo: mensagem texto, áudio, webhook WhatsApp, persistência em `storage/` após restart

---

## 14. Mapa de arquivos importantes

```text
ozapteconta/
├── HANDOFF_IMPLANTACAO.md          # este documento
├── HOSTINGER_DEPLOY.md
├── .env.hostinger.example
├── package.json
├── scripts/
│   ├── hostinger-build.cjs
│   ├── hostinger-db-push.cjs
│   ├── validate-hostinger-env.cjs
│   └── validate-hostinger-deploy.cjs
├── backend/
│   ├── .env                         # produção no servidor (não versionar)
│   ├── package.json                 # Baileys 6.7.21
│   ├── prisma/schema.prisma
│   ├── prisma/seed.ts
│   └── src/
│       ├── server.ts
│       ├── services/aiService.ts
│       ├── services/transcriptionService.ts
│       ├── services/whatsappQrPairingService.ts
│       └── routes/settings.ts
└── frontend/
    └── src/pages/Settings.tsx
```

---

## 15. Contatos de contexto da conversa

- Estratégia mudou de Hostinger compartilhado → Ubuntu 20.04 local (`192.168.4.100`)
- Sistema antigo (`pdvmetamorfose`) foi removido com backup
- Usuário queria Ollama no IP do Windows (`192.168.4.3`) com `hermes3:8b`
- Correções de IA foram feitas em lote (Gemini, Abacus, Groq, áudio, Ollama)

---

*Documento gerado para continuidade do projeto. Atualizar este arquivo quando houver mudanças de infraestrutura, credenciais ou deploy.*
