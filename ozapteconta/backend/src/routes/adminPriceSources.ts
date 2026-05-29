/**
 * Rotas administrativas do comparador de preços.
 *
 * GET    /api/admin/price-sources             — lista fontes
 * PATCH  /api/admin/price-sources/:slug       — atualiza enabled/custo/rate limit/timeout/notes
 * GET    /api/admin/price-search-logs         — telemetria das últimas consultas
 * GET    /api/admin/price-search-stats        — agregação 7 dias (uso, erros por fonte)
 */

import { Router, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../utils/logger";

const router = Router();
router.use(authMiddleware);

router.get("/price-sources", async (_req: Request, res: Response) => {
  try {
    const sources = await prisma.priceSearchSource.findMany({
      orderBy: [{ enabled: "desc" }, { id: "asc" }],
    });
    res.json(sources);
  } catch (err) {
    logger.error(`[adminPriceSources] erro listando fontes: ${String(err)}`);
    res.status(500).json({ error: "Falha ao listar fontes" });
  }
});

router.patch("/price-sources/:slug", async (req: Request, res: Response) => {
  const slug = String(req.params.slug || "").trim();
  if (!slug) {
    res.status(400).json({ error: "slug é obrigatório" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const data: Record<string, unknown> = {};

  if (typeof body.enabled === "boolean") data.enabled = body.enabled;
  if (typeof body.costPerQueryCents === "number" && body.costPerQueryCents >= 0) {
    data.costPerQueryCents = Math.round(body.costPerQueryCents);
  }
  if (typeof body.rateLimitPerMin === "number" && body.rateLimitPerMin > 0) {
    data.rateLimitPerMin = Math.round(body.rateLimitPerMin);
  }
  if (typeof body.timeoutMs === "number" && body.timeoutMs >= 1000) {
    data.timeoutMs = Math.round(body.timeoutMs);
  }
  if (body.notes === null || typeof body.notes === "string") {
    data.notes = body.notes ? String(body.notes).slice(0, 2000) : null;
  }

  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: "Nenhum campo válido para atualização" });
    return;
  }

  try {
    const updated = await prisma.priceSearchSource.update({
      where: { slug },
      data,
    });
    res.json(updated);
  } catch (err) {
    logger.error(`[adminPriceSources] erro atualizando ${slug}: ${String(err)}`);
    res.status(500).json({ error: "Falha ao atualizar fonte" });
  }
});

router.get("/price-search-logs", async (req: Request, res: Response) => {
  const limitParam = Number(req.query.limit ?? 50);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 50;

  try {
    const logs = await prisma.priceSearchLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    res.json(logs);
  } catch (err) {
    logger.error(`[adminPriceSources] erro listando logs: ${String(err)}`);
    res.status(500).json({ error: "Falha ao listar logs" });
  }
});

router.get("/price-search-stats", async (_req: Request, res: Response) => {
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const logs = await prisma.priceSearchLog.findMany({
      where: { createdAt: { gte: since } },
      select: {
        sourceSlug: true,
        offersCount: true,
        errorMessage: true,
        latencyMs: true,
        fromCache: true,
        createdAt: true,
      },
    });

    const bySource = new Map<
      string,
      {
        sourceSlug: string;
        totalQueries: number;
        totalErrors: number;
        totalOffers: number;
        avgLatencyMs: number;
        cacheHits: number;
      }
    >();

    for (const log of logs) {
      const cur = bySource.get(log.sourceSlug) || {
        sourceSlug: log.sourceSlug,
        totalQueries: 0,
        totalErrors: 0,
        totalOffers: 0,
        avgLatencyMs: 0,
        cacheHits: 0,
      };
      cur.totalQueries += 1;
      cur.totalErrors += log.errorMessage ? 1 : 0;
      cur.totalOffers += log.offersCount;
      cur.avgLatencyMs += log.latencyMs || 0;
      cur.cacheHits += log.fromCache ? 1 : 0;
      bySource.set(log.sourceSlug, cur);
    }

    const stats = [...bySource.values()].map((s) => ({
      ...s,
      avgLatencyMs:
        s.totalQueries > 0 ? Math.round(s.avgLatencyMs / s.totalQueries) : 0,
    }));

    res.json({
      windowDays: 7,
      generatedAt: new Date().toISOString(),
      bySource: stats,
      totalQueries: logs.length,
    });
  } catch (err) {
    logger.error(`[adminPriceSources] erro nas estatisticas: ${String(err)}`);
    res.status(500).json({ error: "Falha ao gerar estatísticas" });
  }
});

export default router;
