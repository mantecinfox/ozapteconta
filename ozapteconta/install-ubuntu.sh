#!/bin/bash

#################################################################################
# 🚀 FinanceBot - Script de Instalação Automática - Ubuntu 20.04
# Uso: chmod +x install-ubuntu.sh && ./install-ubuntu.sh
#################################################################################

set -e  # Parar se houver erro

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configurações
INSTALL_PATH="${1:-.}"
DB_USER="finance"
DB_NAME="financebot"
DB_PASSWORD="financepassword123"
SERVER_PORT=3001
FRONTEND_PORT=5173

#################################################################################
# Funções auxiliares
#################################################################################

print_header() {
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC} $1"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

check_command() {
    if ! command -v $1 &> /dev/null; then
        print_error "$1 não encontrado!"
        return 1
    fi
    print_success "$1 encontrado"
}

#################################################################################
# INÍCIO DA INSTALAÇÃO
#################################################################################

clear
print_header "🚀 FinanceBot - Instalação Automática Ubuntu 20.04"

#################################################################################
# 1. Verificar pré-requisitos
#################################################################################

print_header "1️⃣ Verificando Pré-Requisitos"

print_info "Verificando Node.js..."
check_command "node"
NODE_VERSION=$(node --version)
print_info "Versão: $NODE_VERSION"

print_info "Verificando npm..."
check_command "npm"
NPM_VERSION=$(npm --version)
print_info "Versão: $NPM_VERSION"

print_info "Verificando PostgreSQL..."
check_command "psql"
PSQL_VERSION=$(psql --version)
print_info "Versão: $PSQL_VERSION"

print_success "Todos os pré-requisitos verificados!"

#################################################################################
# 2. Verificar/Criar Estrutura de Diretórios
#################################################################################

print_header "2️⃣ Preparando Diretórios"

if [ ! -d "$INSTALL_PATH/backend" ]; then
    print_error "Pasta 'backend' não encontrada em $INSTALL_PATH"
    print_info "Certifique-se de copiar os arquivos antes de executar este script"
    exit 1
fi

if [ ! -d "$INSTALL_PATH/frontend" ]; then
    print_error "Pasta 'frontend' não encontrada em $INSTALL_PATH"
    exit 1
fi

print_success "Estrutura de diretórios verificada"

#################################################################################
# 3. Configurar Banco de Dados PostgreSQL
#################################################################################

print_header "3️⃣ Configurando PostgreSQL"

print_info "Iniciando PostgreSQL (se não estiver rodando)..."
sudo systemctl start postgresql || print_info "PostgreSQL já está rodando"

print_info "Criando usuário e banco de dados..."

sudo -u postgres psql << EOF
SELECT 1 FROM pg_roles WHERE rolname='$DB_USER' \G
EOF

# Criar usuário se não existir
if ! sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
    sudo -u postgres psql << EOF
CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
ALTER USER $DB_USER CREATEDB;
EOF
    print_success "Usuário PostgreSQL '$DB_USER' criado"
else
    print_info "Usuário '$DB_USER' já existe"
fi

# Criar banco se não existir
if ! sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
    sudo -u postgres psql << EOF
CREATE DATABASE $DB_NAME OWNER $DB_USER;
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
EOF
    print_success "Banco de dados '$DB_NAME' criado"
else
    print_info "Banco de dados '$DB_NAME' já existe"
fi

# Testar conexão
if PGPASSWORD="$DB_PASSWORD" psql -U "$DB_USER" -d "$DB_NAME" -h localhost -c "\dt" &>/dev/null; then
    print_success "Conexão com PostgreSQL testada com sucesso"
else
    print_error "Não foi possível conectar ao PostgreSQL"
    exit 1
fi

#################################################################################
# 4. Criar Arquivo .env
#################################################################################

print_header "4️⃣ Configurando Variáveis de Ambiente"

# Gerar JWT_SECRET aleatório
JWT_SECRET=$(openssl rand -base64 32)
SERVER_IP=$(hostname -I | awk '{print $1}')

print_info "IP do servidor detectado: $SERVER_IP"

# Backend .env
print_info "Criando .env do Backend..."
cat > "$INSTALL_PATH/backend/.env" << EOF
# ============ BANCO DE DADOS ============
DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME"

# ============ SERVIDOR ============
NODE_ENV=production
PORT=$SERVER_PORT
API_URL=http://$SERVER_IP:$SERVER_PORT

# ============ FRONTEND ============
FRONTEND_URL=http://$SERVER_IP:$FRONTEND_PORT

# ============ JWT ============
JWT_SECRET=$JWT_SECRET

# ============ ADMIN ============
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123

# ============ WHATSAPP ============
WHATSAPP_BAILEYS_SESSION_PATH=$INSTALL_PATH/storage/wa-sessions

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
print_success ".env Backend criado"

# Frontend .env
print_info "Criando .env do Frontend..."
cat > "$INSTALL_PATH/frontend/.env" << EOF
VITE_API_URL=http://$SERVER_IP:$SERVER_PORT
VITE_APP_NAME=FinanceBot
EOF
print_success ".env Frontend criado"

