# Deploy para Hostinger - Groq + Abacus + Gemini Configuration

param(
    [string]$ServerHost = "45.33.110.55",
    [string]$User = "root",
    [string]$RemotePath = "/root/ozapteconta"
)

Write-Host "Starting deploy..." -ForegroundColor Cyan

# Passo 1: Build local
Write-Host "`nStep 1: Building TypeScript locally..." -ForegroundColor Yellow
cd backend
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "Build successful!" -ForegroundColor Green

# Passo 2: Executar comandos remotamente via SSH
Write-Host "`nStep 2: Building and restarting on server..." -ForegroundColor Yellow

$remoteCmds = "cd $RemotePath/backend && npm run build && pm2 restart ozapteconta --update-env && sleep 3 && pm2 status"

Write-Host "Sending commands to server..." -ForegroundColor Cyan
ssh $User@$ServerHost $remoteCmds

# Passo 3: Verificar saúde
Write-Host "`nStep 3: Checking system health..." -ForegroundColor Yellow
Start-Sleep -Seconds 3
ssh $User@$ServerHost "curl -s http://localhost:3001/api/health"
Write-Host "`nDeploy completed!" -ForegroundColor Green
