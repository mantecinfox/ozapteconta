@echo off
setlocal EnableDelayedExpansion
title FinanceBot - Ambiente de Desenvolvimento
color 0B

set "INSTALL_DIR=%~dp0"

echo.
echo  ============================================================
echo   FinanceBot - Iniciando Ambiente de Desenvolvimento
echo  ============================================================
echo.

REM Verificar se Node.js esta instalado
node --version >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo  [ERRO CRITICO] Node.js nao encontrado!
    echo.
    echo  Instale Node.js 20+: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM Verificar se as pastas de node_modules existem
if not exist "%INSTALL_DIR%backend\node_modules" (
    echo.
    echo  [ERRO] Backend nao foi instalado ainda!
    echo.
    echo  Solucao: Execute instalar.bat primeiro
    echo.
    pause
    exit /b 1
)

if not exist "%INSTALL_DIR%frontend\node_modules" (
    echo.
    echo  [ERRO] Frontend nao foi instalado ainda!
    echo.
    echo  Solucao: Execute instalar.bat primeiro
    echo.
    pause
    exit /b 1
)

REM Verificar PostgreSQL
echo  Verificando PostgreSQL...
psql --version >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo  [AVISO] PostgreSQL nao encontrado no PATH
    echo.
    echo  Tente iniciar manualmente:
    echo  net start postgresql-x64-16
    echo.
)

echo.
echo  [1/2] Abrindo Backend (Terminal 1)...
start "FinanceBot - Backend" /D "%INSTALL_DIR%" cmd /k dev-backend.bat

echo  [2/2] Abrindo Frontend (Terminal 2)...
timeout /t 2 >nul
start "FinanceBot - Frontend" /D "%INSTALL_DIR%" cmd /k dev-frontend.bat

echo.
echo  ============================================================
echo.
echo   Terminais abertos!
echo.
echo   Backend: http://localhost:3001/api/health
echo   Frontend: http://localhost:5173
echo.
echo   IMPORTANTE:
echo   - PostgreSQL deve estar rodando
echo   - Verifique os terminais abertos para ver erros
echo.
echo   Pressione qualquer tecla para fechar esta janela...
echo   (Os terminais de desenvolvimento vao continuar rodando)
echo.
echo  ============================================================
echo.

pause >nul
