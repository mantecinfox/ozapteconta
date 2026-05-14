# âœ… Checklist - InstalaÃ§Ã£o ozapteconta Ubuntu 20.04

## ðŸŽ¯ O Que Foi Preparado Para VocÃª

- âœ… **install-ubuntu.sh** - Script bash totalmente automÃ¡tico
- âœ… **transfer-to-ubuntu.ps1** - Script PowerShell para copiar arquivos via SSH
- âœ… **INSTALACAO_UBUNTU_SSH.md** - Guia completo passo-a-passo
- âœ… **UBUNTU_GUIA_RAPIDO.md** - ReferÃªncia rÃ¡pida com comandos
- âœ… **PRODUCAO_NGINX.md** - Setup de produÃ§Ã£o com NGINX/SSL
- âœ… **UBUNTU_SETUP_RESUMO.md** - SumÃ¡rio e Ã­ndice de tudo

---

## ðŸš€ PRÃ“XIMOS PASSOS - EXECUTE AGORA

### Passo 1ï¸âƒ£: Transferir Arquivos (Windows) - 5 minutos

**Abra PowerShell e execute:**

```powershell
cd "C:\Users\mante\OneDrive\Desktop\Sistemas construidos\wpp finance"
.\transfer-to-ubuntu.ps1
```

**O que vai acontecer:**
- Verifica conexÃ£o SSH
- Copia backend, frontend, scripts
- Transfere script de instalaÃ§Ã£o
- SaÃ­da confirmando sucesso

---

### Passo 2ï¸âƒ£: Conectar ao Ubuntu e Instalar - 15 minutos

**Via Terminal/SSH:**

```bash
ssh pc@192.168.4.100
```

**No Ubuntu, execute:**

```bash
cd /home/pc/financebot
chmod +x install-ubuntu.sh
./install-ubuntu.sh
```

**O que vai acontecer:**
- Verifica Node.js, npm, PostgreSQL
- Cria usuÃ¡rio PostgreSQL (finance)
- Cria banco de dados (financebot)
- Gera arquivos .env
- npm install (backend + frontend)
- Executa Prisma migrations
- Build do frontend
- Cria scripts auxiliares

---

### Passo 3ï¸âƒ£: Iniciar Sistema - 1 minuto

**No Ubuntu:**

```bash
cd /home/pc/financebot
./start-all.sh
```

**Ou iniciar em terminals separadas:**

```bash
# Terminal 1
cd /home/pc/financebot/backend
npm start

# Terminal 2
cd /home/pc/financebot/frontend
npx http-server dist -p 5173
```

---

### Passo 4ï¸âƒ£: Acessar Sistema - Pronto! ðŸŽ‰

| Url | DescriÃ§Ã£o |
|-----|-----------|
| `http://192.168.4.100:5173` | Frontend (React) |
| `http://192.168.4.100:3001` | Backend (API) |
| `http://192.168.4.100:3001/api` | API Health Check |

**Login Inicial:**
- UsuÃ¡rio: `admin`
- Senha: `admin123`

---

## ðŸ“‹ Checklist de VerificaÃ§Ã£o

### Antes de ComeÃ§ar
- [ ] SSH conecta em: `pc@192.168.4.100`
- [ ] PowerShell pronto no Windows
- [ ] ozapteconta nÃ£o estÃ¡ rodando localmente

### Durante TransferÃªncia (transfer-to-ubuntu.ps1)
- [ ] SSH teste passa
- [ ] Backend copia
- [ ] Frontend copia
- [ ] Scripts copiam
- [ ] install-ubuntu.sh copia

### Durante InstalaÃ§Ã£o (install-ubuntu.ps1)
- [ ] Node.js encontrado
- [ ] npm encontrado
- [ ] PostgreSQL encontrado
- [ ] UsuÃ¡rio 'finance' criado
- [ ] Banco 'financebot' criado
- [ ] .env criados
- [ ] npm install backend: OK
- [ ] npm install frontend: OK
- [ ] Prisma migrations: OK
- [ ] Prisma seed: OK
- [ ] Frontend build: OK

### ApÃ³s InstalaÃ§Ã£o
- [ ] `./start-all.sh` executa sem erros
- [ ] Backend rodando (porta 3001)
- [ ] Frontend rodando (porta 5173)
- [ ] http://192.168.4.100:5173 acessÃ­vel
- [ ] Login funciona (admin/admin123)
- [ ] Dashboard carrega

---

## âš ï¸ Se Algo Dar Errado

### Erro: "SSH connection refused"
```bash
# Verificar SSH no Ubuntu
sudo systemctl status ssh

# Ou iniciar se necessÃ¡rio
sudo systemctl start ssh

# Editar transfer-to-ubuntu.ps1 com credenciais corretas
```

### Erro: "PostgreSQL nÃ£o conecta"
```bash
# No Ubuntu:
sudo systemctl status postgresql
sudo systemctl start postgresql

# Verificar usuÃ¡rio
sudo -u postgres psql -l
```

### Erro: "npm install timeout"
```bash
# No Ubuntu:
npm install --no-audit --no-fund --legacy-peer-deps
```

### Erro: "Porta 3001 em uso"
```bash
# Encontrar processo
sudo lsof -i :3001

# Matar processo (substitua PID)
kill -9 <PID>
```

### Erro: "Build frontend falhou"
```bash
# No Ubuntu:
cd frontend
npm install
npm run build
```

