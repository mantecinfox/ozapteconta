@echo off
setlocal EnableExtensions EnableDelayedExpansion
title FinanceBot - Iniciando Tudo
color 0A
chcp 65001 >nul 2>&1

set "ROOT_DIR=%~dp0"
set "BACKEND_DIR=%ROOT_DIR%backend"
set "FRONTEND_DIR=%ROOT_DIR%frontend"
set "PORT=3001"

echo.
echo  ==========================================================
echo   FinanceBot - Inicializacao Completa
echo  ==========================================================
echo.

if not exist "%BACKEND_DIR%\package.json" (
    echo  [ERRO] Pasta backend nao encontrada em:
    echo  %BACKEND_DIR%
    echo.
    pause
    exit /b 1
)

if not exist "%FRONTEND_DIR%\package.json" (
    echo  [ERRO] Pasta frontend nao encontrada em:
    echo  %FRONTEND_DIR%
    echo.
    pause
    exit /b 1
)

echo  [1/6] Verificando Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo  [ERRO] Node.js nao encontrado. Instale o Node.js e tente novamente.
    pause
    exit /b 1
)

echo  [2/6] Liberando porta %PORT%...
set "PORT_WAS_IN_USE=0"
call :kill_port %PORT%
if "%PORT_WAS_IN_USE%"=="1" (
    echo  OK - havia uma instancia anterior na porta %PORT% e ela foi reiniciada.
) else (
    echo  OK - porta %PORT% estava livre.
)

echo  [3/6] Preparando backend...
cd /d "%BACKEND_DIR%"

if not exist ".env" (
    if exist ".env.example" (
        copy /y ".env.example" ".env" >nul
        echo  OK - backend\.env criado a partir do .env.example
    ) else (
        echo  [ERRO] backend\.env e .env.example nao encontrados.
        pause
        exit /b 1
    )
)

if not exist "node_modules" (
    echo  - Instalando dependencias do backend...
    call npm install --legacy-peer-deps
    if errorlevel 1 (
        echo  [ERRO] npm install do backend falhou.
        pause
        exit /b 1
    )
)

echo  - Gerando Prisma e recompilando backend...
call npx prisma generate
if errorlevel 1 (
    echo  [ERRO] prisma generate falhou.
    pause
    exit /b 1
)
call npm run build
if errorlevel 1 (
    echo  [ERRO] build do backend falhou.
    pause
    exit /b 1
)

echo  [4/6] Preparando frontend...
cd /d "%FRONTEND_DIR%"

if not exist ".env" (
    > ".env" echo VITE_API_URL=http://localhost:%PORT%
    echo  OK - frontend\.env criado com VITE_API_URL
)

if not exist "node_modules" (
    echo  - Instalando dependencias do frontend...
    call npm install --legacy-peer-deps
    if errorlevel 1 (
        echo  [ERRO] npm install do frontend falhou.
        pause
        exit /b 1
    )
)

echo  - Recompilando frontend...
call npm run build
if errorlevel 1 (
    echo  [ERRO] build do frontend falhou.
    pause
    exit /b 1
)

echo  [5/6] Iniciando servidor principal...
cd /d "%BACKEND_DIR%"
start "FinanceBot - BACKEND" cmd /k "title FinanceBot - BACKEND && cd /d ""%BACKEND_DIR%"" && node dist\server.js"

echo  [6/6] Abrindo sistema...
timeout /t 4 /nobreak >nul
start http://localhost:%PORT%

echo.
echo  ==========================================================
echo   FinanceBot iniciado com sucesso
echo   Acesse: http://localhost:%PORT%
echo   Observacao: este script inicia apenas o servidor principal
echo   que entrega a API e o frontend compilado.
echo  ==========================================================
echo.
pause
exit /b 0

:kill_port
set "TARGET_PORT=%~1"
set "PORT_WAS_IN_USE=0"
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%TARGET_PORT% .*LISTENING"') do (
    set "PORT_WAS_IN_USE=1"
    taskkill /PID %%P /T /F >nul 2>&1
)
exit /b 0
