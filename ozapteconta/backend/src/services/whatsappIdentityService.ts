import crypto from "crypto";
import { prisma } from "../config/prisma";
import { logger } from "../utils/logger";
import { isPlausibleWhatsappPhone } from "../utils/whatsappPhoneUtils";

const ALIAS_KEY_PREFIX = "wa_alias:";
const ALIASES_KEY_PREFIX = "wa_aliases:";
const HASH_KEY_PREFIX = "wa_hash:";

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function normalizeWhatsappIdentifier(value: string): string {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";

  if (raw.endsWith("@lid")) return raw;

  if (raw.includes("@")) {
    const beforeAt = raw.split("@")[0] || "";
    const digits = beforeAt.replace(/\D/g, "");
    return digits || raw;
  }

  const digits = raw.replace(/\D/g, "");
  return digits || raw;
}

export function buildWhatsappIdentityHash(canonicalId: string): string {
  const normalized = normalizeWhatsappIdentifier(canonicalId);
  return crypto
    .createHash("sha256")
    .update(`ozapteconta:wa:${normalized}`)
    .digest("hex")
    .slice(0, 40);
}

function parseAliases(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return uniq(parsed.map((v) => String(v || "").trim()).filter(Boolean));
  } catch {
    return [];
  }
}

async function reconcileLegacyIdentifiers(alias: string, canonical: string): Promise<void> {
  const legacyCandidates = uniq([
    alias,
    alias.endsWith("@lid") ? alias.slice(0, -4) : "",
    canonical,
    canonical.endsWith("@lid") ? canonical.slice(0, -4) : "",
  ]).filter((value) => value !== canonical);

  if (legacyCandidates.length === 0) return;

  try {
    const profiles = await prisma.clientProfile.findMany({
      where: { phone: { in: legacyCandidates } },
      select: { id: true, phone: true },
    });

    for (const profile of profiles) {
      const conflict = await prisma.clientProfile.findFirst({
        where: { phone: canonical, NOT: { id: profile.id } },
        select: { id: true },
      });

      if (conflict) {
        logger.warn(
          `[WhatsappIdentity] Perfil legado ${profile.phone} não migrado para ${canonical} por conflito com perfil ${conflict.id}`,
        );
        continue;
      }

      await prisma.clientProfile.update({
        where: { id: profile.id },
        data: { phone: canonical },
      });
    }

    await prisma.$transaction(async (tx) => {
      const canonicalUser = await tx.whatsappUser.findUnique({
        where: { phone: canonical },
        select: {
          id: true,
          phone: true,
          name: true,
          conversationContext: true,
          isActive: true,
          totalTransactions: true,
          registrationStep: true,
          registrationData: true,
        },
      });

      const legacyUsers = await tx.whatsappUser.findMany({
        where: { phone: { in: legacyCandidates } },
        select: {
          id: true,
          phone: true,
          name: true,
          conversationContext: true,
          isActive: true,
          totalTransactions: true,
          registrationStep: true,
          registrationData: true,
        },
      });

      let canonicalId = canonicalUser?.id || null;
      let mergedTotal = canonicalUser?.totalTransactions ?? 0;
      let mergedName = canonicalUser?.name ?? null;
      let mergedConversationContext = canonicalUser?.conversationContext ?? null;
      let mergedRegistrationStep = canonicalUser?.registrationStep ?? null;
      let mergedRegistrationData = canonicalUser?.registrationData ?? null;
      let mergedIsActive = canonicalUser?.isActive ?? false;

      if (!canonicalId && legacyUsers.length > 0) {
        const first = legacyUsers[0];
        await tx.whatsappUser.update({
          where: { id: first.id },
          data: { phone: canonical },
        });
        canonicalId = first.id;
        mergedTotal = first.totalTransactions;
        mergedName = first.name;
        mergedConversationContext = first.conversationContext ?? null;
        mergedRegistrationStep = first.registrationStep ?? null;
        mergedRegistrationData = first.registrationData ?? null;
        mergedIsActive = first.isActive;
      }

      for (const legacy of legacyUsers) {
        if (legacy.id === canonicalId) continue;

        await tx.financialTransaction.updateMany({
          where: { userPhone: legacy.phone },
          data: { userPhone: canonical },
        });

        await tx.audioMessage.updateMany({
          where: { userPhone: legacy.phone },
          data: { userPhone: canonical },
        });

        mergedTotal += legacy.totalTransactions;
        mergedName = mergedName ?? legacy.name;
        mergedConversationContext = mergedConversationContext ?? legacy.conversationContext ?? null;
        mergedRegistrationStep = mergedRegistrationStep ?? legacy.registrationStep ?? null;
        mergedRegistrationData = mergedRegistrationData ?? legacy.registrationData ?? null;
        mergedIsActive = mergedIsActive || legacy.isActive;

        await tx.whatsappUser.delete({ where: { id: legacy.id } });
      }

      if (canonicalId) {
        await tx.whatsappUser.update({
          where: { id: canonicalId },
          data: {
            totalTransactions: mergedTotal,
            ...(mergedName ? { name: mergedName } : {}),
            ...(mergedConversationContext !== null ? { conversationContext: mergedConversationContext } : {}),
            ...(mergedRegistrationStep ? { registrationStep: mergedRegistrationStep } : {}),
            ...(mergedRegistrationData !== null ? { registrationData: mergedRegistrationData } : {}),
            isActive: mergedIsActive,
          },
        });
      }
    });
  } catch (err) {
    logger.error("[WhatsappIdentity] Falha ao reconciliar identificadores legados", err);
  }
}

