import { AiProvider } from "@prisma/client";
import { prisma } from "../config/prisma";
import { logger } from "../utils/logger";

export type ProviderChannel = "text" | "audio";

export const TEXT_CAPABLE_PROVIDERS = new Set<AiProvider>([
  "OLLAMA",
  "ABACUS",
  "GEMINI",
  "GROQ",
  "OPENAI",
  "GROK",
]);

export const AUDIO_CAPABLE_PROVIDERS = new Set<AiProvider>([
  "ABACUS",
  "GEMINI",
  "GROQ",
  "OPENAI",
  "OLLAMA",
]);

/** Ordem legada usada só na migração inicial. */
const LEGACY_TEXT_ORDER: AiProvider[] = ["OLLAMA", "ABACUS", "GEMINI", "GROQ", "OPENAI", "GROK"];
const LEGACY_AUDIO_ORDER: AiProvider[] = ["ABACUS", "GEMINI", "GROQ", "OPENAI", "OLLAMA"];

type ProviderRow = {
  id: number;
  provider: AiProvider;
  enabled: boolean;
  isDefault: boolean;
  isAudioDefault: boolean;
  textPriority: number;
  audioPriority: number;
};

let migrationChecked = false;

function priorityField(channel: ProviderChannel): "textPriority" | "audioPriority" {
  return channel === "audio" ? "audioPriority" : "textPriority";
}

function capableSet(channel: ProviderChannel): Set<AiProvider> {
  return channel === "audio" ? AUDIO_CAPABLE_PROVIDERS : TEXT_CAPABLE_PROVIDERS;
}

function legacyOrder(channel: ProviderChannel): AiProvider[] {
  return channel === "audio" ? LEGACY_AUDIO_ORDER : LEGACY_TEXT_ORDER;
}

function sortByLegacy(row: ProviderRow, channel: ProviderChannel): number {
  const order = legacyOrder(channel);
  const index = order.indexOf(row.provider);
  return index === -1 ? 999 : index;
}

/** Migra isDefault/enabled/id → textPriority/audioPriority (uma vez por processo). */
export async function ensureProviderPrioritiesMigrated(): Promise<void> {
  if (migrationChecked) return;

  const rows = await prisma.aiProviderConfig.findMany({ orderBy: { id: "asc" } });
  const needsText = rows.every((row) => row.textPriority === 0);
  const needsAudio = rows.every((row) => row.audioPriority === 0);

  if (!needsText && !needsAudio) {
    migrationChecked = true;
    return;
  }

  if (needsText) {
    const candidates = rows.filter((row) => row.enabled && TEXT_CAPABLE_PROVIDERS.has(row.provider));
    const ordered = [...candidates].sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return sortByLegacy(a, "text") - sortByLegacy(b, "text");
    });

    for (let index = 0; index < ordered.length; index += 1) {
      await prisma.aiProviderConfig.update({
        where: { id: ordered[index].id },
        data: {
          textPriority: index + 1,
          isDefault: index === 0,
        },
      });
    }

    logger.info(`[AiPriority] Migrados ${ordered.length} provedor(es) de texto para prioridade numerada`);
  }

  if (needsAudio) {
    const candidates = rows.filter(
      (row) => (row.isAudioDefault || row.enabled) && AUDIO_CAPABLE_PROVIDERS.has(row.provider),
    );

    const ordered = [...candidates].sort((a, b) => {
      if (a.isAudioDefault !== b.isAudioDefault) return a.isAudioDefault ? -1 : 1;
      return sortByLegacy(a, "audio") - sortByLegacy(b, "audio");
    });

    for (let index = 0; index < ordered.length; index += 1) {
      await prisma.aiProviderConfig.update({
        where: { id: ordered[index].id },
        data: {
          audioPriority: index + 1,
          isAudioDefault: index === 0,
        },
      });
    }

    logger.info(`[AiPriority] Migrados ${ordered.length} provedor(es) de áudio para prioridade numerada`);
  }

  migrationChecked = true;
}

/** Cadeia ordenada para fallback em runtime. */
export async function getOrderedProviders(channel: ProviderChannel = "text") {
  await ensureProviderPrioritiesMigrated();

  const field = priorityField(channel);
  const capable = capableSet(channel);

  const rows = await prisma.aiProviderConfig.findMany({
    where: {
      enabled: true,
      [field]: { gt: 0 },
    },
    orderBy: { [field]: "asc" },
  });

  return rows.filter((row) => capable.has(row.provider));
}

