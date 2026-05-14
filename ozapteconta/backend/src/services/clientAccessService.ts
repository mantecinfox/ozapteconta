import bcrypt from "bcryptjs";
import { prisma } from "../config/prisma";
import { config } from "../config";

function randomPassword(length = 10): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

async function uniqueUsername(base: string): Promise<string> {
  let candidate = base;
  let tries = 0;
  while (tries < 20) {
    const exists = await prisma.clientProfile.findUnique({
      where: { portalUsername: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
    tries += 1;
    candidate = `${base}${Math.floor(Math.random() * 90 + 10)}`;
  }
  return `${base}${Date.now().toString().slice(-4)}`;
}

export async function issueClientPortalAccess(clientId: number, phone: string) {
  const digits = normalizePhoneDigits(phone);
  const base = `cliente${digits.slice(-6) || clientId}`;
  const username = await uniqueUsername(base);
  const plainPassword = randomPassword(12);
  const passwordHash = await bcrypt.hash(plainPassword, 10);

  await prisma.clientProfile.update({
    where: { id: clientId },
    data: {
      portalUsername: username,
      portalPasswordHash: passwordHash,
      portalAccessEnabled: true,
    },
  });

  const frontendBase = (config.frontendUrl || "http://localhost:5173").replace(/\/$/, "");

  return {
    username,
    password: plainPassword,
    loginLink: `${frontendBase}/cliente/login`,
  };
}
