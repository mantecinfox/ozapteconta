# Deploy ozapteconta -> Ubuntu producao (192.168.4.100)
# Uso: .\deploy-to-ubuntu.ps1
# Nao envia .env nem node_modules.

param(
    [string]$RemoteUser = "pc",
    [string]$RemoteHost = "192.168.4.100",
    [string]$RemotePath = "/home/pc/ozapteconta",
    [string]$RemotePassword = "102030",
    [string]$HostKey = "SHA256:HgYOyG848dSLLlCprrY7xMiNqJ+vl34RMth8OsGyk3g",
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"
$plink = "C:\Program Files\PuTTY\plink.exe"
$pscp = "C:\Program Files\PuTTY\pscp.exe"

if (-not (Test-Path $plink)) { throw "plink.exe nao encontrado" }
if (-not (Test-Path $pscp)) { throw "pscp.exe nao encontrado" }

$tarName = "ozapteconta-deploy.tgz"
$tarLocal = Join-Path $env:TEMP $tarName

Write-Host "==> Gerando tarball (sem node_modules, dist, .env)..." -ForegroundColor Cyan
if (Test-Path $tarLocal) { Remove-Item $tarLocal -Force }

Push-Location $RepoRoot
tar --exclude="ozapteconta/backend/.env" `
    --exclude="ozapteconta/**/node_modules" `
    --exclude="ozapteconta/**/dist" `
    --exclude="ozapteconta/**/.git" `
    -czf $tarLocal ozapteconta
Pop-Location

if (-not (Test-Path $tarLocal)) { throw "Falha ao criar $tarLocal" }

Write-Host "==> Enviando para ${RemoteUser}@${RemoteHost}..." -ForegroundColor Cyan
& $pscp -batch -pw $RemotePassword -hostkey $HostKey $tarLocal "${RemoteUser}@${RemoteHost}:/home/pc/"

$remoteScript = "set -e; cd /home/pc; tar -xzf $tarName; cd $RemotePath; npm run prisma:generate --prefix backend; npm run prisma:push --prefix backend; npm run prisma:seed --prefix backend 2>/dev/null || true; npm run build --prefix backend; npm run build --prefix frontend 2>/dev/null || true; if [ -f backend/ecosystem.config.cjs ]; then pm2 restart backend/ecosystem.config.cjs --update-env; elif [ -f ecosystem.config.cjs ]; then pm2 restart ecosystem.config.cjs --update-env; else pm2 restart ozapteconta --update-env; fi; pm2 save; sleep 4; curl -sf http://127.0.0.1:3001/api/health || curl -sf http://127.0.0.1/api/health; echo; pm2 list | head -14"

Write-Host "==> Build + restart PM2 no servidor..." -ForegroundColor Cyan
& $plink -batch -pw $RemotePassword -hostkey $HostKey "${RemoteUser}@${RemoteHost}" $remoteScript

Write-Host "==> Deploy concluido." -ForegroundColor Green
