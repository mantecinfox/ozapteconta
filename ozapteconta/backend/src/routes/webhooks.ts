import { Router, Request, Response } from "express";
import infinityPayService from "../services/infinityPayService";
import { prisma } from "../config/prisma";
import { logger } from "../utils/logger";

const router = Router();

/**
 * Webhook da InfinityPay
 * POST /api/webhooks/infinitypay
 */
router.post("/infinitypay", async (req: Request, res: Response) => {
  try {
    const signature = req.headers["x-infinitypay-signature"] as string;
    const payload = JSON.stringify(req.body);

    // Obter secret do banco de dados
    const config = await prisma.paymentGatewayConfig.findFirst({
      where: { provider: "infinitypay" },
      orderBy: { updatedAt: "desc" },
    });

    if (config?.infinityPayWebhookSecret) {
      // Validar assinatura somente quando houver secret configurado
      const isValid = infinityPayService.validateWebhookSignature(payload, signature, config.infinityPayWebhookSecret);

      if (!isValid) {
        logger.error("Invalid InfinityPay webhook signature");
        return res.status(401).json({ error: "Invalid signature" });
      }
    } else {
      logger.warn("InfinityPay webhook received without configured secret; processing without signature validation");
    }

    // Processar evento
    const event = req.body;
    await infinityPayService.processWebhookEvent(event);

    res.status(200).json({ ok: true });
  } catch (error) {
    logger.error("Error processing InfinityPay webhook:", error);
    // Retornar 200 mesmo com erro para não gerar retry infinito
    res.status(200).json({ ok: false });
  }
});

/**
 * Verificar saúde do webhook
 * GET /api/webhooks/health
 */
router.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

export default router;
