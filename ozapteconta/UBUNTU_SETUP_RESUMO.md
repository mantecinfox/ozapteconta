# ðŸ“¦ ozapteconta - InstalaÃ§Ã£o Ubuntu 20.04 (DocumentaÃ§Ã£o Criada)

## ðŸŽ¯ Resumo

Preparei um **sistema completo de instalaÃ§Ã£o automÃ¡tica** do ozapteconta em Ubuntu 20.04 via SSH. Criados 5 documentos + 2 scripts automÃ¡ticos.

---

## ðŸ“„ DocumentaÃ§Ã£o Criada

### 1. **INSTALACAO_UBUNTU_SSH.md** â­ PRINCIPAL
   - Guia completo passo-a-passo
   - ConfiguraÃ§Ã£o PostgreSQL
   - Setup de variÃ¡veis de ambiente
   - InstalaÃ§Ã£o de dependÃªncias
   - InicializaÃ§Ã£o do sistema
   - Troubleshooting detalhado
   - **Comece por aqui se tiver dÃºvidas**

### 2. **UBUNTU_GUIA_RAPIDO.md** âš¡ RESUMIDO
   - VersÃ£o curta e objetiva
   - 3 passos principais
   - Comandos essenciais
   - Tabelas de referÃªncia
   - **Use para consultas rÃ¡pidas**

### 3. **PRODUCAO_NGINX.md** ðŸš€ PRODUÃ‡ÃƒO
   - ConfiguraÃ§Ã£o NGINX reverse proxy
   - SSL/HTTPS com Certbot
   - Systemd services
   - Monitoramento e logs
   - Backup automÃ¡tico
   - Firewall e seguranÃ§a
   - **Para deploy em produÃ§Ã£o**

---

## ðŸ› ï¸ Scripts AutomÃ¡ticos

### 1. **install-ubuntu.sh** (Bash)
   
   Executar no Ubuntu:
   ```bash
   cd /home/pc/financebot
   chmod +x install-ubuntu.sh
   ./install-ubuntu.sh
   ```
   
   **O que faz:**
   - âœ… Verifica Node.js, npm, PostgreSQL
   - âœ… Configura banco de dados PostgreSQL
   - âœ… Cria arquivo .env
   - âœ… Instala dependÃªncias (npm install)
   - âœ… Executa migrations Prisma
   - âœ… Build do frontend
   - âœ… Cria scripts auxiliares
   - âœ… Mostra comandos para iniciar

### 2. **transfer-to-ubuntu.ps1** (PowerShell)
   
   Executar no Windows:
   ```powershell
   cd "C:\Users\mante\OneDrive\Desktop\Sistemas construidos\wpp finance"
   .\transfer-to-ubuntu.ps1
   ```
   
   **O que faz:**
   - âœ… Verifica SSH
   - âœ… Copia backend/frontend via SCP
   - âœ… Copia scripts
   - âœ… Testa conectividade
   - âœ… NÃ£o sobrescreve .env

---

## ðŸš€ Fluxo de InstalaÃ§Ã£o (Quick Start)

### Windows (MÃ¡quina Local)
```powershell
1. Abrir PowerShell
2. cd "C:\Users\mante\OneDrive\Desktop\Sistemas construidos\wpp finance"
3. .\transfer-to-ubuntu.ps1
4. Aguardar conclusÃ£o (5-10 minutos)
```

### Ubuntu (Servidor SSH)
```bash
1. ssh pc@192.168.4.100
2. cd /home/pc/financebot
3. chmod +x install-ubuntu.sh
4. ./install-ubuntu.sh
5. Aguardar conclusÃ£o (10-15 minutos)
6. ./start-all.sh
```

### Acessar
```
Frontend: http://192.168.4.100:5173
Backend:  http://192.168.4.100:3001
Login: admin / admin123
```

---

## ðŸ“Š ConfiguraÃ§Ãµes PadrÃ£o

