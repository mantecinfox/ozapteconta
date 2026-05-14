# ðŸš€ Guia de InÃ­cio RÃ¡pido - ConfiguraÃ§Ãµes Separadas

## âš¡ Passo 1: Preparar o Banco de Dados

```bash
# Terminal 1: Na pasta backend
cd backend

# Resetar banco e aplicar novo schema
npx prisma migrate dev --name add_payment_gateways_and_whatsapp_separation

# Ou se preferir fazer um reset completo
npx prisma migrate reset
```

## âš¡ Passo 2: Iniciar o Servidor

```bash
# Terminal 1: Backend com auto-reload
npm run dev

# Ou em outro terminal:
npm start
```

**SaÃ­da esperada:**
```
ðŸš€ ozapteconta Backend rodando!
   Porta:    3001
   Ambiente: development

âœ… Banco de dados conectado
âœ… [Recurring Billing] Cron job agendado para 02:00
âœ… [Admin Settings] Rotas de configuraÃ§Ã£o registradas
```

## ðŸŽ¯ Passo 3: Acessar Painel Admin de ConfiguraÃ§Ãµes

### URL Principal de ConfiguraÃ§Ãµes
```
http://localhost:3001/api/admin
```

### Endpoints DisponÃ­veis

#### ðŸ“Š Payment Gateways

**Listar todos:**
```bash
curl http://localhost:3001/api/admin/payment-gateways \
  -H "Authorization: Bearer {seu_token_admin}"
```

**Configurar InfinityPay:**
```bash
curl -X POST http://localhost:3001/api/admin/payment-gateways \
  -H "Authorization: Bearer {seu_token_admin}" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "infinitypay",
    "displayName": "InfinityPay",
    "description": "Gateway de pagamentos principal",
    "isEnabled": true,
    "isPrimary": true,
    "environment": "production",
    "webhookUrl": "https://seu-dominio.com/api/webhooks/infinitypay",
    "infinityPayMerchantKey": "$mantecinfoxsystem",
    "infinityPayApiKey": "sua_api_key_aqui",
    "infinityPayWebhookSecret": "seu_webhook_secret"
  }'
```

**Testar conexÃ£o:**
```bash
curl -X POST http://localhost:3001/api/admin/payment-gateways/infinitypay/test \
  -H "Authorization: Bearer {seu_token_admin}"
```

**Ver logs:**
```bash
curl http://localhost:3001/api/admin/payment-gateways/infinitypay/logs \
  -H "Authorization: Bearer {seu_token_admin}"
```

#### ðŸ“± Contas WhatsApp

**Listar Contas Oficiais:**
```bash
curl http://localhost:3001/api/admin/whatsapp/official \
  -H "Authorization: Bearer {seu_token_admin}"
```

**Criar Conta Oficial (Meta Business API):**
```bash
curl -X POST http://localhost:3001/api/admin/whatsapp/official \
  -H "Authorization: Bearer {seu_token_admin}" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Principal",
    "businessAccountId": "123456789012345",
    "phoneNumberId": "987654321098765",
    "phone": "+5511987654321",
    "accessToken": "EAAn...seu_token_da_meta...",
    "webhookVerifyToken": "seu_verify_token",
    "webhookSecret": "seu_webhook_secret",
    "maxClientsSupported": 1000,
    "notes": "Conta oficial da empresa"
  }'
```

**Listar Contas Geradas (QR Code):**
```bash
curl http://localhost:3001/api/admin/whatsapp/generated \
  -H "Authorization: Bearer {seu_token_admin}"
```

**Criar Nova Conta (QR Code):**
```bash
curl -X POST http://localhost:3001/api/admin/whatsapp/generated \
  -H "Authorization: Bearer {seu_token_admin}" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Cliente 001 - JoÃ£o Silva",
    "phone": "+5511988888888",
    "connectionType": "LOCAL",
    "maxClients": 500,
    "notes": "Conta de teste"
  }'
```

