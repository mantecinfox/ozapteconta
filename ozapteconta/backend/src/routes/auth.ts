import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../config/prisma";
import { config } from "../config";
import { authMiddleware, requireAdmin } from "../middleware/auth";
import { logger } from "../utils/logger";
import { recordAdminAuditLog } from "../services/adminAuditService";

const router = Router();

// POST /api/auth/login
router.post("/login", async (req: Request, res: Response) => {
  const { username, password } = req.body as { username: string; password: string };

  if (!username || !password) {
    res.status(400).json({ error: "Usuário e senha são obrigatórios" });
    return;
  }

  try {
    const admin = await prisma.adminUser.findUnique({ where: { username } });

    if (!admin || !admin.active) {
      await recordAdminAuditLog({
        req,
        adminUsername: username,
        method: "POST",
        path: req.originalUrl || req.url,
        action: "LOGIN_FAILED",
        statusCode: 401,
        success: false,
        requestBody: { username },
        details: { reason: "invalid_credentials" },
      });
      res.status(401).json({ error: "Credenciais inválidas" });
      return;
    }

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) {
      await recordAdminAuditLog({
        req,
        adminUserId: admin.id,
        adminUsername: admin.username,
        adminRole: admin.role,
        method: "POST",
        path: req.originalUrl || req.url,
        action: "LOGIN_FAILED",
        statusCode: 401,
        success: false,
        requestBody: { username },
        details: { reason: "invalid_credentials" },
      });
      res.status(401).json({ error: "Credenciais inválidas" });
      return;
    }

    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLogin: new Date() },
    });

    const token = jwt.sign(
      { id: admin.id, username: admin.username, role: admin.role },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn } as jwt.SignOptions
    );

    await recordAdminAuditLog({
      req,
      adminUserId: admin.id,
      adminUsername: admin.username,
      adminRole: admin.role,
      method: "POST",
      path: req.originalUrl || req.url,
      action: "LOGIN",
      statusCode: 200,
      success: true,
      requestBody: { username },
      details: { adminId: admin.id },
    });

    logger.info(`[Auth] Login: ${username}`);
    res.json({ token, user: { id: admin.id, username: admin.username, name: admin.name, role: admin.role } });
  } catch (err) {
    logger.error("[Auth] Erro no login:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// GET /api/auth/me
router.get("/me", authMiddleware, requireAdmin, (req: Request, res: Response) => {
  res.json({ user: req.admin });
});

// POST /api/auth/change-password
router.post("/change-password", authMiddleware, requireAdmin, async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };

  if (!currentPassword || !newPassword || newPassword.length < 6) {
    res.status(400).json({ error: "Senha atual e nova senha (mín. 6 caracteres) são obrigatórias" });
    return;
  }

  try {
    const admin = await prisma.adminUser.findUnique({ where: { id: req.admin!.id } });
    if (!admin) { res.status(404).json({ error: "Usuário não encontrado" }); return; }

    const valid = await bcrypt.compare(currentPassword, admin.passwordHash);
    if (!valid) { res.status(401).json({ error: "Senha atual incorreta" }); return; }

    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.adminUser.update({ where: { id: admin.id }, data: { passwordHash: hash } });

    res.json({ success: true });
  } catch (err) {
    logger.error("[Auth] Erro ao alterar senha:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

export default router;
