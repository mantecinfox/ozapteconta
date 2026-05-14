# ðŸ”§ ozapteconta - Troubleshooting npm run dev

Problemas comuns ao usar `npm run dev` e como resolver.

---

## âŒ Problema 1: "ERR! code ENOENT"

**Mensagem de erro:**
```
npm ERR! code ENOENT
npm ERR! errno -2
npm ERR! syscall open
```

**Causa:** Arquivo `node_modules` corrompido ou falta de dependÃªncias

**SoluÃ§Ã£o:**
```cmd
cd backend
rm -r node_modules      (ou: rmdir /s /q node_modules)
npm cache clean --force
npm install --legacy-peer-deps
npm run dev
```

---

## âŒ Problema 2: "Port 3001 is already in use"

**Mensagem:**
```
Error: listen EADDRINUSE: address already in use :::3001
```

**Causa:** Outro aplicativo usando a porta

**SoluÃ§Ã£o A - Encontrar e matar processo:**
```cmd
netstat -ano | findstr :3001
taskkill /PID {PID_NUMBER} /F
npm run dev
```

**SoluÃ§Ã£o B - Mudar porta:**

Editar `backend/.env`:
```
PORT=3002
```

Depois:
```cmd
npm run dev
```

Acessar em: `http://localhost:3002`

---

## âŒ Problema 3: "ts-node-dev error"

**Mensagem:**
```
ts-node-dev: command not found
ou
Cannot find module 'ts-node-dev'
```

**Causa:** DependÃªncia de dev nÃ£o instalada

**SoluÃ§Ã£o:**
```cmd
cd backend
npm install --save-dev ts-node-dev
npm run dev
```

---

## âŒ Problema 4: "Cannot connect to PostgreSQL"

**Mensagem:**
```
error: connect ECONNREFUSED 127.0.0.1:5432
```

**Causa:** PostgreSQL nÃ£o estÃ¡ rodando ou nÃ£o instalado

**SoluÃ§Ã£o 1 - Iniciar PostgreSQL:**
```cmd
net start postgresql-x64-16
```

**SoluÃ§Ã£o 2 - Verificar instalaÃ§Ã£o:**
```cmd
psql --version
```

Se nÃ£o aparecer, instale: https://www.enterprisedb.com/downloads/postgres-postgresql-downloads

**SoluÃ§Ã£o 3 - Verificar banco existe:**
```cmd
psql -U postgres -c "SELECT datname FROM pg_database WHERE datname='financebot';"
```

Se nÃ£o existir, criar:
```cmd
psql -U postgres
```

Dentro do psql:
```sql
CREATE USER financebot WITH PASSWORD 'Tra1302';
CREATE DATABASE financebot OWNER financebot;
GRANT ALL PRIVILEGES ON DATABASE financebot TO financebot;
```

---

## âŒ Problema 5: "Prisma error"

**Mensagem:**
```
PrismaClientInitializationError
```

**Causa:** Prisma nÃ£o sincronizado com banco

**SoluÃ§Ã£o:**
```cmd
cd backend
npx prisma generate
npx prisma migrate deploy
npx prisma db push
npm run prisma:seed
npm run dev
```

---

## âŒ Problema 6: "EACCES: permission denied"

**Mensagem:**
```
EACCES: permission denied, open './storage/audios/...'
```

**Causa:** PermissÃ£o insuficiente para criar pastas

**SoluÃ§Ã£o:**
```cmd
mkdir storage\audios
mkdir logs
npm run dev
```

---

## âŒ Problema 7: "npm ERR! code ERESOLVE"

**Mensagem:**
```
npm ERR! code ERESOLVE
npm ERR! ERESOLVE unable to resolve dependency tree
```

**Causa:** Conflito de versÃµes de dependÃªncias

**SoluÃ§Ã£o:**
```cmd
npm install --legacy-peer-deps
```

---

## âŒ Problema 8: Frontend nÃ£o conecta ao backend

**Erro no console do navegador:**
```
GET http://localhost:3001/api/... net::ERR_CONNECTION_REFUSED
```

