import { Router, Request, Response } from "express";
import { prisma } from "../config/prisma";
import infinityPayService from "../services/infinityPayService";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../utils/logger";

const router = Router();

/**
 * GET /api/subscriptions/plans
 * Listar planos disponíveis
 */
router.get("/plans", async (req: Request, res: Response) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      orderBy: { priceMonthly: "asc" },
    });

    res.json(plans);
  } catch (error) {
    logger.error("Error fetching subscription plans:", error);
    res.status(500).json({ error: "Failed to fetch plans" });
  }
});

/**
 * GET /api/subscriptions/my-subscription
 * Obter subscrição atual do cliente (requer QR token)
 */
router.get("/my-subscription", async (req: Request, res: Response) => {
  try {
    const qrToken = req.query.qrToken as string;
    if (!qrToken) {
      return res.status(400).json({ error: "qrToken required" });
    }

    const client = await prisma.clientProfile.findUnique({
      where: { qrToken },
      include: {
        subscription: {
          include: {
            payments: {
              where: { status: "APPROVED" },
              orderBy: { chargedAt: "desc" },
              take: 5,
            },
          },
        },
      },
    });

    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    res.json({
      client: {
        id: client.id,
        fullName: client.fullName,
        email: client.email,
        phone: client.phone,
      },
      subscription: client.subscription || null,
    });
  } catch (error) {
    logger.error("Error fetching client subscription:", error);
    res.status(500).json({ error: "Failed to fetch subscription" });
  }
});

/**
 * POST /api/subscriptions/upgrade
 * Realizar upgrade/downgrade de plano
 */
router.post("/upgrade", async (req: Request, res: Response) => {
  try {
    const { qrToken, plan, paymentMethod, cardData } = req.body;

    if (!qrToken || !plan) {
      return res.status(400).json({ error: "qrToken and plan required" });
    }

    // Validar se plano existe
    const planData = await prisma.subscriptionPlan.findUnique({
      where: { plan: plan as any },
    });

    if (!planData) {
      return res.status(404).json({ error: "Plan not found" });
    }

    // Obter cliente
    const client = await prisma.clientProfile.findUnique({
      where: { qrToken },
      include: { subscription: true },
    });

    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    // Criar ou atualizar subscrição
    let subscription = client.subscription;

    if (!subscription) {
      // Criar nova subscrição
      subscription = await prisma.clientSubscription.create({
        data: {
          clientId: client.id,
          plan: plan as any,
          priceMonthly: planData.priceMonthly,
          status: "PENDING",
        },
      });
    } else {
      // Atualizar subscrição existente
      subscription = await prisma.clientSubscription.update({
        where: { id: subscription.id },
        data: {
          plan: plan as any,
          priceMonthly: planData.priceMonthly,
          status: "PENDING",
        },
      });
    }

    // Criar pagamento na InfinityPay
    const customerResult = await infinityPayService.createCustomer({
      email: client.email || client.phone,
      name: client.fullName,
      cpf: client.cpf ?? undefined,
      phone: client.phone,
    });

    if (!customerResult.success) {
      return res.status(400).json({
        error: "Failed to create customer in payment system",
        details: customerResult.error,
      });
    }

    const customerId = customerResult.data?.id;

    // Atualizar subscrição com customer ID
    if (customerId) {
      await prisma.clientSubscription.update({
        where: { id: subscription.id },
        data: { infinityPayCustomerId: customerId },
      });
    }

    // Criar cobrança
    const chargeResult = await infinityPayService.createCharge({
      amount: Number(planData.priceMonthly),
      currency: "BRL",
      customer_email: client.email || client.phone,
      customer_name: client.fullName,
      customer_cpf: client.cpf ?? undefined,
      description: `${planData.displayName} Plan - ozapteconta`,
      payment_method: paymentMethod || "credit_card",
      auto_capture: true,
      metadata: {
        subscription_id: subscription.id,
        client_id: client.id,
        plan: plan,
      },
    });

    if (!chargeResult.success) {
      return res.status(400).json({
        error: "Failed to create charge",
        details: chargeResult.error,
      });
    }

    // Criar registro de pagamento
    const payment = await prisma.payment.create({
      data: {
        subscriptionId: subscription.id,
        infinityPayTransactionId: chargeResult.data?.id,
        amount: planData.priceMonthly,
        status: "PROCESSING",
        paymentMethod: paymentMethod || "CREDIT_CARD",
        description: `${planData.displayName} Plan - ozapteconta`,
      },
    });

    // Log
    await prisma.paymentLog.create({
      data: {
        paymentId: payment.id,
        action: "initiated",
        details: chargeResult.data,
      },
    });

    res.json({
      success: true,
      subscription: {
        id: subscription.id,
        plan: subscription.plan,
        status: subscription.status,
        price: planData.priceMonthly,
      },
      payment: {
        id: payment.id,
        status: payment.status,
        amount: payment.amount,
      },
      checkout: chargeResult.data?.checkout_url || null,
    });
  } catch (error) {
    logger.error("Error upgrading subscription:", error);
    res.status(500).json({ error: "Failed to upgrade subscription" });
  }
});

