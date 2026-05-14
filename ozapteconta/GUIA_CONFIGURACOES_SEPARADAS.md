# 🎯 Guia Completo - Sistema de Configurações Separadas

## 📋 Visão Geral

O sistema foi estruturado para separar completamente:

1. **Contas de WhatsApp Oficiais (API)** - Contas conectadas via Meta Business API
2. **Contas de WhatsApp Geradas (QR Code)** - Contas conectadas via QR Code (Baileys)
3. **Gateways de Pagamento** - InfinityPay, Mercado Pago, etc.

---

## 🗂️ Estrutura de Banco de Dados

### Official WhatsApp Accounts (`official_whatsapp_accounts`)
```sql
id                       INTEGER PRIMARY KEY
label                    TEXT -- "Principal", "Secundária"
businessAccountId        TEXT UNIQUE -- ID do Business Account da Meta
phoneNumberId            TEXT UNIQUE -- ID do número na API da Meta
phone                    TEXT UNIQUE -- +5511999999999
accessToken              TEXT -- Bearer token da API Meta
permanentAccessToken     TEXT OPTIONAL -- Token com longa duração
webhookVerifyToken       TEXT -- Token para validar webhooks
webhookSecret            TEXT OPTIONAL -- Secret para assinatura
isActive                 BOOLEAN DEFAULT true
whatsappConnectionStatus TEXT -- CONNECTED, DISCONNECTED, ERROR, UNKNOWN
lastHealthCheck          DATETIME
lastHealthCheckError     TEXT
maxClientsSupported      INTEGER DEFAULT 1000
currentClientCount       INTEGER DEFAULT 0
notes                    TEXT
createdAt                DATETIME
updatedAt                DATETIME
```

### Generated WhatsApp Accounts (`generated_whatsapp_accounts`)
```sql
id                       INTEGER PRIMARY KEY
label                    TEXT -- "Cliente 001", "Empresa XYZ"
phone                    TEXT UNIQUE -- +5511999999999
referenceCode            STRING UNIQUE -- WA-1715xxx-abc123
linkedToOfficialId       INTEGER OPTIONAL FK -- Pode estar vinculada a Official
connectionType           TEXT DEFAULT "LOCAL" -- LOCAL ou REMOTE
isActive                 BOOLEAN DEFAULT true
whatsappConnectionStatus TEXT -- CONNECTED, DISCONNECTED, ERROR, UNKNOWN
qrCodeData               TEXT OPTIONAL -- QR Code em base64
qrCodeExpiresAt          DATETIME OPTIONAL
sessionData              JSON OPTIONAL -- Dados de sessão Baileys
lastHealthCheck          DATETIME
lastHealthCheckError     TEXT
maxClients               INTEGER DEFAULT 500
currentClientCount       INTEGER DEFAULT 0
notes                    TEXT
createdAt                DATETIME
updatedAt                DATETIME
```

### Payment Gateway Configs (`payment_gateway_configs`)
```sql
id                           INTEGER PRIMARY KEY
provider                     STRING UNIQUE -- "infinitypay", "mercadopago"
displayName                  STRING -- "InfinityPay", "Mercado Pago"
description                  STRING
isEnabled                    BOOLEAN DEFAULT true
isPrimary                    BOOLEAN DEFAULT false -- Gateway padrão
infinityPayMerchantKey       TEXT -- $mantecinfoxsystem
infinityPayApiKey            TEXT
infinityPayWebhookSecret     TEXT OPTIONAL
mercadoPagoAccessToken       TEXT
mercadoPagoPublicKey         TEXT
mercadoPagoWebhookSecret     TEXT OPTIONAL
environment                  TEXT DEFAULT "sandbox" -- sandbox ou production
webhookUrl                   STRING -- http://seu-dominio.com/api/webhooks/infinitypay
timeoutSeconds               INTEGER DEFAULT 30
maxRetries                   INTEGER DEFAULT 3
extraConfig                  JSON OPTIONAL
createdAt                    DATETIME
updatedAt                    DATETIME
```

