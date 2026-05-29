# Deploy site marketing (client/) -> Hostinger public_html
# Uso: .\deploy-site-hostinger.ps1

param(
    [string]$RemoteUser = "u326559829",
    [string]$RemoteHost = "82.197.88.197",
    [int]$RemotePort = 65002,
    [string]$RemotePassword = "Tra1302ILER@#",
    [string]$HostKey = "SHA256:1Sm69l1021THFZC6AgjIDx4uxcO/a60i8iyXFfclP9w",
    [string]$RemotePath = "domains/ozapteconta.com.br/public_html",
    [string]$RepoRoot = (Resolve-Path $PSScriptRoot).Path
)

$ErrorActionPreference = "Stop"
$plink = "C:\Program Files\PuTTY\plink.exe"
$pscp = "C:\Program Files\PuTTY\pscp.exe"

if (-not (Test-Path $plink)) { throw "plink.exe nao encontrado" }
if (-not (Test-Path $pscp)) { throw "pscp.exe nao encontrado" }

Write-Host "==> Build do site (Vite)..." -ForegroundColor Cyan
Push-Location $RepoRoot
npm run build
if ($LASTEXITCODE -ne 0) { throw "Falha no npm run build" }
Pop-Location

$buildDir = Join-Path $RepoRoot "build"
if (-not (Test-Path $buildDir)) { throw "Pasta build/ nao encontrada apos build" }

Write-Host "==> Enviando build/ para ${RemoteUser}@${RemoteHost}:${RemotePath} ..." -ForegroundColor Cyan
& $pscp -batch -P $RemotePort -pw $RemotePassword -hostkey $HostKey -r "$buildDir\*" "${RemoteUser}@${RemoteHost}:${RemotePath}/"

Write-Host "==> Verificando index.html remoto..." -ForegroundColor Cyan
$remoteCheck = "grep -o 'Plano Travel' ${RemotePath}/index.html | head -1 || echo MISSING"
& $plink -batch -P $RemotePort -pw $RemotePassword -hostkey $HostKey "${RemoteUser}@${RemoteHost}" $remoteCheck

Write-Host "==> Deploy do site concluido." -ForegroundColor Green
