# ⚡ Guia Rápido - Instalação Ubuntu 20.04

## 🚀 Resumo em 3 Passos

### Passo 1: Do Windows, transferir arquivos

```powershell
cd c:\Users\mante\OneDrive\Desktop\Sistemas construidos\wpp finance
.\transfer-to-ubuntu.ps1
```

### Passo 2: Via SSH, conectar e instalar

```bash
ssh pc@192.168.4.100
cd /home/pc/financebot
chmod +x install-ubuntu.sh
./install-ubuntu.sh
```

### Passo 3: Iniciar o sistema

```bash
cd /home/pc/financebot
./start-all.sh
```

---

## 🌐 Acessar

- **Frontend**: http://192.168.4.100:5173
- **Backend**: http://192.168.4.100:3001
- **Admin**: http://192.168.4.100:3001/api/admin

**Login**: `admin` / `admin123`

---

## 📋 Comandos Essenciais

### Iniciar/Parar

```bash
cd /home/pc/financebot

# Iniciar tudo
./start-all.sh

# Parar tudo
./stop-all.sh

# Apenas backend
./start-backend.sh

# Apenas frontend
./start-frontend.sh
```

### Ver Logs

```bash
# Backend em tempo real
tail -f logs/backend.log

# Frontend em tempo real
tail -f logs/frontend.log

# Ultimas 50 linhas
tail -50 logs/backend.log
```

### Reiniciar Banco

```bash
cd /home/pc/financebot/backend

# Reset completo (⚠️ DELETA DADOS)
npm run prisma:migrate reset

# Apenas aplicar migrations
npm run prisma:migrate

# Seed com dados iniciais
npm run prisma:seed
```

### Verificar Status

```bash
# Processos rodando
ps aux | grep node

# Portas em uso
sudo netstat -tulpn | grep :3001

# Banco de dados
psql -U finance -d financebot -c "\dt"
```

---

## 🆘 Troubleshooting Rápido

### Porta 3001 em uso

```bash
# Encontrar processo
sudo lsof -i :3001

# Matar processo (substituir PID)
kill -9 <PID>
```

### PostgreSQL não conecta

```bash
# Status
sudo systemctl status postgresql

# Iniciar
sudo systemctl start postgresql

# Ver banco
sudo -u postgres psql -l
```

### npm install falha

```bash
cd /home/pc/financebot/backend
npm install --no-audit --no-fund --legacy-peer-deps
```

### Resetar tudo

```bash
cd /home/pc/financebot

# Parar
./stop-all.sh

# Limpar node_modules
rm -rf backend/node_modules frontend/node_modules

# Reinstalar
backend/npm install
frontend/npm install

# Resetar BD
cd backend
npm run prisma:migrate reset
cd ..

# Iniciar
./start-all.sh
```

---

## 🔑 Credenciais

| Item | Valor |
|------|-------|
| SSH | `pc@192.168.4.100` |
| DB User | `finance` |
| DB Pass | `financepassword123` |
| DB Name | `financebot` |
| Admin User | `admin` |
| Admin Pass | `admin123` |

---

## 📁 Estrutura

```
/home/pc/financebot/
├── backend/           # API Node.js + Express
├── frontend/          # React + Vite
├── logs/              # Logs do sistema
├── storage/           # Sessões WhatsApp
├── start-all.sh       # Script iniciar tudo
├── stop-all.sh        # Script parar tudo
└── install-ubuntu.sh  # Script instalação
```

---

## ✅ Checklist

- [ ] SSH conectado
- [ ] Arquivos transferidos
- [ ] PostgreSQL rodando
- [ ] Banco criado
- [ ] npm install concluído
- [ ] Prisma migrations aplicadas
- [ ] Backend rodando (3001)
- [ ] Frontend rodando (5173)
- [ ] Login funcionando
- [ ] WhatsApp configurado

---

## 📚 Documentação Completa

Ver: [INSTALACAO_UBUNTU_SSH.md](INSTALACAO_UBUNTU_SSH.md)