| Item | Valor |
|------|-------|
| **SSH** | `pc@192.168.4.100:22` |
| **Caminho** | `/home/pc/financebot` |
| **Frontend Port** | `5173` |
| **Backend Port** | `3001` |
| **DB User** | `finance` |
| **DB Password** | `financepassword123` |
| **DB Name** | `financebot` |
| **Admin User** | `admin` |
| **Admin Password** | `admin123` |

---

## ðŸ“ Estrutura Criada no Ubuntu

```
/home/pc/financebot/
â”œâ”€â”€ backend/
â”‚   â”œâ”€â”€ node_modules/
â”‚   â”œâ”€â”€ src/
â”‚   â”œâ”€â”€ prisma/
â”‚   â”œâ”€â”€ .env (criado automaticamente)
â”‚   â”œâ”€â”€ package.json
â”‚   â””â”€â”€ tsconfig.json
â”œâ”€â”€ frontend/
â”‚   â”œâ”€â”€ node_modules/
â”‚   â”œâ”€â”€ src/
â”‚   â”œâ”€â”€ dist/ (apÃ³s npm run build)
â”‚   â”œâ”€â”€ .env (criado automaticamente)
â”‚   â”œâ”€â”€ package.json
â”‚   â””â”€â”€ vite.config.ts
â”œâ”€â”€ storage/
â”‚   â””â”€â”€ wa-sessions/  (sessÃµes WhatsApp)
â”œâ”€â”€ logs/
â”‚   â”œâ”€â”€ backend.log
â”‚   â””â”€â”€ frontend.log
â”œâ”€â”€ start-all.sh      (iniciar tudo)
â”œâ”€â”€ stop-all.sh       (parar tudo)
â”œâ”€â”€ start-backend.sh  (sÃ³ backend)
â”œâ”€â”€ start-frontend.sh (sÃ³ frontend)
â””â”€â”€ install-ubuntu.sh (instalaÃ§Ã£o)
```

---

## âœ… PrÃ©-Requisitos no Ubuntu

- âœ… Node.js v18+ (jÃ¡ instalado)
- âœ… npm v9+ (jÃ¡ instalado)
- âœ… PostgreSQL (serÃ¡ instalado automaticamente se nÃ£o existir)
- âœ… SSH funcionando
- âœ… Acesso Ã  internet (npm packages)

---

## ðŸ”§ PrÃ³ximos Passos ApÃ³s InstalaÃ§Ã£o

### 1. Primeira InicializaÃ§Ã£o
```bash
cd /home/pc/financebot
./start-all.sh
```

### 2. Verificar Status
```bash
# Frontend
curl http://192.168.4.100:5173

# Backend
curl http://192.168.4.100:3001/api

# Banco
psql -U finance -d financebot -c "SELECT COUNT(*) FROM admin_users;"
```

### 3. Configurar WhatsApp
1. Acessar: `http://192.168.4.100:3001/api/admin/whatsapp/qr-link`
2. Escanear QR code com WhatsApp
3. Confirmar pareamento

### 4. Configurar Payment Gateway (Opcional)
1. Acessar: `http://192.168.4.100:3001/api/admin/payment-gateways`
2. Adicionar credenciais InfinityPay
3. Testar conexÃ£o

### 5. Colocar em ProduÃ§Ã£o
- Ver: [PRODUCAO_NGINX.md](PRODUCAO_NGINX.md)
- Configurar NGINX reverse proxy
- Habilitar SSL/HTTPS
- Configurar systemd services
- Setup de backup automÃ¡tico

---

## ðŸ†˜ Se Algo der Errado

### Erro Durante Transfer (PowerShell)
```powershell
# Verifique SSH
ssh pc@192.168.4.100 -p 22 "echo test"

# Se nÃ£o funcionar, verifique credenciais em transfer-to-ubuntu.ps1
```

### Erro Durante InstalaÃ§Ã£o (Ubuntu)
```bash
# Verifique logs
tail -100 install-ubuntu.sh

# Ou rode manualmente
cd /home/pc/financebot/backend
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

### Sistema nÃ£o conecta
```bash
# Verificar se estÃ¡ rodando
ps aux | grep node

