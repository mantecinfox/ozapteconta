# ðŸš€ ozapteconta - Guia de InstalaÃ§Ã£o e ExecuÃ§Ã£o no Windows

## âœ… STATUS: SISTEMA PRONTO PARA FUNCIONAR

AnÃ¡lise completa do sistema realizada. **Tudo estÃ¡ configurado corretamente** para rodar no Windows.

---

## ðŸ“‹ PRÃ‰-REQUISITOS (OBRIGATÃ“RIO)

Certifique-se de ter instalado **ANTES** de executar:

### 1ï¸âƒ£ **Node.js 20.18.0 LTS (ou superior)**
- **Download:** https://nodejs.org/
- **Como verificar:**
  ```cmd
  node --version
  ```
  - Deve mostrar `v20.x.x` ou superior
- **InstalaÃ§Ã£o:** Executar o instalador `.msi` padrÃ£o
- **Importante:** Marque a opÃ§Ã£o "Add to PATH" durante instalaÃ§Ã£o

### 2ï¸âƒ£ **PostgreSQL 16+ (ou superior)**
- **Download:** https://www.enterprisedb.com/downloads/postgres-postgresql-downloads
- **Como verificar:**
  ```cmd
  psql --version
  ```
  - Deve mostrar `psql (PostgreSQL) 16.x` ou superior
- **InstalaÃ§Ã£o:**
  - Executar instalador `.exe`
  - **Senha do superusuÃ¡rio:** `Tra1302` (ou outra de sua preferÃªncia)
  - Marcar opÃ§Ãµes: "PostgreSQL Server" e "Command Line Tools"
  - Adicionar ao PATH automaticamente
- **Verificar se estÃ¡ rodando:**
  ```cmd
  tasklist | find /i "postgres"
  ```
  - Deve listar serviÃ§o `postgres.exe`

### 3ï¸âƒ£ **Git** (Opcional, para clonar repositÃ³rio)
- **Download:** https://git-scm.com/
- **Como verificar:**
  ```cmd
  git --version
  ```

---

## ðŸŽ¯ INSTALAÃ‡ÃƒO AUTOMÃTICA (RECOMENDADO)

### Passo 1: PreparaÃ§Ã£o
1. Certifique-se que Node.js e PostgreSQL estÃ£o instalados
2. Abra um **Command Prompt** ou **PowerShell**
3. Navegue atÃ© a pasta do projeto:
   ```cmd
   cd "C:\Users\{seu_usuario}\OneDrive\Desktop\Sistemas construidos\wpp finance"
   ```

### Passo 2: Executar Instalador
1. **Clique com botÃ£o direito** no arquivo `install.bat`
2. Selecione **"Executar como administrador"**
3. Digite `S` ou `Y` se pedir confirmaÃ§Ã£o
4. Aguarde a instalaÃ§Ã£o (pode levar 5-10 minutos)

### Passo 3: Resultado Esperado
```
============================================================
  ozapteconta - Sistema de Contas a Pagar/Receber via WhatsApp
  Instalador para Windows
============================================================

[1/6] Verificando Node.js...
OK - Node.js v20.18.0

[2/6] Verificando PostgreSQL...
OK - psql (PostgreSQL) 16.x

[3/6] Configurando banco de dados...
OK - Banco: financebot  Usuario: financebot  Senha: Tra1302

[4/6] Configurando variaveis de ambiente...
OK - .env criado com DATABASE_URL configurada

[5/6] Instalando dependencias, migrando banco e compilando...
[âœ“] Backend compilado

[6/6] Compilando frontend...
[âœ“] Frontend compilado

============================================================
  INSTALACAO CONCLUIDA!
============================================================
```

### Passo 4: Iniciar o Sistema
ApÃ³s a instalaÃ§Ã£o, use um destes scripts:

#### **OpÃ§Ã£o A: Iniciar em Primeiro Plano**
```cmd
iniciar.bat
```
- Abre terminal com o servidor rodando
- Pressione `Ctrl+C` para parar

#### **OpÃ§Ã£o B: Iniciar em Background (PM2)**
```cmd
iniciar-bg.bat
```
- Sistema roda em background
- Abre navegador automaticamente em `http://localhost:3001`
- Para parar: `parar.bat`
- Para verificar status: `status.bat`

---

## ðŸ› ï¸ INSTALAÃ‡ÃƒO MANUAL (Se AutomÃ¡tica NÃ£o Funcionar)