## ðŸ” Credenciais de Teste

**Admin Dashboard:**
```
Login: admin
Senha: admin123
```

## ðŸ“‹ Dados Criados Automaticamente

### Contas WhatsApp
- âœ… **Oficial:** +5511999999999 (preencher credenciais)
- âœ… **Gerada:** +5511988888888 (referÃªncia WA-DEMO-001)

### Payment Gateways
- âœ… **InfinityPay** (Primary - preencher credenciais)
- âœ… **Mercado Pago** (SecundÃ¡rio - preencher credenciais)

### Planos de SubscriÃ§Ã£o
- âœ… **HOME** - R$ 15,99/mÃªs (PESSOAL)
- âœ… **OFFICE** - R$ 19,90/mÃªs (COMERCIAL)
- âœ… **FULL** - R$ 29,90/mÃªs (PESSOAL + COMERCIAL)

### Categorias de Despesas
- âœ… **18 PESSOAL**: Aluguel, Luz, Ãgua, Internet, etc.
- âœ… **20 COMERCIAL**: Aluguel EscritÃ³rio, SalÃ¡rios, Fornecedores, etc.

## ðŸŽ¨ Estrutura LÃ³gica

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚         CLIENTE (ClientProfile)                          â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  â€¢ phone: +55119xxxxxxxxx                                â”‚
â”‚  â€¢ plan: HOME | OFFICE | FULL                           â”‚
â”‚  â€¢ assignedWhatsappAccountId: FK                         â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
        â”‚
        â””â”€â–º â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
            â”‚ Conta WhatsApp Gerada (QR Code)         â”‚
            â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
            â”‚ â€¢ referenceCode: WA-DEMO-001            â”‚
            â”‚ â€¢ phone: +5511988888888                 â”‚
            â”‚ â€¢ currentClientCount: 1                 â”‚
            â”‚ â€¢ maxClients: 500                       â”‚
            â”‚ â€¢ linkedToOfficialId: NULL (opcional)   â”‚
            â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                    â”‚
                    â””â”€â–º [PODE REFERENCIAR]
                        â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                        â”‚ Conta WhatsApp Oficial (API)     â”‚
                        â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
                        â”‚ â€¢ phone: +5511999999999          â”‚
                        â”‚ â€¢ businessAccountId: (Meta)      â”‚
                        â”‚ â€¢ accessToken: (Meta API)        â”‚
                        â”‚ â€¢ maxClientsSupported: 1000      â”‚
                        â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚    SUBSCRIÃ‡ÃƒO (ClientSubscription)                       â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  â€¢ clientId: FK                                          â”‚
â”‚  â€¢ plan: HOME | OFFICE | FULL                           â”‚
â”‚  â€¢ status: PENDING | ACTIVE | PAST_DUE | CANCELLED      â”‚
â”‚  â€¢ nextBillingDate: 2025-02-15                          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
        â”‚
        â””â”€â–º â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
            â”‚ PAGAMENTO (Payment)                      â”‚
            â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
            â”‚ â€¢ infinityPayTransactionId: ABC123       â”‚
            â”‚ â€¢ amount: 1599 (R$ 15,99)               â”‚
            â”‚ â€¢ status: PENDING | APPROVED | FAILED   â”‚
            â”‚ â€¢ paymentMethod: infinitypay            â”‚
            â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                    â”‚
                    â””â”€â–º â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                        â”‚ Gateway Config              â”‚
                        â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
                        â”‚ â€¢ provider: infinitypay     â”‚
                        â”‚ â€¢ apiKey: â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢        â”‚
                        â”‚ â€¢ merchantKey: $mantec...  â”‚
                        â”‚ â€¢ isPrimary: true           â”‚
                        â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

## ðŸ”§ Usando os ServiÃ§os no CÃ³digo

### Exemplo 1: Registrar Novo Cliente

