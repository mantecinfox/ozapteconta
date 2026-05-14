#!/usr/bin/env bash
# ============================================================
#  FinanceBot — Instalador para Ubuntu 20.04+
#  Uso: sudo bash install.sh
# ============================================================
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RED='\033[0;31m'; NC='\033[0m'; BOLD='\033[1m'
STEP=0; TOTAL=6
step() { STEP=$((STEP+1)); echo -e "\n${CYAN}  [$STEP/$TOTAL] $1${NC}"; }
ok()   { echo -e "${GREEN}  ✔ $1${NC}"; }
warn() { echo -e "${YELLOW}  ⚠ $1${NC}"; }
fail() { echo -e "${RED}  ✘ $1${NC}"; exit 1; }

INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_USER="${SUDO_USER:-$(whoami)}"
PORT=3001

echo ""
echo "  ============================================================"
echo "   FinanceBot - Sistema de Contas a Pagar/Receber via WhatsApp"
echo "   Instalador para Ubuntu 20.04+"
echo "  ============================================================"
echo ""

[[ $EUID -ne 0 ]] && fail "Execute como root: sudo bash install.sh"

# ─── 1. Node.js 20 ───────────────────────────────────────────────────────────
step "Instalando Node.js 20 LTS"
if command -v node &>/dev/null && node -e "process.exit(parseInt(process.version.slice(1)) >= 18 ? 0 : 1)" 2>/dev/null; then
    ok "Node.js $(node --version) ja instalado"
else
    apt-get update -qq
    apt-get install -y -qq curl
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
    apt-get install -y nodejs >/dev/null 2>&1
    ok "Node.js $(node --version) instalado"
fi

# ─── 2. PostgreSQL ────────────────────────────────────────────────────────────
step "Instalando PostgreSQL"
if systemctl is-active --quiet postgresql 2>/dev/null; then
    ok "PostgreSQL ja esta rodando"
else
    apt-get install -y -qq gnupg2 lsb-release
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
        | gpg --dearmor -o /usr/share/keyrings/postgresql-keyring.gpg 2>/dev/null
    echo "deb [signed-by=/usr/share/keyrings/postgresql-keyring.gpg] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list
    apt-get update -qq
    apt-get install -y postgresql-16 >/dev/null 2>&1
    systemctl enable postgresql >/dev/null 2>&1
    systemctl start postgresql
    ok "PostgreSQL 16 instalado"
fi

echo ""
echo -n "  Digite a senha para o banco de dados (Enter para gerar automaticamente): "
read -r DB_PASS
if [[ -z "$DB_PASS" ]]; then
    DB_PASS=$(openssl rand -base64 16 | tr -d '/+=\n' | head -c 20)
    echo -e "  Senha gerada: ${BOLD}$DB_PASS${NC}"
    echo "  SALVE ESTA SENHA!"
fi

sudo -u postgres psql -c "CREATE USER financebot WITH PASSWORD '$DB_PASS';" 2>/dev/null || warn "Usuario ja existe"
sudo -u postgres psql -c "CREATE DATABASE financebot OWNER financebot;" 2>/dev/null || warn "Banco ja existe"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE financebot TO financebot;" 2>/dev/null
ok "Banco de dados configurado"

# ─── 3. Configura .env ───────────────────────────────────────────────────────
step "Configurando variaveis de ambiente"
cd "$INSTALL_DIR/backend"

if [[ ! -f ".env" ]]; then
    JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')
    cat > ".env" << ENVEOF
NODE_ENV=production
PORT=$PORT
DATABASE_URL=postgresql://financebot:$DB_PASS@localhost:5432/financebot
JWT_SECRET=$JWT_SECRET
FRONTEND_URL=http://localhost:$PORT
AUDIO_STORAGE_PATH=$INSTALL_DIR/backend/storage/audios
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=financebot_verify
OPENAI_API_KEY=
GEMINI_API_KEY=
GROQ_API_KEY=
GROK_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434
ENVEOF
    ok ".env criado"