### Backend

```cmd
# 1. Entrar na pasta backend
cd backend

# 2. Instalar dependÃªncias
npm install --legacy-peer-deps

# 3. Gerar cliente Prisma
npx prisma generate

# 4. Executar migraÃ§Ãµes do banco
npx prisma migrate deploy

# 5. Fazer seed (dados iniciais)
npm run prisma:seed

# 6. Compilar TypeScript
npm run build

# 7. Iniciar servidor
npm run dev
```

**Resultado esperado:**
```
[13:45:30] ts-node-dev ver. 2.0.0 (using ts-node ver. 10.9.2, typescript ver. 5.7.3)
[13:45:30] Starting... 
[13:45:35] âœ“ Servidor rodando em http://localhost:3001
```

### Frontend

**Em um NOVO terminal:**

```cmd
# 1. Entrar na pasta frontend
cd frontend

# 2. Instalar dependÃªncias
npm install --legacy-peer-deps

# 3. Iniciar servidor de desenvolvimento
npm run dev
```

**Resultado esperado:**
```
VITE v6.0.7  ready in 234 ms

âžœ  Local:   http://localhost:5173/
âžœ  press h to show help
```

---

## ðŸŒ ACESSAR O SISTEMA

### Desenvolvimento
- **Dashboard Admin:** http://localhost:5173/
- **API Backend:** http://localhost:3001/api/

### ProduÃ§Ã£o (ApÃ³s install.bat)
- **Dashboard Admin:** http://localhost:3001/
- **API Backend:** http://localhost:3001/api/

### Verificar SaÃºde do Sistema
```cmd
curl http://localhost:3001/api/health
```

**Resposta esperada:**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "2026-05-10T13:45:35.123Z",
  "uptime": 245.678
}
```

---

## âš™ï¸ CONFIGURAÃ‡ÃƒO INICIAL

### 1. Login PadrÃ£o
- **UsuÃ¡rio:** `admin`
- **Senha:** `admin123`

> âš ï¸ **IMPORTANTE:** Altere a senha apÃ³s primeiro login!

### 2. Configurar WhatsApp Cloud API
1. Acessar Dashboard â†’ Settings â†’ WhatsApp
2. Preencher:
   - `WHATSAPP_ACCESS_TOKEN` - Token da Business API
   - `WHATSAPP_PHONE_NUMBER_ID` - ID do nÃºmero de telefone
   - `WHATSAPP_VERIFY_TOKEN` - Token customizado para webhook
3. Clicar "Salvar"

### 3. Selecionar Provedor de IA
1. Acessar Dashboard â†’ Settings â†’ AI Provider
2. Escolher: OpenAI, Gemini, Groq, Grok, ou Ollama (local)
3. Adicionar chave de API (se nÃ£o for Ollama)
4. Testar conexÃ£o
5. Salvar

### 4. Configurar Webhook WhatsApp
1. Na plataforma Meta Business:
   - URL do Webhook: `https://seu-dominio.com/api/webhook`
   - Verification Token: O token configurado no Dashboard
   - Inscrever-se em eventos: `messages`, `message_status`

---

## ðŸ” VERIFICAÃ‡ÃƒO

### Verificar se Tudo EstÃ¡ Funcionando

```cmd
# 1. Verificar Node.js
node --version

# 2. Verificar PostgreSQL
psql -U postgres -c "SELECT version();"

# 3. Verificar se portas estÃ£o livres
netstat -ano | findstr :3001
netstat -ano | findstr :5173

# 4. Testar API
curl http://localhost:3001/api/health

# 5. Ver logs do PM2
pm2 logs financebot
```

---

## âŒ PROBLEMAS COMUNS E SOLUÃ‡Ã•ES

### âŒ Erro: "Node.js nÃ£o encontrado"
**SoluÃ§Ã£o:**
```cmd
# Reinstale Node.js e adicione ao PATH
# Depois, reinicie o Command Prompt
node --version
```

### âŒ Erro: "PostgreSQL nÃ£o encontrado"
**SoluÃ§Ã£o:**
```cmd
# Adicionar PostgreSQL ao PATH manualmente:
# C:\Program Files\PostgreSQL\16\bin
set PATH=%PATH%;C:\Program Files\PostgreSQL\16\bin

# Verificar
psql --version
```