```typescript
import { whatsappSettingsService } from "../services/whatsappSettingsService";

// Encontrar melhor conta disponÃ­vel
const account = await whatsappSettingsService.findAvailableGeneratedAccount();

// Criar cliente
const client = await prisma.clientProfile.create({
  data: {
    fullName: "JoÃ£o Silva",
    phone: "+5511987654321",
    email: "joao@example.com",
    cpf: "12345678900",
    plan: "HOME",
    assignedWhatsappAccountId: account.id,
    // ... outros dados
  },
});

// Atualizar contador
await whatsappSettingsService.updateClientCount("generated", account.id, 1);
```

### Exemplo 2: CobranÃ§a com Gateway

```typescript
import { paymentGatewaySettingsService } from "../services/paymentGatewaySettingsService";

// Obter configuraÃ§Ã£o do gateway primÃ¡rio
const gateway = await paymentGatewaySettingsService.getPrimaryGateway();

if (gateway?.config.infinitypay?.apiKey) {
  // Usar credenciais para cobrar
  const chargeResult = await infinityPayService.createCharge({
    apiKey: gateway.config.infinitypay.apiKey,
    merchantKey: gateway.config.infinitypay.merchantKey,
    amount: 1599,
    // ... outros dados
  });
}
```

## ðŸ“ Checklist de ConfiguraÃ§Ã£o

### Fase 1: Setup Local (Hoje)
- [x] Schema atualizado com novos modelos
- [x] ServiÃ§os de configuraÃ§Ã£o criados
- [x] Endpoints de API implementados
- [ ] Migration do Prisma executada (`npx prisma migrate dev`)
- [ ] Banco resetado com seed (`npm run prisma:seed`)
- [ ] Backend iniciado e testado

### Fase 2: Configurar Credenciais (PrÃ³ximo)
- [ ] Obter credenciais InfinityPay ($mantecinfoxsystem)
- [ ] Obter credenciais Meta Business API
- [ ] Popular campo `infinityPayApiKey` via dashboard
- [ ] Testar conexÃ£o com InfinityPay
- [ ] Configurar webhook URLs com domÃ­nio real (HTTPS)

### Fase 3: Frontend Admin (Depois)
- [ ] Criar componente de Settings â†’ Payment Gateways
- [ ] Criar componente de Settings â†’ WhatsApp Accounts
- [ ] FormulÃ¡rios para adicionar/editar configuraÃ§Ãµes
- [ ] Dashboard de monitoramento de contas
- [ ] Testes de fluxo completo

## ðŸš¨ Erros Comuns

### âŒ "Tabela 'official_whatsapp_accounts' nÃ£o existe"
**SoluÃ§Ã£o:** Executar migration:
```bash
npx prisma migrate dev
npx prisma db push
npm run prisma:seed
```

### âŒ "Cannot find module 'paymentGatewaySettings'"
**SoluÃ§Ã£o:** Verificar se arquivo estÃ¡ em `src/routes/paymentGatewaySettings.ts`

### âŒ "401 Unauthorized"
**SoluÃ§Ã£o:** Verificar token Bearer no header Authorization:
```bash
# Obter token de teste
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }'
```

## ðŸ“ž Suporte

Para dÃºvidas sobre configuraÃ§Ã£o:
1. Consultar `GUIA_CONFIGURACOES_SEPARADAS.md`
2. Verificar logs em `payment_gateway_logs` table
3. Testar endpoints com Postman/cURL
4. Ativar modo debug: `DEBUG=app:* npm run dev`

## ðŸŽ¯ PrÃ³ximas Melhorias

- [ ] EncriptaÃ§Ã£o de credenciais sensÃ­veis
- [ ] Rate limiting por gateway
- [ ] Metricas e alertas de disponibilidade
- [ ] Suporte a mÃºltiplos ambientes (dev/staging/prod)
- [ ] IntegraÃ§Ã£o com Redis para cache distribuÃ­do
- [ ] Dashboard em tempo real de status dos gateways

---

**Sistema pronto para configuraÃ§Ã£o! ðŸŽ‰**

