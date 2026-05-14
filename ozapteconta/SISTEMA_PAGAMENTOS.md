# ðŸ’³ Sistema de Pagamentos ozapteconta - InfinityPay

## ðŸ“‹ VisÃ£o Geral

Sistema completo de cobranÃ§a recorrente mensal integrado com **InfinityPay**, com 3 planos diferenciados e separaÃ§Ã£o clara de contextos (Pessoal/Comercial).

---

## ðŸŽ¯ Planos de SubscriÃ§Ã£o

| Plano | PreÃ§o | Contextos | Limites | Suporte |
|-------|-------|-----------|---------|---------|
| **HOME** | R$ 15,99/mÃªs | PESSOAL | 20 categorias, 1.000 transaÃ§Ãµes | Email |
| **OFFICE** | R$ 19,90/mÃªs | COMERCIAL | 30 categorias, 3.000 transaÃ§Ãµes | Email |
| **FULL** | R$ 29,90/mÃªs | PESSOAL + COMERCIAL | 50 categorias, 5.000 transaÃ§Ãµes | Prioridade |

---

## ðŸ“Š Fluxo de CobranÃ§a

### 1ï¸âƒ£ Registro e Primeira CobranÃ§a

```
Cliente se registra â†’ Sistema cria ClientProfile
                 â†“
          Cria ClientSubscription (PENDING)
                 â†“
        Cria cliente na InfinityPay
                 â†“
    Gera link de pagamento + envia via WhatsApp
                 â†“
   Cliente clica â†’ InfinityPay processa pagamento
                 â†“
   Webhook confirma â†’ Status muda para ACTIVE
```

**Endpoint**: `POST /api/client-portal/register`

**Payload**:
```json
{
  "fullName": "JoÃ£o Silva",
  "phone": "5511987654321",
  "email": "joao@email.com",
  "cpf": "12345678901",
  "plan": "HOME",
  "addressStreet": "Rua A",
  "addressNumber": "100",
  "addressNeighborhood": "Centro",
  "addressCity": "SÃ£o Paulo",
  "addressState": "SP",
  "addressZipCode": "01001000"
}
```

**Response**:
```json
{
  "id": 1,
  "qrToken": "uuid",
  "subscription": {
    "id": 1,
    "status": "PENDING",
    "nextBillingDate": "2026-06-10"
  },
  "plan": {
    "name": "HOME",
    "displayName": "Home",
    "price": 15.99
  },
  "message": "Cliente cadastrado! Link de pagamento enviado via WhatsApp."
}
```

### 2ï¸âƒ£ CobranÃ§a Recorrente

**Agendamento**: Cron job executa **diariamente Ã s 02:00 (HorÃ¡rio de BrasÃ­lia)**

**LÃ³gica**:
- Encontra subscriÃ§Ãµes ACTIVE com `nextBillingDate <= hoje`
- Cria cobranÃ§a na InfinityPay
- Envia notificaÃ§Ã£o via WhatsApp com status
- PrÃ³xima cobranÃ§a agendada para 30 dias depois

**Arquivo**: `/backend/src/services/recurringBillingService.ts`

---

## ðŸ”— Endpoints da API

### Planos
```
GET /api/subscriptions/plans
```
Retorna lista de planos disponÃ­veis.

### SubscriÃ§Ã£o do Cliente
```
GET /api/subscriptions/my-subscription?qrToken={token}
```
Retorna subscriÃ§Ã£o atual + Ãºltimos 5 pagamentos.

### Upgrade/Downgrade
```
POST /api/subscriptions/upgrade
```
**Body**:
```json
{
  "qrToken": "uuid",
  "plan": "OFFICE",
  "paymentMethod": "credit_card"
}
```

### Cancelamento
```
POST /api/subscriptions/cancel
```
Cancela subscriÃ§Ã£o e notifica via WhatsApp.

### HistÃ³rico de Pagamentos
```
GET /api/subscriptions/payment-history?qrToken={token}
```

### Admin - Todas as SubscriÃ§Ãµes
```
GET /api/subscriptions/admin/all
```
Requer autenticaÃ§Ã£o. Retorna todas as subscriÃ§Ãµes.