### Payment Gateway Credentials (histórico de credenciais)
```sql
id                   INTEGER PRIMARY KEY
provider             STRING -- "infinitypay", "mercadopago"
credentialType       STRING -- "api_key", "merchant_key", etc
encryptedValue       TEXT -- Valor criptografado
expiresAt            DATETIME OPTIONAL
isActive             BOOLEAN DEFAULT true
notes                STRING
createdAt            DATETIME
updatedAt            DATETIME
```

### Payment Gateway Logs (auditoria)
```sql
id               INTEGER PRIMARY KEY
provider         STRING -- "infinitypay", "mercadopago"
action           STRING -- "charge_created", "config_updated", etc
requestData      JSON
responseStatus   INTEGER OPTIONAL
responseData     JSON
errorMessage     TEXT OPTIONAL
duration         INTEGER OPTIONAL -- tempo em ms
createdAt        DATETIME
```

---

## 🚀 Endpoints de API

### Payment Gateway Configuration

#### Listar todos os gateways
```http
GET /api/admin/payment-gateways
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "provider": "infinitypay",
      "displayName": "InfinityPay",
      "isEnabled": true,
      "isPrimary": true,
      "environment": "sandbox",
      "webhookUrl": "http://localhost:3001/api/webhooks/infinitypay",
      "maxRetries": 3,
      "timeoutSeconds": 30,
      "createdAt": "2025-01-15T10:30:00Z"
    },
    {
      "id": 2,
      "provider": "mercadopago",
      "displayName": "Mercado Pago",
      "isEnabled": false,
      "isPrimary": false,
      "environment": "sandbox"
    }
  ]
}
```

#### Obter configuração específica
```http
GET /api/admin/payment-gateways/:provider
Authorization: Bearer {token}
```

#### Salvar/Atualizar configuração
```http
POST /api/admin/payment-gateways
Authorization: Bearer {token}
Content-Type: application/json

{
  "provider": "infinitypay",
  "displayName": "InfinityPay",
  "description": "Gateway de pagamentos primary",
  "isEnabled": true,
  "isPrimary": true,
  "environment": "production",
  "webhookUrl": "https://seu-dominio.com/api/webhooks/infinitypay",
  "timeoutSeconds": 30,
  "maxRetries": 3,
  "infinityPayMerchantKey": "$mantecinfoxsystem",
  "infinityPayApiKey": "seu_api_key_aqui",
  "infinityPayWebhookSecret": "seu_webhook_secret"
}
```

#### Testar conexão
```http
POST /api/admin/payment-gateways/:provider/test
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "message": "Credenciais de InfinityPay parecem válidas"
}
```

#### Ativar/Desativar gateway
```http
PATCH /api/admin/payment-gateways/:provider/status
Authorization: Bearer {token}
Content-Type: application/json

{
  "isEnabled": false
}
```

#### Ver logs do gateway
```http
GET /api/admin/payment-gateways/:provider/logs?limit=50
Authorization: Bearer {token}
```

---

### WhatsApp Configuration

#### Contas Oficiais (Meta Business API)

**Listar todas**
```http
GET /api/admin/whatsapp/official
Authorization: Bearer {token}
```

**Criar/Atualizar**
```http
POST /api/admin/whatsapp/official
Authorization: Bearer {token}
Content-Type: application/json

{
  "label": "Principal",
  "businessAccountId": "123456789012345",
  "phoneNumberId": "987654321098765",
  "phone": "+5511987654321",
  "accessToken": "EAAn...seu_token_aqui...",
  "permanentAccessToken": "EAAn...token_permanente...",
  "webhookVerifyToken": "seu_verify_token",
  "webhookSecret": "seu_webhook_secret",
  "maxClientsSupported": 1000,
  "notes": "Conta principal da empresa"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "label": "Principal",
    "phone": "+5511987654321",
    "message": "Conta criada com sucesso"
  }
}
```

