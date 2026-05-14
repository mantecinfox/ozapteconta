# âš™ï¸ ozapteconta - VerificaÃ§Ãµes e Scripts Windows

## ðŸ“‹ VERIFICAÃ‡Ã•ES PRÃ‰-INSTALAÃ‡ÃƒO

Execute estes comandos em **PowerShell** ou **Command Prompt** para verificar preparaÃ§Ã£o:

### 1. Verificar Node.js
```powershell
# Verificar versÃ£o
node --version
npm --version

# Deve mostrar v20.x.x ou superior
```

### 2. Verificar PostgreSQL
```powershell
# Verificar versÃ£o
psql --version

# Deve mostrar PostgreSQL 16.x ou superior
```

### 3. Verificar Portas Livres
```powershell
# Verificar porta 3001
netstat -ano | findstr ":3001"

# Verificar porta 5173
netstat -ano | findstr ":5173"

# Deve estar vazio (nenhum processo usando)
```

### 4. Verificar Pasta do Projeto
```powershell
# Listar arquivos principais
Get-ChildItem -Path ".\*" -Include "install.bat", "package.json", "README.md"
```

---

## ðŸš€ SCRIPTS DE INICIALIZAÃ‡ÃƒO

### Criar Script: iniciar-dev-full.bat

Crie um arquivo `iniciar-dev-full.bat` na raiz do projeto com este conteÃºdo:

```batch
@echo off
setlocal EnableDelayedExpansion
title ozapteconta - Desenvolvimento Full
color 0B

echo.
echo  ozapteconta - Iniciar Ambiente de Desenvolvimento
echo  ================================================
echo.

set "INSTALL_DIR=%~dp0"

REM Verificar se os processos Node ja estao rodando
tasklist /FI "IMAGENAME eq node.exe" | find /I "node.exe" >nul
if %errorLevel% equ 0 (
    echo  [!] Node.js ja esta rodando. Matando processos antigos...
    taskkill /F /IM node.exe >nul 2>&1
    timeout /t 2 >nul
)

REM Terminal 1: Backend
echo  [1] Abrindo terminal do Backend...
start "ozapteconta - Backend" /D "%INSTALL_DIR%backend" cmd /k npm run dev

REM Aguardar backend iniciar
timeout /t 3 >nul

REM Terminal 2: Frontend
echo  [2] Abrindo terminal do Frontend...
start "ozapteconta - Frontend" /D "%INSTALL_DIR%frontend" cmd /k npm run dev

echo.
echo  ================================================
echo   Backend: http://localhost:3001
echo   Frontend: http://localhost:5173
echo  ================================================
echo.
echo  Pressione qualquer tecla para sair (nao fecha terminais)...
pause >nul
```

### Usar Script
```cmd
iniciar-dev-full.bat
```

---

## ðŸ” VERIFICAÃ‡Ã•ES PÃ“S-INSTALAÃ‡ÃƒO

### Testar Backend
```powershell
# Verificar se backend estÃ¡ respondendo
Invoke-WebRequest -Uri "http://localhost:3001/api/health" -ErrorAction SilentlyContinue

# Ou com curl
curl http://localhost:3001/api/health
```

### Testar Banco de Dados
```powershell
# Conectar ao banco e verificar usuÃ¡rios admin
psql -U financebot -d financebot -c "SELECT id, username, role FROM admin_users LIMIT 5;"
```

### Verificar Arquivos CrÃ­ticos
```powershell
# Verificar se .env foi criado
Test-Path "backend\.env"

# Ver conteÃºdo (cuidado com senhas)
Get-Content "backend\.env" | Select-String -Pattern "DATABASE_URL", "JWT_SECRET"
```

---

## ðŸ› ï¸ TROUBLESHOOTING WINDOWS

### 1. Porta JÃ¡ em Uso

