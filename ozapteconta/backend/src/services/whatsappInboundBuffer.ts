/**
 * Aguarda payload completo do WhatsApp (notify → append) antes de avisar "ilegível".
 * Evita exigir 2ª mensagem do usuário quando o texto chega em frações.
 */
import { logger } from "../utils/logger";

export interface PendingInboundMessage {
  accountId: number;
  remoteJid: string;
  messageId: string;
  rawMsg: unknown;
  phone: string;
  senderName?: string;
  firstSeenAt: number;
  attemptCount: number;
  retryTimer?: NodeJS.Timeout;
  giveUpTimer?: NodeJS.Timeout;
}

export type ExtractTextFn = (rawMsg: unknown) => string | null;

export interface InboundBufferHandlers {
  onTextReady: (entry: PendingInboundMessage, text: string) => Promise<void>;
  onGiveUp: (entry: PendingInboundMessage) => Promise<void>;
}

const RETRY_INTERVAL_MS = 2000;
const MAX_RETRY_ATTEMPTS = 8;
const GIVE_UP_MS = Number(process.env.WPP_INBOUND_GIVE_UP_MS ?? 18000);

export class WhatsappInboundBuffer {
  private readonly pendingById = new Map<string, PendingInboundMessage>();
  private readonly finishedIds = new Set<string>();

  private bufferKey(accountId: number, messageId: string): string {
    return `${accountId}:${messageId}`;
  }

  isFinished(accountId: number, messageId: string): boolean {
    return this.finishedIds.has(this.bufferKey(accountId, messageId));
  }

  markFinished(accountId: number, messageId: string): void {
    const key = this.bufferKey(accountId, messageId);
    this.finishedIds.add(key);
    this.clearPending(accountId, messageId);
    if (this.finishedIds.size > 3000) {
      this.finishedIds.clear();
    }
  }

  clearPending(accountId: number, messageId: string): void {
    const key = this.bufferKey(accountId, messageId);
    const entry = this.pendingById.get(key);
    if (!entry) return;
    if (entry.retryTimer) clearTimeout(entry.retryTimer);
    if (entry.giveUpTimer) clearTimeout(entry.giveUpTimer);
    this.pendingById.delete(key);
  }

  clearAllPendingForRemote(accountId: number, remoteJid: string): void {
    for (const [key, entry] of this.pendingById.entries()) {
      if (entry.accountId === accountId && entry.remoteJid === remoteJid) {
        if (entry.retryTimer) clearTimeout(entry.retryTimer);
        if (entry.giveUpTimer) clearTimeout(entry.giveUpTimer);
        this.pendingById.delete(key);
      }
    }
  }

  /**
   * Mescla payload mais completo (append costuma trazer conversation/extendedText).
   */
  mergeRawMessage(existing: unknown, incoming: unknown): unknown {
    if (!existing) return incoming;
    if (!incoming) return existing;
    const prev = existing as Record<string, unknown>;
    const next = incoming as Record<string, unknown>;
    const prevMsg = (prev.message || {}) as Record<string, unknown>;
    const nextMsg = (next.message || {}) as Record<string, unknown>;
    return {
      ...prev,
      ...next,
      key: next.key || prev.key,
      pushName: next.pushName || prev.pushName,
      message: { ...prevMsg, ...nextMsg },
    };
  }

  enqueueOrRetry(
    entry: Omit<PendingInboundMessage, "firstSeenAt" | "attemptCount" | "retryTimer" | "giveUpTimer">,
    extractText: ExtractTextFn,
    handlers: InboundBufferHandlers,
  ): void {
    const key = this.bufferKey(entry.accountId, entry.messageId);
    if (this.finishedIds.has(key)) return;

    const textNow = extractText(entry.rawMsg)?.trim();
    if (textNow) {
      this.markFinished(entry.accountId, entry.messageId);
      void handlers.onTextReady(
        { ...entry, firstSeenAt: Date.now(), attemptCount: 0 },
        textNow,
      );
      return;
    }

    const existing = this.pendingById.get(key);
    const merged: PendingInboundMessage = {
      ...(existing || {}),
      ...entry,
      rawMsg: this.mergeRawMessage(existing?.rawMsg, entry.rawMsg),
      firstSeenAt: existing?.firstSeenAt ?? Date.now(),
      attemptCount: existing?.attemptCount ?? 0,
    };

    if (existing?.retryTimer) clearTimeout(existing.retryTimer);
    if (existing?.giveUpTimer) clearTimeout(existing.giveUpTimer);

    const scheduleRetry = () => {
      merged.retryTimer = setTimeout(() => {
        merged.attemptCount += 1;
        const recovered = extractText(merged.rawMsg)?.trim();
        if (recovered) {
          logger.info(
            `[WPP Ingress] Texto recuperado id=${merged.messageId} tentativa=${merged.attemptCount}`,
          );
          this.markFinished(merged.accountId, merged.messageId);
          void handlers.onTextReady(merged, recovered);
          return;
        }
        if (merged.attemptCount >= MAX_RETRY_ATTEMPTS) {
          logger.info(
            `[WPP Ingress] Esgotadas tentativas id=${merged.messageId} (${merged.attemptCount})`,
          );
          void handlers.onGiveUp(merged);
          this.clearPending(merged.accountId, merged.messageId);
          return;
        }
        scheduleRetry();
      }, RETRY_INTERVAL_MS);
    };

    merged.giveUpTimer = setTimeout(() => {
      const recovered = extractText(merged.rawMsg)?.trim();
      if (recovered) {
        this.markFinished(merged.accountId, merged.messageId);
        void handlers.onTextReady(merged, recovered);
        return;
      }
      logger.info(`[WPP Ingress] Give-up id=${merged.messageId} após ${GIVE_UP_MS}ms`);
      void handlers.onGiveUp(merged);
      this.clearPending(merged.accountId, merged.messageId);
    }, GIVE_UP_MS);

    this.pendingById.set(key, merged);
    scheduleRetry();
  }

  /** messages.update — reprocessa pendente com payload atualizado */
  retryFromUpdate(
    accountId: number,
    messageId: string,
    rawMsg: unknown,
    extractText: ExtractTextFn,
    handlers: InboundBufferHandlers,
  ): void {
    const key = this.bufferKey(accountId, messageId);
    const pending = this.pendingById.get(key);
    if (!pending) {
      const text = extractText(rawMsg)?.trim();
      if (text && !this.finishedIds.has(key)) {
        this.markFinished(accountId, messageId);
        void handlers.onTextReady(
          {
            accountId,
            messageId,
            remoteJid: "",
            rawMsg,
            phone: "",
            firstSeenAt: Date.now(),
            attemptCount: 0,
          },
          text,
        );
      }
      return;
    }
    pending.rawMsg = this.mergeRawMessage(pending.rawMsg, rawMsg);
    const text = extractText(pending.rawMsg)?.trim();
    if (text) {
      this.markFinished(accountId, messageId);
      void handlers.onTextReady(pending, text);
    }
  }
}
