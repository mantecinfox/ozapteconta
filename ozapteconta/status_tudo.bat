@echo off
title FinanceBot - Status
color 0E
echo.
echo  ============================================
echo   FinanceBot - Status dos Servicos
echo  ============================================
echo.

:: --- Backend (porta 3001) ---
echo  [ BACKEND - porta 3001 ]
set BACK_OK=0
for /f "tokens=4,5" %%a in ('netstat -aon ^| findstr ":3001 " ^| findstr "LISTENING"') do (
    echo   STATUS : RODANDO
    echo   PID    : %%b
    echo   Endereco: %%a
    set BACK_OK=1
)
if %BACK_OK%==0 echo   STATUS : PARADO

echo.

:: --- Frontend (porta 5173) ---
echo  [ FRONTEND - porta 5173 ]
set FRONT_OK=0
for /f "tokens=4,5" %%a in ('netstat -aon ^| findstr ":5173 " ^| findstr "LISTENING"') do (
    echo   STATUS : RODANDO
    echo   PID    : %%b
    echo   Endereco: %%a
    set FRONT_OK=1
)
if %FRONT_OK%==0 echo   STATUS : PARADO

echo.

:: --- URLs de acesso ---
echo  [ URLS DE ACESSO ]
if %BACK_OK%==1 (
    echo   API Backend   : http://localhost:3001/api
) else (
    echo   API Backend   : indisponivel
)
if %FRONT_OK%==1 (
    echo   Painel Admin  : http://localhost:5173/login
    echo   Portal Cliente: http://localhost:5173/cliente/login
) else (
    echo   Frontend      : indisponivel
)

echo.
echo  ============================================
echo.
pause
