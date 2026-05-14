import { Router, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../utils/logger";
import { normalizePhoneToE164, isValidBrazilianPhone, testWhatsappConnection } from "../services/whatsappHealthService";
import { whatsappQrPairingService } from "../services/whatsappQrPairingService";

const router = Router();
router.use(authMiddleware);

function makeReferenceCode(label: string) {
  const base = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase() || "BOT";
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${base}-${suffix}`;
}

router.get("/", async (_req: Request, res: Response) => {
  const accounts = await prisma.generatedWhatsappAccount.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { clients: true } },
    },
  });

  res.json(accounts);
});

router.post("/", async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;

  try {
    // Gera label automático se não fornecido
    const now = new Date();
    const dateStr = now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
    const count = await prisma.generatedWhatsappAccount.count();
    const autoLabel = `Conta ${count + 1} - ${dateStr}`;
    const label = String(body.label || "").trim() || autoLabel;
    const referenceCode = makeReferenceCode(label);

    const created = await prisma.generatedWhatsappAccount.create({
      data: {
        label,
        phone: null,
        referenceCode,
        linkedToOfficialId: null,
        connectionType: "LOCAL",
        isActive: true,
        maxClients: 500,
        notes: null,
        whatsappConnectionStatus: "UNKNOWN",
        lastHealthCheck: new Date(),
      },
    });

    res.status(201).json({
      ...created,
      message: "Conta WhatsApp criada com sucesso",
    });
  } catch (err) {
    logger.error("[AdminWhatsappAccounts] Erro ao criar conta", err);
    if (String(err).includes("Unique constraint failed")) {
      res.status(400).json({ error: "Este número de telefone ou código referencial já existe" });
      return;
    }
    res.status(500).json({ error: "Erro ao criar conta WhatsApp" });
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  const body = req.body as Record<string, unknown>;

  try {
    // Validar número se fornecido
    if (body.phone) {
      const normalizedPhone = normalizePhoneToE164(String(body.phone));
      if (!isValidBrazilianPhone(normalizedPhone)) {
        res.status(400).json({
          error: "Número de telefone inválido. Use o formato +5511999999999",
          example: "+5511987654321",
        });
        return;
      }
    }

    // Atualização da conta gerada
    let updateData: any = {
      label: body.label !== undefined ? String(body.label).trim() : undefined,
      phone: body.phone !== undefined ? normalizePhoneToE164(String(body.phone)) : undefined,
      referenceCode: body.referenceCode !== undefined ? String(body.referenceCode).trim().toUpperCase() : undefined,
      linkedToOfficialId: body.linkedToOfficialId !== undefined ? Number(body.linkedToOfficialId) : undefined,
      connectionType: body.connectionType !== undefined ? String(body.connectionType).toUpperCase() : undefined,
      isActive: body.isActive !== undefined ? Boolean(body.isActive) : undefined,
      maxClients: body.maxClients !== undefined ? Math.max(parseInt(String(body.maxClients), 10), 1) : undefined,
      notes: body.notes !== undefined ? (String(body.notes).trim() || null) : undefined,
    };

    // Remover undefined
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

    const updated = await prisma.generatedWhatsappAccount.update({
      where: { id },
      data: updateData,
    });

    res.json(updated);
  } catch (err) {
    logger.error("[AdminWhatsappAccounts] Erro ao atualizar conta", err);
    if (String(err).includes("Unique constraint failed")) {
      res.status(400).json({ error: "Este número de telefone ou código referencial já existe" });
      return;
    }
    res.status(500).json({ error: "Erro ao atualizar conta WhatsApp" });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);

  try {
    const account = await prisma.generatedWhatsappAccount.findUnique({ where: { id } });
    if (!account) {
      res.status(404).json({ error: "Conta não encontrada" });
      return;
    }

    const inUseCount = await prisma.clientProfile.count({
      where: { assignedWhatsappAccountId: id },
    });

    if (inUseCount > 0) {
      res.status(400).json({
        error: `Conta em uso por ${inUseCount} cliente(s). Desative a conta em vez de excluir.`,
      });
      return;
    }

    // Deletar a conta
    await prisma.generatedWhatsappAccount.delete({ where: { id } });
    
    logger.info(`[AdminWhatsapp] Conta deletada: ${account.label} (${account.phone})`);
    res.json({ success: true, message: `Conta ${account.label} deletada com sucesso` });
  } catch (err) {
    logger.error("[AdminWhatsappAccounts] Erro ao excluir conta", err);
    res.status(500).json({ error: "Erro ao excluir conta WhatsApp" });
  }
});

export default router;

// ─── Health Check da conexão com WhatsApp Business API ─────────────────────────
router.post("/:id/health-check", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);

  try {
    const account = await prisma.generatedWhatsappAccount.findUnique({
      where: { id },
      include: { linkedToOfficial: true },
    });
    if (!account) {
      res.status(404).json({ error: "Conta não encontrada" });
      return;
    }

    if (!account.linkedToOfficial?.accessToken || !account.linkedToOfficial?.phoneNumberId) {
      res.status(400).json({
        error: "Conta sem vinculo oficial com credenciais. Vincule uma conta oficial para validar.",
        current: {
          hasLinkedOfficial: !!account.linkedToOfficialId,
          hasToken: !!account.linkedToOfficial?.accessToken,
          hasPhoneNumberId: !!account.linkedToOfficial?.phoneNumberId,
        },
      });
      return;
    }

    const healthCheck = await testWhatsappConnection(
      account.linkedToOfficial.phoneNumberId,
      account.linkedToOfficial.accessToken
    );

    // Atualizar status no banco
    await prisma.generatedWhatsappAccount.update({
      where: { id },
      data: {
        whatsappConnectionStatus: healthCheck.success ? "CONNECTED" : "DISCONNECTED",
        lastHealthCheckError: healthCheck.success ? null : healthCheck.message,
        lastHealthCheck: new Date(),
      },
    });

    res.json({
      accountId: id,
      label: account.label,
      phone: account.phone,
      status: healthCheck.success ? "✅ CONECTADO" : "❌ DESCONECTADO",
      success: healthCheck.success,
      message: healthCheck.message,
      details: healthCheck.details,
      lastCheck: new Date(),
    });
  } catch (err) {
    logger.error("[AdminWhatsapp] Erro ao fazer health check", err);
    res.status(500).json({ error: "Erro ao verificar status do WhatsApp" });
  }
});

// ─── Listar status de todas as contas ─────────────────────────────────────────
router.get("/status/all", async (_req: Request, res: Response) => {
  try {
    const accounts = await prisma.generatedWhatsappAccount.findMany({
      select: {
        id: true,
        label: true,
        phone: true,
        referenceCode: true,
        whatsappConnectionStatus: true,
        lastHealthCheck: true,
        lastHealthCheckError: true,
        isActive: true,
        _count: { select: { clients: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const formatted = accounts.map((acc: any) => ({
      ...acc,
      connectionIcon: acc.whatsappConnectionStatus === "CONNECTED" ? "✅" : acc.whatsappConnectionStatus === "DISCONNECTED" ? "❌" : "❓",
    }));

    res.json(formatted);
  } catch (err) {
    logger.error("[AdminWhatsapp] Erro ao listar status", err);
    res.status(500).json({ error: "Erro ao listar contas" });
  }
});

router.get("/:id/qr-link", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);

  const account = await prisma.generatedWhatsappAccount.findUnique({ where: { id } });
  if (!account) {
    res.status(404).json({ error: "Conta não encontrada" });
    return;
  }

  const base = await prisma.systemSetting.findUnique({ where: { key: "client_portal_base_url" } });
  const baseUrl = (base?.value || "http://localhost:5173").replace(/\/$/, "");
  const qrLink = `${baseUrl}/cliente?ref=${encodeURIComponent(account.referenceCode)}`;

  res.json({
    accountId: account.id,
    label: account.label,
    phone: account.phone,
    referenceCode: account.referenceCode,
    connectionStatus: account.whatsappConnectionStatus,
    qrLink,
    connectionIcon: account.whatsappConnectionStatus === "CONNECTED" ? "✅" : "❌",
  });
});

router.get("/qr-links/active", async (_req: Request, res: Response) => {
  const accounts = await prisma.generatedWhatsappAccount.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      label: true,
      phone: true,
      referenceCode: true,
      isActive: true,
      whatsappConnectionStatus: true,
    },
  });

  const base = await prisma.systemSetting.findUnique({ where: { key: "client_portal_base_url" } });
  const baseUrl = (base?.value || "http://localhost:5173").replace(/\/$/, "");

  const links = accounts.map((account) => {
    const qrLink = `${baseUrl}/cliente?ref=${encodeURIComponent(account.referenceCode)}`;
    return {
      accountId: account.id,
      label: account.label,
      phone: account.phone,
      referenceCode: account.referenceCode,
      isActive: account.isActive,
      connectionStatus: account.whatsappConnectionStatus,
      connectionIcon:
        account.whatsappConnectionStatus === "CONNECTED"
          ? "✅"
          : account.whatsappConnectionStatus === "DISCONNECTED"
            ? "❌"
            : "❓",
      qrLink,
    };
  });

  res.json({
    total: links.length,
    links,
  });
});

router.post("/:id/pairing/start", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const result = await whatsappQrPairingService.startPairing(id);
    res.json(result);
  } catch (err) {
    logger.error("[AdminWhatsapp] Erro ao iniciar pareamento", err);
    res.status(500).json({ success: false, status: "ERROR", message: "Erro ao iniciar pareamento" });
  }
});

router.get("/:id/pairing/status", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const result = await whatsappQrPairingService.getPairingStatus(id);
    res.json(result);
  } catch (err) {
    logger.error("[AdminWhatsapp] Erro ao consultar pareamento", err);
    res.status(500).json({ success: false, status: "ERROR", lastError: "Erro ao consultar pareamento" });
  }
});

router.post("/:id/pairing/disconnect", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const result = await whatsappQrPairingService.disconnect(id);
    res.json(result);
  } catch (err) {
    logger.error("[AdminWhatsapp] Erro ao desconectar pareamento", err);
    res.status(500).json({ success: false, message: "Erro ao desconectar" });
  }
});