#### Contas Geradas (QR Code)

**Listar todas**
```http
GET /api/admin/whatsapp/generated
Authorization: Bearer {token}
```

**Criar nova**
```http
POST /api/admin/whatsapp/generated
Authorization: Bearer {token}
Content-Type: application/json

{
  "label": "Cliente 001 - João Silva",
  "phone": "+5511988888888",
  "linkedToOfficialId": 1,  // OPCIONAL - vincular a conta oficial
  "connectionType": "LOCAL",  // LOCAL ou REMOTE
  "maxClients": 500,
  "notes": "Cliente de teste"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "label": "Cliente 001 - João Silva",
    "phone": "+5511988888888",
    "referenceCode": "WA-1715234567-abc123xyz",
    "message": "Conta WhatsApp criada com sucesso. Escaneie o QR Code para conectar."
  }
}
```

---

## 💻 Usando os Serviços no Backend

### PaymentGatewaySettingsService

```typescript
import { paymentGatewaySettingsService } from "../services/paymentGatewaySettingsService";

// Carregar todas as configurações (com cache)
const allConfigs = await paymentGatewaySettingsService.loadConfigs();

// Obter gateway específico
const infinityPayConfig = await paymentGatewaySettingsService.getConfig("infinitypay");
if (infinityPayConfig?.config.infinitypay?.apiKey) {
  // Usar credenciais
}

// Obter gateway primário (padrão)
const primaryGateway = await paymentGatewaySettingsService.getPrimaryGateway();

// Listar todos os gateways ativos
const activeGateways = await paymentGatewaySettingsService.listActiveGateways();

// Verificar se está configurado
const isConfigured = await paymentGatewaySettingsService.isConfigured("infinitypay");

// Invalidar cache após atualizar config
paymentGatewaySettingsService.invalidateCache("infinitypay");

// Ver status de saúde
const healthStatus = await paymentGatewaySettingsService.getHealthStatus();
```

### WhatsappSettingsService

```typescript
import { whatsappSettingsService } from "../services/whatsappSettingsService";

// Carregar contas oficiais
const officialAccounts = await whatsappSettingsService.loadOfficialAccounts();

// Carregar contas geradas
const generatedAccounts = await whatsappSettingsService.loadGeneratedAccounts();

// Obter conta oficial específica
const official = await whatsappSettingsService.getOfficialAccount("+5511987654321");

// Obter conta gerada específica
const generated = await whatsappSettingsService.getGeneratedAccount("WA-1715234567-abc123xyz");

// Encontrar conta disponível com espaço
const availableGenerated = await whatsappSettingsService.findAvailableGeneratedAccount();
const availableOfficial = await whatsappSettingsService.findAvailableOfficialAccount();

// Atualizar contador de clientes
await whatsappSettingsService.updateClientCount("generated", 1, 1); // +1 cliente
await whatsappSettingsService.updateClientCount("generated", 1, -1); // -1 cliente

// Atualizar status de conexão
await whatsappSettingsService.updateConnectionStatus("generated", 1, "CONNECTED");
await whatsappSettingsService.updateConnectionStatus("generated", 1, "ERROR", "Connection timeout");

// Ver status de todas as contas
const healthStatus = await whatsappSettingsService.getHealthStatus();

// Invalidar cache
whatsappSettingsService.invalidateCache();
```

---

## 🔧 Exemplo Prático: Atribuir Conta WhatsApp a Cliente

```typescript
// No endpoint de registro de cliente
import { whatsappSettingsService } from "../services/whatsappSettingsService";

async function registerClient(clientData: ClientData) {
  // Encontrar melhor conta disponível
  const availableAccount = await whatsappSettingsService.findAvailableGeneratedAccount();
  
  if (!availableAccount) {
    throw new Error("Nenhuma conta WhatsApp disponível");
  }

  // Criar cliente
  const client = await prisma.clientProfile.create({
    data: {
      ...clientData,
      assignedWhatsappAccountId: availableAccount.id,
    },
  });

  // Atualizar contador
  await whatsappSettingsService.updateClientCount(
    "generated",
    availableAccount.id,
    1 // +1 cliente
  );

  return client;
}
```

