import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { logger } from "../utils/logger";

type JsonLike = Record<string, unknown> | Array<unknown> | string | number | boolean | null;

const SENSITIVE_KEYS = new Set([
  "password",
  "newPassword",
  "currentPassword",
  "passwordHash",
  "apiKey",
  "accessToken",
  "publicKey",
  "verifyToken",
  "webhookSecret",
  "merchantKey",
  "authorization",
  "token",
  "jwt",
  "secret",
]);

function sanitize(value: unknown): JsonLike {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitize(item));
  }

  if (typeof value === "object") {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(input)) {
      output[key] = SENSITIVE_KEYS.has(key) ? "[REDACTED]" : sanitize(entry);
    }
    return output;
  }

  return String(value);
}

function normalizePath(pathname: string) {
  return pathname.split("?")[0] || "/";
}

function inferEntity(pathname: string) {
  const segments = normalizePath(pathname).split("/").filter(Boolean);
  if (segments.length < 2) return { entityType: null as string | null, entityId: null as string | null };

  const routeSegments = segments.slice(1);
  let entityType = routeSegments[0] || null;
  let entityId: string | null = null;

  for (let index = routeSegments.length - 1; index >= 1; index -= 1) {
    const candidate = routeSegments[index];
    if (/^[a-zA-Z0-9_-]+$/.test(candidate) && !["activate", "regenerate-qr", "test", "status", "logs"].includes(candidate)) {
      entityId = candidate;
      entityType = routeSegments[index - 1] || entityType;
      break;
    }
  }

  return { entityType, entityId };
}

function inferAction(method: string, pathname: string) {
  const normalizedPath = normalizePath(pathname);
  if (normalizedPath.includes("/activate")) return "ACTIVATE";
  if (normalizedPath.includes("/regenerate-qr")) return "REGENERATE_QR";
  if (normalizedPath.includes("/change-password")) return "CHANGE_PASSWORD";
  if (normalizedPath.includes("/login")) return "LOGIN";
  if (normalizedPath.includes("/logout")) return "LOGOUT";
  if (normalizedPath.includes("/test")) return "TEST";
  if (normalizedPath.includes("/status")) return "STATUS_CHANGE";

  if (method === "GET") return "READ";
  if (method === "POST") return "CREATE";
  if (method === "PUT") return "UPDATE";
  if (method === "PATCH") return "PATCH";
  if (method === "DELETE") return "DELETE";
  return method;
}

function shouldSkipAudit(req: Request) {
  const pathname = normalizePath(req.originalUrl || req.url || "");
  if (pathname.startsWith("/api/client-portal")) return true;
  if (pathname.startsWith("/api/webhook")) return true;
  if (pathname.startsWith("/api/webhooks")) return true;
  if (pathname.startsWith("/api/admin/audit-logs")) return true;
  return false;
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  const sanitized = sanitize(value);
  if (sanitized === null) return Prisma.JsonNull;
  return sanitized as Prisma.InputJsonValue;
}

export async function recordAdminAuditLog(input: {
  req?: Request;
  adminUserId?: string | null;
  adminUsername?: string | null;
  adminRole?: string | null;
  method: string;
  path: string;
  action?: string;
  entityType?: string | null;
  entityId?: string | null;
  statusCode: number;
  success: boolean;
  requestBody?: unknown;
  queryParams?: unknown;
  details?: unknown;
}) {
  try {
    const pathname = normalizePath(input.path);
    const entity = inferEntity(pathname);
    const action = input.action || inferAction(input.method, pathname);
    const ipAddress = input.req?.ip || input.req?.socket?.remoteAddress || null;
    const userAgent = input.req?.headers["user-agent"] || null;

    await prisma.adminAuditLog.create({
      data: {
        adminUserId: input.adminUserId || null,
        adminUsername: input.adminUsername || null,
        adminRole: input.adminRole || null,
        method: input.method,
        path: pathname,
        action,
        entityType: input.entityType ?? entity.entityType,
        entityId: input.entityId ?? entity.entityId,
        statusCode: input.statusCode,
        success: input.success,
        ipAddress,
        userAgent,
        requestBody: toPrismaJson(input.requestBody),
        queryParams: toPrismaJson(input.queryParams),
        details: toPrismaJson(input.details),
      },
    });

    logger.info(`[AdminAudit] ${input.adminUsername || "unknown"} ${action} ${pathname} -> ${input.statusCode}`);
  } catch (error) {
    logger.error("[AdminAudit] Falha ao gravar log", error);
  }
}

export function auditAdminRequest(req: Request, res: Response, next: NextFunction) {
  res.on("finish", () => {
    if (!req.admin || req.admin.role === "CLIENT") return;
    if (shouldSkipAudit(req)) return;

    void recordAdminAuditLog({
      req,
      adminUserId: req.admin.id,
      adminUsername: req.admin.username,
      adminRole: req.admin.role,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      success: res.statusCode < 400,
      requestBody: req.method === "GET" ? undefined : req.body,
      queryParams: req.query,
    });
  });

  next();
}
