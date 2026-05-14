# 📊 Estrutura de Banco de Dados - Configurações Separadas

## 🗂️ Visão Geral das Tabelas

```sql
-- ANTES (Estrutura antiga)
admin_whatsapp_accounts (1 tabela genérica)

-- DEPOIS (Estrutura nova separada)
official_whatsapp_accounts  (Contas via Meta Business API)
generated_whatsapp_accounts (Contas via QR Code - Baileys)
payment_gateway_configs     (Configurações de gateways)
payment_gateway_credentials (Histórico de credenciais)
payment_gateway_logs        (Auditoria de requisições)
```

---

## 📝 Detalhes de Cada Tabela

### 1️⃣ `official_whatsapp_accounts` (Contas Oficiais - Meta Business API)

```sql
┌─────────────────────────────────────────────────────────────────┐
│ OFFICIAL_WHATSAPP_ACCOUNTS                                      │
├─────────────────────────────────────────────────────────────────┤
│ id                          INT PRIMARY KEY                     │
│ label                       VARCHAR(255)  -- "Principal"        │
│ businessAccountId           VARCHAR(50) UNIQUE -- ID da Meta    │
│ phoneNumberId               VARCHAR(50) UNIQUE -- ID do número  │
│ phone                       VARCHAR(20) UNIQUE -- +5511999999   │
│ accessToken                 TEXT          -- Bearer token Meta  │
│ permanentAccessToken        TEXT NULLABLE -- Token permanente   │
│ webhookVerifyToken          VARCHAR(255)  -- Validar webhooks   │
│ webhookSecret               TEXT NULLABLE -- Assinar webhooks   │
│ isActive                    BOOLEAN DEFAULT true                │
│ whatsappConnectionStatus    VARCHAR(50)   -- CONNECTED/...      │
│ lastHealthCheck             TIMESTAMP NULLABLE                  │
│ lastHealthCheckError        TEXT NULLABLE                       │
│ maxClientsSupported         INT DEFAULT 1000                   │
│ currentClientCount          INT DEFAULT 0                      │
│ notes                       TEXT NULLABLE                       │
│ createdAt                   TIMESTAMP DEFAULT now()             │
│ updatedAt                   TIMESTAMP DEFAULT now()             │
└─────────────────────────────────────────────────────────────────┘

ÍNDICES:
- PK: id
- UNIQUE: businessAccountId, phoneNumberId, phone
- INDEX: isActive, whatsappConnectionStatus

EXEMPLO DE DADO:
┌─────┬─────────────────────┬──────────────────────────┬─────────────────────┐
│ id  │ label               │ phone                    │ currentClientCount  │
├─────┼─────────────────────┼──────────────────────────┼─────────────────────┤
│ 1   │ Conta Oficial       │ +5511999999999          │ 0                  │
│     │ Principal           │                          │                     │
└─────┴─────────────────────┴──────────────────────────┴─────────────────────┘
```

---

### 2️⃣ `generated_whatsapp_accounts` (Contas Geradas - QR Code)

```sql
┌──────────────────────────────────────────────────────────────────┐
│ GENERATED_WHATSAPP_ACCOUNTS                                      │
├──────────────────────────────────────────────────────────────────┤
│ id                          INT PRIMARY KEY                      │
│ label                       VARCHAR(255)  -- "Cliente 001"       │
│ phone                       VARCHAR(20) UNIQUE -- +5511988888    │
│ referenceCode               VARCHAR(50) UNIQUE -- WA-xxxx-xxxxx  │
│ linkedToOfficialId          INT NULLABLE FK -- Vincular a oficial│
│ connectionType              VARCHAR(50)   -- LOCAL ou REMOTE     │
│ isActive                    BOOLEAN DEFAULT true                 │
│ whatsappConnectionStatus    VARCHAR(50)   -- CONNECTED/...       │
│ qrCodeData                  TEXT NULLABLE -- QR Code em base64   │
│ qrCodeExpiresAt             TIMESTAMP NULLABLE                   │
│ sessionData                 JSON NULLABLE -- Dados Baileys       │
│ lastHealthCheck             TIMESTAMP NULLABLE                   │
│ lastHealthCheckError        TEXT NULLABLE                        │
│ maxClients                  INT DEFAULT 500                     │
│ currentClientCount          INT DEFAULT 0                       │
│ notes                       TEXT NULLABLE                        │
│ createdAt                   TIMESTAMP DEFAULT now()              │
│ updatedAt                   TIMESTAMP DEFAULT now()              │
└──────────────────────────────────────────────────────────────────┘

ÍNDICES:
- PK: id
- UNIQUE: phone, referenceCode
- FK: linkedToOfficialId → official_whatsapp_accounts(id)
- INDEX: isActive, whatsappConnectionStatus, linkedToOfficialId

EXEMPLO DE DADO:
┌─────┬────────────────────┬──────────────────┬─────────────────────┐
│ id  │ referenceCode      │ phone            │ currentClientCount  │
├─────┼────────────────────┼──────────────────┼─────────────────────┤
│ 1   │ WA-DEMO-001       │ +5511988888888  │ 12                 │
│ 2   │ WA-1715234567-abc  │ +5511977777777  │ 8                  │
└─────┴────────────────────┴──────────────────┴─────────────────────┘
```