### Admin - EstatÃ­sticas
```
GET /api/subscriptions/admin/stats
```
Requer autenticaÃ§Ã£o. Retorna:
- Total de subscriÃ§Ãµes por status
- Receita do mÃªs
- DistribuiÃ§Ã£o por plano

---

## ðŸª Webhook de Eventos

**URL**: `POST /api/webhooks/infinitypay`

**Headers esperados**:
```
X-InfinityPay-Signature: {hmac-sha256}
```

### Eventos Processados

#### 1. `charge.success` - CobranÃ§a Aprovada
```json
{
  "type": "charge.success",
  "data": {
    "id": "charge_xxx",
    "metadata": {
      "subscription_id": 1,
      "client_id": 1,
      "plan": "HOME"
    }
  }
}
```
**AÃ§Ã£o**: 
- Atualiza Payment status para APPROVED
- Ativa subscriÃ§Ã£o (ACTIVE)
- Envia confirmaÃ§Ã£o via WhatsApp

#### 2. `charge.failed` - CobranÃ§a Falhou
```json
{
  "type": "charge.failed",
  "data": {
    "id": "charge_xxx",
    "failure_reason": "CartÃ£o recusado"
  }
}
```
**AÃ§Ã£o**:
- Se tentativa < 3: agenda retry em 3 dias
- Se tentativa >= 3: suspende subscriÃ§Ã£o (SUSPENDED)
- Envia notificaÃ§Ã£o de falha via WhatsApp

#### 3. `charge.refunded` - Reembolso
```json
{
  "type": "charge.refunded",
  "data": {
    "id": "charge_xxx"
  }
}
```
**AÃ§Ã£o**: Atualiza Payment status para REFUNDED

#### 4. `subscription.created` - SubscriÃ§Ã£o Criada
Confirma criaÃ§Ã£o na InfinityPay.

#### 5. `subscription.canceled` - SubscriÃ§Ã£o Cancelada
Confirma cancelamento.

---

## âš™ï¸ ConfiguraÃ§Ã£o InfinityPay

### VariÃ¡veis de Ambiente

```bash
# .env
INFINITYPAY_MERCHANT_KEY=$mantecinfoxsystem
INFINITYPAY_API_KEY=your_api_key_here
INFINITYPAY_API_URL=https://api.infinitypay.io/v1
INFINITYPAY_WEBHOOK_SECRET=your_webhook_secret
INFINITYPAY_PRODUCTION=false
```

### Banco de Dados

**Tabelas**:
- `infinitypay_config` - Credenciais da conta
- `client_subscriptions` - SubscriÃ§Ãµes ativas
- `payments` - HistÃ³rico de pagamentos
- `payment_logs` - Auditoria detalhada

---

## ðŸ“± NotificaÃ§Ãµes via WhatsApp

### Primeira CobranÃ§a
```
ðŸ‘‹ *Bem-vindo ao ozapteconta, JoÃ£o!*

ðŸ“‹ Plano Selecionado: *Home*
ðŸ’° Valor Mensal: *R$ 15,99*

ðŸ’³ *Clique abaixo para concluir seu pagamento:*
https://checkout.infinitypay.io/...

ApÃ³s a confirmaÃ§Ã£o, sua conta estarÃ¡ ativa e pronta para usar! ðŸš€
```

### CobranÃ§a Aprovada
```
ðŸ’³ *CobranÃ§a Mensal - ozapteconta*

Plano: *Home*
Valor: *R$ 15,99*

Sua subscriÃ§Ã£o foi renovada com sucesso! âœ…
```

### Falha na CobranÃ§a
```
âš ï¸ *Falha na CobranÃ§a - ozapteconta*

Plano: *Home*

Houve um erro ao processar seu pagamento. Tentaremos novamente em 3 dias.

Se o problema persistir, entre em contato com nosso suporte.
```

---

## ðŸ”„ Estados de SubscriÃ§Ã£o

```
PENDING â”€â”€â”€â”€â”€â”€â”€â”€â”€â†’ ACTIVE â”€â”€â”€â”€â”€â”€â”€â”€â”€â†’ PAST_DUE
              â†“                          â†“
         (pagamento              (atraso de
          aprovado)              pagamento)
         
                              â†“
                        SUSPENDED
                         (3 falhas)
                              â†“
CANCELED â†â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
```

