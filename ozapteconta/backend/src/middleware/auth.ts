import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";

export interface AuthPayload {
  id: string;
  username: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      admin?: AuthPayload;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token não fornecido" });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const payload = jwt.verify(token, config.jwt.secret) as AuthPayload;
    req.admin = payload;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido ou expirado" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.admin?.role !== "ADMIN") {
    res.status(403).json({ error: "Acesso restrito a administradores" });
    return;
  }
  next();
}

export function requireClient(req: Request, res: Response, next: NextFunction): void {
  if (req.admin?.role !== "CLIENT") {
    res.status(403).json({ error: "Acesso restrito ao portal do cliente" });
    return;
  }
  next();
}
