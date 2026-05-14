# ðŸš€ ozapteconta - InstalaÃ§Ã£o Simples com npm run dev

**VersÃ£o Alternativa - Sem install.bat complexo**

Se o `install.bat` nÃ£o funcionou para vocÃª, esta Ã© a forma mais simples de rodar o ozapteconta em desenvolvimento.

---

## âš¡ Forma MAIS RÃPIDA (3 passos)

### Passo 1: Instalar DependÃªncias

Duplo-clique em:
```
instalar.bat
```

Aguarde a instalaÃ§Ã£o (2-3 minutos). Ele vai instalar:
- Backend (npm install)
- Frontend (npm install)
- Prisma (generate)
- Banco de dados (se PostgreSQL estiver rodando)

### Passo 2: Iniciar Desenvolvimento

Duplo-clique em:
```
dev-start.bat
```

Isso abre **2 terminais automaticamente**:
- Terminal 1: Backend em `http://localhost:3001`
- Terminal 2: Frontend em `http://localhost:5173`

### Passo 3: Acessar o Sistema

Abra no navegador:
```
http://localhost:5173
```

**Pronto!** Sistema funcionando ðŸŽ‰

---

## ðŸ“‹ PrÃ©-Requisitos (ANTES de comeÃ§ar)

### âœ… Node.js 20+
```cmd
node --version
```
Deve retornar `v20.x.x` ou maior

Se nÃ£o tiver: https://nodejs.org/

### âœ… PostgreSQL 16+
```cmd
psql --version
```
Deve retornar `psql (PostgreSQL) 16.x` ou maior

Se nÃ£o tiver: https://www.enterprisedb.com/downloads/postgres-postgresql-downloads
- Senha padrÃ£o: `Tra1302`

### âœ… PostgreSQL Rodando
```cmd
tasklist | find /i "postgres"
```

Se nÃ£o aparecer `postgres.exe`:
```cmd
net start postgresql-x64-16
```

---

## ðŸ“ Arquivo .env (IMPORTANTE)

### LocalizaÃ§Ã£o
```
backend/.env
```

### ConteÃºdo MÃ­nimo
```
NODE_ENV=development
PORT=3001

DATABASE_URL=postgresql://financebot:Tra1302@localhost:5432/financebot

JWT_SECRET=sua_chave_jwt_secreta_aqui

FRONTEND_URL=http://localhost:5173
AUDIO_STORAGE_PATH=./storage/audios

WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=financebot_verify

OPENAI_API_KEY=
GEMINI_API_KEY=
GROQ_API_KEY=
GROK_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434
```

---

## ðŸŽ® Formas de Iniciar

### OpÃ§Ã£o A: AutomÃ¡tica (Recomendado)
```
dev-start.bat
```
Abre ambos os terminais automaticamente.

### OpÃ§Ã£o B: Manual - Backend e Frontend em terminais separados

**Terminal 1 (Backend):**
```cmd
cd backend
npm run dev
```

**Terminal 2 (Frontend):**
```cmd
cd frontend
npm run dev
```

### OpÃ§Ã£o C: Apenas Backend
```
dev-backend.bat
```
Frontend fica em `npm run build` (produÃ§Ã£o).

### OpÃ§Ã£o D: Apenas Frontend
```
dev-frontend.bat
```
Backend fica como Docker ou remoto.

---

## ðŸ” Verificar se EstÃ¡ Funcionando

### Backend
```cmd
curl http://localhost:3001/api/health
```

Deve retornar:
```json
{"status":"ok","version":"1.0.0","timestamp":"..."}
```

### Frontend
Abra no navegador:
```
http://localhost:5173
```

---

## âŒ Se der erro...

### Erro: "Node.js nÃ£o encontrado"
```cmd
node --version
```
Se nÃ£o funcionar, reinstale Node.js: https://nodejs.org/

### Erro: "Porta 3001 jÃ¡ em uso"
```cmd
netstat -ano | findstr :3001
taskkill /PID {PID} /F
```
Ou edite `backend/.env` e mude `PORT=3002`

### Erro: "PostgreSQL nÃ£o conecta"
```cmd
psql -U financebot -d financebot
```
Se falhar, reinicie o serviÃ§o:
```cmd
net stop postgresql-x64-16
net start postgresql-x64-16
```

### Erro: "npm install falhou"
```cmd
cd backend
npm cache clean --force
npm install --legacy-peer-deps
```

### Erro: "prisma error"
```cmd
cd backend
npx prisma generate
npx prisma db push
npm run prisma:seed
```

---

## ðŸ›‘ Parar o Sistema

Nos terminais que abriram:
```cmd
Pressionar Ctrl+C
```

---

## ðŸ“ Estrutura de Pastas

```
wpp finance/
â”œâ”€â”€ instalar.bat          â† Execute primeiro
â”œâ”€â”€ dev-start.bat         â† Execute para iniciar desenvolvimento
â”œâ”€â”€ dev-backend.bat       â† Backend sozinho
â”œâ”€â”€ dev-frontend.bat      â† Frontend sozinho
â”‚
â”œâ”€â”€ backend/
â”‚   â”œâ”€â”€ .env              â† ConfiguraÃ§Ã£o (criado por instalar.bat)
â”‚   â”œâ”€â”€ package.json
â”‚   â”œâ”€â”€ src/
â”‚   â”œâ”€â”€ dist/             â† Build output
â”‚   â””â”€â”€ node_modules/     â† Criado por npm install
â”‚
â””â”€â”€ frontend/
    â”œâ”€â”€ .env              â† ConfiguraÃ§Ã£o frontend
    â”œâ”€â”€ package.json
    â”œâ”€â”€ src/
    â”œâ”€â”€ dist/             â† Build output
    â””â”€â”€ node_modules/     â† Criado por npm install
```

---

## ðŸŽ¯ Resumo Executivo

```
1. node --version         â† Verificar
2. psql --version         â† Verificar  
3. net start postgresql   â† Iniciar PostgreSQL
4. instalar.bat           â† Instalar
5. dev-start.bat          â† Rodar
6. http://localhost:5173  â† Acessar
```

**Pronto! Sistema funcionando em desenvolvimento** ðŸš€

---

## ðŸ’¡ Dicas

### Hard Reload Frontend
Se o frontend nÃ£o refrescar:
```
Ctrl+Shift+Delete no navegador
```

### Ver Logs do Backend
Dentro do terminal do backend, aparece em tempo real. Se quiser log anterior:
```
type backend\logs\app.log
```

### Pausar e Retomar
```cmd
Ctrl+C  â† Pausa
npm run dev  â† Retoma
```

---

**Tempo total:** 5 minutos  
**Dificuldade:** FÃ¡cil âœ…  
**Status:** Pronto para desenvolvimento ðŸŽ‰

