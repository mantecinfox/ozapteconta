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

## 16. Atualização de sessão — 18/05/2026

### 16.1 Backend — e-mail (template padrao)

Arquivo alterado:

- `backend/src/services/emailService.ts`

Mudancas aplicadas:

1. Parametros opcionais adicionados ao fluxo de envio:
    - `recipientName?`
    - `skipClientTemplate?`
2. Novo builder de HTML padrao para e-mails de cliente/finais:
    - `buildClientEmailHtml(...)`
3. `sendEmail(...)` e `sendEmailWithAttachment(...)` atualizados para suportar os novos parametros.

Resultado validado:

- Build TypeScript OK.
- Envio de teste executado em producao com retorno:
  - `[Email] E-mail enviado para mantecinfox@gmail.com`
  - `testEmailSent true`

### 16.2 Backend — cobranca recorrente (fallback sem assinatura InfinityPay)

Arquivo alterado:

- `backend/src/services/recurringBillingService.ts`

Correcao implementada:

1. Quando `infinityPaySubscriptionId` estiver ausente, o fluxo nao tenta debito automatico direto.
2. Nesse cenario, envia link de recuperacao/renovacao (em vez de marcar falha imediata indevida).
3. Mantem remarcacao de `nextBillingDate` e registro de acao no gateway log.

Validacao executada em servidor:

- Build + restart PM2 OK (`ozapteconta` online).
- Execucao de teste forcando vencimento:
  - `recoveryLogs: 1`
  - `failedPayments: 0`
  - `lastRecoveryAction: recovery_link_sent_subscription_1_automatic_charge_unavailable`

Observacao operacional:

- Em parte dos testes apareceu log de reconexao WhatsApp QR com codigo `440`.

### 16.3 Analise de incidente (mensagem "nao consegui ler o conteudo")

Arquivos analisados:

- `backend/src/services/whatsappQrPairingService.ts`
- `backend/src/services/messageProcessor.ts`
- `backend/src/services/aiService.ts`

Conclusao tecnica registrada:

1. A mensagem "Recebi sua mensagem mas nao consegui ler o conteudo" e enviada por timer no fluxo QR quando chega payload sem texto util.
2. O aviso era enviado com atraso fixo de 8s (segunda chance para append/notificacao completa do WhatsApp).
3. Esse fallback de ilegibilidade acontece antes do pipeline de IA; portanto, esse evento especifico nao aponta diretamente para Ollama.
4. Ollama pode impactar latencia quando acionado, mas nao e o gatilho desse aviso de conteudo ilegivel.

### 16.4 Ordem de provedores IA alterada nesta sessao

Arquivo alterado:

- `backend/src/services/aiService.ts`

Estado anterior (texto):

- `GROQ -> ABACUS -> GEMINI -> OPENAI -> GROK -> OLLAMA`

Novo estado aplicado (texto):

- `OLLAMA -> ABACUS -> GEMINI -> GROQ`

Novo estado aplicado (audio):

- `ABACUS -> GEMINI -> GROQ`

Detalhe importante:

1. Para `source = "text"`, a selecao foi restringida aos provedores:
    - `OLLAMA`, `ABACUS`, `GEMINI`, `GROQ`
2. `OPENAI` e `GROK` deixaram de participar do fallback textual nessa configuracao.

Validacao local:

- `npm run build` (backend) concluido sem erros apos as alteracoes.

### 16.5 Deploy do ajuste de prioridade IA

Status atual:

- Alteracoes de prioridade (texto/audio) confirmadas no codigo local.
- Build local validado com sucesso.
- Implantacao remota dessas alteracoes de prioridade ainda deve ser executada no servidor para entrar em producao, se ainda nao aplicada via ciclo de deploy completo.

Passo recomendado (rapido):

1. Enviar `backend/src/services/aiService.ts` atualizado para o servidor.
2. Rodar build no servidor (`npm run build` no backend).
3. Reiniciar PM2 (`pm2 restart ozapteconta --update-env`).
4. Validar resposta com testes de texto e audio.

## 17. Pendencias de continuidade (agente seguinte)

1. Confirmar deploy remoto final da mudanca de ordem dos provedores IA.
2. Registrar commit(s) com mensagem clara separando:
    - e-mail/template
    - recorrencia/fallback InfinityPay
    - prioridade de provedores IA
