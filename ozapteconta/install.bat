@echo off
setlocal EnableDelayedExpansion
title FinanceBot - Instalador Windows
color 0B
chcp 65001 >nul 2>&1

echo.
echo  ============================================================
echo   FinanceBot - Sistema de Contas a Pagar/Receber via WhatsApp
echo   Instalador para Windows
echo  ============================================================
echo.

:: ─── Verifica Administrador ──────────────────────────────────────────────────
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo  [ERRO] Execute como Administrador!
    echo  Clique direito no arquivo e selecione "Executar como administrador"
    echo.
    pause
    exit /b 1
)

set "INSTALL_DIR=%~dp0"
set "DB_PASS=Tra1302"
set "DB_USER=financebot"
set "DB_NAME=financebot"
set "PORT=3001"

echo  Diretorio: %INSTALL_DIR%
echo.

:: ─── 1. Verifica Node.js ─────────────────────────────────────────────────────
echo  [1/6] Verificando Node.js...
node --version >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo  Node.js nao encontrado!
    echo  Abra o link abaixo, instale o Node.js 20 LTS e execute este script novamente:
    echo  https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi
    echo.
    start https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do echo  OK - Node.js %%v

:: ─── 2. Verifica psql no PATH ────────────────────────────────────────────────
echo  [2/6] Verificando PostgreSQL...
psql --version >nul 2>&1
if %errorLevel% neq 0 (
    :: Tenta caminhos padrao do PostgreSQL
    for %%P in (16 15 14 17) do (
        if exist "C:\Program Files\PostgreSQL\%%P\bin\psql.exe" (
            set "PATH=%PATH%;C:\Program Files\PostgreSQL\%%P\bin"
            goto :pg_found
        )
    )
    echo.
    echo  PostgreSQL nao encontrado!
    echo  Instale o PostgreSQL 16 com a senha: %DB_PASS%
    echo  https://www.enterprisedb.com/downloads/postgres-postgresql-downloads
    echo.
    start https://www.enterprisedb.com/downloads/postgres-postgresql-downloads
    pause
    exit /b 1
    :pg_found
)
for /f "tokens=*" %%v in ('psql --version') do echo  OK - %%v

:: ─── 3. Cria banco de dados ───────────────────────────────────────────────────
echo  [3/6] Configurando banco de dados...
set "PGPASSWORD=%DB_PASS%"
psql -U postgres -c "CREATE USER %DB_USER% WITH PASSWORD '%DB_PASS%';" 2>nul
psql -U postgres -c "CREATE DATABASE %DB_NAME% OWNER %DB_USER%;" 2>nul
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE %DB_NAME% TO %DB_USER%;" 2>nul
echo  OK - Banco: %DB_NAME%  Usuario: %DB_USER%  Senha: %DB_PASS%

:: ─── 4. Configura .env ───────────────────────────────────────────────────────
echo  [4/6] Configurando variaveis de ambiente...
cd /d "%INSTALL_DIR%backend"

if not exist ".env" (
    copy ".env.example" ".env" >nul
    :: Ajusta DATABASE_URL com a senha correta
    powershell -Command ^
      "(Get-Content '.env') -replace 'DATABASE_URL=.*', 'DATABASE_URL=postgresql://%DB_USER%:%DB_PASS%@localhost:5432/%DB_NAME%' | Set-Content '.env'"
    :: Gera JWT_SECRET aleatorio
    powershell -Command ^
      "$s = [System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(48)); (Get-Content '.env') -replace 'JWT_SECRET=.*', \"JWT_SECRET=$s\" | Set-Content '.env'"
    echo  OK - .env criado com DATABASE_URL configurada
) else (
    echo  OK - .env ja existe, mantendo configuracoes atuais
)

if not exist "storage\audios" mkdir "storage\audios"
if not exist "logs" mkdir "logs"

:: ─── 5. Instala, migra e compila backend ─────────────────────────────────────
echo  [5/6] Instalando dependencias, migrando banco e compilando...

echo  - npm install...
call npm install --legacy-peer-deps
if %errorLevel% neq 0 ( echo  [ERRO] npm install falhou & pause & exit /b 1 )

echo  - prisma generate...
call npx prisma generate
if %errorLevel% neq 0 ( echo  [ERRO] prisma generate falhou & pause & exit /b 1 )

echo  - prisma migrate...
call npx prisma migrate deploy 2>nul
if %errorLevel% neq 0 (
    echo  Tentando prisma db push...
    call npx prisma db push
)

echo  - seed inicial...
call npm run prisma:seed
if %errorLevel% neq 0 ( echo  Aviso: seed ja executado ou falhou )

echo  - npm run build...
call npm run build
if %errorLevel% neq 0 ( echo  [ERRO] Build falhou & pause & exit /b 1 )

echo  OK - Backend compilado

:: ─── 6. Compila frontend ─────────────────────────────────────────────────────
echo  [6/6] Compilando frontend...
cd /d "%INSTALL_DIR%frontend"

if not exist ".env" (
    echo VITE_API_URL=http://localhost:%PORT%> .env
)

call npm install --legacy-peer-deps
if %errorLevel% neq 0 ( echo  [ERRO] npm install frontend falhou & pause & exit /b 1 )

call npm run build
if %errorLevel% neq 0 ( echo  [ERRO] Build frontend falhou & pause & exit /b 1 )

echo  OK - Frontend compilado

:: ─── Cria scripts de controle ────────────────────────────────────────────────
cd /d "%INSTALL_DIR%"

:: iniciar.bat
(
echo @echo off
echo title FinanceBot
echo echo Iniciando FinanceBot...
echo cd /d "%INSTALL_DIR%backend"
echo node dist\server.js
) > iniciar.bat

:: iniciar-bg.bat (em background via PM2)
call npm install -g pm2 >nul 2>&1
(
echo module.exports = {
echo   apps: [{
echo     name: 'financebot',
echo     script: 'dist/server.js',
echo     cwd: '%INSTALL_DIR%backend',
echo     env: { NODE_ENV: 'production' }
echo   }]
echo };
) > ecosystem.config.js

(
echo @echo off
echo title FinanceBot - Background
echo echo Iniciando FinanceBot em background...
echo pm2 start "%INSTALL_DIR%ecosystem.config.js"
echo pm2 save
echo timeout /t 2 /nobreak ^>nul
echo start http://localhost:%PORT%
echo echo.
echo echo FinanceBot rodando em: http://localhost:%PORT%
echo pause
) > iniciar-bg.bat

(
echo @echo off
echo echo Parando FinanceBot...
echo pm2 stop financebot
echo echo Encerrado.
echo pause
) > parar.bat

(
echo @echo off
echo pm2 status
echo pause
) > status.bat

:: ─── Resumo ───────────────────────────────────────────────────────────────────
echo.
echo  ============================================================
echo   INSTALACAO CONCLUIDA!
echo  ============================================================
echo.
echo   Sistema:    http://localhost:%PORT%
echo   Webhook:    http://localhost:%PORT%/api/webhook
echo.
echo   Login admin: admin / admin123
echo   Banco:       %DB_NAME% (usuario: %DB_USER%, senha: %DB_PASS%)
echo.
echo   Para iniciar:
echo     iniciar.bat     - Inicia no terminal (visivel)
echo     iniciar-bg.bat  - Inicia em background com PM2
echo     parar.bat       - Para o servico PM2
echo     status.bat      - Ver status do PM2
echo.
echo   PROXIMO PASSO: Configure o WhatsApp e IA no Dashboard!
echo  ============================================================
echo.

start http://localhost:%PORT%
pause
