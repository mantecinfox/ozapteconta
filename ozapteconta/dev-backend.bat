@echo off
setlocal EnableDelayedExpansion
title FinanceBot - Backend (npm run dev)
color 0A

cd /d "%~dp0backend"

echo.
echo  ============================================================
echo   FinanceBot - Backend em Desenvolvimento
echo  ============================================================
echo.

REM Verificar se node_modules existe
if not exist "node_modules" (
    echo.
    echo  [ERRO] node_modules nao encontrado!
    echo.
    echo  Solucao:
    echo  - Feche este terminal
    echo  - Execute: instalar.bat
    echo  - Depois execute: dev-start.bat
    echo.
    pause
    exit /b 1
)

REM Verificar se .env existe
if not exist ".env" (
    echo.
    echo  [AVISO] Arquivo .env nao encontrado!
    echo.
    echo  Criando .env a partir de .env.example...
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo  OK - .env criado
    ) else (
        echo  ERRO: .env.example nao encontrado
        pause
        exit /b 1
    )
)

echo.
echo  Iniciando servidor...
echo.
echo  Backend: http://localhost:3001
echo  API Health: http://localhost:3001/api/health
echo.
echo  Pressione Ctrl+C para parar
echo.
echo  ============================================================
echo.

call npm run dev

REM Se npm run dev falhar
if %errorLevel% neq 0 (
    echo.
    echo  ============================================================
    echo  [ERRO] npm run dev falhou!
    echo  ============================================================
    echo.
    echo  Possíveis causas:
    echo  1. PostgreSQL nao esta rodando
    echo     Solucao: net start postgresql-x64-16
    echo.
    echo  2. Porta 3001 ja esta em uso
    echo     Solucao: netstat -ano | findstr :3001
    echo.
    echo  3. DATABASE_URL incorreta em .env
    echo     Verifique: backend\.env
    echo.
    echo  4. Node modules corrompidos
    echo     Solucao: npm cache clean --force && npm install
    echo.
    echo  Pressione qualquer tecla para sair...
    pause >nul
)