else
    ok ".env ja existe, mantendo configuracoes"
fi

mkdir -p "$INSTALL_DIR/backend/storage/audios" "$INSTALL_DIR/backend/logs"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/backend/storage" "$INSTALL_DIR/backend/logs" 2>/dev/null || true

# ─── 4. Backend ───────────────────────────────────────────────────────────────
step "Instalando dependencias e compilando backend"
cd "$INSTALL_DIR/backend"

npm install --legacy-peer-deps --silent
npx prisma generate >/dev/null 2>&1
npx prisma migrate deploy 2>/dev/null || npx prisma db push --accept-data-loss 2>/dev/null
npm run prisma:seed 2>/dev/null || warn "Seed ja executado ou falhou"
npm run build
ok "Backend compilado"

# ─── 5. Frontend ──────────────────────────────────────────────────────────────
step "Compilando frontend"
cd "$INSTALL_DIR/frontend"

[[ ! -f ".env" ]] && echo "VITE_API_URL=http://localhost:$PORT" > .env
npm install --legacy-peer-deps --silent
npm run build
ok "Frontend compilado"

# ─── 6. PM2 e scripts de controle ────────────────────────────────────────────
step "Configurando PM2 e scripts de controle"
npm install -g pm2 --silent 2>/dev/null

cat > "$INSTALL_DIR/ecosystem.config.js" << ECOEOF
module.exports = {
  apps: [{
    name: 'financebot',
    script: '$INSTALL_DIR/backend/dist/server.js',
    cwd: '$INSTALL_DIR/backend',
    env: { NODE_ENV: 'production' }
  }]
};
ECOEOF

sudo -u "$SERVICE_USER" bash -c "cd '$INSTALL_DIR' && pm2 start ecosystem.config.js && pm2 save" 2>/dev/null || true
env PATH=$PATH:/usr/bin pm2 startup systemd -u "$SERVICE_USER" --hp "/home/$SERVICE_USER" 2>/dev/null || true

# Scripts de controle
cat > "$INSTALL_DIR/iniciar.sh" << 'EOF'
#!/bin/bash
pm2 start ecosystem.config.js
pm2 status
EOF

cat > "$INSTALL_DIR/parar.sh" << 'EOF'
#!/bin/bash
pm2 stop financebot
pm2 status
EOF

cat > "$INSTALL_DIR/status.sh" << 'EOF'
#!/bin/bash
pm2 status
echo ""
pm2 logs financebot --lines 30 --nostream
EOF

chmod +x "$INSTALL_DIR/iniciar.sh" "$INSTALL_DIR/parar.sh" "$INSTALL_DIR/status.sh"
chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/iniciar.sh" "$INSTALL_DIR/parar.sh" "$INSTALL_DIR/status.sh" 2>/dev/null || true

# Firewall
if command -v ufw &>/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
    ufw allow "$PORT/tcp" >/dev/null 2>&1 || true
fi

ok "PM2 configurado"

# ─── Resumo ───────────────────────────────────────────────────────────────────
SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
echo ""
echo -e "${GREEN}${BOLD}"
echo "  ============================================================"
echo "   INSTALACAO CONCLUIDA!"
echo "  ============================================================"
echo ""
echo "   Sistema:    http://localhost:$PORT"
echo "   Rede local: http://$SERVER_IP:$PORT"
echo "   Webhook:    http://$SERVER_IP:$PORT/api/webhook"
echo ""
echo "   Login admin: admin / admin123"
echo ""
echo "   Comandos:"
echo "     ./iniciar.sh  - Inicia o FinanceBot"
echo "     ./parar.sh    - Para o FinanceBot"
echo "     ./status.sh   - Ver status e logs"
echo "     pm2 logs      - Logs em tempo real"
echo ""
echo "   PROXIMO PASSO: Configure o WhatsApp e IA no Dashboard!"
echo "  ============================================================"
echo -e "${NC}"