**Causa:** Backend nÃ£o estÃ¡ rodando ou porta diferente

**SoluÃ§Ã£o 1 - Verificar backend:**
```cmd
curl http://localhost:3001/api/health
```

Se falhar, iniciar backend em outro terminal:
```cmd
cd backend
npm run dev
```

**SoluÃ§Ã£o 2 - Verificar VITE_API_URL:**

Editar `frontend/.env`:
```
VITE_API_URL=http://localhost:3001
```

Depois recarregar frontend.

---

## âŒ Problema 9: "Cannot find module '@prisma/client'"

**Mensagem:**
```
Error: Cannot find module '@prisma/client'
```

**Causa:** Prisma nÃ£o foi gerado

**SoluÃ§Ã£o:**
```cmd
cd backend
npx prisma generate
npm run dev
```

---

## âŒ Problema 10: "Unexpected token <" (Frontend)

**Erro no console:**
```
SyntaxError: Unexpected token '<'
```

**Causa:** Frontend recebendo HTML em vez de JS (backend offline)

**SoluÃ§Ã£o:**
1. Verificar que backend estÃ¡ rodando em http://localhost:3001
2. Verificar VITE_API_URL no `frontend/.env`
3. Recarregar pÃ¡gina do navegador

---

## âœ… VerificaÃ§Ãµes RÃ¡pidas

### 1. Node.js OK?
```cmd
node --version
npm --version
```
Deve mostrar versÃ£o 20+ e npm 9+

### 2. PostgreSQL OK?
```cmd
psql --version
psql -U financebot -d financebot -c "SELECT 1;"
```
Deve retornar `1`

### 3. Backend respondendo?
```cmd
curl http://localhost:3001/api/health
```
Deve retornar JSON com status

### 4. Frontend rodando?
```
Abrir http://localhost:5173 no navegador
```
Deve carregar pÃ¡gina do Vite

### 5. Ver logs em tempo real
```cmd
# Terminal backend (jÃ¡ mostra logs)
# Ou arquivo:
type backend\logs\app.log
```

---

## ðŸ†˜ Se Nada Disso Funcionar

### Ãšltima alternativa: Reset completo

```cmd
# 1. Parar todos os Node processes
taskkill /F /IM node.exe

# 2. Limpar caches
cd backend
rmdir /s /q node_modules
npm cache clean --force

cd ../frontend
rmdir /s /q node_modules
npm cache clean --force

# 3. Reinstalar
cd ../backend
npm install --legacy-peer-deps
npx prisma generate

cd ../frontend
npm install --legacy-peer-deps

# 4. Resetar banco (cuidado!)
cd ../backend
npx prisma migrate reset

# 5. Tentar novamente
npm run dev

# Terminal 2
cd frontend
npm run dev
```

---

## ðŸ“ž Logs de DiagnÃ³stico

### Capturar logs para anÃ¡lise

**Backend:**
```cmd
cd backend
npm run dev > backend-debug.log 2>&1
```

**Frontend:**
```cmd
cd frontend
npm run dev > frontend-debug.log 2>&1
```

Depois compartilhar os arquivos `backend-debug.log` e `frontend-debug.log`.

---

## ðŸŽ¯ Resumo das SoluÃ§Ãµes Mais Comuns

| Erro | SoluÃ§Ã£o |
|------|---------|
| Port 3001 in use | `taskkill /F /IM node.exe` ou mudar PORT |
| Cannot connect PostgreSQL | `net start postgresql-x64-16` |
| npm install failed | `npm install --legacy-peer-deps` |
| Prisma error | `npx prisma generate && npx prisma migrate deploy` |
| Port 5173 in use | Mudar VITE_PORT em `frontend/vite.config.ts` |
| node_modules corrupted | `rmdir /s /q node_modules && npm install` |

---

**Ãšltima atualizaÃ§Ã£o:** 10/05/2026  
**Para suporte:** Executar `npm run dev` novamente e compartilhar a saÃ­da do erro

