# ðŸš€ InstalaÃ§Ã£o ozapteconta - Ubuntu 20.04 via SSH

## ðŸ“‹ InformaÃ§Ãµes do Ambiente

```
Servidor: pc@192.168.4.100:22
Caminho InstalaÃ§Ã£o: /home/pc/financebot
Componentes: Frontend + Backend
Banco de Dados: PostgreSQL
```

---

## ðŸ”§ PrÃ©-Requisitos Verificados

- âœ… Node.js jÃ¡ instalado
- âœ… Prisma jÃ¡ instalado
- âœ… PostgreSQL disponÃ­vel (serÃ¡ configurado)
- âœ… SSH funcionando em: `pc@192.168.4.100`

---

## ðŸ“¥ Passo 1: Conectar via SSH

```bash
ssh pc@192.168.4.100 -p 22
```

---

## ðŸ—ï¸ Passo 2: Preparar Ambiente

### 2.1 - Criar diretÃ³rio do projeto
```bash
mkdir -p /home/pc/financebot
cd /home/pc/financebot
```

### 2.2 - Verificar Node.js
```bash
node --version    # Deve ser v18+
npm --version     # Deve ser v9+
```

### 2.3 - Verificar PostgreSQL
```bash
psql --version
# E testar conexÃ£o (se for local):
psql -U postgres -c "\l"
```

---

## ðŸ“¦ Passo 3: Transferir Arquivos do Projeto

**Na sua mÃ¡quina Windows (PowerShell), execute:**

```powershell
# Substitua pelos caminhos corretos
$localPath = "C:\Users\mante\OneDrive\Desktop\Sistemas construidos\wpp finance"
$remoteUser = "pc"
$remoteHost = "192.168.4.100"
$remotePath = "/home/pc/financebot"

# Copiar project (excluindo node_modules e arquivos temporÃ¡rios)
scp -r "$localPath\backend" "$remoteUser@$remoteHost`:$remotePath/"
scp -r "$localPath\frontend" "$remoteUser@$remoteHost`:$remotePath/"
scp -r "$localPath\scripts" "$remoteUser@$remoteHost`:$remotePath/"
scp "$localPath\package.json" "$remoteUser@$remoteHost`:$remotePath/"
```

Ou **copiar tudo de uma vez:**
```powershell
$localPath = "C:\Users\mante\OneDrive\Desktop\Sistemas construidos\wpp finance"
scp -r "$localPath\*" "pc@192.168.4.100:/home/pc/financebot/" 2>$null
```

---

## ðŸ—„ï¸ Passo 4: Configurar Banco de Dados PostgreSQL

**Via SSH no Ubuntu:**

```bash
# Criar usuÃ¡rio do banco
sudo -u postgres psql << EOF
CREATE USER finance WITH PASSWORD 'financepassword123';
CREATE DATABASE financebot OWNER finance;
ALTER USER finance CREATEDB;
EOF
```

**Testar conexÃ£o:**
```bash
psql -U finance -d financebot -h localhost -c "\dt"
```

---

## âš™ï¸ Passo 5: Configurar VariÃ¡veis de Ambiente

**Via SSH, criar arquivo .env no backend:**

```bash
cd /home/pc/financebot

# Criar .env backend
cat > backend/.env << 'EOF'
# ============ BANCO DE DADOS ============
DATABASE_URL="postgresql://finance:financepassword123@localhost:5432/financebot"

# ============ SERVIDOR ============
NODE_ENV=production
PORT=3001
API_URL=http://192.168.4.100:3001

# ============ FRONTEND ============
FRONTEND_URL=http://192.168.4.100:5173

# ============ JWT ============
JWT_SECRET=seu_jwt_secret_super_secreto_aqui_32_caracteres_minimo

# ============ ADMIN ============
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123

# ============ WHATSAPP ============
WHATSAPP_BAILEYS_SESSION_PATH=/home/pc/financebot/storage/wa-sessions

# ============ EMAIL (Opcional) ============
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu_email@gmail.com
SMTP_PASSWORD=sua_senha_app

# ============ PAYMENT GATEWAY (Opcional) ============
INFINITYPAY_MERCHANT_KEY=
INFINITYPAY_API_KEY=
INFINITYPAY_WEBHOOK_SECRET=

EOF
```

**Criar .env frontend:**

```bash
cat > frontend/.env << 'EOF'
VITE_API_URL=http://192.168.4.100:3001
VITE_APP_NAME=ozapteconta
EOF
```

---

## ðŸ”§ Passo 6: Instalar DependÃªncias

**Via SSH:**

```bash
cd /home/pc/financebot