3. Executar smoke test funcional apos deploy:
    - mensagem de texto simples
    - mensagem de audio
    - validacao de fallback de IA conforme nova ordem

## 18. Atualizacao de sessao — 18/05/2026 (hardening fluxo "conteudo ilegivel")

Arquivo alterado:

- `backend/src/services/whatsappQrPairingService.ts`

Mudancas implementadas:

1. Timer de fallback de mensagem ilegivel migrado para configuracao por ambiente:
    - `WPP_UNREADABLE_DELAY_MS` (default aplicado: `12000`)
    - faixa protegida por clamp: 8s ate 30s
2. Extracao de texto robustecida para payloads interativos/parciais:
    - suporte adicional para campos de botoes/listas/template/interativo
    - fallback recursivo para localizar texto util em estruturas aninhadas
3. Antes de enviar resposta negativa, o sistema tenta recuperar contexto recente:
    - busca contexto do usuario no `conversationContext`
    - se detectar consulta de mercado recente, reaproveita a intencao e processa
4. Fallback final foi trocado para mensagem orientativa/positiva (sem tom de erro), com exemplos praticos de consulta.

Deploy em producao (Ubuntu `192.168.4.100`) concluido:

1. Arquivo sincronizado via `scp` para `/home/pc/ozapteconta/backend/src/services/whatsappQrPairingService.ts`
2. Build remoto executado com sucesso (`npm run build` no backend)
3. Processo reiniciado com `pm2 restart ozapteconta --update-env`
4. Validacao de saude concluida com sucesso:
    - `curl http://127.0.0.1:3001/api/health` => `{"status":"ok",...}`
    - `curl http://192.168.4.100/api/health` => `{"status":"ok",...}`

Observacao:

- Durante os restarts, houve janelas curtas de `502 Bad Gateway` no Nginx ate o processo Node estabilizar; apos estabilizacao, health checks retornaram `ok`.

## 19. Atualizacao de sessao — 18/05/2026 (filas Redis + workers)

Objetivo solicitado:

- Criar filas com workers dedicados para: FIPE, mercado financeiro, nutricao, gastos.
- Reservar mais 5 workers para crescimento.
- Enviar aviso ao cliente a cada 7s quando a solicitacao estiver em processamento.

Implementacao de codigo concluida:

1. Dependencias adicionadas no backend:
    - `bullmq`
    - `ioredis`
2. Infra de filas criada:
    - `backend/src/queues/names.ts`
    - `backend/src/queues/types.ts`
    - `backend/src/queues/redis.ts`
    - `backend/src/queues/client.ts`
    - `backend/src/queues/processors.ts`
3. Worker entrypoint criado:
    - `backend/src/workers/startWorker.ts`
4. Scripts de workers adicionados em `backend/package.json`.
5. Arquivo PM2 para app + workers criado:
    - `backend/ecosystem.config.cjs`
6. Variaveis Redis adicionadas em `backend/.env.example` e suporte no `backend/src/config/index.ts`.
7. Fluxo de atendimento atualizado em `backend/src/services/messageProcessor.ts`:
    - Enfileiramento para FIPE, mercado, nutricao e gastos.
    - Aviso periodico de processamento a cada 7 segundos para reduzir reenvios duplicados.
    - Fallback seguro para processamento direto quando Redis/fila estiver indisponivel.

Status em producao (Ubuntu):

1. Codigo atualizado e build remoto aplicado com sucesso.
2. Processo principal `ozapteconta` online e health check `ok`.
3. Workers foram criados no PM2, porem mantidos em `stopped` para evitar ruido de logs enquanto Redis nao estiver ativo.

Pendencia bloqueante atual:

- Redis nao esta instalado/ativo no servidor (`ECONNREFUSED 127.0.0.1:6379`), e instalacao exige `sudo` com senha correta do Ubuntu (diferente da senha SSH usada na sessao).

Proximo passo para ativacao final dos workers:

1. Instalar e subir Redis no Ubuntu com credencial sudo valida.
2. Iniciar workers no PM2:
    - `ozapteconta-worker-fipe`
    - `ozapteconta-worker-market`
    - `ozapteconta-worker-nutrition`
    - `ozapteconta-worker-expenses`
    - `ozapteconta-worker-reserve-1` ate `ozapteconta-worker-reserve-5`
