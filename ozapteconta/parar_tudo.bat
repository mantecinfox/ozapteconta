@echo off
title FinanceBot - Parando Tudo
color 0C
setlocal EnableDelayedExpansion

set "ROOT_DIR=%~dp0"
set "ROOT_DIR=%ROOT_DIR:~0,-1%"

echo.
echo  ============================================
echo   FinanceBot - Encerrando Tudo
echo  ============================================
echo.

echo [1/6] Parando processos nas portas conhecidas...
set "KILLED_3001=0"
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001 " ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
    echo        Porta 3001 -> PID %%a encerrado.
    set "KILLED_3001=1"
)
if !KILLED_3001!==0 echo        Porta 3001 ja estava livre.

set "KILLED_5173=0"
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 " ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
    echo        Porta 5173 -> PID %%a encerrado.
    set "KILLED_5173=1"
)
if !KILLED_5173!==0 echo        Porta 5173 ja estava livre.

echo [2/6] Fechando janelas abertas pelo iniciar_tudo.bat...
taskkill /FI "WINDOWTITLE eq FinanceBot - BACKEND" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq FinanceBot - FRONTEND" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq FinanceBot - Iniciando Tudo" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq FinanceBot - Status" /F >nul 2>&1

echo [3/6] Encerrando processos Node/NPM do projeto (watchers/eventos)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$killed = 0; Get-CimInstance Win32_Process | Where-Object { ($_.Name -in @('node.exe','npm.exe','npm.cmd','npx.exe','npx.cmd')) -and $_.CommandLine -and $_.CommandLine.ToLower().Contains('wpp finance') } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop; Write-Host ('       Encerrado PID ' + $_.ProcessId + ' (' + $_.Name + ')'); $killed++ } catch {} }; if ($killed -eq 0) { Write-Host '       Nenhum processo Node/NPM do projeto estava ativo.' }"

echo [4/6] Encerrando ts-node-dev e vite que sobraram...
taskkill /IM "ts-node-dev.exe" /F >nul 2>&1
taskkill /IM "vite.exe" /F >nul 2>&1

echo [5/6] Fechando terminais CMD/PowerShell do projeto...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$killed = 0; Get-CimInstance Win32_Process | Where-Object { ($_.Name -in @('cmd.exe','powershell.exe','pwsh.exe')) -and $_.CommandLine -and $_.CommandLine.ToLower().Contains('wpp finance') -and ( $_.CommandLine.ToLower().Contains('npm run dev') -or $_.CommandLine.ToLower().Contains('vite') -or $_.CommandLine.ToLower().Contains('ts-node-dev') -or $_.CommandLine.ToLower().Contains('prisma') ) } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop; Write-Host ('       Terminal encerrado PID ' + $_.ProcessId + ' (' + $_.Name + ')'); $killed++ } catch {} }; if ($killed -eq 0) { Write-Host '       Nenhum terminal de desenvolvimento ativo foi encontrado.' }"

echo [6/6] Confirmando portas finais...
set "RESTO_3001=0"
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001 " ^| findstr "LISTENING"') do set "RESTO_3001=1"
set "RESTO_5173=0"
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 " ^| findstr "LISTENING"') do set "RESTO_5173=1"

if !RESTO_3001!==0 (
    echo        Porta 3001 liberada.
) else (
    echo        ATENCAO: ainda existe processo na porta 3001.
)

if !RESTO_5173!==0 (
    echo        Porta 5173 liberada.
) else (
    echo        ATENCAO: ainda existe processo na porta 5173.
)

echo.
echo  ============================================
echo   Rotina de parada concluida.
echo  ============================================
echo.
pause
