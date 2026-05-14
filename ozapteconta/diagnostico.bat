@echo off
setlocal EnableDelayedExpansion
title FinanceBot - Diagnostico
color 0E

echo.
echo  ============================================================
echo   FinanceBot - Diagnostico do Sistema
echo  ============================================================
echo.

set "ERROS=0"

REM 1. Verificar Node.js
echo  [1/7] Verificando Node.js...
node --version >nul 2>&1
if %errorLevel% neq 0 (
    echo  ✗ ERRO: Node.js nao encontrado
    echo    Baixe: https://nodejs.org/
    set "ERROS=1"
) else (
    for /f "tokens=*" %%v in ('node --version') do echo  ✓ OK - %%v
)

REM 2. Verificar npm
echo.
echo  [2/7] Verificando npm...
npm --version >nul 2>&1
if %errorLevel% neq 0 (
    echo  ✗ ERRO: npm nao encontrado
    set "ERROS=1"
) else (
    for /f "tokens=*" %%v in ('npm --version') do echo  ✓ OK - npm %%v
)

REM 3. Verificar PostgreSQL
echo.
echo  [3/7] Verificando PostgreSQL...
psql --version >nul 2>&1
if %errorLevel% neq 0 (
    echo  ✗ ERRO: PostgreSQL nao encontrado
    echo    Baixe: https://www.enterprisedb.com/downloads/postgres-postgresql-downloads
    set "ERROS=1"
) else (
    for /f "tokens=*" %%v in ('psql --version') do echo  ✓ OK - %%v
)

REM 4. Verificar se PostgreSQL esta rodando
echo.
echo  [4/7] Verificando se PostgreSQL esta rodando...
tasklist /FI "IMAGENAME eq postgres.exe" | find /i "postgres" >nul
if %errorLevel% neq 0 (
    echo  ✗ AVISO: PostgreSQL nao esta rodando
    echo    Solucao: net start postgresql-x64-16
) else (
    echo  ✓ OK - PostgreSQL esta rodando
)

REM 5. Verificar portas
echo.
echo  [5/7] Verificando portas disponiveis...
netstat -ano | findstr ":3001" >nul
if %errorLevel% equ 0 (
    echo  ✗ AVISO: Porta 3001 ja esta em uso
) else (
    echo  ✓ OK - Porta 3001 disponivel
)

netstat -ano | findstr ":5173" >nul
if %errorLevel% equ 0 (
    echo  ✗ AVISO: Porta 5173 ja esta em uso
) else (
    echo  ✓ OK - Porta 5173 disponivel
)

REM 6. Verificar backend instalado
echo.
echo  [6/7] Verificando instalacao do backend...
if exist "backend\node_modules" (
    echo  ✓ OK - Backend instalado
) else (
    echo  ✗ ERRO: Backend nao instalado
    echo    Solucao: Execute instalar.bat
    set "ERROS=1"
)

if exist "backend\.env" (
    echo  ✓ OK - backend\.env existe
) else (
    echo  ✗ AVISO: backend\.env nao existe
    echo    Solucao: Crie arquivo .env no backend
)

REM 7. Verificar frontend instalado
echo.
echo  [7/7] Verificando instalacao do frontend...
if exist "frontend\node_modules" (
    echo  ✓ OK - Frontend instalado
) else (
    echo  ✗ ERRO: Frontend nao instalado
    echo    Solucao: Execute instalar.bat
    set "ERROS=1"
)

if exist "frontend\.env" (
    echo  ✓ OK - frontend\.env existe
) else (
    echo  ✗ AVISO: frontend\.env nao existe (sera criado automaticamente)
)

echo.
echo  ============================================================
echo.

if %ERROS% equ 1 (
    echo  STATUS: Problemas encontrados acima
    echo.
    echo  Proximos passos:
    echo  1. Instale todos os programas que faltam
    echo  2. Certifique-se que PostgreSQL esta rodando
    echo  3. Execute instalar.bat
    echo.
) else (
    echo  STATUS: Sistema pronto!
    echo.
    echo  Agora execute: dev-start.bat
    echo.
)

echo  ============================================================
echo.
pause