# Backend
echo "ðŸ“¦ Instalando dependÃªncias do backend..."
cd backend
npm install
npm run prisma:generate

# Frontend
echo "ðŸ“¦ Instalando dependÃªncias do frontend..."
cd ../frontend
npm install

cd ..
echo "âœ… InstalaÃ§Ã£o concluÃ­da!"
```

---

## ðŸ—„ï¸ Passo 7: Setup do Banco de Dados

**Via SSH:**

```bash
cd /home/pc/financebot/backend

# Gerar Prisma Client
npm run prisma:generate

# Executar migrations
npm run prisma:migrate

# Seed com dados iniciais (admin user)
npm run prisma:seed
```

**Se tudo correr bem, vocÃª verÃ¡:**
```
âœ… Admin user criado: admin / admin123
âœ… Dados iniciais inseridos
```

---

## â–¶ï¸ Passo 8: Iniciar o Sistema

### OpÃ§Ã£o A: Em Segundo Plano (Recomendado para ProduÃ§Ã£o)

```bash
cd /home/pc/financebot/backend

# Backend rodando em background
nohup npm run build > /tmp/backend.log 2>&1 &
nohup npm start > /tmp/backend.log 2>&1 &

# Frontend rodando em background (build first)
cd ../frontend
npm run build
nohup npx http-server dist -p 5173 > /tmp/frontend.log 2>&1 &
```

### OpÃ§Ã£o B: Em Terminals Separadas (Para Testes)

```bash
# Terminal 1 - Backend
cd /home/pc/financebot/backend
npm run dev

# Terminal 2 - Frontend
cd /home/pc/financebot/frontend
npm run dev
```

---

## ðŸŒ Passo 9: Acessar o Sistema

### Frontend
```
http://192.168.4.100:5173
```

### Backend API
```
http://192.168.4.100:3001
```

### Admin API
```
http://192.168.4.100:3001/api/admin
```

---

## ðŸ” Primeiro Acesso

### Credenciais PadrÃ£o
```
UsuÃ¡rio: admin
Senha:   admin123
```

### âš ï¸ IMPORTANTE: Alterar Senha

1. Acesse: `http://192.168.4.100:3001/api/admin/users/change-password`
2. Mude a senha do admin
3. Delete arquivo `.env` com credenciais antigas

---

## ðŸ“‹ Checklist Final

- [ ] SSH conectado ao Ubuntu
- [ ] Arquivos transferidos
- [ ] PostgreSQL rodando
- [ ] Banco "financebot" criado
- [ ] .env backend configurado
- [ ] .env frontend configurado
- [ ] `npm install` completado
- [ ] `npm run prisma:migrate` executado
- [ ] `npm run prisma:seed` executado
- [ ] Backend rodando (porta 3001)
- [ ] Frontend rodando (porta 5173)
- [ ] AcessÃ­vel via browser

---

## ðŸ†˜ Troubleshooting

### Erro: "PostgreSQL nÃ£o conecta"
```bash
# Verificar se PostgreSQL estÃ¡ rodando
sudo systemctl status postgresql

# Iniciar se necessÃ¡rio
sudo systemctl start postgresql

# Verificar se usuÃ¡rio/banco existem
sudo -u postgres psql -l
```

### Erro: "Porta 3001 ou 5173 em uso"
```bash
# Listar processos nas portas
sudo netstat -tulpn | grep :3001
sudo netstat -tulpn | grep :5173

# Matar processo (substituir PID)
kill -9 <PID>
```

### Erro: "npm install timeout"
```bash
npm install --no-audit --no-fund --legacy-peer-deps
```

### Ver logs em tempo real
```bash
# Backend
tail -f /tmp/backend.log

# Frontend
tail -f /tmp/frontend.log
```

---

## ðŸ“š PrÃ³ximos Passos

1. **Configurar WhatsApp**: Acessar `/api/admin/whatsapp/qr-link`
2. **Configurar Payment Gateway**: Acessar `/api/admin/payment-gateways`
3. **Criar Contas de Clientes**: Via frontend em `/admin`
4. **Testar via WhatsApp**: Enviar mensagem para nÃºmero vinculado

---

## ðŸ“ž Suporte

Se tiver problemas:
1. Verifique os logs: `tail -f /tmp/backend.log`
2. Confirme conectividade: `telnet 192.168.4.100 3001`
3. Verifique .env: `cat backend/.env` (sem credenciais sensÃ­veis)