/**
 * POST /api/subscriptions/cancel
 * Cancelar subscrição
 */
router.post("/cancel", async (req: Request, res: Response) => {
  try {
    const { qrToken } = req.body;

    if (!qrToken) {
      return res.status(400).json({ error: "qrToken required" });
    }

    const client = await prisma.clientProfile.findUnique({
      where: { qrToken },
      include: { subscription: true },
    });

    if (!client || !client.subscription) {
      return res.status(404).json({ error: "Subscription not found" });
    }

    const subscription = client.subscription;

    // Cancelar na InfinityPay se houver ID
    if (subscription.infinityPaySubscriptionId) {
      const result = await infinityPayService.cancelSubscription(
        subscription.infinityPaySubscriptionId
      );

      if (!result.success) {
        logger.warn("Failed to cancel InfinityPay subscription:", result.error);
      }
    }

    // Cancelar no banco
    await prisma.clientSubscription.update({
      where: { id: subscription.id },
      data: {
        status: "CANCELED",
        cancellationDate: new Date(),
        cancellationReason: "Requested by user",
      },
    });

    res.json({
      success: true,
      message: "Subscription canceled successfully",
    });
  } catch (error) {
    logger.error("Error canceling subscription:", error);
    res.status(500).json({ error: "Failed to cancel subscription" });
  }
});

/**
 * GET /api/subscriptions/payment-history
 * Histórico de pagamentos
 */
router.get("/payment-history", async (req: Request, res: Response) => {
  try {
    const qrToken = req.query.qrToken as string;

    if (!qrToken) {
      return res.status(400).json({ error: "qrToken required" });
    }

    const client = await prisma.clientProfile.findUnique({
      where: { qrToken },
      include: {
        subscription: {
          include: {
            payments: {
              orderBy: { createdAt: "desc" },
              include: {
                logs: {
                  orderBy: { createdAt: "desc" },
                },
              },
            },
          },
        },
      },
    });

    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    const payments = client.subscription?.payments || [];

    res.json({
      clientId: client.id,
      paymentHistory: payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        status: p.status,
        date: p.chargedAt || p.createdAt,
        description: p.description,
        method: p.paymentMethod,
        logs: p.logs,
      })),
    });
  } catch (error) {
    logger.error("Error fetching payment history:", error);
    res.status(500).json({ error: "Failed to fetch payment history" });
  }
});

/**
 * Admin: GET /api/subscriptions/admin/all
 * Listar todas as subscrições (protegido)
 */
router.get("/admin/all", authMiddleware, async (req: Request, res: Response) => {
  try {
    const subscriptions = await prisma.clientSubscription.findMany({
      include: {
        client: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
          },
        },
        payments: {
          where: { status: "APPROVED" },
          orderBy: { chargedAt: "desc" },
          take: 3,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(subscriptions);
  } catch (error) {
    logger.error("Error fetching subscriptions:", error);
    res.status(500).json({ error: "Failed to fetch subscriptions" });
  }
});

/**
 * Admin: GET /api/subscriptions/admin/stats
 * Estatísticas de subscrições
 */
router.get("/admin/stats", authMiddleware, async (req: Request, res: Response) => {
  try {
    const stats = {
      total_active: await prisma.clientSubscription.count({
        where: { status: "ACTIVE" },
      }),
      total_pending: await prisma.clientSubscription.count({
        where: { status: "PENDING" },
      }),
      total_canceled: await prisma.clientSubscription.count({
        where: { status: "CANCELED" },
      }),
      total_suspended: await prisma.clientSubscription.count({
        where: { status: "SUSPENDED" },
      }),
      revenue_this_month: await prisma.payment.aggregate({
        where: {
          status: "APPROVED",
          chargedAt: {
            gte: new Date(new Date().setDate(1)),
          },
        },
        _sum: { amount: true },
      }),
      by_plan: await prisma.clientSubscription.groupBy({
        by: ["plan"],
        _count: {
          id: true,
        },
        where: { status: "ACTIVE" },
      }),
    };

    res.json(stats);
  } catch (error) {
    logger.error("Error fetching subscription stats:", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;
