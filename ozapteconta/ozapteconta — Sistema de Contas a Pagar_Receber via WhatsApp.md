# ozapteconta â€” Sistema de Contas a Pagar/Receber via WhatsApp

Sistema completo de gestÃ£o financeira pessoal via WhatsApp com dashboard administrativo web.

---

## Funcionalidades

- **Registro de contas via WhatsApp** â€” envie texto ou Ã¡udio e a IA extrai automaticamente tipo, valor, vencimento e natureza (pagar/receber)
- **Listagem de contas** â€” consulte contas a vencer no mÃªs e contas pagas pelo prÃ³prio WhatsApp
- **MarcaÃ§Ã£o como pago** â€” marque contas como pagas via mensagem no WhatsApp
- **Lembretes automÃ¡ticos** â€” notificaÃ§Ãµes 3 dias antes e no dia do vencimento
- **TranscriÃ§Ã£o de Ã¡udio** â€” mensagens de voz sÃ£o transcritas automaticamente antes do processamento
- **Dashboard admin** â€” painel web com mÃ©tricas, listagem, filtros, ediÃ§Ã£o manual e histÃ³rico de Ã¡udios
- **IA modular** â€” suporte a OpenAI, Gemini, Groq, Grok e Ollama (local), configurÃ¡vel pelo dashboard

---

## Estrutura do Projeto

```
whatsapp-finance/
â”œâ”€â”€ install.bat          â† Instalador Windows (execute como Administrador)
â”œâ”€â”€ install.sh           â† Instalador Ubuntu (execute com sudo)
â”œâ”€â”€ backend/             â† Servidor Node.js + Express + Prisma
â”‚   â”œâ”€â”€ src/
â”‚   â”‚   â”œâ”€â”€ server.ts
â”‚   â”‚   â”œâ”€â”€ config/
â”‚   â”‚   â”œâ”€â”€ middleware/
â”‚   â”‚   â”œâ”€â”€ routes/      â† webhook, auth, transactions, settings
â”‚   â”‚   â”œâ”€â”€ services/    â† aiService, whatsappService, messageProcessor, reminderService
â”‚   â”‚   â””â”€â”€ utils/
â”‚   â”œâ”€â”€ prisma/
â”‚   â”‚   â”œâ”€â”€ schema.prisma
â”‚   â”‚   â””â”€â”€ seed.ts
â”‚   â””â”€â”€ .env.example     â† Copie para .env e configure
â””â”€â”€ frontend/            â† Dashboard React + Vite + Tailwind
    â””â”€â”€ src/
        â”œâ”€â”€ pages/       â† Dashboard, Transactions, Audios, Users, Settings, Login
        â””â”€â”€ components/
```

---

## InstalaÃ§Ã£o AutomÃ¡tica

### Windows

> **PrÃ©-requisito:** PostgreSQL 16 instalado com senha `Tra1302`

1. Clique com o botÃ£o direito em `install.bat`
2. Selecione **"Executar como administrador"**
3. Aguarde a instalaÃ§Ã£o concluir
4. O sistema abrirÃ¡ automaticamente em `http://localhost:3001`

### Ubuntu 20.04+

```bash
sudo bash install.sh
```

---

## InstalaÃ§Ã£o Manual

### PrÃ©-requisitos

- Node.js 20+
- PostgreSQL 16+

### Passo a Passo

**1. Configure o banco de dados**

```sql
-- No psql como superusuÃ¡rio:
CREATE USER financebot WITH PASSWORD 'SUA_SENHA';
CREATE DATABASE financebot OWNER financebot;
GRANT ALL PRIVILEGES ON DATABASE financebot TO financebot;
```

**2. Configure o backend**

```bash
cd backend
cp .env.example .env
# Edite .env com suas configuraÃ§Ãµes (DATABASE_URL, JWT_SECRET, etc.)

npm install
npx prisma generate
npx prisma migrate deploy
npm run prisma:seed
npm run build
```

**3. Configure o frontend**

```bash
cd frontend
echo "VITE_API_URL=http://localhost:3001" > .env
npm install
npm run build
```

**4. Inicie o sistema**

```bash
# Modo desenvolvimento (backend serve o frontend automaticamente)
cd backend
npm run dev

# Modo produÃ§Ã£o
cd backend
node dist/server.js
```

O sistema estarÃ¡ disponÃ­vel em `http://localhost:3001`.

---

## ConfiguraÃ§Ã£o PÃ³s-InstalaÃ§Ã£o

### 1. Acesse o Dashboard