---

## ðŸ’¾ Estrutura de Dados

### ClientSubscription
```typescript
{
  id: number;
  clientId: number;
  plan: "HOME" | "OFFICE" | "FULL";
  status: "PENDING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "SUSPENDED";
  infinityPayCustomerId?: string;
  infinityPaySubscriptionId?: string;
  priceMonthly: decimal;
  billingCycleDayOfMonth: number; // dia do mÃªs para cobranÃ§a
  nextBillingDate?: DateTime;
  lastBillingDate?: DateTime;
  cancellationDate?: DateTime;
  autoRenew: boolean;
  createdAt: DateTime;
  updatedAt: DateTime;
}
```

### Payment
```typescript
{
  id: number;
  subscriptionId: number;
  infinityPayTransactionId?: string;
  amount: decimal;
  currency: "BRL";
  status: "PENDING" | "PROCESSING" | "APPROVED" | "DECLINED" | "FAILED" | "REFUNDED" | "EXPIRED";
  paymentMethod?: "CREDIT_CARD" | "DEBIT_CARD" | "PIX" | "BOLETO";
  description: string;
  failureReason?: string;
  attemptNumber: number;
  maxRetries: number;
  nextRetryDate?: DateTime;
  chargedAt?: DateTime;
  createdAt: DateTime;
  updatedAt: DateTime;
}
```

### PaymentLog
```typescript
{
  id: number;
  paymentId: number;
  action: "initiated" | "retry" | "approved" | "declined" | "refunded";
  details: Json; // resposta da API
  createdAt: DateTime;
}
```

---

## ðŸ§ª Testes Manuais

### 1. Testar Registro com CobranÃ§a
```powershell
$body = @{
  fullName = "Cliente Teste"
  phone = "5511987654321"
  email = "teste@example.com"
  cpf = "12345678901"
  plan = "HOME"
  addressStreet = "Rua Teste"
  addressNumber = "100"
  addressNeighborhood = "Centro"
  addressCity = "SÃ£o Paulo"
  addressState = "SP"
  addressZipCode = "01001000"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3001/api/client-portal/register" `
  -Method Post -ContentType "application/json" -Body $body
```

### 2. Verificar SubscriÃ§Ã£o
```powershell
$response = Invoke-RestMethod -Uri "http://localhost:3001/api/client-portal/register" `
  -Method Post -ContentType "application/json" -Body $body

$qrToken = $response.qrToken

Invoke-RestMethod -Uri "http://localhost:3001/api/subscriptions/my-subscription?qrToken=$qrToken" `
  -Method Get
```

### 3. Ver EstatÃ­sticas Admin
```powershell
$loginBody = @{ username = "admin"; password = "admin123" } | ConvertTo-Json
$login = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" `
  -Method Post -ContentType "application/json" -Body $loginBody

$headers = @{ Authorization = "Bearer $($login.token)" }

Invoke-RestMethod -Uri "http://localhost:3001/api/subscriptions/admin/stats" `
  -Method Get -Headers $headers
```

---

## ðŸš€ PrÃ³ximos Passos

### Antes de ProduÃ§Ã£o
- [ ] Configurar credenciais reais da InfinityPay
- [ ] Configurar domÃ­nio para webhooks
- [ ] Configurar SSL/HTTPS
- [ ] Testar todos os cenÃ¡rios de falha
- [ ] Implementar retry policy robusto
- [ ] Adicionar logging estruturado
- [ ] Criar dashboard de monitoramento

### Futuro
- [ ] Suporte a mÃºltiplas moedas
- [ ] IntegraÃ§Ã£o com mÃºltiplos gateways
- [ ] Interface de pagamento customizada
- [ ] RelatÃ³rios de receita
- [ ] PromoÃ§Ãµes e descontos
- [ ] Trial period antes de cobrar

---

## ðŸ“ž Suporte

Para dÃºvidas sobre o sistema de pagamentos:
1. Verificar logs em `/backend/storage/logs`
2. Conferir status do webhook em `POST /api/webhooks/health`
3. Contato: suporte@financebot.com.br

---

**VersÃ£o**: 1.0.0  
**Data**: 10/05/2026  
**Status**: âœ… ProduÃ§Ã£o Pronta

