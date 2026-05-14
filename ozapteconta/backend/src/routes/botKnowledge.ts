import { Router, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../utils/logger";

const router = Router();
router.use(authMiddleware);

router.get("/", async (_req: Request, res: Response) => {
  const items = await prisma.botKnowledgeEntry.findMany({ orderBy: [{ priority: "asc" }, { id: "asc" }] });
  res.json(items);
});

router.post("/", async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;

  try {
    const title = String(body.title || "").trim();
    const keywords = String(body.keywords || "").trim();
    const content = String(body.content || "").trim();
    const enabled = body.enabled !== false;
    const priority = body.priority ? parseInt(String(body.priority), 10) : 100;

    if (!title || !keywords || !content) {
      res.status(400).json({ error: "title, keywords e content são obrigatórios" });
      return;
    }

    const created = await prisma.botKnowledgeEntry.create({
      data: { title, keywords, content, enabled, priority },
    });

    res.status(201).json(created);
  } catch (err) {
    logger.error("[BotKnowledge] Erro ao criar entrada", err);
    res.status(500).json({ error: "Erro ao criar entrada de conhecimento" });
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  const body = req.body as Record<string, unknown>;

  try {
    const updated = await prisma.botKnowledgeEntry.update({
      where: { id },
      data: {
        title: body.title !== undefined ? String(body.title).trim() : undefined,
        keywords: body.keywords !== undefined ? String(body.keywords).trim() : undefined,
        content: body.content !== undefined ? String(body.content).trim() : undefined,
        enabled: body.enabled !== undefined ? Boolean(body.enabled) : undefined,
        priority: body.priority !== undefined ? parseInt(String(body.priority), 10) : undefined,
      },
    });

    res.json(updated);
  } catch (err) {
    logger.error("[BotKnowledge] Erro ao atualizar entrada", err);
    res.status(500).json({ error: "Erro ao atualizar entrada de conhecimento" });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);

  try {
    await prisma.botKnowledgeEntry.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    logger.error("[BotKnowledge] Erro ao excluir entrada", err);
    res.status(500).json({ error: "Erro ao excluir entrada de conhecimento" });
  }
});

export default router;