---

## 🔐 Segurança das Credenciais

1. **Nunca retornar credenciais em responses públicas**
   - Os endpoints de configuração retornam apenas metadados
   - Credenciais são carregadas internamente pelos serviços

2. **Criptografia de credenciais no banco**
   - Implementar encryption no modelo `PaymentGatewayCredential`
   - Usar chave de ambiente para criptografar/descriptografar

3. **Audit logs de acessos**
   - Tabela `payment_gateway_logs` registra todas operações
   - Verificar em `PaymentGatewayLog` quando credenciais foram usadas

4. **Variáveis de ambiente**
```bash
# .env
DATABASE_URL=postgresql://user:pass@localhost/financebot
ENCRYPTION_KEY=sua_chave_de_32_caracteres_aqui
INFINITYPAY_WEBHOOK_URL=https://seu-dominio.com/api/webhooks/infinitypay
MERCADOPAGO_WEBHOOK_URL=https://seu-dominio.com/api/webhooks/mercadopago
```

---

## 📊 Dashboard Admin (Frontend)

Páginas a criar para gerenciar:

### 1. **Payment Gateways Configuration**
- [ ] Listar gateways
- [ ] Configurar credenciais por gateway
- [ ] Testar conexão
- [ ] Ver logs de transações
- [ ] Ativar/desativar gateways
- [ ] Definir gateway primário

### 2. **WhatsApp Accounts**
- [ ] Tab: Contas Oficiais
  - [ ] Listar contas oficiais
  - [ ] Adicionar nova conta (meta business API)
  - [ ] Ver status de conexão
  - [ ] Ver capacidade (clientes usados/disponíveis)
  
- [ ] Tab: Contas Geradas (QR Code)
  - [ ] Listar contas geradas
  - [ ] Criar nova conta
  - [ ] Ver QR Code para escanear
  - [ ] Vincular a conta oficial (opcional)
  - [ ] Ver status de conexão
  - [ ] Ver distribuição de clientes

- [ ] Relatório de distribuição
  - [ ] Gráfico de clientes por conta
  - [ ] Balanceamento de carga
  - [ ] Sugestões de escalabilidade

---

## 🚨 Troubleshooting

### Problema: "Nenhuma conta WhatsApp disponível"
**Solução:**
1. Verifique se há contas geradas ativas
2. Verifique se `maxClients` < `currentClientCount`
3. Crie novas contas via QR Code
4. Se usar API Oficial, pode ter capacidade muito maior

### Problema: Gateway retorna erro de credenciais
**Solução:**
1. Acesse `/api/admin/payment-gateways/:provider/test`
2. Verifique `payment_gateway_logs` para detalhes do erro
3. Confirme se credenciais estão corretas no dashboard
4. Se usar InfinityPay, verifique $mantecinfoxsystem

### Problema: Webhook não está recebendo eventos
**Solução:**
1. Verifique `webhookUrl` em `payment_gateway_configs`
2. Confirme que URL é acessível publicamente
3. Verifique credenciais de webhook no provedor
4. Ver logs em `payment_gateway_logs` com action="webhook_received"

---

## 📈 Performance & Caching

- Configurações são cacheadas por **5 minutos**
- Cache é invalidado automaticamente ao salvar novo config
- Usar `forceRefresh=true` para carregar diretamente do DB
- Recomendado para produção: usar Redis para cache distribuído

---

## 🎯 Próximos Passos

1. ✅ Schema Prisma atualizado
2. ✅ Serviços de configuração criados
3. ✅ Endpoints de API implementados
4. ⏳ Criar migration do Prisma
5. ⏳ Atualizar seed data
6. ⏳ Criar componentes React para Admin
7. ⏳ Testar fluxo completo

