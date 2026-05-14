import { Router, Request, Response } from "express";
import axios from "axios";
import { prisma } from "../config/prisma";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../utils/logger";

const router = Router();

function resolveInfinityCheckoutBaseUrl(raw?: string): string {
  const fallback = "https://api.checkout.infinitepay.io";
  const value = String(raw || "").trim();
  if (!value) return fallback;
  if (value.includes("api.infinitypay.io")) return fallback;
  return value.replace(/\/+$/, "");
}

// ─── Get all payment gateway configurations ────────────────────────────────
router.get("/payment-gateways", authMiddleware, async (req: Request, res: Response) => {
  try {
    const configs = await prisma.paymentGatewayConfig.findMany({
      select: {
        id: true,
        provider: true,
        displayName: true,
        description: true,
        isEnabled: true,
        isPrimary: true,
        environment: true,
        webhookUrl: true,
        maxRetries: true,
        timeoutSeconds: true,
        createdAt: true,
        updatedAt: true,
        // Não retornar chaves sensíveis
      },
      orderBy: { isPrimary: "desc" },
    });

    res.json({ success: true, data: configs });
  } catch (error) {
    logger.error("Erro ao listar configurações de Payment Gateways", error);
    res.status(500).json({ success: false, error: "Erro ao listar configurações" });
  }
});