- URL: `http://localhost:3001`
- Login: `admin` / `admin123`
- **Altere a senha apÃ³s o primeiro acesso!**

### 2. Configure o WhatsApp

Acesse **ConfiguraÃ§Ãµes â†’ WhatsApp** no dashboard e preencha:

| Campo | Onde obter |
|---|---|
| Access Token | [Meta for Developers](https://developers.facebook.com/apps/) â†’ WhatsApp â†’ API Setup |
| Phone Number ID | Mesmo local acima |
| Verify Token | Qualquer string secreta (ex: `meu_token_secreto`) |

**URL do Webhook para configurar no Meta:**
```
http://SEU_IP:3001/api/webhook
```

> Para expor localmente, use [ngrok](https://ngrok.com): `ngrok http 3001`

### 3. Configure o Provedor de IA

Acesse **ConfiguraÃ§Ãµes â†’ InteligÃªncia Artificial** e selecione o provedor:

| Provedor | Chave necessÃ¡ria |
|---|---|
| OpenAI (GPT) | `OPENAI_API_KEY` |
| Google Gemini | `GEMINI_API_KEY` |
| Groq | `GROQ_API_KEY` |
| Grok (xAI) | `GROK_API_KEY` |
| Ollama (local) | Nenhuma â€” apenas URL do servidor |

---

## Comandos WhatsApp

O usuÃ¡rio interage com o bot enviando mensagens naturais:

| IntenÃ§Ã£o | Exemplos de mensagem |
|---|---|
| Registrar conta a pagar | `"Conta de luz R$ 150 vence dia 20"` |
| Registrar conta a receber | `"Vou receber R$ 500 de aluguel no dia 5"` |
| Ver contas do mÃªs | `"quais contas tenho para pagar?"` / `"lista do mÃªs"` |
| Ver contas pagas | `"o que jÃ¡ paguei?"` / `"contas pagas"` |
| Marcar como pago | `"paguei a conta de luz"` / `"marcar 3 como pago"` |
| Resumo financeiro | `"resumo"` / `"balanÃ§o do mÃªs"` |
| Ajuda | `"ajuda"` / `"comandos"` |

---

## Desenvolvimento

```bash
# Backend em modo watch
cd backend
npm run dev

# Frontend em modo watch
cd frontend
npm run dev   # http://localhost:5173

# Prisma Studio (visualizar banco)
cd backend
npx prisma studio
```

---

## VariÃ¡veis de Ambiente (backend/.env)

| VariÃ¡vel | DescriÃ§Ã£o | PadrÃ£o |
|---|---|---|
| `PORT` | Porta do servidor | `3001` |
| `DATABASE_URL` | Connection string PostgreSQL | â€” |
| `JWT_SECRET` | Segredo para tokens JWT | â€” |
| `FRONTEND_URL` | URL do frontend (CORS) | `http://localhost:3000` |
| `AUDIO_STORAGE_PATH` | Pasta para salvar Ã¡udios | `./storage/audios` |
| `WHATSAPP_ACCESS_TOKEN` | Token da API WhatsApp Cloud | â€” |
| `WHATSAPP_PHONE_NUMBER_ID` | ID do nÃºmero WhatsApp | â€” |
| `WHATSAPP_VERIFY_TOKEN` | Token de verificaÃ§Ã£o do webhook | â€” |
| `OPENAI_API_KEY` | Chave OpenAI | â€” |
| `GEMINI_API_KEY` | Chave Google Gemini | â€” |
| `GROQ_API_KEY` | Chave Groq | â€” |
| `GROK_API_KEY` | Chave Grok (xAI) | â€” |
| `OLLAMA_BASE_URL` | URL do servidor Ollama local | `http://localhost:11434` |

---

## Changelog de Desenvolvimento

### [2026-05-10] â€” SessÃ£o atual

#### Categorias

- **+10 categorias COMERCIAL setor-especÃ­ficas** adicionadas ao `backend/prisma/seed.ts`:
  - ClÃ­nica MÃ©dica, ClÃ­nica OdontolÃ³gica, Hospital, Supermercado, Padaria e Confeitaria, FarmÃ¡cia, Restaurante, AÃ§ougue, Mercearia, Transporte por App
- Total: **26 PESSOAL + 30 COMERCIAL** categorias no banco

#### IA â€” `backend/src/services/aiService.ts`

- **Prompt dinÃ¢mico**: `buildExtractionPrompt()` carrega categorias do banco em tempo real com palavras-chave
- **Timeout OLLAMA ampliado**: 60 s (outros provedores 30 s)
- **Fallback regex** implementado com **28 entradas** cobrindo todas as categorias PESSOAL:
  - Exemplos: `gasolina/combustÃ­vel`, `luz/energia`, `aluguel`, `mercado/supermercado`, `salÃ¡rio/recebi`, `presente/namorado/natal`, `carta.*namorado`, `comprei.*namorado`, etc.
  - O fallback retorna `needsMoreInfo: false` com `confidence: 0.6` quando valor + categoria sÃ£o detectados por regex
- **Modelo padrÃ£o alterado**: `llama3` â†’ `qwen2.5:7b` â†’ **`hermes3:8b`** (mais rÃ¡pido, ~330 ms warm)

#### Processador de Mensagens â€” `backend/src/services/messageProcessor.ts`

- **Prioridade corrigida**: extraÃ§Ã£o IA roda ANTES da base de conhecimento (era o inverso â€” causava respostas educativas em vez de registrar)
- **ConfirmaÃ§Ã£o explÃ­cita** ao registrar: resposta inclui valor, item, categoria, contexto, data/hora e ID da transaÃ§Ã£o
- **`processAudioBuffer()`** exportada: recebe `Buffer` diretamente (para integraÃ§Ã£o QR sem salvar em disco antes)
- Fluxo de Ã¡udio tambÃ©m envia confirmaÃ§Ã£o igual ao texto apÃ³s transcriÃ§Ã£o bem-sucedida

#### TranscriÃ§Ã£o â€” `backend/src/services/transcriptionService.ts`

- **Reescrito completamente** com duas estratÃ©gias em cascata:
  1. **API externa** (OpenAI Whisper / Groq Whisper) â€” usada se houver API key configurada
  2. **Whisper local** (`@xenova/transformers` â€” `Xenova/whisper-small`) â€” fallback sem Python, sem ffmpeg manual
- **ffmpeg bundled** via `@ffmpeg-installer/ffmpeg` + `fluent-ffmpeg`: converte OGG/MP4 â†’ WAV 16kHz mono antes de passar ao Whisper local
- DependÃªncias adicionadas: `@xenova/transformers`, `@ffmpeg-installer/ffmpeg`, `fluent-ffmpeg`, `@types/fluent-ffmpeg`

#### WhatsApp QR â€” `backend/src/services/whatsappQrPairingService.ts`

- **Roteamento de Ã¡udio corrigido**: mensagens com `audioMessage` ou `pttMessage` agora sÃ£o detectadas, o buffer Ã© baixado via `downloadMediaMessage` e roteado para `processAudioBuffer()`
- Antes: Ã¡udios chegavam como `"Mensagem sem texto Ãºtil"` e eram descartados

#### Banco de Dados

- Modelo Ollama atualizado no banco: `qwen2.5:7b` â†’ `hermes3:8b` (via script `.mjs` executado diretamente)
- `backend/prisma/seed.ts` atualizado para refletir `hermes3:8b` como padrÃ£o em futuros seeds

#### Modelos Ollama disponÃ­veis (instalados localmente)

| Modelo | Tamanho | Uso |
|---|---|---|
| `hermes3:8b` | 4.7 GB | **PadrÃ£o** â€” extraÃ§Ã£o de transaÃ§Ãµes |
| `qwen2.5:7b` | 4.7 GB | Alternativo |
| `mistral:7b` | 4.4 GB | Alternativo |
| `deepseek-r1:8b` | 5.2 GB | RaciocÃ­nio |
| `qwen3.5:4b` | 3.4 GB | Leve |
| `gemma4:e4b` | 9.6 GB | Grande |

#### Problemas corrigidos

| Problema | Causa | CorreÃ§Ã£o |
|---|---|---|
| Ãudio nÃ£o registrava | `extractIncomingText()` retornava `null` para Ã¡udio â†’ descartado | Detectar `audioMessage/pttMessage` e chamar `processAudioBuffer()` |
| Bot respondia dicas em vez de registrar | `findKnowledgeAnswer()` tinha prioridade sobre a IA | Invertida prioridade: IA primeiro, base de conhecimento como fallback |
| Ollama retornava 404 | Modelo `llama3` nÃ£o instalado | Trocado para `hermes3:8b` |
| "carta para o namorado" nÃ£o registrava | Regex nÃ£o cobria padrÃ£o sem a palavra "presente" | Regex expandida: `carta.*namorad`, `comprei.*namorad` |
| TranscriÃ§Ã£o sempre falhava | Nenhum provedor com API key disponÃ­vel | Whisper local como fallback automÃ¡tico |