---

### 3️⃣ `payment_gateway_configs` (Configurações de Gateways)

```sql
┌──────────────────────────────────────────────────────────────────┐
│ PAYMENT_GATEWAY_CONFIGS                                          │
├──────────────────────────────────────────────────────────────────┤
│ id                           INT PRIMARY KEY                     │
│ provider                     VARCHAR(50) UNIQUE -- "infinitypay" │
│ displayName                  VARCHAR(100)  -- "InfinityPay"      │
│ description                  TEXT NULLABLE                       │
│ isEnabled                    BOOLEAN DEFAULT true                │
│ isPrimary                    BOOLEAN DEFAULT false               │
│ ─── InfinityPay Config ────────────────────────────────────────  │
│ infinityPayMerchantKey       TEXT NULLABLE -- $mantecinfoxsystem │
│ infinityPayApiKey            TEXT NULLABLE -- API Key            │
│ infinityPayWebhookSecret     TEXT NULLABLE -- Webhook Secret     │
│ ─── Mercado Pago Config ───────────────────────────────────────  │
│ mercadoPagoAccessToken       TEXT NULLABLE -- Access Token       │
│ mercadoPagoPublicKey         TEXT NULLABLE -- Public Key         │
│ mercadoPagoWebhookSecret     TEXT NULLABLE -- Webhook Secret     │
│ ─── Configuração Geral ────────────────────────────────────────  │
│ environment                  VARCHAR(20)   -- "sandbox" ou "prod"│
│ webhookUrl                   VARCHAR(500) -- URL para webhooks   │
│ timeoutSeconds               INT DEFAULT 30                      │
│ maxRetries                   INT DEFAULT 3                       │
│ extraConfig                  JSON NULLABLE -- Config customizada │
│ createdAt                    TIMESTAMP DEFAULT now()             │
│ updatedAt                    TIMESTAMP DEFAULT now()             │
└──────────────────────────────────────────────────────────────────┘

ÍNDICES:
- PK: id
- UNIQUE: provider
- INDEX: provider, isEnabled

EXEMPLO DE DADO:
┌──────┬─────────────┬──────────────┬───────────┬──────────────┐
│ id   │ provider    │ displayName  │ isEnabled │ isPrimary    │
├──────┼─────────────┼──────────────┼───────────┼──────────────┤
│ 1    │ infinitypay │ InfinityPay  │ true      │ true         │
│ 2    │ mercadopago │ Mercado Pago │ false     │ false        │
└──────┴─────────────┴──────────────┴───────────┴──────────────┘
```

---

### 4️⃣ `payment_gateway_credentials` (Histórico de Credenciais)

```sql
┌──────────────────────────────────────────────────────────────────┐
│ PAYMENT_GATEWAY_CREDENTIALS                                      │
├──────────────────────────────────────────────────────────────────┤
│ id                INT PRIMARY KEY                                │
│ provider          VARCHAR(50)  -- "infinitypay"                 │
│ credentialType    VARCHAR(50)  -- "api_key", "webhook_secret"   │
│ encryptedValue    TEXT         -- Valor criptografado           │
│ expiresAt         TIMESTAMP NULLABLE                             │
│ isActive          BOOLEAN DEFAULT true                          │
│ notes             TEXT NULLABLE                                  │
│ createdAt         TIMESTAMP DEFAULT now()                        │
│ updatedAt         TIMESTAMP DEFAULT now()                        │
└──────────────────────────────────────────────────────────────────┘

ÍNDICES:
- PK: id
- INDEX: provider, credentialType, isActive

FINALIDADE:
- Guardar histórico de credenciais com segurança
- Permitir rotação de chaves sem perder rastreabilidade
- Auditoria de quando credenciais foram alteradas
```

