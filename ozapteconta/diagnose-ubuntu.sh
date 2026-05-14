#!/bin/bash

################################################################################
# 🔍 FinanceBot - Script de Diagnóstico - Ubuntu 20.04
# Uso: chmod +x diagnose-ubuntu.sh && ./diagnose-ubuntu.sh
################################################################################

set +e  # Não parar em erros

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Contadores
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_WARNING=0

print_header() {
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC} $1"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
}

test_success() {
    echo -e "${GREEN}✅ $1${NC}"
    ((TESTS_PASSED++))
}

test_error() {
    echo -e "${RED}❌ $1${NC}"
    ((TESTS_FAILED++))
}

test_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
    ((TESTS_WARNING++))
}

test_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

################################################################################
# INÍCIO
################################################################################

clear
print_header "🔍 FinanceBot - Diagnóstico Completo"

################################################################################
# 1. Verificar Diretório
################################################################################

print_header "1️⃣ Verificando Diretório"

if [ -d "./backend" ]; then
    test_success "Diretório backend encontrado"
else
    test_error "Diretório backend NÃO encontrado"
fi

if [ -d "./frontend" ]; then
    test_success "Diretório frontend encontrado"
else
    test_error "Diretório frontend NÃO encontrado"
fi

if [ -d "./storage" ]; then
    test_success "Diretório storage encontrado"
else
    test_warning "Diretório storage não encontrado (será criado)"
fi

################################################################################
# 2. Verificar Node.js e npm
################################################################################

print_header "2️⃣ Verificando Node.js e npm"

if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    test_success "Node.js instalado: $NODE_VERSION"
else
    test_error "Node.js NÃO encontrado"
fi

if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    test_success "npm instalado: $NPM_VERSION"
else
    test_error "npm NÃO encontrado"
fi

################################################################################
# 3. Verificar PostgreSQL
################################################################################

print_header "3️⃣ Verificando PostgreSQL"

if command -v psql &> /dev/null; then
    PSQL_VERSION=$(psql --version)
    test_success "PostgreSQL encontrado: $PSQL_VERSION"
else
    test_error "PostgreSQL NÃO encontrado"
fi

if sudo systemctl is-active --quiet postgresql; then
    test_success "PostgreSQL está rodando"
else
    test_warning "PostgreSQL não está rodando (tentando iniciar...)"
    sudo systemctl start postgresql 2>/dev/null
    if sudo systemctl is-active --quiet postgresql; then
        test_success "PostgreSQL iniciado com sucesso"
    else
        test_error "Não foi possível iniciar PostgreSQL"
    fi
fi

################################################################################
# 4. Verificar Banco de Dados
################################################################################

print_header "4️⃣ Verificando Banco de Dados"

# Testar conexão
if PGPASSWORD="financepassword123" psql -U finance -d financebot -h localhost -c "SELECT 1;" &>/dev/null; then
    test_success "Conexão com banco 'financebot' OK"
    
    # Contar usuários
    ADMIN_COUNT=$(PGPASSWORD="financepassword123" psql -U finance -d financebot -h localhost -t -c "SELECT COUNT(*) FROM admin_users;" 2>/dev/null)
    if [ "$ADMIN_COUNT" -gt 0 ]; then
        test_success "Banco de dados populado ($ADMIN_COUNT admin users)"
    else
        test_warning "Banco de dados vazio (execute: npm run prisma:seed)"
    fi
else
    test_error "Não foi possível conectar ao banco 'financebot'"
    test_info "Credenciais esperadas: finance / financepassword123"
fi

################################################################################
# 5. Verificar Arquivos .env
################################################################################

print_header "5️⃣ Verificando Arquivos .env"

if [ -f "./backend/.env" ]; then
    test_success "Backend .env encontrado"
    
    # Verificar variáveis críticas
    if grep -q "DATABASE_URL" backend/.env; then
        test_success "DATABASE_URL configurado"
    else
        test_error "DATABASE_URL não configurado"
    fi
    
    if grep -q "JWT_SECRET" backend/.env; then
        test_success "JWT_SECRET configurado"
    else
        test_error "JWT_SECRET não configurado"
    fi
else
    test_error "Backend .env NÃO encontrado"
fi

if [ -f "./frontend/.env" ]; then
    test_success "Frontend .env encontrado"
