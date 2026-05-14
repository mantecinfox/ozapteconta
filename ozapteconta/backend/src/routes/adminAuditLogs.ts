import { Router, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { authMiddleware } from "../middleware/auth";

const router = Router();

router.use(authMiddleware);

router.get("/", async (req: Request, res: Response) => {
  try {
    const page = Math.max(parseInt(String(req.query.page || "1"), 10), 1);
    const pageSize = Math.min(100, Math.max(parseInt(String(req.query.pageSize || "20"), 10), 1));
    const skip = (page - 1) * pageSize;

    const search = String(req.query.search || "").trim();
    const action = String(req.query.action || "").trim().toUpperCase();
    const method = String(req.query.method || "").trim().toUpperCase();
    const entityType = String(req.query.entityType || "").trim();
    const username = String(req.query.username || "").trim();
    const from = String(req.query.from || "").trim();
    const to = String(req.query.to || "").trim();

    const where: Record<string, unknown> = {};
    if (action) where.action = action;
    if (method) where.method = method;
    if (entityType) where.entityType = entityType;
    if (username) where.adminUsername = { contains: username, mode: "insensitive" };
    if (search) {
      where.OR = [
        { adminUsername: { contains: search, mode: "insensitive" } },
        { path: { contains: search, mode: "insensitive" } },
        { entityType: { contains: search, mode: "insensitive" } },
        { entityId: { contains: search, mode: "insensitive" } },
      ];
    }
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(`${to}T23:59:59.999`) } : {}),
      };
    }

    const [logs, total, groupedActions] = await Promise.all([
      prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.adminAuditLog.count({ where }),
      prisma.adminAuditLog.groupBy({
        by: ["action"],
        _count: { action: true },
        where,
        orderBy: { _count: { action: "desc" } },
      }),
    ]);

    res.json({
      logs,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      summary: {
        total,
        byAction: groupedActions.map((item: { action: string; _count: { action: number } }) => ({
          action: item.action,
          count: item._count.action,
        })),
      },
    });
  } catch {
    res.status(500).json({ error: "Erro ao carregar logs de auditoria" });
  }
});

export default router;