---

### 5️⃣ `payment_gateway_logs` (Auditoria e Logs)

```sql
┌──────────────────────────────────────────────────────────────────┐
│ PAYMENT_GATEWAY_LOGS                                             │
├──────────────────────────────────────────────────────────────────┤
│ id               INT PRIMARY KEY                                 │
│ provider         VARCHAR(50)  -- "infinitypay", "mercadopago"   │
│ action           VARCHAR(100) -- "charge_created", "test_conn"  │
│ requestData      JSON NULLABLE -- Dados enviados ao gateway     │
│ responseStatus   INT NULLABLE -- HTTP status (200, 400, 500)    │
│ responseData     JSON NULLABLE -- Resposta do gateway           │
│ errorMessage     TEXT NULLABLE -- Mensagem de erro se houver    │
│ duration         INT NULLABLE -- Tempo de resposta em ms        │
│ createdAt        TIMESTAMP DEFAULT now()                        │
└──────────────────────────────────────────────────────────────────┘

ÍNDICES:
- PK: id
- INDEX: provider, action, createdAt

AÇÕES REGISTRADAS:
- "config_updated"     → Config foi atualizada
- "status_changed"     → Gateway ativado/desativado
- "connection_test"    → Teste de conexão realizado
- "charge_created"     → Cobrança iniciada
- "webhook_received"   → Webhook recebido do gateway
- "charge_failed"      → Cobrança falhou
- "health_check"       → Health check realizado

EXEMPLO DE DADO:
┌──────┬──────────────┬──────────────────┬────────────┐
│ id   │ provider     │ action           │ duration   │
├──────┼──────────────┼──────────────────┼────────────┤
│ 1    │ infinitypay  │ charge_created   │ 150        │
│ 2    │ infinitypay  │ webhook_received │ 45         │
│ 3    │ infinitypay  │ charge_failed    │ 1200       │
└──────┴──────────────┴──────────────────┴────────────┘
```

---

## 🔗 Relacionamentos Entre Tabelas

```
┌────────────────────────────────────────────────────────────┐
│                     CLIENT_PROFILES                         │
│  (Cliente do sistema)                                       │
├────────────────────────────────────────────────────────────┤
│ id, name, phone, plan, assignedWhatsappAccountId            │
└────────────────────────────────────────────────────────────┘
        │
        │ FK assignedWhatsappAccountId
        ▼
┌────────────────────────────────────────────────────────────┐
│          GENERATED_WHATSAPP_ACCOUNTS                        │
│  (Conta WhatsApp atribuída ao cliente)                     │
├────────────────────────────────────────────────────────────┤
│ id, label, phone, referenceCode, linkedToOfficialId        │
└────────────────────────────────────────────────────────────┘
        │
        │ FK linkedToOfficialId (OPCIONAL)
        ▼
┌────────────────────────────────────────────────────────────┐
│          OFFICIAL_WHATSAPP_ACCOUNTS                         │
│  (Conta Meta Business API - opcional)                      │
├────────────────────────────────────────────────────────────┤
│ id, label, phone, businessAccountId, phoneNumberId         │
└────────────────────────────────────────────────────────────┘


┌────────────────────────────────────────────────────────────┐
│                CLIENT_SUBSCRIPTIONS                         │
│  (Subscrição do cliente)                                   │
├────────────────────────────────────────────────────────────┤
│ id, clientId (FK), plan, nextBillingDate                   │
└────────────────────────────────────────────────────────────┘
        │
        │ Um para muitos
        ▼
┌────────────────────────────────────────────────────────────┐
│                    PAYMENTS                                 │
│  (Histórico de pagamentos)                                 │
├────────────────────────────────────────────────────────────┤
│ id, subscriptionId (FK), amount, status, chargedAt         │
└────────────────────────────────────────────────────────────┘
        │
        │ Usa credenciais de
        ▼
┌────────────────────────────────────────────────────────────┐
│         PAYMENT_GATEWAY_CONFIGS                             │
│  (Configuração do gateway de pagamento)                    │
├────────────────────────────────────────────────────────────┤
│ id, provider, infinityPayApiKey, mercadoPagoAccessToken   │
└────────────────────────────────────────────────────────────┘
        │
        │ Logs de todas operações
        ▼
┌────────────────────────────────────────────────────────────┐
│         PAYMENT_GATEWAY_LOGS                                │
│  (Auditoria)                                               │
├────────────────────────────────────────────────────────────┤
│ id, provider, action, requestData, responseData            │
└────────────────────────────────────────────────────────────┘
```