else
    test_warning "Frontend .env não encontrado (opcional)"
fi

################################################################################
# 6. Verificar node_modules
################################################################################

print_header "6️⃣ Verificando node_modules"

if [ -d "./backend/node_modules" ]; then
    test_success "Backend node_modules instalado"
else
    test_error "Backend node_modules NÃO encontrado"
fi

if [ -d "./frontend/node_modules" ]; then
    test_success "Frontend node_modules instalado"
else
    test_error "Frontend node_modules NÃO encontrado"
fi

################################################################################
# 7. Verificar Processos Node Rodando
################################################################################

print_header "7️⃣ Verificando Processos Node Rodando"

BACKEND_RUNNING=$(ps aux | grep -v grep | grep "npm start" | grep backend | wc -l)
FRONTEND_RUNNING=$(ps aux | grep -v grep | grep "http-server" | wc -l)

if [ $BACKEND_RUNNING -gt 0 ]; then
    BACKEND_PID=$(ps aux | grep "npm start" | grep backend | grep -v grep | awk '{print $2}')
    test_success "Backend rodando (PID: $BACKEND_PID)"
else
    test_warning "Backend NÃO está rodando"
fi

if [ $FRONTEND_RUNNING -gt 0 ]; then
    FRONTEND_PID=$(ps aux | grep "http-server" | grep -v grep | awk '{print $2}')
    test_success "Frontend rodando (PID: $FRONTEND_PID)"
else
    test_warning "Frontend NÃO está rodando"
fi

################################################################################
# 8. Verificar Portas
################################################################################

print_header "8️⃣ Verificando Portas"

if sudo netstat -tulpn 2>/dev/null | grep -q ":3001 "; then
    test_success "Porta 3001 em uso (Backend)"
else
    test_warning "Porta 3001 não está respondendo"
fi

if sudo netstat -tulpn 2>/dev/null | grep -q ":5173 "; then
    test_success "Porta 5173 em uso (Frontend)"
else
    test_warning "Porta 5173 não está respondendo"
fi

if sudo netstat -tulpn 2>/dev/null | grep -q ":5432 "; then
    test_success "Porta 5432 em uso (PostgreSQL)"
else
    test_error "PostgreSQL não respondendo na porta 5432"
fi

################################################################################
# 9. Testes HTTP
################################################################################

print_header "9️⃣ Testando Conectividade HTTP"

if command -v curl &> /dev/null; then
    # Backend
    BACKEND_HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api 2>/dev/null)
    if [ "$BACKEND_HTTP" == "200" ] || [ "$BACKEND_HTTP" == "404" ]; then
        test_success "Backend respondendo (HTTP $BACKEND_HTTP)"
    else
        test_warning "Backend retornou HTTP $BACKEND_HTTP"
    fi
    
    # Frontend
    FRONTEND_HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5173 2>/dev/null)
    if [ "$FRONTEND_HTTP" == "200" ]; then
        test_success "Frontend respondendo (HTTP $FRONTEND_HTTP)"
    else
        test_warning "Frontend retornou HTTP $FRONTEND_HTTP"
    fi
else
    test_warning "curl não disponível (pulando testes HTTP)"
fi

################################################################################
# 10. Verificar Espaço em Disco
################################################################################

print_header "🔟 Verificando Espaço em Disco"

DISK_USAGE=$(df . | tail -1 | awk '{print int($5)}')
FREE_SPACE=$(df . | tail -1 | awk '{print $4}')

if [ $DISK_USAGE -lt 80 ]; then
    test_success "Espaço em disco OK ($DISK_USAGE% usado)"
else
    test_warning "Disco quase cheio ($DISK_USAGE% usado, $FREE_SPACE KB livres)"
fi

################################################################################
# 11. Verificar Memória
################################################################################

print_header "1️⃣1️⃣ Verificando Memória"

MEM_USAGE=$(free | grep Mem | awk '{printf("%.0f", $3/$2 * 100)}')

if [ $MEM_USAGE -lt 80 ]; then
    test_success "Memória OK ($MEM_USAGE% usada)"
else
    test_warning "Memória alta ($MEM_USAGE% usada)"
fi

################################################################################
# 12. Verificar Logs
################################################################################

print_header "1️⃣2️⃣ Verificando Logs"

