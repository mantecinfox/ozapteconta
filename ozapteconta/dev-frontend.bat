@echo off
setlocal EnableDelayedExpansion
title FinanceBot - Frontend (npm run dev)
color 0B

cd /d "%~dp0frontend"

echo.
echo  ============================================================
echo   FinanceBot - Frontend em Desenvolvimento
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
    echo  Criando .env com configuracao padrao...
    echo VITE_API_URL=http://localhost:3001 > .env
    echo  OK - .env criado
)

echo.
echo  Iniciando Vite dev server...
echo.
echo  Frontend: http://localhost:5173
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
    echo  1. Porta 5173 ja esta em uso
    echo     Solucao: netstat -ano | findstr :5173
    echo.
    echo  2. Node modules corrompidos
    echo     Solucao: npm cache clean --force && npm install
    echo.
    echo  3. Conflito no Vite
    echo     Solucao: Editar frontend\vite.config.ts
    echo.
    echo  Pressione qualquer tecla para sair...
    pause >nul
)