3. Confirmar conectividade (`redis-cli ping`) e executar smoke test de fila.

## 20. Atualizacao final de sessao — 18/05/2026 (commit, push, deploy e testes remotos)

### 20.1 Problema transitório de compilacao local

Durante a sessao apareceu um erro TypeScript em `backend/src/services/recurringBillingService.ts` com mensagens como:

- `TS1005 ':' expected`
- `TS1005 ',' expected`
- `TS1472 'catch' or 'finally' expected`

Contexto importante:

1. O erro foi transitório durante uma execucao anterior de build/terminal.
2. Um novo build local executado depois concluiu com sucesso.
3. O estado final considerado valido foi o do build local bem-sucedido e do build remoto apos deploy.

### 20.2 Commit e push realizados

Repositorio remoto utilizado:

- `https://github.com/mantecinfox/ozapteconta.git`

Commit realizado e enviado:

- Hash: `57015b4`
- Mensagem: `fix(payments): alinhar ciclo de 30 dias e enviar link por email`

Arquivos incluidos nesse commit segundo o terminal:

- `backend/src/routes/clientPortal.ts`
- `backend/src/routes/clients.ts`
- `backend/src/services/emailService.ts`
- `backend/src/services/infinityPayService.ts`
- `backend/src/services/recurringBillingService.ts`

### 20.3 Deploy remoto concluido em producao

Servidor:

- `pc@192.168.4.100`

Sequencia executada com sucesso:

1. `git pull origin main`
2. Confirmacao do HEAD remoto implantado: `57015b4`
3. `cd backend && npm run build`
4. `pm2 restart ozapteconta`
5. Validacao PM2 com processo `ozapteconta` online

Resultado observado:

- PM2 reiniciou o processo com sucesso
- Processo permaneceu `online`

### 20.4 Validacao de clientes em producao

Consulta remota confirmou cliente ativo de teste:

- `id: 1`
- `fullName: João Cesar dos Santos Pereira`
- `phone: 553185297356`
- `email: mantecinfox@gmail.com`
- `plan: FULL`
- `status: ACTIVE`

### 20.5 Teste remoto do fluxo de cobranca/renovacao

Validacao executada no servidor contra `dist/services/recurringBillingService`:

Resultado confirmado:

- `recoveryLogs: 1`
- `failedPayments: 0`
- `lastRecoveryAction: recovery_link_sent_subscription_1_automatic_charge_unavailable`

Evidencias importantes do log:

1. O sistema detectou `subscription.infinityPaySubscriptionId` ausente.
2. Em vez de falha imediata de cobranca, gerou link de pagamento.
3. E-mail foi enviado com sucesso para `mantecinfox@gmail.com`.

### 20.6 Teste de envio de e-mail em producao

Teste dedicado executado no servidor retornou:

- `[Email] E-mail enviado para mantecinfox@gmail.com`
- `testEmailSent true`

Conclusao:

- O envio SMTP em producao estava funcional no momento da sessao.

### 20.7 Tentativas de script ad hoc para envio de link de cobranca de teste

Houve varias tentativas via SSH/PowerShell para disparar manualmente um link de cobranca de teste por WhatsApp e e-mail.

Resultado consolidado:

1. O `InfinityPay` conseguiu gerar link de pagamento de teste com sucesso.
2. O envio via WhatsApp falhou porque nao havia API oficial ativa nem sessao QR conectada no momento.
3. Uma tentativa de uso de `sendEmail` a partir de `dist/services/emailService` falhou com:
    - `TypeError: sendEmail is not a function`
4. Inspecao do modulo remoto naquele momento mostrou somente:
    - `isEmailConfigured`
    - `sendEmailWithAttachment`
5. Para contornar e validar o SMTP, foi usado `nodemailer` diretamente com sucesso.

Resultado do envio direto com `nodemailer`:

- `success: true`
- `messageId: <ea3e0a63-0618-afb9-c728-dad04db3b020@ozapteconta.com.br>`

Interpretacao para o proximo agente:

1. O SMTP/credenciais estavam corretos.
2. Vale revalidar o export efetivo de `sendEmail` no build remoto atual de `dist/services/emailService` caso esse helper volte a ser usado em scripts manuais.
3. No codigo-fonte local atual, `sendEmail` existe em `backend/src/services/emailService.ts`.

