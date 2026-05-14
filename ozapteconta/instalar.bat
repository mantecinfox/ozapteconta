@echo off
setlocal EnableDelayedExpansion
title FinanceBot - Instalacao Automatizada
color 0A

echo.
echo  ============================================================
echo   FinanceBot - Setup Completo (Windows)
echo  ============================================================
echo.

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

echo  [1/6] Verificando Node.js...
node --version >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo  [ERRO] Node.js nao encontrado.
    echo  Instale em: https://nodejs.org/
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do echo  OK - %%v

echo  [2/6] Verificando npm...
npm --version >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo  [ERRO] npm nao encontrado.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('npm --version') do echo  OK - npm %%v

echo  [3/6] Configurando acesso ao PostgreSQL...
if exist "C:\Program Files\PostgreSQL\18\bin\psql.exe" set "PATH=%PATH%;C:\Program Files\PostgreSQL\18\bin"
if exist "C:\Program Files\PostgreSQL\17\bin\psql.exe" set "PATH=%PATH%;C:\Program Files\PostgreSQL\17\bin"
if exist "C:\Program Files\PostgreSQL\16\bin\psql.exe" set "PATH=%PATH%;C:\Program Files\PostgreSQL\16\bin"

psql --version >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo  [ERRO] PostgreSQL nao encontrado no PATH.
    echo  Instale em: https://www.enterprisedb.com/downloads/postgres-postgresql-downloads
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('psql --version') do echo  OK - %%v

echo  [4/6] Criando usuario e banco financebot...
set "PGPASSWORD=Tra1302"
psql -U postgres -h localhost -tc "SELECT 1 FROM pg_roles WHERE rolname='financebot'" | findstr /r "1" >nul
if %errorLevel% neq 0 (
    psql -U postgres -h localhost -c "CREATE USER financebot WITH PASSWORD 'Tra1302';"
)
psql -U postgres -h localhost -tc "SELECT 1 FROM pg_database WHERE datname='financebot'" | findstr /r "1" >nul
if %errorLevel% neq 0 (
    psql -U postgres -h localhost -c "CREATE DATABASE financebot OWNER financebot;"
)
psql -U postgres -h localhost -c "GRANT ALL PRIVILEGES ON DATABASE financebot TO financebot;" >nul 2>&1
echo  OK - Banco de dados pronto

echo  [5/6] Executando setup do projeto...
call npm install
if %errorLevel% neq 0 (
    echo.
    echo  [ERRO] npm install (raiz) falhou.
    echo.
    pause
    exit /b 1
)

call npm run setup
if %errorLevel% neq 0 (
    echo.
    echo  [ERRO] npm run setup falhou.
    echo.
    pause
    exit /b 1
)

echo  [6/6] Validando backend...
call npm run prisma:generate --prefix backend >nul 2>&1

echo.
echo  ============================================================
echo   INSTALACAO CONCLUIDA COM SUCESSO
echo  ============================================================
echo.
echo  Para iniciar tudo com um comando:
echo.
echo     npm run dev
echo.
echo  URLs:
echo     Frontend: http://localhost:5173
echo     Backend:  http://localhost:3001/api/health
echo.
pause