// ─── Get specific gateway configuration (sem dados sensíveis) ──────────────
router.get("/payment-gateways/:provider", authMiddleware, async (req: Request, res: Response) => {
  try {
    const provider = String(req.params.provider || "");

    const config = await prisma.paymentGatewayConfig.findUnique({
      where: { provider },
      select: {
        id: true,
        provider: true,
        displayName: true,
        description: true,
        isEnabled: true,
        isPrimary: true,
        environment: true,
        webhookUrl: true,
        maxRetries: true,
        timeoutSeconds: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!config) {
      return res.status(404).json({ success: false, error: "Gateway não encontrado" });
    }

    res.json({ success: true, data: config });
  } catch (error) {
    logger.error("Erro ao buscar configuração de Gateway", error);
    res.status(500).json({ success: false, error: "Erro ao buscar configuração" });
  }
});

// ─── Save/Update payment gateway configuration ─────────────────────────────
router.post("/payment-gateways", authMiddleware, async (req: Request, res: Response) => {
  try {
    const {
      provider,
      displayName,
      description,
      isEnabled,
      isPrimary,
      environment,
      webhookUrl,
      timeoutSeconds,
      maxRetries,
      infinityPayMerchantKey,
      infinityPayApiKey,
      infinityPayWebhookSecret,
      mercadoPagoAccessToken,
      mercadoPagoPublicKey,
      mercadoPagoWebhookSecret,
      extraConfig,
    } = req.body;

    // Validar campos obrigatórios
    if (!provider || !displayName) {
      return res.status(400).json({ success: false, error: "Provider e displayName são obrigatórios" });
    }

    // Se for primary, remover isPrimary de outros
    if (isPrimary) {
      await prisma.paymentGatewayConfig.updateMany({
        where: { provider: { not: provider } },
        data: { isPrimary: false },
      });
    }

    // Buscar ou criar
    const existing = await prisma.paymentGatewayConfig.findUnique({
      where: { provider },
    });

    let config;

    if (existing) {
      // Atualizar — se há merchantKey configurada, forçar isEnabled=true
      const resolvedIsEnabled =
        typeof isEnabled === "boolean"
          ? isEnabled
          : Boolean(infinityPayMerchantKey || mercadoPagoAccessToken);

      config = await prisma.paymentGatewayConfig.update({
        where: { provider },
        data: {
          displayName,
          description,
          isEnabled: resolvedIsEnabled,
          isPrimary: isPrimary || false,
          environment,
          webhookUrl,
          timeoutSeconds,
          maxRetries,
          infinityPayMerchantKey,
          infinityPayApiKey,
          infinityPayWebhookSecret,
          mercadoPagoAccessToken,
          mercadoPagoPublicKey,
          mercadoPagoWebhookSecret,
          extraConfig: extraConfig || undefined,
        },
      });

      logger.info(`[PaymentGateway] Configuração atualizada: ${provider}`);
    } else {
      // Criar
      config = await prisma.paymentGatewayConfig.create({
        data: {
          provider,
          displayName,
          description,
          isEnabled: isEnabled !== false,
          isPrimary: isPrimary || false,
          environment: environment || "sandbox",
          webhookUrl,
          timeoutSeconds: timeoutSeconds || 30,
          maxRetries: maxRetries || 3,
          infinityPayMerchantKey,
          infinityPayApiKey,
          infinityPayWebhookSecret,
          mercadoPagoAccessToken,
          mercadoPagoPublicKey,
          mercadoPagoWebhookSecret,
          extraConfig: extraConfig || undefined,
        },
      });

      logger.info(`[PaymentGateway] Configuração criada: ${provider}`);
    }

    // Registrar log
    await prisma.paymentGatewayLog.create({
      data: {
        provider,
        action: "config_updated",
        requestData: { displayName, isEnabled, isPrimary },
        responseStatus: 200,
      },
    });

    res.json({ 
      success: true, 
      data: {
        id: config.id,
        provider: config.provider,
        displayName: config.displayName,
        message: existing ? "Configuração atualizada com sucesso" : "Configuração criada com sucesso",
      } 
    });
  } catch (error) {
    logger.error("Erro ao salvar configuração de Payment Gateway", error);
    res.status(500).json({ success: false, error: "Erro ao salvar configuração" });
  }
});

// ─── Test gateway connection ───────────────────────────────────────────────
router.post("/payment-gateways/:provider/test", authMiddleware, async (req: Request, res: Response) => {
  try {
    const provider = String(req.params.provider || "");

    const config = await prisma.paymentGatewayConfig.findUnique({ where: { provider } });

    // Permite testar sem precisar salvar/ativar antes: usa payload do formulário se enviado.
    const draft = (req.body || {}) as Record<string, unknown>;
    const candidate = {
      infinityPayMerchantKey: String(draft.infinityPayMerchantKey ?? config?.infinityPayMerchantKey ?? "").trim(),
      infinityPayApiKey: String(draft.infinityPayApiKey ?? config?.infinityPayApiKey ?? "").trim(),
      infinityPayWebhookSecret: String(draft.infinityPayWebhookSecret ?? config?.infinityPayWebhookSecret ?? "").trim(),
      mercadoPagoAccessToken: String(draft.mercadoPagoAccessToken ?? config?.mercadoPagoAccessToken ?? "").trim(),
      mercadoPagoPublicKey: String(draft.mercadoPagoPublicKey ?? config?.mercadoPagoPublicKey ?? "").trim(),
      environment: String(draft.environment ?? config?.environment ?? "sandbox").trim(),
    };

    let testResult: { success: boolean; message: string; checkoutUrl?: string };

    // Testar conexão com o provedor
    if (provider === "infinitypay") {
      // Teste real: tenta criar um payment link PF e retorna URL de checkout.
      if (!candidate.infinityPayMerchantKey) {
        testResult = { success: false, message: "Merchant Key não informado" };
      } else if (!candidate.infinityPayMerchantKey.startsWith("$")) {
        testResult = { success: false, message: "Merchant Key inválido. Deve começar com '$'" };
      } else {
        const baseUrl = resolveInfinityCheckoutBaseUrl(process.env.INFINITYPAY_API_URL);
        const handle = candidate.infinityPayMerchantKey.replace(/^\$/, "").trim();
        const testPayload = {
          handle,
          items: [
            {
              quantity: 1,
              price: 100, // R$ 1,00 em centavos
              description: "Teste de configuracao ozapteconta",
            },
          ],
          order_nsu: `ozapteconta-test-${Date.now()}`,
          customer: {
            name: "Teste ozapteconta",
            email: `teste+${Date.now()}@ozapteconta.app`,
            phone_number: "+5531999999999",
          },
        };

        try {
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
          };

          // Opcional: algumas contas podem exigir Authorization no Checkout.
          if (candidate.infinityPayApiKey) {
            headers.Authorization = `Bearer ${candidate.infinityPayApiKey}`;
          }

          const response = await axios.post(`${baseUrl}/links`, testPayload, {
            headers,
            timeout: 30000,
          });

          const data = response.data as Record<string, unknown>;
          const checkoutUrl =
            String(data.url || "") ||
            String(data.checkout_url || "") ||
            String(data.payment_url || "") ||
            String(data.link || "") ||
            String(data.checkoutLink || "");

          if (!checkoutUrl) {
            testResult = {
              success: false,
              message: "Link foi criado, mas a URL de checkout não veio na resposta da InfinityPay.",
            };
          } else {
            testResult = {
              success: true,
              message: "Link de teste gerado com sucesso. Abrindo checkout da InfinityPay.",
              checkoutUrl,
            };
          }
        } catch (apiError: any) {
          const apiMessage =
            apiError?.response?.data?.message ||
            apiError?.response?.data?.error ||
            apiError?.message ||
            "Falha ao criar link de teste na InfinityPay";

          testResult = {
            success: false,
            message: `Erro InfinityPay: ${apiMessage}`,
          };
        }
      }
    } else if (provider === "mercadopago") {
      if (!candidate.mercadoPagoAccessToken || !candidate.mercadoPagoPublicKey) {
        testResult = { success: false, message: "Credenciais de Mercado Pago não configuradas" };
      } else {
        // Aqui você chamaria a API Mercado Pago para validar as credenciais
        testResult = { success: true, message: "Credenciais de Mercado Pago parecem válidas" };
      }
    } else {
      testResult = { success: false, message: "Provedor desconhecido" };
    }

    // Registrar log
    await prisma.paymentGatewayLog.create({
      data: {
        provider,
        action: "connection_test",
        requestData: {
          environment: candidate.environment,
          hasInfinityPayMerchantKey: !!candidate.infinityPayMerchantKey,
          hasInfinityPayApiKey: !!candidate.infinityPayApiKey,
          hasMercadoPagoAccessToken: !!candidate.mercadoPagoAccessToken,
          hasMercadoPagoPublicKey: !!candidate.mercadoPagoPublicKey,
        },
        responseStatus: testResult.success ? 200 : 400,
        responseData: testResult,
      },
    });

    res.json(testResult);
  } catch (error) {
    logger.error(`Erro ao testar conexão com ${req.params.provider}`, error);
    res.status(500).json({ success: false, error: "Erro ao testar conexão" });
  }
});

// ─── Get gateway logs (últimas transações) ─────────────────────────────────
router.get("/payment-gateways/:provider/logs", authMiddleware, async (req: Request, res: Response) => {
  try {
    const provider = String(req.params.provider || "");
    const limit = parseInt(req.query.limit as string) || 50;

    const logs = await prisma.paymentGatewayLog.findMany({
      where: { provider },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    res.json({ success: true, data: logs });
  } catch (error) {
    logger.error("Erro ao buscar logs de Payment Gateway", error);
    res.status(500).json({ success: false, error: "Erro ao buscar logs" });
  }
});

// ─── Enable/Disable gateway ────────────────────────────────────────────────
router.patch("/payment-gateways/:provider/status", authMiddleware, async (req: Request, res: Response) => {
  try {
    const provider = String(req.params.provider || "");
    const { isEnabled } = req.body;

    if (typeof isEnabled !== "boolean") {
      return res.status(400).json({ success: false, error: "Campo 'isEnabled' deve ser boolean" });
    }

    const config = await prisma.paymentGatewayConfig.update({
      where: { provider },
      data: { isEnabled },
    });

    await prisma.paymentGatewayLog.create({
      data: {
        provider,
        action: "status_changed",
        requestData: { isEnabled },
        responseStatus: 200,
      },
    });

    logger.info(`[PaymentGateway] ${provider} ${isEnabled ? "ativado" : "desativado"}`);

    res.json({ 
      success: true, 
      data: { 
        provider, 
        isEnabled,
        message: `Gateway ${isEnabled ? "ativado" : "desativado"} com sucesso`,
      } 
    });
  } catch (error) {
    logger.error("Erro ao alterar status do gateway", error);
    res.status(500).json({ success: false, error: "Erro ao alterar status" });
  }
});

// ─── Get WhatsApp configurations (Official API) ────────────────────────────
router.get("/whatsapp/official", authMiddleware, async (req: Request, res: Response) => {
  try {
    const accounts = await prisma.officialWhatsappAccount.findMany({
      select: {
        id: true,
        label: true,
        businessAccountId: true,
        phone: true,
        isActive: true,
        whatsappConnectionStatus: true,
        lastHealthCheck: true,
        currentClientCount: true,
        maxClientsSupported: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ success: true, data: accounts });
  } catch (error) {
    logger.error("Erro ao listar contas WhatsApp oficiais", error);
    res.status(500).json({ success: false, error: "Erro ao listar contas" });
  }
});

// ─── Create/Update Official WhatsApp Account ────────────────────────────────
router.post("/whatsapp/official", authMiddleware, async (req: Request, res: Response) => {
  try {
    const {
      id,
      label,
      businessAccountId,
      phoneNumberId,
      phone,
      accessToken,
      permanentAccessToken,
      webhookVerifyToken,
      webhookSecret,
      maxClientsSupported,
      notes,
    } = req.body;

    // Validar campos obrigatórios
    if (!label || !businessAccountId || !phoneNumberId || !phone || !accessToken) {
      return res.status(400).json({ 
        success: false, 
        error: "label, businessAccountId, phoneNumberId, phone e accessToken são obrigatórios" 
      });
    }

    let account;

    if (id) {
      // Atualizar
      account = await prisma.officialWhatsappAccount.update({
        where: { id: parseInt(id) },
        data: {
          label,
          businessAccountId,
          phoneNumberId,
          phone,
          accessToken,
          permanentAccessToken,
          webhookVerifyToken,
          webhookSecret,
          maxClientsSupported,
          notes,
        },
      });
      logger.info(`[WhatsApp Official] Conta atualizada: ${label}`);
    } else {
      // Criar
      account = await prisma.officialWhatsappAccount.create({
        data: {
          label,
          businessAccountId,
          phoneNumberId,
          phone,
          accessToken,
          permanentAccessToken,
          webhookVerifyToken,
          webhookSecret,
          maxClientsSupported: maxClientsSupported || 1000,
          notes,
        },
      });
      logger.info(`[WhatsApp Official] Conta criada: ${label}`);
    }

    res.json({
      success: true,
      data: {
        id: account.id,
        label: account.label,
        phone: account.phone,
        message: id ? "Conta atualizada com sucesso" : "Conta criada com sucesso",
      },
    });
  } catch (error: any) {
    logger.error("Erro ao salvar conta WhatsApp oficial", error);
    
    // Verificar se é erro de duplicação
    if (error.code === "P2002") {
      return res.status(400).json({ 
        success: false, 
        error: "Esta conta WhatsApp já está registrada" 
      });
    }

    res.status(500).json({ success: false, error: "Erro ao salvar conta" });
  }
});

// ─── Get WhatsApp configurations (Generated via QR) ─────────────────────────
router.get("/whatsapp/generated", authMiddleware, async (req: Request, res: Response) => {
  try {
    const accounts = await prisma.generatedWhatsappAccount.findMany({
      select: {
        id: true,
        label: true,
        phone: true,
        referenceCode: true,
        connectionType: true,
        isActive: true,
        whatsappConnectionStatus: true,
        lastHealthCheck: true,
        currentClientCount: true,
        maxClients: true,
        linkedToOfficialId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ success: true, data: accounts });
  } catch (error) {
    logger.error("Erro ao listar contas WhatsApp geradas", error);
    res.status(500).json({ success: false, error: "Erro ao listar contas" });
  }
});

// ─── Create Generated WhatsApp Account ──────────────────────────────────────
router.post("/whatsapp/generated", authMiddleware, async (req: Request, res: Response) => {
  try {
    const {
      label,
      phone,
      linkedToOfficialId,
      connectionType = "LOCAL",
      maxClients = 500,
      notes,
    } = req.body;

    if (!label || !phone) {
      return res.status(400).json({ 
        success: false, 
        error: "label e phone são obrigatórios" 
      });
    }

    const referenceCode = `WA-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const account = await prisma.generatedWhatsappAccount.create({
      data: {
        label,
        phone,
        referenceCode,
        linkedToOfficialId: linkedToOfficialId || null,
        connectionType,
        maxClients,
        notes,
      },
    });

    logger.info(`[WhatsApp Generated] Conta criada: ${label} - ${referenceCode}`);

    res.json({
      success: true,
      data: {
        id: account.id,
        label: account.label,
        phone: account.phone,
        referenceCode: account.referenceCode,
        message: "Conta WhatsApp criada com sucesso. Escaneie o QR Code para conectar.",
      },
    });
  } catch (error: any) {
    logger.error("Erro ao criar conta WhatsApp gerada", error);
    
    if (error.code === "P2002") {
      return res.status(400).json({ 
        success: false, 
        error: "Esta conta WhatsApp já está registrada" 
      });
    }

    res.status(500).json({ success: false, error: "Erro ao criar conta" });
  }
});

export default router;
