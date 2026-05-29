/**
 * Evita processar o mesmo áudio 2x (notify+append) e serializa áudios por usuário.
 */
import { logger } from "../utils/logger";

const PROCESSED_AUDIO_TTL_MS = 5 * 60 * 1000;
const processedAudioKeys = new Map<string, number>();
const phoneTail = new Map<string, Promise<unknown>>();

function purgeOldAudioKeys(): void {
  const now = Date.now();
  for (const [key, at] of processedAudioKeys.entries()) {
    if (now - at > PROCESSED_AUDIO_TTL_MS) processedAudioKeys.delete(key);
  }
}

export function buildAudioDedupKey(phone: string, mediaId: string): string {
  return `${phone}:${mediaId}`;
}

/** Retorna false se este áudio já foi processado (duplicata Baileys). */
export function claimAudioProcessing(phone: string, mediaId: string): boolean {
  purgeOldAudioKeys();
  const key = buildAudioDedupKey(phone, mediaId);
  if (processedAudioKeys.has(key)) {
    logger.info(`[Audio] Ignorando áudio duplicado mediaId=${mediaId} phone=${phone}`);
    return false;
  }
  processedAudioKeys.set(key, Date.now());
  return true;
}

export function withAudioPhoneLock<T>(phone: string, fn: () => Promise<T>): Promise<T> {
  const prev = phoneTail.get(phone) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(() => fn());
  phoneTail.set(phone, run);
  return run.finally(() => {
    if (phoneTail.get(phone) === run) phoneTail.delete(phone);
  });
}