# Criar diretórios necessários
mkdir -p "$INSTALL_PATH/storage/wa-sessions"
mkdir -p "$INSTALL_PATH/logs"

#################################################################################
# 5. Instalar Dependências
#################################################################################

print_header "5️⃣ Instalando Dependências"

print_info "Backend - npm install..."
cd "$INSTALL_PATH/backend"
npm install --prefer-offline --no-audit --no-fund 2>&1 | grep -E "(added|up to date|WARN)" || true
print_success "Backend - dependências instaladas"

print_info "Frontend - npm install..."
cd "$INSTALL_PATH/frontend"
npm install --prefer-offline --no-audit --no-fund 2>&1 | grep -E "(added|up to date|WARN)" || true
print_success "Frontend - dependências instaladas"

#################################################################################
# 6. Setup Prisma
#################################################################################

print_header "6️⃣ Configurando Prisma"

cd "$INSTALL_PATH/backend"

print_info "Gerando Prisma Client..."
npm run prisma:generate

print_info "Executando migrations..."
npm run prisma:migrate || print_info "Migrations já aplicadas"

print_info "Seedando banco de dados..."
npm run prisma:seed || print_info "Seed já executado"

print_success "Prisma configurado com sucesso"

#################################################################################
# 7. Build Frontend
#################################################################################

print_header "7️⃣ Buildando Frontend"

cd "$INSTALL_PATH/frontend"
npm run build
print_success "Frontend buildado"

#################################################################################
# 8. Criar Scripts de Inicialização
#################################################################################

print_header "8️⃣ Criando Scripts de Inicialização"

# Script para iniciar backend
cat > "$INSTALL_PATH/start-backend.sh" << 'EOF'
#!/bin/bash
cd "$(dirname "$0")/backend"
npm start
EOF

chmod +x "$INSTALL_PATH/start-backend.sh"
print_success "Script start-backend.sh criado"

# Script para iniciar frontend
cat > "$INSTALL_PATH/start-frontend.sh" << 'EOF'
#!/bin/bash
cd "$(dirname "$0")/frontend"
npx http-server dist -p 5173
EOF

chmod +x "$INSTALL_PATH/start-frontend.sh"
print_success "Script start-frontend.sh criado"

# Script para iniciar tudo
cat > "$INSTALL_PATH/start-all.sh" << 'EOF'
#!/bin/bash
echo "🚀 Iniciando FinanceBot..."

# Backend em background
nohup ./start-backend.sh > ./logs/backend.log 2>&1 &
BACKEND_PID=$!
echo "Backend iniciado (PID: $BACKEND_PID)"

# Frontend em background
nohup ./start-frontend.sh > ./logs/frontend.log 2>&1 &
FRONTEND_PID=$!
echo "Frontend iniciado (PID: $FRONTEND_PID)"

# Salvar PIDs
echo $BACKEND_PID > ./backend.pid
echo $FRONTEND_PID > ./frontend.pid

echo "✅ FinanceBot iniciado!"
echo "📱 Frontend: http://$(hostname -I | awk '{print $1}'):5173"
echo "🔌 Backend: http://$(hostname -I | awk '{print $1}'):3001"
sleep 2
EOF

chmod +x "$INSTALL_PATH/start-all.sh"
print_success "Script start-all.sh criado"

# Script para parar tudo
cat > "$INSTALL_PATH/stop-all.sh" << 'EOF'
#!/bin/bash
echo "🛑 Parando FinanceBot..."

if [ -f ./backend.pid ]; then
    kill $(cat ./backend.pid) 2>/dev/null || true
    rm ./backend.pid
fi

if [ -f ./frontend.pid ]; then
    kill $(cat ./frontend.pid) 2>/dev/null || true
    rm ./frontend.pid
fi

echo "✅ FinanceBot parado"
EOF

chmod +x "$INSTALL_PATH/stop-all.sh"
print_success "Script stop-all.sh criado"

#################################################################################
# 9. Resumo Final
#################################################################################

print_header "✅ INSTALAÇÃO CONCLUÍDA!"

echo ""
print_success "Todas as etapas foram concluídas com sucesso!"
echo ""
print_info "IP do Servidor: $SERVER_IP"
echo ""
echo "📋 PRÓXIMOS PASSOS:"
echo ""
echo "1️⃣  Iniciar o sistema:"
echo "   cd $INSTALL_PATH"
echo "   ./start-all.sh"
echo ""
echo "2️⃣  Acessar aplicação:"
echo "   Frontend: http://$SERVER_IP:$FRONTEND_PORT"
echo "   Backend:  http://$SERVER_IP:$SERVER_PORT"
echo ""
echo "3️⃣  Credenciais iniciais:"
echo "   Usuário: admin"
echo "   Senha:   admin123"
echo ""
echo "4️⃣  Ver logs:"
echo "   tail -f ./logs/backend.log"
echo "   tail -f ./logs/frontend.log"
echo ""
echo "5️⃣  Parar o sistema:"
echo "   ./stop-all.sh"
echo ""

#################################################################################
# FIM
#################################################################################