---

## 🎯 Exemplo de Fluxo Completo

```
1. USUÁRIO ACESSA PORTAL E SE REGISTRA
   └─► ClientProfile criado com plan="HOME"

2. SISTEMA ENCONTRA MELHOR CONTA WHATSAPP
   └─► SELECT * FROM generated_whatsapp_accounts
       WHERE isActive=true AND currentClientCount < maxClients
       ORDER BY currentClientCount ASC LIMIT 1

3. ATRIBUI CONTA AO CLIENTE
   └─► UPDATE client_profiles 
       SET assignedWhatsappAccountId=1
       WHERE id=123

4. ATUALIZA CONTADOR
   └─► UPDATE generated_whatsapp_accounts 
       SET currentClientCount=currentClientCount+1
       WHERE id=1

5. CRIA SUBSCRIÇÃO INICIAL
   └─► ClientSubscription criada com status="PENDING"

6. GERA LINK DE PAGAMENTO
   └─► Busca payment_gateway_configs WHERE isPrimary=true
       └─► Usa infinityPayApiKey para criar link
           └─► INSERT INTO payment_gateway_logs (ação: charge_created)

7. ENVIA VIA WHATSAPP
   └─► Busca generated_whatsapp_accounts para enviar mensagem
       └─► Usa phone do cliente + account.phone
           └─► Client recebe: "Pague aqui: [link]"

8. WEBHOOK DE CONFIRMAÇÃO
   └─► Recebe POST em /api/webhooks/infinitypay
       └─► Valida signature com infinityPayWebhookSecret
           └─► UPDATE payments SET status="APPROVED"
               └─► UPDATE client_subscriptions SET status="ACTIVE"
                   └─► INSERT INTO payment_gateway_logs (ação: webhook_received)

9. PRÓXIMA COBRANÇA (30 DIAS)
   └─► Cron job às 02:00 BRT
       └─► SELECT * FROM client_subscriptions 
           WHERE nextBillingDate <= NOW()
           └─► Repete passos 6-8
```

---

## 📊 Estatísticas de Banco

```sql
-- Ver quantas contas estão em uso
SELECT 
  COUNT(*) as total_contas,
  SUM(currentClientCount) as clientes_atribuidos,
  SUM(maxClients) as capacidade_total
FROM generated_whatsapp_accounts;

-- Contas próximas do limite
SELECT 
  id, label, currentClientCount, maxClients,
  ROUND((currentClientCount::float / maxClients) * 100, 2) as ocupacao_pct
FROM generated_whatsapp_accounts
WHERE (currentClientCount::float / maxClients) > 0.8
ORDER BY ocupacao_pct DESC;

-- Gateway primário
SELECT * FROM payment_gateway_configs 
WHERE isPrimary=true AND isEnabled=true;

-- Últimos 10 logs de erro
SELECT * FROM payment_gateway_logs 
WHERE errorMessage IS NOT NULL
ORDER BY createdAt DESC LIMIT 10;

-- Estatísticas de pagamento
SELECT 
  DATE(createdAt) as data,
  COUNT(*) as total_tentativas,
  SUM(CASE WHEN status='APPROVED' THEN 1 ELSE 0 END) as aprovadas,
  SUM(CASE WHEN status='FAILED' THEN 1 ELSE 0 END) as falhas
FROM payments
GROUP BY DATE(createdAt)
ORDER BY data DESC;
```

---

## ✅ Migration do Prisma

Para aplicar estas mudanças no seu banco:

```bash
# Gerar migration automática
npx prisma migrate dev --name add_payment_gateways_and_whatsapp_separation

# Ou fazer reset completo (cuidado em produção!)
npx prisma migrate reset

# Verificar status das migrations
npx prisma migrate status

# Revert de uma migration
npx prisma migrate resolve --rolled-back "20250115_add_payment_gateways"
```

---

## 🔐 Dados Sensíveis

**Nunca armazenar em plaintext:**
- ✗ infinityPayApiKey
- ✗ infinityPayWebhookSecret
- ✗ mercadoPagoAccessToken
- ✗ webhookSecret (WhatsApp)

**Melhorias futuras:**
1. Implementar encryption usando `@prisma/encryption`
2. Usar AWS Secrets Manager ou HashiCorp Vault
3. Rotação automática de chaves
4. Rate limiting de acessos a credenciais

---

**Estrutura completa pronta para produção! 🚀**