---

## ðŸ” Verificar Status

### Backend rodando?
```bash
curl http://192.168.4.100:3001/api
```

### Frontend rodando?
```bash
curl http://192.168.4.100:5173
```

### Banco de dados?
```bash
psql -U finance -d financebot -c "SELECT COUNT(*) FROM admin_users;"
```

### Processos Node?
```bash
ps aux | grep node
```

---

## ðŸ“Š O Que Cada Script Faz

### transfer-to-ubuntu.ps1 (PowerShell)
```
Windows PC
    â†“ (SCP via SSH)
Ubuntu Server
    â””â”€â”€ /home/pc/financebot/
        â”œâ”€â”€ backend/
        â”œâ”€â”€ frontend/
        â”œâ”€â”€ scripts/
        â””â”€â”€ install-ubuntu.sh
```

### install-ubuntu.sh (Bash)
```
/home/pc/financebot/install-ubuntu.sh
    â”œâ”€ Verificar: Node, npm, PostgreSQL
    â”œâ”€ Setup DB: Criar user 'finance', banco 'financebot'
    â”œâ”€ Criar: .env backend e frontend
    â”œâ”€ Install: npm install (backend + frontend)
    â”œâ”€ Prisma: migrations + seed
    â”œâ”€ Build: frontend production build
    â””â”€ Scripts: start-all.sh, stop-all.sh, etc
```

### start-all.sh (Bash)
```
start-all.sh
    â”œâ”€ Backend: npm start em background
    â”œâ”€ Frontend: http-server em background
    â”œâ”€ Logs: ./logs/backend.log e frontend.log
    â”œâ”€ PIDs: Salva em backend.pid e frontend.pid
    â””â”€ Output: URLs de acesso
```

---

## ðŸ’¾ Comandos Essenciais ApÃ³s InstalaÃ§Ã£o

### Iniciar/Parar
```bash
cd /home/pc/financebot

./start-all.sh      # Tudo
./stop-all.sh       # Parar tudo
./start-backend.sh  # SÃ³ backend
./start-frontend.sh # SÃ³ frontend
```

### Ver Logs
```bash
tail -f logs/backend.log
tail -f logs/frontend.log
```

### Reiniciar Banco
```bash
cd backend
npm run prisma:migrate reset  # âš ï¸ DELETA DADOS
npm run prisma:seed          # Reinsere admin
```

### Resetar Tudo
```bash
./stop-all.sh
rm -rf backend/node_modules frontend/node_modules
cd backend && npm install && npm run prisma:migrate reset
cd ../frontend && npm install && npm run build
cd ..
./start-all.sh
```

---

## ðŸŽ“ Documentos Para ReferÃªncia

| SituaÃ§Ã£o | Documento | Tempo |
|----------|-----------|-------|
| **Quero instalar agora** | UBUNTU_GUIA_RAPIDO.md | 5 min |
| **Preciso de detalhes** | INSTALACAO_UBUNTU_SSH.md | 20 min |
| **Vou usar em produÃ§Ã£o** | PRODUCAO_NGINX.md | 30 min |
| **Preciso de summary** | UBUNTU_SETUP_RESUMO.md | 10 min |

---

## ðŸŽ¯ Timeline Estimado

```
1. Transfer arquivos (PowerShell):    5-10 minutos
2. Instalar no Ubuntu (script bash):  15-20 minutos
3. Iniciar sistema:                   1 minuto
4. Testes iniciais:                   5 minutos
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
TOTAL:                                26-36 minutos
```

---

## âœ… Sucesso! O Que Fazer Depois?

Quando tudo estiver rodando:

1. **Alterar senha admin**
   - Acessar dashboard
   - Mudar senha padrÃ£o (admin123)

2. **Configurar WhatsApp**
   - Acessar: `/api/admin/whatsapp/qr-link`
   - Escanear QR code
   - Testar envio de mensagens

3. **Configurar Payment Gateway** (se necessÃ¡rio)
   - Adicionar credenciais InfinityPay
   - Testar transaÃ§Ãµes

4. **Colocar em ProduÃ§Ã£o** (opcional)
   - Seguir: PRODUCAO_NGINX.md
   - NGINX reverse proxy
   - SSL/HTTPS
   - Systemd services

---

## ðŸ“ž Suporte RÃ¡pido

### "NÃ£o sei por onde comeÃ§ar"
â†’ Execute **Passo 1ï¸âƒ£**, depois **Passo 2ï¸âƒ£**

### "Deu erro no meio"
â†’ Ver seÃ§Ã£o **"Se Algo Dar Errado"**

### "Preciso de mais detalhes"
â†’ Ler **INSTALACAO_UBUNTU_SSH.md**

### "Erro especÃ­fico [mensagem]"
â†’ Buscar em **UBUNTU_GUIA_RAPIDO.md** (Troubleshooting)

---

## ðŸš€ COMECE AGORA!

**VocÃª tem tudo que precisa. Execute:**

```powershell
# Windows PowerShell
cd "C:\Users\mante\OneDrive\Desktop\Sistemas construidos\wpp finance"
.\transfer-to-ubuntu.ps1
```

**Depois:**

```bash
# Ubuntu SSH
ssh pc@192.168.4.100
cd /home/pc/financebot
./install-ubuntu.sh
./start-all.sh
```

**E pronto! ðŸŽ‰**