### 20.8 Observacoes operacionais relevantes

1. O canal WhatsApp QR apresentou repetidos logs de reconexao com codigo `440` durante os testes.
2. Houve bastante atrito com quoting entre PowerShell e SSH ao executar `node -e` remoto.
3. Para proximas automacoes remotas, preferir:
    - arquivo `.js` temporario no servidor, ou
    - heredoc Linux puro aberto dentro de uma sessao SSH interativa, ou
    - script shell enviado sem CRLF.

### 20.9 Estado final ao encerrar esta sessao

Concluido:

1. Commit realizado e enviado ao GitHub.
2. Deploy remoto aplicado no servidor Ubuntu.
3. Build remoto concluido com sucesso.
4. PM2 reiniciado e aplicacao online.
5. Fluxo de recuperacao por link para recorrencia validado.
6. Envio de e-mail de teste validado em producao.

Pontos que ainda merecem verificacao posterior:

1. Confirmar em producao o deploy das alteracoes mais recentes da ordem dos provedores IA, se ainda nao estiverem no commit implantado.
2. Confirmar porque o modulo remoto compilado exposto em `dist/services/emailService` nao mostrou `sendEmail` durante o teste ad hoc, apesar da existencia no fonte local atual.
3. Retestar envio de link por WhatsApp quando houver sessao QR conectada ou API oficial ativa.

---

## 21. APIs externas com fallback (macro, FipeZap, Buscapé) — 21/05/2026

### Arquivos novos

| Arquivo | Função |
|---------|--------|
| `backend/src/services/externalData/externalDataClient.ts` | Fetch com retry 429/503, cache RAM/Redis/disco, fallback chain |
| `backend/src/services/macroIndicatorsService.ts` | IPCA, IPCA 12m, Selic, CDI, IGP-M, IPC-Fipe (BCB→IBGE→BrasilAPI→Ipeadata→brapi) |
| `backend/src/services/fipeZapService.ts` | FipeZap imóveis (Ipeadata → cache disco) |
| `backend/src/services/fipeZapRateLimitService.ts` | 5 consultas/dia/telefone |
| `backend/src/services/priceComparison/adapters/buscapeApiAdapter.ts` | API oficial Buscapé (opcional) |
| `scripts/sync-fipezap-cache.ts` | Job mensal de cache FipeZap |

### Prisma

- `macro_indicator_snapshots` — cache stale de indicadores
- `fipezap_search_logs` — rate limit FipeZap
- Seed: slug `buscape_api` (disabled até tokens)

### Variáveis `.env` (opcionais)

```env
BRAPI_TOKEN=                    # fallback inflação via brapi.dev
BUSCAPE_APP_TOKEN=
BUSCAPE_AUTH_TOKEN=
IPEADATA_BASE_URL=http://www.ipeadata.gov.br/api/odata4
FIPEZAP_CACHE_DIR=/home/pc/ozapteconta/backend/data/fipezap-cache
```

### WhatsApp (plano Completo)

| Consulta | Exemplo |
|----------|---------|
| IPCA / CDI / Selic / IGP-M | `ipca`, `cdi`, `selic`, `igpm` |
| IPCA 12 meses / IPC-Fipe | `ipca 12 meses`, `ipc fipe` |
| FipeZap | `fipezap`, `fipezap sao paulo venda` |
| Ajuda | `indicadores`, `fipezap`, `mercado` |

Comparador de preços permanece aberto no plano Básico.

### Fila Redis

- `svc_fipezap` — worker `ozapteconta-worker-fipezap` (substitui reserve-1)

### Deploy / smoke

```bash
cd backend && npm run prisma:push && npm run build && npm run test:unit
pm2 restart ecosystem.config.cjs --update-env
# Cron mensual (Ubuntu):
# 0 6 5 * * cd /home/pc/ozapteconta/backend && npx ts-node --project tsconfig.seed.json ../scripts/sync-fipezap-cache.ts
```

Smoke WhatsApp: `ipca`, `cdi`, `fipezap`, `comparar preco smart tv 50 polegadas`.

---

*Documento gerado para continuidade do projeto. Atualizar este arquivo quando houver mudanças de infraestrutura, credenciais ou deploy.*