export async function registerWhatsappIdentityAlias(aliasRaw: string, canonicalRaw: string): Promise<void> {
  const alias = normalizeWhatsappIdentifier(aliasRaw);
  const canonical = normalizeWhatsappIdentifier(canonicalRaw);
  if (!alias || !canonical) return;

  if (alias.endsWith("@lid") && !isPlausibleWhatsappPhone(canonical)) {
    logger.warn(`[WhatsappIdentity] Alias @lid ignorado — canonical inválido: ${canonicalRaw}`);
    return;
  }

  const aliasKey = `${ALIAS_KEY_PREFIX}${alias}`;
  const aliasesKey = `${ALIASES_KEY_PREFIX}${canonical}`;
  const hashKey = `${HASH_KEY_PREFIX}${canonical}`;
  const hash = buildWhatsappIdentityHash(canonical);

  try {
    await prisma.systemSetting.upsert({
      where: { key: aliasKey },
      update: { value: canonical },
      create: { key: aliasKey, value: canonical },
    });

    const currentAliasesSetting = await prisma.systemSetting.findUnique({ where: { key: aliasesKey } });
    const nextAliases = uniq([...parseAliases(currentAliasesSetting?.value), alias, canonical]);

    await prisma.systemSetting.upsert({
      where: { key: aliasesKey },
      update: { value: JSON.stringify(nextAliases) },
      create: { key: aliasesKey, value: JSON.stringify(nextAliases) },
    });

    await prisma.systemSetting.upsert({
      where: { key: hashKey },
      update: { value: hash },
      create: { key: hashKey, value: hash },
    });

    await reconcileLegacyIdentifiers(alias, canonical);
  } catch (err) {
    logger.error("[WhatsappIdentity] Falha ao registrar alias", err);
  }
}

export async function resolveWhatsappIdentity(inputRaw: string): Promise<{
  canonicalPhone: string;
  identityHash: string;
  aliases: string[];
}> {
  const normalized = normalizeWhatsappIdentifier(inputRaw);
  if (!normalized) {
    return { canonicalPhone: "", identityHash: "", aliases: [] };
  }

  const strippedLid = normalized.endsWith("@lid") ? normalized.slice(0, -4) : "";
  const legacyLidAlias = normalized && !normalized.endsWith("@lid") ? `${normalized}@lid` : "";
  let canonical = normalized;

  if (normalized.endsWith("@lid")) {
    const aliasSetting = await prisma.systemSetting.findUnique({
      where: { key: `${ALIAS_KEY_PREFIX}${normalized}` },
    });
    if (aliasSetting?.value) {
      const mapped = normalizeWhatsappIdentifier(aliasSetting.value);
      if (isPlausibleWhatsappPhone(mapped)) {
        canonical = mapped;
      }
    } else if (isPlausibleWhatsappPhone(strippedLid)) {
      canonical = strippedLid;
    } else {
      canonical = normalized;
    }
  } else if (isPlausibleWhatsappPhone(normalized)) {
    canonical = normalized;
  }

  const aliasKeys = uniq([
    `${ALIASES_KEY_PREFIX}${canonical}`,
    normalized ? `${ALIASES_KEY_PREFIX}${normalized}` : "",
    strippedLid ? `${ALIASES_KEY_PREFIX}${strippedLid}` : "",
    legacyLidAlias ? `${ALIASES_KEY_PREFIX}${legacyLidAlias}` : "",
  ]);

  const aliasSettings = await Promise.all(
    aliasKeys.map((key) => prisma.systemSetting.findUnique({ where: { key } })),
  );

  const aliases = uniq([
    canonical,
    normalized,
    strippedLid,
    legacyLidAlias,
    ...aliasSettings.flatMap((setting) => parseAliases(setting?.value)),
  ]);

  const hashKey = `${HASH_KEY_PREFIX}${canonical}`;
  const hashSetting = await prisma.systemSetting.findUnique({ where: { key: hashKey } });
  const identityHash = hashSetting?.value || buildWhatsappIdentityHash(canonical);

  if (!hashSetting) {
    await prisma.systemSetting.create({
      data: { key: hashKey, value: identityHash },
    }).catch(() => null);
  }

  if (
    !canonical.endsWith("@lid") &&
    !isPlausibleWhatsappPhone(canonical) &&
    canonical.length >= 14
  ) {
    canonical = `${canonical}@lid`;
  }

  return {
    canonicalPhone: canonical,
    identityHash,
    aliases,
  };
}