if [ -f "./logs/backend.log" ]; then
    BACKEND_LOG_SIZE=$(stat -f%z ./logs/backend.log 2>/dev/null || stat -c%s ./logs/backend.log 2>/dev/null)
    test_success "Backend log existe (${BACKEND_LOG_SIZE} bytes)"
    
    # Verificar erros
    BACKEND_ERRORS=$(grep -i "error\|fail" ./logs/backend.log 2>/dev/null | tail -5)
    if [ ! -z "$BACKEND_ERRORS" ]; then
        test_warning "Erros detectados no backend log (últimas 5 linhas):"
        echo "$BACKEND_ERRORS" | sed 's/^/  /'
    fi
else
    test_info "Backend log não criado ainda"
fi

if [ -f "./logs/frontend.log" ]; then
    FRONTEND_LOG_SIZE=$(stat -f%z ./logs/frontend.log 2>/dev/null || stat -c%s ./logs/frontend.log 2>/dev/null)
    test_success "Frontend log existe (${FRONTEND_LOG_SIZE} bytes)"
else
    test_info "Frontend log não criado ainda"
fi

################################################################################
# 13. Verificar Sessões WhatsApp
################################################################################

print_header "1️⃣3️⃣ Verificando Sessões WhatsApp"

if [ -d "./storage/wa-sessions" ]; then
    SESSION_COUNT=$(find ./storage/wa-sessions -type d -mindepth 1 | wc -l)
    if [ $SESSION_COUNT -gt 0 ]; then
        test_success "$SESSION_COUNT sessão(ões) WhatsApp salva(s)"
    else
        test_info "Nenhuma sessão WhatsApp salva ainda"
    fi
else
    test_warning "Diretório wa-sessions não existe"
fi

################################################################################
# 14. Verificar Prisma
################################################################################

print_header "1️⃣4️⃣ Verificando Prisma"

if [ -d "./backend/node_modules/@prisma" ]; then
    test_success "Prisma Client instalado"
else
    test_error "Prisma Client NÃO instalado"
fi

if [ -f "./backend/prisma/schema.prisma" ]; then
    test_success "Schema Prisma encontrado"
else
    test_error "Schema Prisma NÃO encontrado"
fi

################################################################################
# RESUMO
################################################################################

print_header "📊 RESUMO DO DIAGNÓSTICO"

echo ""
echo -e "${GREEN}✅ Testes Passados: $TESTS_PASSED${NC}"
echo -e "${YELLOW}⚠️  Avisos: $TESTS_WARNING${NC}"
echo -e "${RED}❌ Testes Falhados: $TESTS_FAILED${NC}"
echo ""

TOTAL=$((TESTS_PASSED + TESTS_WARNING + TESTS_FAILED))
SCORE=$((TESTS_PASSED * 100 / TOTAL))

echo "Pontuação: $SCORE%"
echo ""

if [ $TESTS_FAILED -eq 0 ] && [ $TESTS_WARNING -le 2 ]; then
    echo -e "${GREEN}🎉 SISTEMA PRONTO PARA USAR!${NC}"
elif [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${YELLOW}⚠️  Alguns avisos encontrados, mas o sistema deve funcionar${NC}"
else
    echo -e "${RED}❌ Erros detectados! Veja acima para detalhes${NC}"
fi

echo ""

################################################################################
# RECOMENDAÇÕES
################################################################################

print_header "💡 RECOMENDAÇÕES"

if [ $TESTS_FAILED -gt 0 ] || [ $TESTS_WARNING -gt 0 ]; then
    echo ""
    echo "Próximos passos:"
    echo ""
    
    if [ ! -f "./backend/.env" ]; then
        echo "1. Executar instalação:"
        echo "   ./install-ubuntu.sh"
        echo ""
    fi
    
    if [ $BACKEND_RUNNING -eq 0 ]; then
        echo "2. Iniciar backend:"
        echo "   ./start-backend.sh"
        echo ""
    fi
    
    if [ $FRONTEND_RUNNING -eq 0 ]; then
        echo "3. Iniciar frontend:"
        echo "   ./start-frontend.sh"
        echo ""
    fi
    
    echo "Ou iniciar tudo:"
    echo "   ./start-all.sh"
    echo ""
fi

################################################################################