```powershell
# Encontrar processo usando porta 3001
$process = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
if ($process) {
    $process | Select-Object OwningProcess
    $pid = $process.OwningProcess
    Stop-Process -Id $pid -Force
    Write-Host "Processo $pid encerrado"
}

# Ou manualmente
Get-NetTCPConnection -LocalPort 3001 | Select-Object OwningProcess
taskkill /PID {PID} /F
```

### 2. Limpar Cache Node

```powershell
# Limpar cache npm
npm cache clean --force

# Limpar node_modules
cd backend
Remove-Item -Recurse -Force node_modules
npm install --legacy-peer-deps

cd ../frontend
Remove-Item -Recurse -Force node_modules
npm install --legacy-peer-deps
```

### 3. Resetar Banco de Dados

```powershell
# âš ï¸ CUIDADO: Deleta todos os dados!

cd backend

# Backup (recomendado)
pg_dump -U financebot -d financebot > backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql

# Resetar banco
npx prisma migrate reset --force
npm run prisma:seed

Write-Host "Banco de dados resetado e seed executado"
```

### 4. Verificar Logs

```powershell
# Ver Ãºltimas 50 linhas do log
Get-Content "backend\logs\app.log" -Tail 50

# Acompanhar log em tempo real
Get-Content -Path "backend\logs\app.log" -Wait

# Ver logs PM2
pm2 logs financebot --lines 100
```

### 5. Verificar VariÃ¡veis de Ambiente

```powershell
# Verificar NODE_ENV
$env:NODE_ENV

# Definir para desenvolvimento
$env:NODE_ENV = "development"

# Ou permanentemente (VariÃ¡veis de Ambiente do Windows)
[Environment]::SetEnvironmentVariable("NODE_ENV", "development", "User")
```

---

## ðŸ“Š MONITORAMENTO

### Criar Script: monitor-financebot.ps1

```powershell
# Script de monitoramento do sistema

$apiUrl = "http://localhost:3001/api/health"
$checkInterval = 30  # segundos

while ($true) {
    $timestamp = Get-Date -Format "HH:mm:ss"
    
    try {
        $response = Invoke-WebRequest -Uri $apiUrl -TimeoutSec 5 -ErrorAction Stop
        $health = $response.Content | ConvertFrom-Json
        
        Write-Host "[$timestamp] âœ“ Backend OK - Uptime: $($health.uptime)s" -ForegroundColor Green
    }
    catch {
        Write-Host "[$timestamp] âœ— Backend DOWN - Erro: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    # Verificar uso de memÃ³ria Node.js
    $nodeProcess = Get-Process node -ErrorAction SilentlyContinue | Measure-Object -Property WorkingSet -Sum
    if ($nodeProcess.Count -gt 0) {
        $memoryMB = $nodeProcess.Sum / 1MB
        Write-Host "[$timestamp] ðŸ’¾ Node.js usando: $([Math]::Round($memoryMB, 2)) MB" -ForegroundColor Yellow
    }
    
    Start-Sleep -Seconds $checkInterval
}
```

Executar:
```powershell
.\monitor-financebot.ps1
```

---

## ðŸ” SEGURANÃ‡A

### Verificar PermissÃµes de Arquivos

```powershell
# Ver permissÃµes de .env
Get-Acl "backend\.env" | Format-List

# Remover acesso pÃºblico (apenas usuÃ¡rio atual)
$acl = Get-Acl "backend\.env"
$rule = $acl.Access | Where-Object {$_.IdentityReference -match "Everyone"}
if ($rule) {
    $acl.RemoveAccessRule($rule)
    Set-Acl -Path "backend\.env" -AclObject $acl
}
```

### Gerar Novo JWT_SECRET

```powershell
# Gerar string aleatÃ³ria de 64 caracteres
$bytes = [byte[]]::new(48)
$random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$random.GetBytes($bytes)
$secret = [Convert]::ToBase64String($bytes)

Write-Host "Novo JWT_SECRET: $secret"

# Atualizar no .env
(Get-Content "backend\.env") -replace 'JWT_SECRET=.*', "JWT_SECRET=$secret" | Set-Content "backend\.env"
```

