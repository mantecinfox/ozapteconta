# ðŸ”§ ozapteconta - SoluÃ§Ã£o para Terminais Fechando Automaticamente

Os terminais estÃ£o fechando porque hÃ¡ erros. Criei scripts melhorados que:
- âœ… Mostram os erros antes de fechar
- âœ… Fazem diagnÃ³stico completo
- âœ… Pausam para vocÃª ler as mensagens

---

## ðŸš€ Novo Processo de InstalaÃ§Ã£o (3 passos simples)

### Passo 1: DiagnÃ³stico (1 min)

Duplo-clique em:
```
diagnostico.bat
```

Isto vai mostrar:
- âœ“ Node.js OK?
- âœ“ npm OK?
- âœ“ PostgreSQL OK?
- âœ“ PostgreSQL rodando?
- âœ“ Portas livres?
- âœ“ Tudo instalado?

**Se tiver âœ— ou âš , ele te diz como resolver.**

---

### Passo 2: Instalar (2-3 min)

Se o diagnÃ³stico passou, duplo-clique em:
```
instalar.bat
```

Ele vai:
- Instalar backend (npm install)
- Instalar frontend (npm install)
- Gerar Prisma
- Configurar .env

**Se tiver erro, ele PAUSA e mostra o que fazer.**

---

### Passo 3: Rodar (1 min)

Duplo-clique em:
```
dev-start.bat
```

Vai abrir 2 terminais:
- Terminal 1: Backend (`npm run dev`)
- Terminal 2: Frontend (`npm run dev`)

Se tiver erro, o terminal NÃƒO vai fechar e vocÃª vai ver a mensagem.

---

## ðŸ“‹ PrÃ©-Requisitos ObrigatÃ³rios

Antes de rodar `diagnostico.bat`, certifique-se:

### 1. Node.js 20+
```cmd
node --version
```
Se nÃ£o tiver: https://nodejs.org/ (instale a versÃ£o LTS 20.x)

### 2. PostgreSQL 16+
```cmd
psql --version
```
Se nÃ£o tiver: https://www.enterprisedb.com/downloads/postgres-postgresql-downloads

### 3. PostgreSQL Rodando
```cmd
net start postgresql-x64-16
```

---

## ðŸŽ¯ Fluxo Completo

```
1. Duplo-clique em: diagnostico.bat
   â†“
   Se tudo OK:
   â†“
2. Duplo-clique em: instalar.bat
   â†“
   Se tudo OK:
   â†“
3. Duplo-clique em: dev-start.bat
   â†“
   Pronto! Sistema funcionando
```

---

## âŒ Se Algo Estiver Fechando...

### OpÃ§Ã£o 1: Executar via PowerShell (vÃª os erros)

```powershell
# Abra PowerShell na pasta do projeto e execute:

# DiagnÃ³stico
.\diagnostico.bat

# Instalar
.\instalar.bat

# Iniciar
.\dev-start.bat
```

### OpÃ§Ã£o 2: Executar Manualmente (mais controle)

```cmd
# Terminal 1 - Backend
cd backend
npm install --legacy-peer-deps
npx prisma generate
npm run dev

# Terminal 2 - Frontend (novo terminal)
cd frontend
npm install --legacy-peer-deps
npm run dev
```

---

## ðŸ” VerificaÃ§Ãµes RÃ¡pidas

### Backend respondendo?
```cmd
curl http://localhost:3001/api/health
```

### Frontend acessÃ­vel?
```
http://localhost:5173
```

### Ver logs de erro?
```cmd
type backend\logs\app.log
```

---

## âš¡ TL;DR (Resumido)

1. **InstalaÃ§Ã£o Node.js:** https://nodejs.org/
2. **Instale PostgreSQL:** https://www.enterprisedb.com/downloads/postgres-postgresql-downloads
3. **Inicie PostgreSQL:** `net start postgresql-x64-16`
4. **DiagnÃ³stico:** Duplo-clique em `diagnostico.bat`
5. **Instalar:** Duplo-clique em `instalar.bat`
6. **Rodar:** Duplo-clique em `dev-start.bat`
7. **Acessar:** http://localhost:5173

---

## ðŸ“ Novos Scripts Criados

| Script | O que faz |
|--------|-----------|
| `diagnostico.bat` | Verifica tudo (Node, npm, PostgreSQL, portas, etc) |
| `instalar.bat` | Instala dependÃªncias (melhorado) |
| `dev-start.bat` | Abre 2 terminais com backend e frontend (melhorado) |
| `dev-backend.bat` | Roda apenas backend com `npm run dev` (melhorado) |
| `dev-frontend.bat` | Roda apenas frontend com `npm run dev` (melhorado) |

---

## ðŸ†˜ Problemas EspecÃ­ficos

### "PostgreSQL nÃ£o encontrado"
```cmd
net start postgresql-x64-16
```

### "Porta 3001 jÃ¡ em uso"
```cmd
netstat -ano | findstr :3001
taskkill /PID {PID_DO_RESULTADO} /F
```

### "npm install falhou"
```cmd
npm cache clean --force
npm install --legacy-peer-deps
```

### "Prisma error"
```cmd
cd backend
npx prisma generate
npx prisma migrate deploy
npx prisma db push
```

---

## âœ¨ O que Mudou

### Antes:
- âŒ Terminais fechavam sem mostrar erro
- âŒ DifÃ­cil identificar o problema

### Agora:
- âœ… Terminais PAUSAM quando hÃ¡ erro
- âœ… Mensagens claras do que estÃ¡ errado
- âœ… DiagnÃ³stico completo antes de instalar
- âœ… InstruÃ§Ãµes de resoluÃ§Ã£o para cada erro

---

**Comece por:** `diagnostico.bat` (1 minuto)

Depois me conte qual Ã© o erro que aparece!

