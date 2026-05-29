import { Job, Queue, QueueEvents } from "bullmq";
import { logger } from "../utils/logger";
import { createRedisConnection, getSharedRedisConnection } from "./redis";
import type { QueueName } from "./names";
import type { QueueJobMap } from "./types";

const queueByName = new Map<QueueName, Queue>();
const queueEventsByName = new Map<QueueName, QueueEvents>();

function getQueue(name: QueueName): Queue {
  const existing = queueByName.get(name);
  if (existing) return existing;

  const queue = new Queue(name, {
    connection: getSharedRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 1500 },
      removeOnComplete: 1000,
      removeOnFail: 1000,
    },
  });

  queueByName.set(name, queue);
  return queue;
}

function getQueueEvents(name: QueueName): QueueEvents {
  const existing = queueEventsByName.get(name);
  if (existing) return existing;

  const events = new QueueEvents(name, {
    connection: createRedisConnection(),
  });

  queueEventsByName.set(name, events);
  return events;
}

export interface EnqueueAndWaitOptions {
  dedupKey?: string;
  timeoutMs?: number;
  attempts?: number;
}

/** BullMQ proíbe ':' no jobId — normaliza chave de deduplicação. */
function sanitizeQueueJobId(rawKey: string): string {
  return rawKey
    .replace(/:/g, "_")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 180);
}

export async function enqueueAndWait<N extends QueueName>(
  queueName: N,
  data: QueueJobMap[N],
  options: EnqueueAndWaitOptions = {},
): Promise<unknown> {
  const queue = getQueue(queueName);
  const events = getQueueEvents(queueName);

  const dedupKeyRaw = options.dedupKey?.trim();
  const dedupKey = dedupKeyRaw ? sanitizeQueueJobId(dedupKeyRaw) : undefined;
  const attempts = options.attempts ?? 3;

  if (dedupKey) {
    const existingJob = await queue.getJob(dedupKey);
    if (existingJob) {
      const state = await existingJob.getState();

      if (state === "active" || state === "waiting" || state === "delayed" || state === "prioritized") {
        logger.info(`[queue] Reutilizando job em andamento ${dedupKey} (${queueName}, state=${state})`);
        const timeoutMs = options.timeoutMs ?? 45000;
        return waitForJobResult(existingJob, events, timeoutMs);
      }

      // Job anterior já encerrou. Remove para permitir nova execução com a mesma chave.
      try {
        await existingJob.remove();
      } catch (err) {
        logger.warn(`[queue] Falha ao remover job stale ${dedupKey}: ${String(err)}`);
      }
    }
  }

  const job = await queue.add("task", data, {
    jobId: dedupKey,
    attempts,
    backoff: { type: "exponential", delay: 1500 },
  });

  const timeoutMs = options.timeoutMs ?? 45000;
  return waitForJobResult(job, events, timeoutMs);
}

async function waitForJobResult(job: Job, events: QueueEvents, timeoutMs: number): Promise<unknown> {
  const timeout = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      clearTimeout(timer);
      reject(new Error(`Queue timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      job.waitUntilFinished(events),
      timeout,
    ]);
  } catch (err) {
    logger.warn(`[queue] Falha aguardando job ${job.id}: ${String(err)}`);
    throw err;
  }
}
