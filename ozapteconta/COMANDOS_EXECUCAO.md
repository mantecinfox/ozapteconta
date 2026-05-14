# âš¡ Comandos para ExecuÃ§Ã£o - Copia e Cola

## ðŸš€ Fase 1: Aplicar MudanÃ§as no Banco (5 minutos)

```bash
# Navegar para pasta backend
cd backend

# Aplicar nova schema
npx prisma migrate dev --name add_payment_gateways_and_whatsapp_separation

# Carregar dados iniciais
npm run prisma:seed

# Verificar banco
npx prisma studio  # Abre interface visual (opcional)
```

**SaÃ­da esperada:**
```
âœ” Enter a name for the new migration â€º add_payment_gateways_and_whatsapp_separation
âœ” Created migration â€º ./prisma/migrations/..._add_payment_gateways_and_whatsapp_separation/migration.sql
âœ” Generated Prisma Client in ...
âœ” Ran all pending migrations on the database

ðŸŒ± Iniciando seed do banco de dados...
âœ… 8 operaÃ§Ãµes concluÃ­das com sucesso
```

---

## ðŸŽ¯ Fase 2: Iniciar Backend (2 minutos)

```bash
# Ainda em backend/ â†’ Iniciar servidor
npm run dev
```

**SaÃ­da esperada:**
```
ðŸš€ ozapteconta Backend rodando!
   Porta:    3001
   Ambiente: development
   Webhook:  http://localhost:3001/api/webhook

âœ… Banco de dados conectado
[Reminders] Cron job agendado para 09:00
âœ… [Recurring Billing] Cron job agendado para 02:00
âœ… [Admin Settings] Rotas de configuraÃ§Ã£o registradas
```

---

## ðŸ§ª Fase 3: Testar Endpoints (5 minutos)

### 3a. Obter Token Admin

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }'
```

**Resposta:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "...",
    "username": "admin",
    "role": "ADMIN"
  }
}
```

> Copie o valor de `token` para usar nos prÃ³ximos comandos

### 3b. Listar Payment Gateways

```bash
export TOKEN="seu_token_aqui"

curl http://localhost:3001/api/admin/payment-gateways \
  -H "Authorization: Bearer $TOKEN"
```

**Resposta esperada:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "provider": "infinitypay",
      "displayName": "InfinityPay",
      "isEnabled": false,
      "isPrimary": true,
      "environment": "sandbox"
    },
    {
      "id": 2,
      "provider": "mercadopago",
      "displayName": "Mercado Pago",
      "isEnabled": false,
      "isPrimary": false
    }
  ]
}
```

### 3c. Listar Contas WhatsApp Oficiais

```bash
curl http://localhost:3001/api/admin/whatsapp/official \
  -H "Authorization: Bearer $TOKEN"
```

**Resposta:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "label": "Conta Oficial Principal",
      "businessAccountId": "123456789012345",
      "phone": "+5511999999999",
      "isActive": true,
      "whatsappConnectionStatus": "UNKNOWN"
    }
  ]
}
```

### 3d. Listar Contas WhatsApp Geradas (QR Code)

```bash
curl http://localhost:3001/api/admin/whatsapp/generated \
  -H "Authorization: Bearer $TOKEN"
```

**Resposta:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "label": "Demo - Conta Teste",
      "phone": "+5511988888888",
      "referenceCode": "WA-DEMO-001",
      "isActive": true,
      "currentClientCount": 0,
      "maxClients": 500
    }
  ]
}
```

---

## ðŸ” Fase 4: Configurar Credenciais (10 minutos)

### 4a. Configurar InfinityPay

```bash
curl -X POST http://localhost:3001/api/admin/payment-gateways \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "infinitypay",
    "displayName": "InfinityPay",
    "description": "Gateway principal de pagamentos",
    "isEnabled": true,
    "isPrimary": true,
    "environment": "sandbox",
    "webhookUrl": "http://localhost:3001/api/webhooks/infinitypay",
    "timeoutSeconds": 30,
    "maxRetries": 3,
    "infinityPayMerchantKey": "$mantecinfoxsystem",
    "infinityPayApiKey": "pk_live_your_api_key_here",
    "infinityPayWebhookSecret": "your_webhook_secret_here"
  }'
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "provider": "infinitypay",
    "displayName": "InfinityPay",
    "message": "ConfiguraÃ§Ã£o criada com sucesso"
  }
}
```

### 4b. Configurar Mercado Pago (Opcional)

```bash
curl -X POST http://localhost:3001/api/admin/payment-gateways \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "mercadopago",
    "displayName": "Mercado Pago",
    "description": "Gateway secundÃ¡rio de pagamentos",
    "isEnabled": false,
    "isPrimary": false,
    "environment": "sandbox",
    "webhookUrl": "http://localhost:3001/api/webhooks/mercadopago",
    "mercadoPagoAccessToken": "APP_USR_your_access_token_here",
    "mercadoPagoPublicKey": "APP_USR_your_public_key_here"
  }'
```

### 4c. Testar ConexÃ£o InfinityPay

```bash
curl -X POST http://localhost:3001/api/admin/payment-gateways/infinitypay/test \
  -H "Authorization: Bearer $TOKEN"
