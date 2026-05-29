# Gera link InfinitePay de renovacao para Joao Cesar (cliente #1)
$ErrorActionPreference = "Stop"
$BaseUrl = "http://192.168.4.100:3001"
$ClientId = 1
$Phone = "553185297356"
$Email = "mantecinfox@gmail.com"
$Name = "Joao Cesar dos Santos Pereira"
$AmountReais = 9.90
$MerchantHandle = "mantecinfoxsystem"

Write-Host "==> Login admin"
$login = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body '{"username":"admin","password":"admin123"}'
$token = $login.token
$headers = @{ Authorization = "Bearer $token" }

Write-Host "==> Cliente #$ClientId"
$client = Invoke-RestMethod -Uri "$BaseUrl/api/clients/$ClientId" -Headers $headers
Write-Host "   $($client.fullName) | $($client.phone) | $($client.plan)"

Write-Host "==> Tentar endpoint send-renewal-link"
$apiOk = $false
try {
  $send = Invoke-RestMethod -Uri "$BaseUrl/api/clients/$ClientId/send-renewal-link" -Method POST -Headers $headers
  Write-Host "SUCESSO via API:" ($send | ConvertTo-Json -Compress)
  $apiOk = $true
}
catch {
  $status = $_.Exception.Response.StatusCode.value__
  Write-Host "   Endpoint nao implantado (HTTP $status) - gerando link direto"
}

if ($apiOk) { exit 0 }

Write-Host "==> Gerar link InfinitePay"
$amountCents = [int][Math]::Round($AmountReais * 100)
$orderNsu = "renewal-$ClientId-$(Get-Date -Format 'yyyyMMddHHmmss')"
$payloadObj = [ordered]@{
  handle = $MerchantHandle
  items = @(@{ quantity = 1; price = $amountCents; description = "Plano Completo - Renovacao ozapteconta" })
  order_nsu = $orderNsu
  customer = @{
    name = $Name
    email = $Email
    phone_number = "+553185297356"
  }
}
$payload = $payloadObj | ConvertTo-Json -Depth 5
$linkResp = Invoke-RestMethod -Uri "https://api.checkout.infinitepay.io/links" -Method POST -ContentType "application/json" -Body $payload
$checkoutUrl = $linkResp.url
if (-not $checkoutUrl) { $checkoutUrl = $linkResp.checkout_url }
if (-not $checkoutUrl) { throw "InfinitePay sem URL na resposta" }

Write-Host ""
Write-Host "LINK GERADO:"
Write-Host $checkoutUrl
Write-Host ""
Write-Host "Deploy pendente para envio WhatsApp automatico."
Write-Host "No servidor: bash /home/pc/ozapteconta/scripts/test-renewal-joao-producao.sh 1"
