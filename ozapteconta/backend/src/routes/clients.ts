import { Router, Request, Response } from "express";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { ClientPlan, ClientStatus } from "@prisma/client";
import { prisma } from "../config/prisma";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../utils/logger";
import { issueClientPortalAccess } from "../services/clientAccessService";
import infinityPayService from "../services/infinityPayService";
import { sendMessage } from "../services/whatsappService";
import { sendEmail } from "../services/emailService";
import { config } from "../config";
import { applyBillingCycleFromPayment } from "../services/subscriptionBillingCycleService";
import recurringBillingService from "../services/recurringBillingService";

const router = Router();
router.use(authMiddleware);

function normalizePhone(v: string) {
  return v.replace(/\D/g, "");
}

function normalizeCpf(v: string) {
  return v.replace(/\D/g, "");
}

function normalizeZip(v: string) {
  return v.replace(/\D/g, "");
}

function parsePlan(v: string): ClientPlan {
  const upper = String(v || "").toUpperCase();
  if (upper === "FULL") return "FULL";
  if (upper === "TRAVEL") return "TRAVEL";
  if (upper === "OFFICE") return "OFFICE";
  return "HOME";
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

async function deleteStoredAudios(keys: string[]) {
  const uniqueKeys = Array.from(new Set(keys.filter(Boolean)));
  await Promise.all(
    uniqueKeys.map(async (key) => {
      try {
        await fs.rm(path.join(config.storage.audioPath, key), { force: true });
      } catch (err) {
        logger.warn(`[Clients] Não foi possível remover o arquivo de áudio ${key}:`, err);
      }
    })
  );
}

// GET /api/clients/metrics — métricas de negócio do admin
router.get("/metrics", async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const [
      totalClients,
      activeClients,
      pendingClients,
      inactiveClients,
      newThisMonth,
      newLastMonth,
      byPlan,
      recentClients,
      recentPayments,
      paymentsPaidMonth,
      paymentsPendingMonth,
      growthLast6Months,
    ] = await Promise.all([
      prisma.clientProfile.count(),
      prisma.clientProfile.count({ where: { status: "ACTIVE" } }),
      prisma.clientProfile.count({ where: { status: "PENDING_ACTIVATION" } }),
      prisma.clientProfile.count({ where: { status: "INACTIVE" } }),
      prisma.clientProfile.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.clientProfile.count({ where: { createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } } }),
      prisma.clientProfile.groupBy({ by: ["plan"], _count: { id: true } }),
      prisma.clientProfile.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { id: true, fullName: true, phone: true, plan: true, status: true, createdAt: true, subscription: { select: { status: true, priceMonthly: true } } },
      }),
      prisma.payment.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, amount: true, status: true, chargedAt: true, createdAt: true, subscription: { select: { client: { select: { fullName: true, phone: true } } } } },
      }),
      prisma.payment.aggregate({ _sum: { amount: true }, where: { status: "APPROVED", chargedAt: { gte: startOfMonth } } }),
      prisma.payment.aggregate({ _sum: { amount: true }, where: { status: "PENDING", chargedAt: { gte: startOfMonth } } }),
      // crescimento mês a mês (últimos 6 meses)
      Promise.all(
        Array.from({ length: 6 }, (_, i) => {
          const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
          const de = new Date(now.getFullYear(), now.getMonth() - (5 - i) + 1, 0, 23, 59, 59);
          return prisma.clientProfile.count({ where: { createdAt: { gte: d, lte: de } } }).then((count) => ({
            month: d.toLocaleString("pt-BR", { month: "short", year: "2-digit" }),
            novos: count,
          }));
        })
      ),
    ]);

    const mrr = activeClients > 0
      ? await prisma.clientSubscription.aggregate({ _sum: { priceMonthly: true }, where: { status: "ACTIVE" } })
      : { _sum: { priceMonthly: 0 } };

    const planMap: Record<string, number> = {};
    byPlan.forEach((p) => { planMap[p.plan] = p._count.id; });

    res.json({
      totalClients,
      activeClients,
      pendingClients,
      inactiveClients,
      newThisMonth,
      newLastMonth,
      growthRate: newLastMonth > 0 ? ((newThisMonth - newLastMonth) / newLastMonth) : 0,
      byPlan: planMap,
      mrr: Number(mrr._sum?.priceMonthly || 0),
      revenueThisMonth: Number(paymentsPaidMonth._sum?.amount || 0),
      revenuePendingMonth: Number(paymentsPendingMonth._sum?.amount || 0),
      recentClients,
      recentPayments,
      growthLast6Months,
    });
  } catch (err) {
    logger.error("[Clients] Erro em metrics:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// GET /api/clients?page=1&search=...
router.get("/", async (req: Request, res: Response) => {
  const page = Math.max(parseInt(String(req.query.page || "1"), 10), 1);
  const search = String(req.query.search || "").trim();
  const skip = (page - 1) * 20;

  const where = search
    ? {
        OR: [
          { fullName: { contains: search, mode: "insensitive" as const } },
          { phone: { contains: search } },
          { cpf: { contains: search } },
          { email: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [clients, total] = await Promise.all([
    prisma.clientProfile.findMany({
      where,
      skip,
      take: 20,
      orderBy: { createdAt: "desc" },
      include: {
        assignedWhatsappAccount: true,
        subscription: { select: { status: true, priceMonthly: true } },
      },
    }),
    prisma.clientProfile.count({ where }),
  ]);

  res.json({ clients, total, page });
});

// GET /api/clients/:id
router.get("/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  const client = await prisma.clientProfile.findUnique({ where: { id } });

  if (!client) {
    res.status(404).json({ error: "Cliente não encontrado" });
    return;
  }

  res.json(client);
});

// POST /api/clients
router.post("/", async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;

  try {
    const clientType = String(body.clientType || "PF").toUpperCase() === "PJ" ? "PJ" : "PF";
    const fullName = String(body.fullName || "").trim();
    const phone = normalizePhone(String(body.phone || ""));
    const email = String(body.email || "").trim().toLowerCase() || null;
    const cpf = normalizeCpf(String(body.cpf || "")) || null;
    const cnpj = String(body.cnpj || "").replace(/\D/g, "") || null;
    const addressStreet = String(body.addressStreet || "").trim();
    const addressNumber = String(body.addressNumber || "").trim();
    const addressComplement = String(body.addressComplement || "").trim() || null;
    const addressNeighborhood = String(body.addressNeighborhood || "").trim();
    const addressCity = String(body.addressCity || "").trim();
    const addressState = String(body.addressState || "").trim().toUpperCase();
    const addressZipCode = normalizeZip(String(body.addressZipCode || ""));
    const plan = parsePlan(String(body.plan || "HOME"));
    const assignedWhatsappAccountId = body.assignedWhatsappAccountId
      ? parseInt(String(body.assignedWhatsappAccountId), 10)
      : null;

    if (!fullName || !phone) {
      res.status(400).json({ error: "Nome e telefone são obrigatórios" });
      return;
    }
    if (clientType === "PF" && !cpf) {
      res.status(400).json({ error: "CPF é obrigatório para Pessoa Física" });
      return;
    }
    if (clientType === "PJ" && !cnpj) {
      res.status(400).json({ error: "CNPJ é obrigatório para Pessoa Jurídica" });
      return;
    }

    const created = await prisma.clientProfile.create({
      data: {
        clientType,
        fullName,
        phone,
        email,
        cpf,
        cnpj,
        addressStreet,
        addressNumber,
        addressComplement,
        addressNeighborhood,
        addressCity,
        addressState,
        addressZipCode,
        plan,
        status: "PENDING_ACTIVATION",
        primaryContext: "PESSOAL",
        assignedWhatsappAccountId,
      },
      include: { assignedWhatsappAccount: true },
    });

    // Gerar acesso ao portal
    const portalAccess = await issueClientPortalAccess(created.id, created.phone);

    // Buscar dados do plano
    const planData = await prisma.subscriptionPlan.findUnique({ where: { plan } });

    let subscription: any = null;
    let paymentLinkUrl: string | null = null;
    let paymentId: number | null = null;

    if (planData) {
      // Criar assinatura
      subscription = await prisma.clientSubscription.create({
        data: {
          clientId: created.id,
          plan,
          priceMonthly: planData.priceMonthly,
          status: "PENDING",
        },
      });

      // Tentar criar cliente na InfinityPay
      const customerResult = await infinityPayService.createCustomer({
        email: email || phone,
        name: fullName,
        cpf: cpf || undefined,
        phone,
      });

      if (customerResult.success && customerResult.data?.id) {
        await prisma.clientSubscription.update({
          where: { id: subscription.id },
          data: { infinityPayCustomerId: customerResult.data.id },
        });
      }

      // Criar link de pagamento InfinityPay
      const pendingPayment = await prisma.payment.create({
        data: {
          subscriptionId: subscription.id,
          amount: planData.priceMonthly,
          status: "PENDING",
          paymentMethod: "PIX",
          description: `${planData.displayName} - ozapteconta (1º mês)`,
        },
      });
      paymentId = pendingPayment.id;

      const linkResult = await infinityPayService.createPaymentLink({
        amount: Number(planData.priceMonthly),
        description: `${planData.displayName} - ozapteconta (1º mês)`,
        customer_email: email || phone,
        customer_name: fullName,
        customer_cpf: cpf || undefined,
        customer_phone: phone,
        payment_methods: ["pix", "credit_card", "boleto"],
        expires_in: 86400 * 3, // 3 dias
        metadata: {
          subscription_id: subscription.id,
          client_id: created.id,
          payment_id: pendingPayment.id,
          plan,
          initial: true,
        },
      });

      if (linkResult.success) {
        paymentLinkUrl = linkResult.data?.resolved_url || linkResult.data?.url || null;

        await prisma.payment.update({
          where: { id: pendingPayment.id },
          data: {
            infinityPayTransactionId: linkResult.data?.id,
          },
        });

        await prisma.paymentLog.create({
          data: {
            paymentId: pendingPayment.id,
            action: "payment_link_created",
            details: linkResult.data,
          },
        });

        logger.info(`[Clients] Payment link gerado para ${fullName}: ${paymentLinkUrl}`);
      } else {
        await prisma.payment.update({
          where: { id: pendingPayment.id },
          data: {
            status: "FAILED",
            failureReason: linkResult.error || "Falha ao criar link de pagamento",
          },
        });
        logger.warn(`[Clients] Falha ao criar payment link para ${created.id}: ${linkResult.error}`);
      }
    }

    // Montar e enviar mensagem de boas-vindas via WhatsApp
    const botPhone = (created as any).assignedWhatsappAccount?.phone || null;
    const frontendBase = (config.frontendUrl || "http://localhost:5173").replace(/\/$/, "");

    let paymentLinkMessageSent = false;
    if (paymentLinkUrl) {
      const paymentMsg =
        `💳 *LINK DE PAGAMENTO*\n` +
        `Olá, ${fullName}! Seu link para ativação do ozapteconta já está pronto:\n` +
        `${paymentLinkUrl}\n\n` +
        `Após a confirmação do pagamento, sua conta será ativada automaticamente.`;

      paymentLinkMessageSent = await sendMessage(phone, paymentMsg);
      if (!paymentLinkMessageSent) {
        logger.warn(`[Clients] Não foi possível enviar mensagem dedicada com link de pagamento para ${phone}`);
      }

      if (created.email) {
        await sendEmail({
          to: created.email,
          subject: `Link de pagamento - ${planData?.displayName || plan}`,
          text: `Olá, ${fullName}!\n\nSeu link de pagamento para ativação do ozapteconta está pronto:\n${paymentLinkUrl}\n\nApós a confirmação do pagamento, sua conta será ativada automaticamente.`,
          html: `<p>Olá, ${fullName}!</p><p>Seu link de pagamento para ativação do ozapteconta está pronto:</p><p><a href="${paymentLinkUrl}">${paymentLinkUrl}</a></p><p>Após a confirmação do pagamento, sua conta será ativada automaticamente.</p>`,
        });
      }
    }

    const welcomeMsg = buildWelcomeMessage({
      clientName: fullName,
      planDisplayName: planData?.displayName || plan,
      priceMonthly: Number(planData?.priceMonthly || 0),
      paymentLinkUrl,
      portalLoginUrl: `${frontendBase}/cliente/login`,
      username: portalAccess.username,
      password: portalAccess.password,
      botPhone,
    });

    const wppSent = await sendMessage(phone, welcomeMsg);
    if (!wppSent) {
      logger.warn(`[Clients] Mensagem de boas-vindas não pôde ser enviada para ${phone}`);
    }

    res.status(201).json({
      ...created,
      portalAccess,
      subscription,
      paymentLinkUrl,
      paymentId,
      paymentLinkMessageSent,
      welcomeMessageSent: wppSent,
    });
  } catch (err) {
    logger.error("[Clients] Erro ao criar cliente", err);
    res.status(500).json({ error: "Erro ao criar cliente" });
  }
});

// ─── Helper: montar mensagem de boas-vindas completa ─────────────────────────
function buildWelcomeMessage(params: {
  clientName: string;
  planDisplayName: string;
  priceMonthly: number;
  paymentLinkUrl: string | null;
  portalLoginUrl: string;
  username: string;
  password: string;
  botPhone: string | null;
}): string {
  const { clientName, planDisplayName, priceMonthly, paymentLinkUrl, portalLoginUrl, username, password, botPhone } = params;

  const paymentSection = paymentLinkUrl
    ? `💳 *PAGAMENTO — 1º MÊS*\nClique no link abaixo para pagar via PIX, cartão ou boleto:\n${paymentLinkUrl}\n⏳ Prazo: 3 dias\n\nApós a confirmação, sua conta será ativada automaticamente! ✅`
    : `💳 *PAGAMENTO*\nNosso time entrará em contato em breve com o link de pagamento.\nValor: *R$ ${priceMonthly.toFixed(2)}/mês*`;

  const botSection = botPhone
    ? `📱 *SEU BOT FINANCEIRO*\nAdicione este número e comece a usar:\n📞 *${botPhone}*\n\nExemplos de uso:\n• "paguei conta de luz R$ 150"\n• "recebi aluguel R$ 1.200"\n• Pode enviar áudios também! 🎤`
    : `📱 *SEU BOT FINANCEIRO*\nEm breve você receberá o número do seu bot personalizado.`;

  return (
    `👋 *Bem-vindo(a) ao ozapteconta, ${clientName}!*\n` +
    `Seu cadastro foi realizado com sucesso! 🎉\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📋 *SEU PLANO*\n` +
    `Plano: *${planDisplayName}*\n` +
    `Valor: *R$ ${priceMonthly.toFixed(2)}/mês*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${paymentSection}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🔐 *PORTAL DO CLIENTE*\n` +
    `Acesse seus relatórios financeiros:\n` +
    `🌐 ${portalLoginUrl}\n` +
    `👤 Usuário: *${username}*\n` +
    `🔑 Senha: *${password}*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${botSection}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `Dúvidas? Responda esta mensagem. 😊`
  );
}

// PUT /api/clients/:id
router.put("/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  const body = req.body as Record<string, unknown>;

  try {
    const updated = await prisma.clientProfile.update({
      where: { id },
      data: {
        clientType: body.clientType ? String(body.clientType).toUpperCase() : undefined,
        fullName: String(body.fullName || "").trim(),
        phone: normalizePhone(String(body.phone || "")),
        email: String(body.email || "").trim().toLowerCase() || null,
        cpf: body.cpf ? normalizeCpf(String(body.cpf)) || null : null,
        cnpj: body.cnpj ? String(body.cnpj).replace(/\D/g, "") || null : null,
        addressStreet: String(body.addressStreet || "").trim(),
        addressNumber: String(body.addressNumber || "").trim(),
        addressComplement: String(body.addressComplement || "").trim() || null,
        addressNeighborhood: String(body.addressNeighborhood || "").trim(),
        addressCity: String(body.addressCity || "").trim(),
        addressState: String(body.addressState || "").trim().toUpperCase(),
        addressZipCode: normalizeZip(String(body.addressZipCode || "")),
        plan: parsePlan(String(body.plan || "HOME")),
        status: (body.status as ClientStatus) || undefined,
        assignedWhatsappAccountId:
          body.assignedWhatsappAccountId !== undefined
            ? body.assignedWhatsappAccountId
              ? parseInt(String(body.assignedWhatsappAccountId), 10)
              : null
            : undefined,
      },
    });

    res.json(updated);
  } catch (err) {
    logger.error("[Clients] Erro ao atualizar cliente", err);
    res.status(500).json({ error: "Erro ao atualizar cliente" });
  }
});

// DELETE /api/clients/:id
router.delete("/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);

  try {
    const client = await prisma.clientProfile.findUnique({
      where: { id },
      include: {
        subscription: true,
        assignedWhatsappAccount: { select: { id: true, label: true } },
      },
    });

    if (!client) {
      res.status(404).json({ error: "Cliente não encontrado" });
      return;
    }

    const confirmDelete = req.body?.confirmDelete === true;
    const confirmationName = String(req.body?.confirmationName || "").trim();
    if (!confirmDelete || confirmationName !== client.fullName) {
      res.status(400).json({
        error: "Confirmação inválida para exclusão do cliente.",
        expectedName: client.fullName,
      });
      return;
    }

    if (client.subscription?.infinityPaySubscriptionId) {
      const cancelResult = await infinityPayService.cancelSubscription(client.subscription.infinityPaySubscriptionId);
      if (!cancelResult.success) {
        logger.warn(
          `[Clients] Falha ao cancelar assinatura InfinityPay ${client.subscription.infinityPaySubscriptionId} antes da exclusão do cliente ${id}: ${cancelResult.error}`
        );
      }
    }

    const fileKeys = await prisma.$transaction(async (tx) => {
      const transactions = await tx.financialTransaction.findMany({
        where: { userPhone: client.phone },
        select: { id: true, audioStorageKey: true },
      });

      const audios = await tx.audioMessage.findMany({
        where: { userPhone: client.phone },
        select: { storageKey: true },
      });

      const transactionIds = transactions.map((transaction) => transaction.id);
      const storageKeys = [
        ...audios.map((audio) => audio.storageKey),
        ...transactions.map((transaction) => transaction.audioStorageKey || ""),
      ].filter(Boolean);

      if (transactionIds.length > 0) {
        await tx.reminderJob.deleteMany({
          where: { transactionId: { in: transactionIds } },
        });
      }

      await tx.audioMessage.deleteMany({ where: { userPhone: client.phone } });
      await tx.financialTransaction.deleteMany({ where: { userPhone: client.phone } });
      await tx.whatsappUser.deleteMany({ where: { phone: client.phone } });
      await tx.clientProfile.delete({ where: { id: client.id } });

      return storageKeys;
    });

    await deleteStoredAudios(fileKeys);

    res.json({
      success: true,
      deletedClientId: client.id,
      deletedPhone: client.phone,
      deletedAudioFiles: fileKeys.length,
      message: "Cliente e todos os dados relacionados foram excluídos com sucesso.",
    });
  } catch (err) {
    logger.error("[Clients] Erro ao excluir cliente", err);
    res.status(500).json({ error: "Erro ao excluir cliente" });
  }
});

// POST /api/clients/:id/activate
router.post("/:id/activate", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);

  try {
    const client = await prisma.clientProfile.findUnique({
      where: { id },
      include: { subscription: true },
    });
    if (!client) {
      res.status(404).json({ error: "Cliente não encontrado" });
      return;
    }

    const activatedAt = new Date();

    await prisma.clientProfile.update({
      where: { id },
      data: { status: "ACTIVE", activatedAt },
    });

    if (client.subscription) {
      await applyBillingCycleFromPayment(client.subscription.id, activatedAt);
    }

    res.json({ success: true, message: "Cliente ativado com sucesso" });
  } catch (err) {
    logger.error("[Clients] Erro ao ativar cliente", err);
    res.status(500).json({ error: "Erro ao ativar cliente" });
  }
});

// POST /api/clients/:id/send-renewal-link
router.post("/:id/send-renewal-link", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);

  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "ID de cliente inválido" });
    return;
  }

  try {
    const client = await prisma.clientProfile.findUnique({
      where: { id },
      select: { id: true, fullName: true, phone: true },
    });

    if (!client) {
      res.status(404).json({ error: "Cliente não encontrado" });
      return;
    }

    const result = await recurringBillingService.sendRenewalLinkToClient(id);

    if (!result.success) {
      res.status(502).json({ error: result.error || "Falha ao enviar link de renovação" });
      return;
    }

    res.json({
      success: true,
      clientId: id,
      clientName: client.fullName,
      phone: client.phone,
      checkoutUrl: result.checkoutUrl,
      whatsappSent: result.whatsappSent,
      emailSent: result.emailSent,
    });
  } catch (err) {
    logger.error("[Clients] Erro ao enviar link de renovação", err);
    res.status(500).json({ error: "Erro ao enviar link de renovação" });
  }
});

// POST /api/clients/:id/regenerate-qr
router.post("/:id/regenerate-qr", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);

  try {
    const updated = await prisma.clientProfile.update({
      where: { id },
      data: {
        qrToken: randomUUID(),
        status: "PENDING_ACTIVATION",
        activatedAt: null,
      },
    });

    res.json(updated);
  } catch (err) {
    logger.error("[Clients] Erro ao regenerar QR", err);
    res.status(500).json({ error: "Erro ao regenerar QR" });
  }
});

// ─── Analytics ────────────────────────────────────────────────────────────────

// GET /api/clients/analytics/overview
router.get("/analytics/overview", async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = addDays(now, -30);

    const allClients = await prisma.clientProfile.findMany({
      include: { subscription: true },
    });

    const inadimplentes: { id: number; fullName: string; daysOverdue: number; amount: number }[] = [];
    const proximosVencimento: { id: number; fullName: string; daysRemaining: number; amount: number }[] = [];

    for (const client of allClients) {
      if (!client.subscription || client.status !== "ACTIVE") continue;
      const sub = client.subscription;
      if (!sub.nextBillingDate) continue;
      const daysUntil = Math.round(
        (new Date(sub.nextBillingDate).getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
      );
      const amount = Number(sub.priceMonthly);
      if (daysUntil < 0) {
        inadimplentes.push({ id: client.id, fullName: client.fullName, daysOverdue: Math.abs(daysUntil), amount });
      } else if (daysUntil <= 7) {
        proximosVencimento.push({ id: client.id, fullName: client.fullName, daysRemaining: daysUntil, amount });
      }
    }

    inadimplentes.sort((a, b) => b.daysOverdue - a.daysOverdue);
    proximosVencimento.sort((a, b) => a.daysRemaining - b.daysRemaining);

    // Distribuição de uso por serviço (últimos 30 dias)
    const serviceRaw = await prisma.clientInteractionLog.groupBy({
      by: ["intent"],
      where: { createdAt: { gte: thirtyDaysAgo } },
      _count: { id: true },
    });
    const serviceDistribution = serviceRaw.map((r) => ({ service: r.intent, count: r._count.id }));

    // Horários de pico (últimos 30 dias)
    const hourLogs = await prisma.clientInteractionLog.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
    });
    const peakHoursGlobal = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
    for (const log of hourLogs) {
      const h = new Date(log.createdAt).getHours();
      peakHoursGlobal[h].count += 1;
    }

    // Demografias
    const genderCounts = await prisma.clientProfile.groupBy({
      by: ["gender"],
      _count: { id: true },
    });
    const typeCounts = await prisma.clientProfile.groupBy({
      by: ["clientType"],
      _count: { id: true },
    });
    const pjCount = typeCounts.find((t) => t.clientType === "PJ")?._count.id ?? 0;
    const maleCount = genderCounts.find((g) => g.gender === "MALE")?._count.id ?? 0;
    const femaleCount = genderCounts.find((g) => g.gender === "FEMALE")?._count.id ?? 0;
    const demographicBreakdown = [
      { label: "Homem", count: maleCount },
      { label: "Mulher", count: femaleCount },
      { label: "Empresa", count: pjCount },
    ];

    // Tendência de crescimento (últimos 6 meses)
    const sixMonthsAgo = addDays(now, -180);
    const growthClients = await prisma.clientProfile.findMany({
      where: { createdAt: { gte: sixMonthsAgo } },
      select: { createdAt: true },
    });
    const growthMap: Record<string, number> = {};
    for (const c of growthClients) {
      const key = c.createdAt.toISOString().slice(0, 7);
      growthMap[key] = (growthMap[key] || 0) + 1;
    }
    const growthTrend = Object.entries(growthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count }));

    res.json({
      inadimplentes,
      proximosVencimento,
      serviceDistribution,
      peakHoursGlobal,
      demographicBreakdown,
      growthTrend,
    });
  } catch (err) {
    logger.error("[Clients] Erro ao buscar analytics overview:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// GET /api/clients/:id/analytics
router.get("/:id/analytics", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "ID inválido" });

  try {
    const client = await prisma.clientProfile.findUnique({
      where: { id },
      include: { subscription: true },
    });
    if (!client) return res.status(404).json({ error: "Cliente não encontrado" });

    const now = new Date();
    const thirtyDaysAgo = addDays(now, -30);
    const ninetyDaysAgo = addDays(now, -90);

    // Uso por serviço (30 dias)
    const serviceUsage30 = await prisma.clientInteractionLog.groupBy({
      by: ["intent"],
      where: { clientId: id, createdAt: { gte: thirtyDaysAgo } },
      _count: { id: true },
    });

    // Uso por serviço (90 dias)
    const serviceUsage90 = await prisma.clientInteractionLog.groupBy({
      by: ["intent"],
      where: { clientId: id, createdAt: { gte: ninetyDaysAgo } },
      _count: { id: true },
    });

    // Horários de pico do cliente
    const clientHourLogs = await prisma.clientInteractionLog.findMany({
      where: { clientId: id, createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
    });
    const peakHours = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
    for (const log of clientHourLogs) {
      peakHours[new Date(log.createdAt).getHours()].count += 1;
    }

    // Tendência diária (últimos 30 dias)
    const usageTrend: { date: string; count: number }[] = [];
    const trendMap: Record<string, number> = {};
    for (const log of clientHourLogs) {
      const key = log.createdAt.toISOString().slice(0, 10);
      trendMap[key] = (trendMap[key] || 0) + 1;
    }
    for (let d = 0; d < 30; d++) {
      const day = addDays(now, -d).toISOString().slice(0, 10);
      usageTrend.unshift({ date: day, count: trendMap[day] || 0 });
    }

    // Top serviços
    const sorted90 = [...serviceUsage90].sort((a, b) => b._count.id - a._count.id);
    const topServices = sorted90.map((s) => ({ service: s.intent, count: s._count.id }));

    // Subscription info
    let subscriptionInfo = null;
    if (client.subscription) {
      const sub = client.subscription;
      const daysRemaining = sub.nextBillingDate
        ? Math.round((new Date(sub.nextBillingDate).getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
        : null;
      const daysOfUse = client.activatedAt
        ? Math.round((now.getTime() - new Date(client.activatedAt).getTime()) / (24 * 60 * 60 * 1000))
        : 0;
      subscriptionInfo = {
        status: sub.status,
        plan: sub.plan,
        priceMonthly: Number(sub.priceMonthly),
        nextBillingDate: sub.nextBillingDate,
        lastBillingDate: sub.lastBillingDate,
        daysRemaining,
        daysOfUse,
      };
    }

    // Histórico de pagamentos
    const paymentHistory = client.subscription
      ? await prisma.payment.findMany({
          where: { subscriptionId: client.subscription.id },
          orderBy: { chargedAt: "desc" },
          take: 20,
          select: { id: true, amount: true, status: true, paymentMethod: true, chargedAt: true, createdAt: true },
        })
      : [];

    // Total de interações e média diária
    const totalInteractions = await prisma.clientInteractionLog.count({ where: { clientId: id } });
    const daysActive = client.activatedAt
      ? Math.max(1, Math.round((now.getTime() - new Date(client.activatedAt).getTime()) / (24 * 60 * 60 * 1000)))
      : 1;
    const avgPerDay = Math.round((totalInteractions / daysActive) * 10) / 10;

    res.json({
      serviceUsage: {
        last30Days: serviceUsage30.map((s) => ({ service: s.intent, count: s._count.id })),
        last90Days: serviceUsage90.map((s) => ({ service: s.intent, count: s._count.id })),
      },
      peakHours,
      usageTrend,
      topServices,
      subscriptionInfo,
      paymentHistory,
      totalInteractions,
      avgPerDay,
      demographics: {
        gender: client.gender,
        clientType: client.clientType,
      },
    });
  } catch (err) {
    logger.error("[Clients] Erro ao buscar analytics do cliente:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

export default router;