```

**Resposta se sucesso:**
```json
{
  "success": true,
  "message": "Credenciais de InfinityPay parecem vÃ¡lidas"
}
```

---

## ðŸ‘¥ Fase 5: Gerenciar Contas WhatsApp

### 5a. Adicionar Conta WhatsApp Oficial (Meta Business)

```bash
curl -X POST http://localhost:3001/api/admin/whatsapp/official \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Conta Principal - Meta",
    "businessAccountId": "987654321098765",
    "phoneNumberId": "555666777888999",
    "phone": "+5511999887766",
    "accessToken": "EAAn5ZCGz1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefg",
    "webhookVerifyToken": "seu_verify_token_aqui",
    "webhookSecret": "seu_webhook_secret_aqui",
    "maxClientsSupported": 1000,
    "notes": "Conta principal da empresa para Meta Business API"
  }'
```

### 5b. Adicionar Conta Gerada (QR Code)

```bash
curl -X POST http://localhost:3001/api/admin/whatsapp/generated \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Cliente XYZ - Gerada",
    "phone": "+5511987654321",
    "linkedToOfficialId": 1,
    "connectionType": "LOCAL",
    "maxClients": 500,
    "notes": "Conta vinculada Ã  conta oficial para escalabilidade"
  }'
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "id": 2,
    "label": "Cliente XYZ - Gerada",
    "phone": "+5511987654321",
    "referenceCode": "WA-1715234567-abc123",
    "message": "Conta WhatsApp criada com sucesso. Escaneie o QR Code para conectar."
  }
}
```

---

## ðŸ“Š Fase 6: Monitorar e Manter

### 6a. Ver Logs de Payment Gateway

```bash
curl http://localhost:3001/api/admin/payment-gateways/infinitypay/logs?limit=50 \
  -H "Authorization: Bearer $TOKEN"
```

### 6b. Ativar/Desativar Gateway

```bash
# Desativar Mercado Pago
curl -X PATCH http://localhost:3001/api/admin/payment-gateways/mercadopago/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"isEnabled": false}'

# Ativar InfinityPay
curl -X PATCH http://localhost:3001/api/admin/payment-gateways/infinitypay/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"isEnabled": true}'
```

### 6c. Ver Status de Todas as Contas WhatsApp

```bash
# Oficiais
curl http://localhost:3001/api/admin/whatsapp/official \
  -H "Authorization: Bearer $TOKEN" | jq '.data[] | {label, phone, currentClientCount, maxClientsSupported}'

# Geradas
curl http://localhost:3001/api/admin/whatsapp/generated \
  -H "Authorization: Bearer $TOKEN" | jq '.data[] | {label, phone, currentClientCount, maxClients}'
```

---

## ðŸ› ï¸ Fase 7: Troubleshooting & Debug

### 7a. Verificar Status do Backend

```bash
curl http://localhost:3001/api/webhook -H "Content-Type: application/json"
```

### 7b. Ver Logs em Tempo Real

```bash
# Em outro terminal (ainda em backend/)
tail -f debug.log  # Se usando Winston
# OU
npm run dev  # Log jÃ¡ aparece no console
```

### 7c. Resetar Banco (Cuidado em ProduÃ§Ã£o!)

```bash
cd backend
npx prisma migrate reset
npm run prisma:seed
npm run dev
```

### 7d. Ver Dados no Banco (Interface Visual)

```bash
npx prisma studio
# AbrirÃ¡ em http://localhost:5555
```

---

## ðŸ“‹ Checklist Completo

- [ ] Executar `npm run prisma:seed`
- [ ] Backend rodando em `npm run dev`
- [ ] Obter token admin em `/api/auth/login`
- [ ] Listar payment gateways
- [ ] Listar contas WhatsApp
- [ ] Configurar InfinityPay com credenciais reais
- [ ] Testar conexÃ£o com `/api/admin/payment-gateways/infinitypay/test`
- [ ] Criar nova conta WhatsApp gerada
- [ ] Ver QR Code (quando implementado no frontend)
- [ ] Monitorar logs em `/api/admin/payment-gateways/:provider/logs`

---

## ðŸŽ¯ Para Windows PowerShell (Se preferir)

```powershell
# Definir token como variÃ¡vel
$TOKEN = "seu_token_aqui"

# Listar gateways
Invoke-WebRequest -Uri "http://localhost:3001/api/admin/payment-gateways" `
  -Headers @{"Authorization" = "Bearer $TOKEN"} | ConvertTo-Json

# Configurar InfinityPay
$body = @{
    provider = "infinitypay"
    infinityPayMerchantKey = "`$mantecinfoxsystem"
    infinityPayApiKey = "sua_chave_aqui"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3001/api/admin/payment-gateways" `
  -Headers @{"Authorization" = "Bearer $TOKEN"; "Content-Type" = "application/json"} `
  -Method Post `
  -Body $body
```

---

## ðŸš€ Pronto para ComeÃ§ar!

Copie e execute estes comandos em sequÃªncia:

```bash
# 1. Preparar banco
cd backend
npx prisma migrate dev --name add_payment_gateways_and_whatsapp_separation
npm run prisma:seed

# 2. Iniciar backend
npm run dev

# 3. Em novo terminal, obter token
export TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.token')

# 4. Testar endpoints
echo "Token: $TOKEN"
curl http://localhost:3001/api/admin/payment-gateways \
  -H "Authorization: Bearer $TOKEN" | jq .

# Sucesso! âœ¨
```

---

**Tudo pronto para usar! ðŸŽ‰**

