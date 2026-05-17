import { Router, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { authMiddleware } from "../middleware/auth";
import { testProvider } from "../services/aiService";
import { AiUsageStage, getAiUsageReport } from "../services/aiUsageMetricsService";
import { processReminders } from "../services/reminderService";
import { whatsappQrPairingService } from "../services/whatsappQrPairingService";
import { logger } from "../utils/logger";

const router = Router();
router.use(authMiddleware);

const AUDIO_CHAIN_KEY = "abacus_audio_model_chain";
const ALLOWED_AUDIO_MODELS = [
  "gpt-4o-audio-preview",
  "gpt-4o-mini-audio-preview",
];

function normalizeAudioModelChain(models: unknown): string[] {
  if (!Array.isArray(models)) return [];
  const cleaned = models
    .map((m) => String(m || "").trim())
    .filter(Boolean)
    .filter((m) => ALLOWED_AUDIO_MODELS.includes(m));
  return Array.from(new Set(cleaned));
}

function normalizeAiProviderModel(provider: string, model: unknown): string | undefined {
  const selected = String(model || "").trim();
  if (!selected) return undefined;

  const obsolete: Record<string, Record<string, string>> = {
    GEMINI: {
      "gemini-1.5-flash": "gemini-2.5-flash",
      "gemini-1.5-pro": "gemini-2.5-pro",
    },
    GROQ: {
      "llama3-8b-8192": "llama-3.1-8b-instant",
      "llama3-70b-8192": "llama-3.3-70b-versatile",
      "mixtral-8x7b-32768": "llama-3.1-8b-instant",
    },
    GROK: {
      "grok-beta": "grok-2-latest",
    },
    ABACUS: {
      "gpt-5": "gpt-4o-mini",
      "gpt-4o-audio-preview": "gpt-4o-mini",
      "gpt-4o-mini-audio-preview": "gpt-4o-mini",
      "gemini-2.5-pro": "gpt-4o-mini",
    },
  };

  return obsolete[provider]?.[selected] || selected;
}

// ─── WhatsApp Config ──────────────────────────────────────────────────────────
router.get("/whatsapp", async (_req: Request, res: Response) => {
  const cfg = await prisma.whatsappConfig.findFirst();
  // Mascara o token por segurança
  if (cfg?.accessToken) {
    (cfg as Record<string, unknown>).accessToken = cfg.accessToken.substring(0, 10) + "...";
  }
  res.json(cfg || {});
});

router.put("/whatsapp", async (req: Request, res: Response) => {
  const { accessToken, phoneNumberId, verifyToken, businessAccountId, enabled } = req.body as {
    accessToken?: string; phoneNumberId?: string; verifyToken?: string;
    businessAccountId?: string; enabled?: boolean;
  };

  try {
    const existing = await prisma.whatsappConfig.findFirst();
    const data: Record<string, unknown> = {};
    if (accessToken && !accessToken.includes("...")) data.accessToken = accessToken;
    if (phoneNumberId !== undefined) data.phoneNumberId = phoneNumberId;
    if (verifyToken !== undefined) data.verifyToken = verifyToken;
    if (businessAccountId !== undefined) data.businessAccountId = businessAccountId;
    if (enabled !== undefined) data.enabled = enabled;

    const cfg = existing
      ? await prisma.whatsappConfig.update({ where: { id: existing.id }, data })
      : await prisma.whatsappConfig.create({ data });

    res.json({ success: true, id: cfg.id });
  } catch (err) {
    logger.error("[Settings] Erro ao salvar config WhatsApp:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// ─── AI Providers ─────────────────────────────────────────────────────────────
router.get("/ai-providers", async (_req: Request, res: Response) => {
  const providers = await prisma.aiProviderConfig.findMany({ orderBy: { id: "asc" } });
  // Mascara API keys
  const masked = providers.map((p) => ({
    ...p,
    apiKey: p.apiKey ? p.apiKey.substring(0, 8) + "..." : null,
  }));
  res.json(masked);
});

router.put("/ai-providers/:provider", async (req: Request, res: Response) => {
  const provider = String(req.params.provider || "");
  const { apiKey, model, apiUrl, enabled, isDefault, isAudioDefault } = req.body as {
    apiKey?: string; model?: string; apiUrl?: string; enabled?: boolean; isDefault?: boolean; isAudioDefault?: boolean;
  };

  try {
    const data: Record<string, unknown> = {};
    if (apiKey && !apiKey.includes("...")) data.apiKey = apiKey;
    if (model !== undefined) data.model = normalizeAiProviderModel(provider, model);
    if (apiUrl !== undefined) data.apiUrl = apiUrl;
    if (enabled !== undefined) data.enabled = enabled;
    if (isDefault !== undefined) {
      data.isDefault = isDefault;
      // Remove default de outros provedores
      if (isDefault) {
        await prisma.aiProviderConfig.updateMany({
          where: { provider: { not: provider as "BUILTIN" | "OPENAI" | "GEMINI" | "GROQ" | "GROK" | "OLLAMA" | "ABACUS" } },
          data: { isDefault: false },
        });
      }
    }
    if (isAudioDefault !== undefined) {
      data.isAudioDefault = isAudioDefault;
      // Remove padrão de áudio de outros provedores
      if (isAudioDefault) {
        await prisma.aiProviderConfig.updateMany({
          where: { provider: { not: provider as "BUILTIN" | "OPENAI" | "GEMINI" | "GROQ" | "GROK" | "OLLAMA" | "ABACUS" } },
          data: { isAudioDefault: false },
        });
      }
    }

    await prisma.aiProviderConfig.update({
      where: { provider: provider as "BUILTIN" | "OPENAI" | "GEMINI" | "GROQ" | "GROK" | "OLLAMA" | "ABACUS" },
      data,
    });

    res.json({ success: true });
  } catch (err) {
    logger.error("[Settings] Erro ao atualizar provedor:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// Cria um novo provedor (upsert — recria se foi deletado)
router.post("/ai-providers", async (req: Request, res: Response) => {
  const { provider, displayName, model, apiUrl } = req.body as {
    provider?: string; displayName?: string; model?: string; apiUrl?: string;
  };

  const VALID = ["OPENAI", "GEMINI", "GROQ", "GROK", "OLLAMA", "ABACUS"] as const;
  type ValidProvider = typeof VALID[number];

  if (!provider || !VALID.includes(provider as ValidProvider)) {
    res.status(400).json({ error: "Provedor inválido" });
    return;
  }

  try {
    const existing = await prisma.aiProviderConfig.findUnique({
      where: { provider: provider as ValidProvider },
    });
    if (existing) {
      res.status(409).json({ error: "Provedor já existe" });
      return;
    }

    await prisma.aiProviderConfig.create({
      data: {
        provider: provider as ValidProvider,
        displayName: displayName || provider,
        model: normalizeAiProviderModel(provider, model) || null,
        apiUrl: apiUrl || null,
        enabled: false,
        isDefault: false,
      },
    });

    res.json({ success: true });
  } catch (err) {
    logger.error("[Settings] Erro ao criar provedor:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

router.post("/ai-providers/:provider/test", async (req: Request, res: Response) => {
  const provider = String(req.params.provider || "");
  const { apiKey, model, apiUrl } = req.body as { apiKey?: string; model?: string; apiUrl?: string };

  try {
    const cfg = await prisma.aiProviderConfig.findUnique({
      where: { provider: provider as "BUILTIN" | "OPENAI" | "GEMINI" | "GROQ" | "GROK" | "OLLAMA" | "ABACUS" },
    });

    const key = (apiKey && !apiKey.includes("...")) ? apiKey : cfg?.apiKey;
    const requiresApiKey = provider !== "OLLAMA";
    if (requiresApiKey && !key) {
      res.status(400).json({ ok: false, message: "API key não configurada" });
      return;
    }

    const result = await testProvider(
      provider,
      key || "",
      normalizeAiProviderModel(provider, model || cfg?.model) || "gpt-4o-mini",
      apiUrl || cfg?.apiUrl || undefined
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
});

// ─── Abacus Audio Model Chain ────────────────────────────────────────────────
router.get("/audio-model-chain", async (_req: Request, res: Response) => {
  const saved = await prisma.systemSetting.findUnique({ where: { key: AUDIO_CHAIN_KEY } });
  const fallback = ALLOWED_AUDIO_MODELS;
  const models = saved?.value
    ? saved.value.split(",").map((item) => item.trim()).filter((m) => ALLOWED_AUDIO_MODELS.includes(m))
    : fallback;

  res.json({
    models: models.length > 0 ? models : fallback,
    allowedModels: ALLOWED_AUDIO_MODELS,
  });
});

router.put("/audio-model-chain", async (req: Request, res: Response) => {
  const { models } = req.body as { models?: string[] };
  const normalized = normalizeAudioModelChain(models);

  if (normalized.length === 0) {
    res.status(400).json({
      error: "Lista de modelos inválida. Informe ao menos 1 modelo permitido.",
      allowedModels: ALLOWED_AUDIO_MODELS,
    });
    return;
  }

  await prisma.systemSetting.upsert({
    where: { key: AUDIO_CHAIN_KEY },
    create: { key: AUDIO_CHAIN_KEY, value: normalized.join(",") },
    update: { value: normalized.join(",") },
  });

  res.json({ success: true, models: normalized });
});

router.get("/ai-usage-report", async (req: Request, res: Response) => {
  const daysRaw = String(req.query.days || "7");
  const days = Math.max(1, Math.min(90, parseInt(daysRaw, 10) || 7));
  const stageRaw = String(req.query.stage || "all").toLowerCase();
  const stage: AiUsageStage = stageRaw === "extract" || stageRaw === "transcribe" ? stageRaw : "all";
  const report = await getAiUsageReport(days, stage);
  res.json({ ...report, days, stage });
});

// ─── Áudios ───────────────────────────────────────────────────────────────────
router.get("/audios", async (req: Request, res: Response) => {
  const { page = "1", reviewed } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * 20;

  const where: Record<string, unknown> = {};
  if (reviewed !== undefined) where.reviewed = reviewed === "true";

  const [audios, total] = await Promise.all([
    prisma.audioMessage.findMany({
      where, skip, take: 20,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, phone: true } }, transaction: { select: { tipo: true, valor: true } } },
    }),
    prisma.audioMessage.count({ where }),
  ]);

  res.json({ audios, total, page: parseInt(page) });
});

router.patch("/audios/:id/review", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  await prisma.audioMessage.update({
    where: { id },
    data: { reviewed: true, reviewedAt: new Date(), reviewedBy: req.admin?.username },
  });
  res.json({ success: true });
});

// ─── Usuários WhatsApp ────────────────────────────────────────────────────────
router.get("/whatsapp-users", async (req: Request, res: Response) => {
  const { page = "1" } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * 20;

  const [users, total] = await Promise.all([
    prisma.whatsappUser.findMany({
      skip, take: 20,
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { transactions: true, audioMessages: true } } },
    }),
    prisma.whatsappUser.count(),
  ]);

  res.json({
    users: users.map((user) => ({
      ...user,
      resolvedPhone: whatsappQrPairingService.resolveRealPhoneFromStoredIdentifier(user.phone),
      displayPhone: whatsappQrPairingService.buildPhoneDisplay(user.phone),
    })),
    total,
    page: parseInt(page),
  });
});

// ─── Lembretes manuais ────────────────────────────────────────────────────────
router.post("/reminders/run", async (_req: Request, res: Response) => {
  try {
    const result = await processReminders();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