/** Persiste ordem explícita (1 = primeiro). */
export async function applyProviderPriorityOrder(
  channel: ProviderChannel,
  orderedProviders: string[],
): Promise<void> {
  if (!Array.isArray(orderedProviders) || orderedProviders.length === 0) {
    throw new Error("Ordem de provedores inválida");
  }

  const field = priorityField(channel);
  const capable = capableSet(channel);
  const normalized = Array.from(
    new Set(
      orderedProviders
        .map((item) => String(item || "").trim().toUpperCase())
        .filter(Boolean),
    ),
  );

  for (const providerName of normalized) {
    if (!capable.has(providerName as AiProvider)) {
      throw new Error(`Provedor ${providerName} não suporta canal ${channel}`);
    }
  }

  const all = await prisma.aiProviderConfig.findMany();
  const inChain = new Set(normalized);

  for (const row of all) {
    const patch: Record<string, unknown> = { [field]: 0 };

    if (channel === "text" && !inChain.has(row.provider)) {
      patch.enabled = false;
      patch.isDefault = false;
    }

    if (channel === "audio" && !inChain.has(row.provider)) {
      patch.isAudioDefault = false;
    }

    await prisma.aiProviderConfig.update({
      where: { id: row.id },
      data: patch,
    });
  }

  for (let index = 0; index < normalized.length; index += 1) {
    const providerName = normalized[index];
    const patch: Record<string, unknown> = {
      [field]: index + 1,
      enabled: true,
    };

    if (channel === "text") {
      patch.isDefault = index === 0;
    }

    if (channel === "audio") {
      patch.isAudioDefault = index === 0;
    }

    await prisma.aiProviderConfig.update({
      where: { provider: providerName as AiProvider },
      data: patch,
    });
  }

  logger.info(`[AiPriority] Ordem ${channel} atualizada: ${normalized.join(" → ")}`);
}

/** Próxima prioridade livre ao habilitar provedor. */
export async function assignNextProviderPriority(
  providerName: string,
  channel: ProviderChannel,
): Promise<number> {
  const field = priorityField(channel);
  const aggregate = await prisma.aiProviderConfig.aggregate({
    _max: { [field]: true },
  });

  const next = (aggregate._max[field] ?? 0) + 1;

  const patch: Record<string, unknown> = {
    [field]: next,
    enabled: true,
  };

  if (channel === "text" && next === 1) {
    patch.isDefault = true;
  }

  if (channel === "audio" && next === 1) {
    patch.isAudioDefault = true;
  }

  await prisma.aiProviderConfig.update({
    where: { provider: providerName as AiProvider },
    data: patch,
  });

  return next;
}

/** Remove da cadeia e compacta prioridades. */
export async function removeProviderFromChain(
  providerName: string,
  channel: ProviderChannel,
): Promise<void> {
  const field = priorityField(channel);
  const target = await prisma.aiProviderConfig.findUnique({
    where: { provider: providerName as AiProvider },
  });

  if (!target) return;

  const removedPriority = target[field];
  const patch: Record<string, unknown> = { [field]: 0 };

  if (channel === "text") {
    patch.enabled = false;
    patch.isDefault = false;
  }

  if (channel === "audio") {
    patch.isAudioDefault = false;
  }

  await prisma.aiProviderConfig.update({
    where: { id: target.id },
    data: patch,
  });

  if (removedPriority <= 0) return;

  const remaining = await prisma.aiProviderConfig.findMany({
    where: { [field]: { gt: removedPriority } },
    orderBy: { [field]: "asc" },
  });

  for (const row of remaining) {
    await prisma.aiProviderConfig.update({
      where: { id: row.id },
      data: { [field]: row[field] - 1 },
    });
  }

  if (channel === "text") {
    const first = await prisma.aiProviderConfig.findFirst({
      where: { textPriority: 1 },
    });
    await prisma.aiProviderConfig.updateMany({ data: { isDefault: false } });
    if (first) {
      await prisma.aiProviderConfig.update({
        where: { id: first.id },
        data: { isDefault: true },
      });
    }
  }

  if (channel === "audio") {
    const first = await prisma.aiProviderConfig.findFirst({
      where: { audioPriority: 1 },
    });
    await prisma.aiProviderConfig.updateMany({ data: { isAudioDefault: false } });
    if (first) {
      await prisma.aiProviderConfig.update({
        where: { id: first.id },
        data: { isAudioDefault: true },
      });
    }
  }
}

/** Move provedor uma posição na cadeia. */
export async function moveProviderPriority(
  providerName: string,
  channel: ProviderChannel,
  direction: "up" | "down",
): Promise<void> {
  const field = priorityField(channel);
  const target = await prisma.aiProviderConfig.findUnique({
    where: { provider: providerName as AiProvider },
  });

  if (!target || target[field] <= 0) {
    throw new Error("Provedor não está na cadeia de prioridade");
  }

  const chain = await prisma.aiProviderConfig.findMany({
    where: { [field]: { gt: 0 } },
    orderBy: { [field]: "asc" },
  });

  const order = chain.map((row) => row.provider);
  const currentIndex = order.indexOf(target.provider);
  if (currentIndex === -1) {
    throw new Error("Provedor não encontrado na cadeia");
  }

  const swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (swapIndex < 0 || swapIndex >= order.length) {
    return;
  }

  [order[currentIndex], order[swapIndex]] = [order[swapIndex], order[currentIndex]];
  await applyProviderPriorityOrder(channel, order);
}