# Ver logs
tail -f logs/backend.log
tail -f logs/frontend.log

# Verificar portas
sudo netstat -tulpn | grep :3001
```

### Banco de dados nÃ£o conecta
```bash
# Status PostgreSQL
sudo systemctl status postgresql

# Iniciar se necessÃ¡rio
sudo systemctl start postgresql

# Verificar credenciais em .env
cat backend/.env | grep DATABASE_URL
```

---

## ðŸ“š Documentos por Categoria

| Categoria | Documento |
|-----------|-----------|
| **InstalaÃ§Ã£o BÃ¡sica** | INSTALACAO_UBUNTU_SSH.md |
| **ReferÃªncia RÃ¡pida** | UBUNTU_GUIA_RAPIDO.md |
| **ProduÃ§Ã£o** | PRODUCAO_NGINX.md |
| **Desenvolvimento** | GUIA_DEV_NPM.md (original) |
| **Windows** | GUIA_WINDOWS.md (original) |

---

## ðŸŽ“ Como Usar Cada Documento

### CenÃ¡rio 1: "Quero instalar agora"
1. Leia: UBUNTU_GUIA_RAPIDO.md (2 min)
2. Execute: transfer-to-ubuntu.ps1 (5 min)
3. Execute: install-ubuntu.sh (15 min)
4. Execute: ./start-all.sh (1 min)

### CenÃ¡rio 2: "Preciso de detalhes"
1. Leia: INSTALACAO_UBUNTU_SSH.md (20 min)
2. Siga passo-a-passo
3. Use troubleshooting se necessÃ¡rio

### CenÃ¡rio 3: "Vou usar em produÃ§Ã£o"
1. Instale com INSTALACAO_UBUNTU_SSH.md
2. Aplique PRODUCAO_NGINX.md
3. Configure HTTPS e firewall
4. Setup backup automÃ¡tico

---

## ðŸ’¾ Arquivos Criados Neste Session

- âœ… [INSTALACAO_UBUNTU_SSH.md](INSTALACAO_UBUNTU_SSH.md) - Guia completo
- âœ… [UBUNTU_GUIA_RAPIDO.md](UBUNTU_GUIA_RAPIDO.md) - ReferÃªncia rÃ¡pida
- âœ… [PRODUCAO_NGINX.md](PRODUCAO_NGINX.md) - Setup produÃ§Ã£o
- âœ… [install-ubuntu.sh](install-ubuntu.sh) - Script bash automÃ¡tico
- âœ… [transfer-to-ubuntu.ps1](transfer-to-ubuntu.ps1) - Script PowerShell
- âœ… [UBUNTU_SETUP_RESUMO.md](UBUNTU_SETUP_RESUMO.md) - Este arquivo

---

## ðŸŽ¯ PrÃ³ximas Fases (Opcionais)

- [ ] Docker compose para containerizaÃ§Ã£o
- [ ] CI/CD com GitHub Actions
- [ ] Monitoramento com Prometheus/Grafana
- [ ] Load balancing multi-servidor
- [ ] CDN para assets estÃ¡ticos
- [ ] ReplicaÃ§Ã£o de banco de dados

---

## ðŸ“ž Suporte RÃ¡pido

### DÃºvidas sobre...
- **InstalaÃ§Ã£o bÃ¡sica**: Ver UBUNTU_GUIA_RAPIDO.md
- **Passos detalhados**: Ver INSTALACAO_UBUNTU_SSH.md
- **SSH/Transfer**: Ver transfer-to-ubuntu.ps1
- **ProduÃ§Ã£o/NGINX**: Ver PRODUCAO_NGINX.md
- **Troubleshooting**: Buscar em UBUNTU_GUIA_RAPIDO.md (seÃ§Ã£o ðŸ†˜)

---

**Data de CriaÃ§Ã£o**: 12 de Maio de 2026  
**Sistema**: ozapteconta v1.0  
**Plataforma**: Ubuntu 20.04 / PostgreSQL  
**Status**: âœ… Pronto para ProduÃ§Ã£o


