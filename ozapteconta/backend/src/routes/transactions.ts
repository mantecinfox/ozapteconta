import { Router, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../utils/logger";

const router = Router();
router.use(authMiddleware);

// GET /api/transactions — listar com filtros
router.get("/", async (req: Request, res: Response) => {
  const {
    page = "1", limit = "20",
    status, natureza, categoria,
    phone, search,
    dateFrom, dateTo,
    orderBy = "createdAt", order = "desc",
  } = req.query as Record<string, string>;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const take = Math.min(parseInt(limit), 100);

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (natureza) where.natureza = natureza;
  if (categoria) where.categoria = categoria;
  if (phone) where.userPhone = { contains: phone };
  if (search) where.tipo = { contains: search, mode: "insensitive" };
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom && { gte: new Date(dateFrom) }),
      ...(dateTo && { lte: new Date(dateTo + "T23:59:59Z") }),
    };
  }

  try {
    const [transactions, total] = await Promise.all([
      prisma.financialTransaction.findMany({
        where,
        skip,
        take,
        orderBy: { [orderBy]: order },
        include: { user: { select: { name: true, phone: true } } },
      }),
      prisma.financialTransaction.count({ where }),
    ]);

    res.json({ transactions, total, page: parseInt(page), limit: take, pages: Math.ceil(total / take) });
  } catch (err) {
    logger.error("[Transactions] Erro ao listar:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// GET /api/transactions/metrics — métricas do dashboard
router.get("/metrics", async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const next7Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 23, 59, 59);
    const start14Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13);

    const [allPending, monthTransactions, overdue, totalUsers, dueNext7Days, topCategoriesMonth, last14DaysTransactions] = await Promise.all([
      prisma.financialTransaction.findMany({
        where: { status: { in: ["PENDENTE", "VENCIDO"] } },
        select: { valor: true, natureza: true, status: true },
      }),
      prisma.financialTransaction.findMany({
        where: { createdAt: { gte: startOfMonth, lte: endOfMonth } },
        select: { valor: true, natureza: true, status: true },
      }),
      prisma.financialTransaction.count({ where: { status: "VENCIDO" } }),
      prisma.whatsappUser.count({ where: { isActive: true } }),
      prisma.financialTransaction.count({
        where: {
          status: "PENDENTE",
          vencimento: {
            gte: startOfToday,
            lte: next7Days,
          },
        },
      }),
      prisma.financialTransaction.groupBy({
        by: ["categoria"],
        where: {
          natureza: "PAGAR",
          createdAt: { gte: startOfMonth, lte: endOfMonth },
        },
        _sum: { valor: true },
        _count: { _all: true },
        orderBy: {
          _sum: { valor: "desc" },
        },
        take: 5,
      }),
      prisma.financialTransaction.findMany({
        where: { createdAt: { gte: start14Days, lte: now } },
        select: { valor: true, natureza: true, createdAt: true },
      }),
    ]);

    const totalPagar = allPending.filter((t) => t.natureza === "PAGAR").reduce((s, t) => s + t.valor.toNumber(), 0);
    const totalReceber = allPending.filter((t) => t.natureza === "RECEBER").reduce((s, t) => s + t.valor.toNumber(), 0);
    const monthPago = monthTransactions.filter((t) => t.status === "PAGO" && t.natureza === "PAGAR").reduce((s, t) => s + t.valor.toNumber(), 0);
    const monthRecebido = monthTransactions.filter((t) => t.status === "PAGO" && t.natureza === "RECEBER").reduce((s, t) => s + t.valor.toNumber(), 0);

    const monthPagarCount = monthTransactions.filter((t) => t.natureza === "PAGAR").length;
    const monthReceberCount = monthTransactions.filter((t) => t.natureza === "RECEBER").length;
    const monthPaidCount = monthTransactions.filter((t) => t.status === "PAGO").length;

    const pendingOrOverduePagarCount = allPending.filter((t) => t.natureza === "PAGAR").length;
    const taxaInadimplencia = pendingOrOverduePagarCount > 0 ? overdue / pendingOrOverduePagarCount : 0;
    const aderenciaPagamentoMes = monthTransactions.length > 0 ? monthPaidCount / monthTransactions.length : 0;
    const ticketMedioPagarMes = monthPagarCount > 0 ? monthTransactions
      .filter((t) => t.natureza === "PAGAR")
      .reduce((s, t) => s + t.valor.toNumber(), 0) / monthPagarCount : 0;
    const ticketMedioReceberMes = monthReceberCount > 0 ? monthTransactions
      .filter((t) => t.natureza === "RECEBER")
      .reduce((s, t) => s + t.valor.toNumber(), 0) / monthReceberCount : 0;

    const fluxoMap = new Map<string, number>();
    for (let i = 13; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      fluxoMap.set(key, 0);
    }

    for (const tx of last14DaysTransactions) {
      const key = tx.createdAt.toISOString().slice(0, 10);
      const current = fluxoMap.get(key) ?? 0;
      const signedValue = tx.natureza === "RECEBER" ? tx.valor.toNumber() : -tx.valor.toNumber();
      fluxoMap.set(key, current + signedValue);
    }

    const fluxo14dias = Array.from(fluxoMap.entries()).map(([date, valor]) => ({
      date,
      valor,
    }));

    res.json({
      totalPagar,
      totalReceber,
      saldoProjetado: totalReceber - totalPagar,
      contasVencidas: overdue,
      contasVencendo7Dias: dueNext7Days,
      contasMes: monthTransactions.length,
      pagosNoMes: monthPago,
      recebidosNoMes: monthRecebido,
      usuariosAtivos: totalUsers,
      taxaInadimplencia,
      aderenciaPagamentoMes,
      ticketMedioPagarMes,
      ticketMedioReceberMes,
      topCategoriasPagarMes: topCategoriesMonth.map((row) => ({
        categoria: row.categoria,
        total: row._sum.valor?.toNumber() ?? 0,
        quantidade: row._count._all,
      })),
      fluxo14dias,
    });
  } catch (err) {
    logger.error("[Transactions] Erro nas métricas:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// GET /api/transactions/:id
router.get("/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  try {
    const t = await prisma.financialTransaction.findUnique({
      where: { id },
      include: { user: true, audioMessages: true, reminders: true },
    });
    if (!t) { res.status(404).json({ error: "Transação não encontrada" }); return; }
    res.json(t);
  } catch (err) {
    logger.error("[Transactions] Erro ao buscar:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// PATCH /api/transactions/:id
router.patch("/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  const { tipo, valor, natureza, categoria, vencimento, status, notes } = req.body as {
    tipo?: string; valor?: number; natureza?: string; categoria?: string;
    vencimento?: string; status?: string; notes?: string;
  };

  try {
    const updated = await prisma.financialTransaction.update({
      where: { id },
      data: {
        ...(tipo && { tipo }),
        ...(valor !== undefined && { valor }),
        ...(natureza && { natureza: natureza as "PAGAR" | "RECEBER" }),
        ...(categoria && { categoria }),
        ...(vencimento !== undefined && { vencimento: vencimento ? new Date(vencimento) : null }),
        ...(status && { status: status as "PENDENTE" | "PAGO" | "VENCIDO" | "CANCELADO" }),
        ...(notes !== undefined && { notes }),
        ...(status === "PAGO" && { paidAt: new Date() }),
      },
    });
    res.json(updated);
  } catch (err) {
    logger.error("[Transactions] Erro ao atualizar:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// DELETE /api/transactions/:id
router.delete("/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  try {
    await prisma.reminderJob.deleteMany({ where: { transactionId: id } });
    await prisma.audioMessage.updateMany({ where: { transactionId: id }, data: { transactionId: null } });
    await prisma.financialTransaction.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    logger.error("[Transactions] Erro ao deletar:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

export default router;