---

## ðŸ“ˆ PERFORMANCE

### OtimizaÃ§Ã£o Node.js para Windows

```powershell
# Aumentar limite de file descriptors (Node.js)
# Criar arquivo backend\start-optimized.js

@"
// Aumentar pool de conexÃµes
const cluster = require('cluster');
const os = require('os');

if (cluster.isMaster) {
  const numCPUs = os.cpus().length;
  console.log(\`Master process \${process.pid} iniciado\`);
  
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
} else {
  require('./dist/server.js');
  console.log(\`Worker process \${process.pid} iniciado\`);
}
"@ | Out-File -Path "backend\start-optimized.js"
```

### Usar PM2 com Clustering

```batch
REM ecosystem.config.js configurado com clustering
pm2 start ecosystem.config.js
pm2 save
```

---

## ðŸ§¹ LIMPEZA E MANUTENÃ‡ÃƒO

### Script: Cleanup.ps1

```powershell
# Limpeza do sistema ozapteconta

Write-Host "ozapteconta - Limpeza do Sistema" -ForegroundColor Green
Write-Host "=============================="
Write-Host ""

# 1. Parar PM2
Write-Host "[1] Parando PM2..."
pm2 stop all
pm2 delete all

# 2. Matar processos Node
Write-Host "[2] Encerrando Node.js..."
Stop-Process -Name node -Force -ErrorAction SilentlyContinue

# 3. Limpar node_modules
Write-Host "[3] Limpando node_modules..."
Remove-Item -Recurse -Force "backend\node_modules" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "frontend\node_modules" -ErrorAction SilentlyContinue

# 4. Limpar dist
Write-Host "[4] Limpando arquivos compilados..."
Remove-Item -Recurse -Force "backend\dist" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "frontend\dist" -ErrorAction SilentlyContinue

# 5. Limpar logs antigos (>7 dias)
Write-Host "[5] Limpando logs antigos..."
Get-ChildItem "backend\logs\*" -Include "*.log" -ErrorAction SilentlyContinue | 
    Where-Object {$_.LastWriteTime -lt (Get-Date).AddDays(-7)} | 
    Remove-Item -Force

Write-Host ""
Write-Host "Limpeza concluÃ­da! Execute install.bat para reinstalar." -ForegroundColor Green
```

---

## ðŸŒ DEPLOYAR PARA PRODUÃ‡ÃƒO

### PreparaÃ§Ã£o Windows Server

```powershell
# 1. Criar usuÃ¡rio de serviÃ§o
New-LocalUser -Name "financebot" -Password (ConvertTo-SecureString -AsPlainText "senha_forte" -Force) -Description "ozapteconta Service"
Add-LocalGroupMember -Group "Administrators" -Member "financebot"

# 2. Clonar repositÃ³rio
git clone https://seu-repo.git C:\WebApps\financebot
cd C:\WebApps\financebot

# 3. Executar instalaÃ§Ã£o
.\install.bat

# 4. Instalar como serviÃ§o Windows usando NSSM
# Download: https://nssm.cc/download
nssm install financebot "C:\Program Files\nodejs\node.exe" "dist\server.js"
nssm set financebot AppDirectory "C:\WebApps\financebot\backend"
nssm set financebot AppEnvironmentExtra NODE_ENV=production
nssm start financebot

# 5. Verificar
nssm status financebot
```

---

## ðŸ“ž CONTATO E SUPORTE

Para problemas especÃ­ficos:

1. Verificar arquivo de log: `backend\logs\app.log`
2. Verificar PM2 logs: `pm2 logs`
3. Verificar PostgreSQL: `psql -U postgres -l`
4. Testar conectividade: `curl http://localhost:3001/api/health`

---

**Ãšltima atualizaÃ§Ã£o:** 10/05/2026  
**Windows:** 10/11  
**Node.js:** 20+  
**PostgreSQL:** 16+

