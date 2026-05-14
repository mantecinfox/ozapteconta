# ═════════════════════════════════════════════════════════════════════════════
# 🚀 FinanceBot - Script de Transferência para Ubuntu via SSH
# 
# Uso: .\transfer-to-ubuntu.ps1
# 
# Este script copia automaticamente os arquivos do projeto para o servidor Ubuntu
# ═════════════════════════════════════════════════════════════════════════════

param(
    [string]$RemoteUser = "pc",
    [string]$RemoteHost = "192.168.4.100",
    [string]$RemotePort = "22",
    [string]$RemotePath = "/home/pc/financebot",
    [string]$LocalPath = (Get-Location).Path
)

# Cores para output
$Colors = @{
    Success = @{ ForegroundColor = 'Green' }
    Error   = @{ ForegroundColor = 'Red' }
    Info    = @{ ForegroundColor = 'Yellow' }
    Header  = @{ ForegroundColor = 'Cyan' }
}

function Write-Header {
    param([string]$Message)
    Write-Host "╔════════════════════════════════════════════════════════════╗" @($Colors.Header)
    Write-Host "║ $Message" @($Colors.Header)
    Write-Host "╚════════════════════════════════════════════════════════════╝" @($Colors.Header)
}

function Write-Success {
    param([string]$Message)
    Write-Host "✅ $Message" @($Colors.Success)
}

function Write-Error-Custom {
    param([string]$Message)
    Write-Host "❌ $Message" @($Colors.Error)
}

function Write-Info {
    param([string]$Message)
    Write-Host "ℹ️  $Message" @($Colors.Info)
}

# ═════════════════════════════════════════════════════════════════════════════
# INÍCIO
# ═════════════════════════════════════════════════════════════════════════════

Clear-Host
Write-Header "🚀 FinanceBot - Transferência para Ubuntu"

Write-Info "Configurações:"
Write-Host "  Remote User: $RemoteUser"
Write-Host "  Remote Host: $RemoteHost"
Write-Host "  Remote Port: $RemotePort"
Write-Host "  Remote Path: $RemotePath"
Write-Host "  Local Path:  $LocalPath"
Write-Host ""

# Verificar se SSH está disponível
Write-Info "Verificando SSH..."
try {
    $sshTest = ssh -p $RemotePort -n "$RemoteUser@$RemoteHost" "echo test" 2>$null
    if ($sshTest -eq "test") {
        Write-Success "SSH conectado com sucesso!"
    }
}
catch {
    Write-Error-Custom "Não foi possível conectar via SSH"
    Write-Host "Verifique:"
    Write-Host "  1. SSH está instalado? (ssh --version)"
    Write-Host "  2. Pode acessar: $RemoteUser@$RemoteHost`:$RemotePort"
    Write-Host "  3. Tem permissão SSH configurada?"
    exit 1
}

# Verificar se as pastas existem localmente
Write-Info "Verificando estrutura local..."

$requiredDirs = @("backend", "frontend", "scripts")
$missingDirs = @()

foreach ($dir in $requiredDirs) {
    $path = Join-Path $LocalPath $dir
    if (Test-Path $path) {
        Write-Success "$dir encontrado"
    }
    else {
        Write-Error-Custom "$dir NÃO encontrado"
        $missingDirs += $dir
    }
}

if ($missingDirs.Count -gt 0) {
    Write-Error-Custom "Arquivos faltando: $($missingDirs -join ', ')"
    exit 1
}

Write-Host ""

# ═════════════════════════════════════════════════════════════════════════════
# Criar diretório remoto
# ═════════════════════════════════════════════════════════════════════════════

Write-Header "📁 Criando Diretório Remoto"

ssh -p $RemotePort "$RemoteUser@$RemoteHost" "mkdir -p $RemotePath" 2>$null
Write-Success "Diretório remoto preparado"

# ═════════════════════════════════════════════════════════════════════════════
# Transferir arquivos
# ═════════════════════════════════════════════════════════════════════════════

Write-Header "📤 Transferindo Arquivos"

$filesToCopy = @(
    "backend",
    "frontend", 
    "scripts",
    "package.json",
    "prisma",
    "storage"
)

$totalFiles = $filesToCopy.Count
$fileIndex = 1

foreach ($file in $filesToCopy) {
    $localFile = Join-Path $LocalPath $file
    
    if (Test-Path $localFile) {
        Write-Info "[$fileIndex/$totalFiles] Transferindo: $file"
        
        # Usar rsync se disponível (mais eficiente), senão usar scp
        $rsyncAvailable = $null -ne (Get-Command rsync -ErrorAction SilentlyContinue)
        
        if ($rsyncAvailable) {
            rsync.exe -avz --delete `
                --exclude node_modules `
                --exclude ".git" `
                --exclude ".DS_Store" `
                --exclude ".env" `
                -e "ssh -p $RemotePort" `
                "$localFile/" "$RemoteUser@$RemoteHost`:$RemotePath/$file/" 2>&1 | Out-Null
        }
        else {
            # Fallback para scp
            $fileType = if ((Get-Item $localFile) -is [System.IO.DirectoryInfo]) { 
                "-r" 
            } else { 
                "" 
            }
            
            scp -P $RemotePort $fileType "$localFile" "$RemoteUser@$RemoteHost`:$RemotePath/" 2>&1 | Out-Null
        }
        
        Write-Success "$file transferido"
    }
    else {
        Write-Info "$file não encontrado localmente, pulando..."
    }
    
    $fileIndex++
}

# ═════════════════════════════════════════════════════════════════════════════
# Transferir script de instalação
# ═════════════════════════════════════════════════════════════════════════════

Write-Header "🔧 Transferindo Script de Instalação"

$installScript = Join-Path $LocalPath "install-ubuntu.sh"
if (Test-Path $installScript) {
    Write-Info "Transferindo install-ubuntu.sh..."
    scp -P $RemotePort "$installScript" "$RemoteUser@$RemoteHost`:$RemotePath/" 2>&1 | Out-Null
    Write-Success "install-ubuntu.sh transferido"
    
    # Dar permissão de execução
    ssh -p $RemotePort "$RemoteUser@$RemoteHost" "chmod +x $RemotePath/install-ubuntu.sh" 2>$null
    Write-Success "Permissões configuradas"
}

# ═════════════════════════════════════════════════════════════════════════════
# Resumo
# ═════════════════════════════════════════════════════════════════════════════

Write-Host ""
Write-Header "✅ TRANSFERÊNCIA CONCLUÍDA!"

Write-Host ""
Write-Info "Próximos passos:"
Write-Host ""
Write-Host "1️⃣  Conectar ao servidor:"
Write-Host "   ssh $RemoteUser@$RemoteHost -p $RemotePort"
Write-Host ""
Write-Host "2️⃣  Executar instalação:"
Write-Host "   cd $RemotePath"
Write-Host "   chmod +x install-ubuntu.sh"
Write-Host "   ./install-ubuntu.sh"
Write-Host ""
Write-Host "3️⃣  Ou executar manualmente via SSH:"
Write-Host "   ssh $RemoteUser@$RemoteHost -p $RemotePort 'cd $RemotePath && ./install-ubuntu.sh'"
Write-Host ""

# ═════════════════════════════════════════════════════════════════════════════