### âŒ Erro: "Porta 3001 jÃ¡ estÃ¡ em uso"
**SoluÃ§Ã£o:**
```cmd
# Encontrar processo na porta 3001
netstat -ano | findstr :3001

# Matar processo (ex: PID 5678)
taskkill /PID 5678 /F

# Ou mudar porta no .env
# Editar backend/.env: PORT=3002
```

### âŒ Erro: "Connection refused" (PostgreSQL)
**SoluÃ§Ã£o:**
```cmd
# Verificar se PostgreSQL estÃ¡ rodando
tasklist | find /i "postgres"

# Se nÃ£o estiver, reiniciar serviÃ§o:
# Services > postgres > Iniciar

# Ou pela linha de comando:
net start postgresql-x64-16
```

### âŒ Erro: "npm install falhou"
**SoluÃ§Ã£o:**
```cmd
# Limpar cache npm
npm cache clean --force

# Instalar novamente com legacy peer deps
npm install --legacy-peer-deps

# Se ainda falhar, deletar node_modules
rmdir /s /q node_modules
npm install --legacy-peer-deps
```

### âŒ Erro: "prisma migrate deploy falhou"
**SoluÃ§Ã£o:**
```cmd
# Tentar db push em vez de migrate
npx prisma db push

# Ou resetar banco (cuidado - deleta dados):
npx prisma migrate reset
npm run prisma:seed
```

---

## ðŸ›‘ PARAR O SISTEMA

### OpÃ§Ã£o 1: Background (PM2)
```cmd
parar.bat
```

### OpÃ§Ã£o 2: Terminal em Primeiro Plano
```cmd
# Pressionar Ctrl+C
```

### OpÃ§Ã£o 3: ForÃ§ado
```cmd
taskkill /F /IM node.exe
```

---

## ðŸ“ ESTRUTURA DE ARQUIVOS CRIADOS

ApÃ³s instalaÃ§Ã£o bem-sucedida:

```
wpp finance/
â”œâ”€â”€ backend/
â”‚   â”œâ”€â”€ node_modules/          â† DependÃªncias backend
â”‚   â”œâ”€â”€ dist/                  â† Backend compilado
â”‚   â”œâ”€â”€ .env                   â† VariÃ¡veis de ambiente (CRIADO)
â”‚   â”œâ”€â”€ logs/                  â† Arquivos de log
â”‚   â””â”€â”€ storage/
â”‚       â””â”€â”€ audios/            â† Ãudios do WhatsApp
â”‚
â”œâ”€â”€ frontend/
â”‚   â”œâ”€â”€ node_modules/          â† DependÃªncias frontend
â”‚   â”œâ”€â”€ dist/                  â† Frontend compilado
â”‚   â”œâ”€â”€ .env                   â† VariÃ¡veis frontend (CRIADO)
â”‚   â””â”€â”€ public/
â”‚
â”œâ”€â”€ iniciar.bat                â† Script iniciar (CRIADO)
â”œâ”€â”€ iniciar-bg.bat             â† Script iniciar background (CRIADO)
â”œâ”€â”€ parar.bat                  â† Script parar (CRIADO)
â”œâ”€â”€ status.bat                 â† Script status (CRIADO)
â”œâ”€â”€ ecosystem.config.js        â† ConfiguraÃ§Ã£o PM2 (CRIADO)
â””â”€â”€ GUIA_WINDOWS.md            â† Este arquivo
```

---

## ðŸ“ž SUPORTE

Se encontrar problemas:

1. **Verificar logs:**
   ```cmd
   # Backend
   type backend\logs\app.log
   
   # PM2 logs
   pm2 logs financebot
   ```

2. **Verificar conectividade PostgreSQL:**
   ```cmd
   psql -U financebot -d financebot -c "SELECT 1;"
   ```

3. **Testar API:**
   ```cmd
   curl -v http://localhost:3001/api/health
   ```

---

## ðŸŽ‰ PRÃ“XIMOS PASSOS

ApÃ³s instalaÃ§Ã£o bem-sucedida:

1. âœ… Acessar http://localhost:3001
2. âœ… Fazer login com credenciais padrÃ£o
3. âœ… Alterar senha do admin
4. âœ… Configurar WhatsApp Cloud API
5. âœ… Selecionar provedor de IA
6. âœ… Testar bot via WhatsApp

---

**VersÃ£o:** 1.0.0  
**Data:** 10/05/2026  
**Status:** Pronto para ProduÃ§Ã£o âœ…

