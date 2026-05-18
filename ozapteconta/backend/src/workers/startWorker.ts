import { ensureAppUtf8Locale } from "../bootstrap/utf8Locale";
ensureAppUtf8Locale();

import { Worker } from "bullmq";
import { config } from "../config";
import { logger } from "../utils/logger";
import { ALL_QUEUE_NAMES, QueueName } from "../queues/names";
import { createRedisConnection } from "../queues/redis";
import { runQueueJob } from "../queues/processors";

function getTargetQueue(): QueueName {
  const queueName = String(process.env.WORKER_QUEUE || "").trim() as QueueName;
  if (!ALL_QUEUE_NAMES.includes(queueName)) {
    throw new Error(`WORKER_QUEUE inválida: ${queueName}`);
  }
  return queueName;
}

async function start(): Promise<void> {
  const queueName = getTargetQueue();
  const concurrency = Number(process.env.WORKER_CONCURRENCY || 2);

  const worker = new Worker(
    queueName,
    async (job) => runQueueJob(queueName, job.data),
    {
      connection: createRedisConnection(),
      concurrency,
    },
  );

  worker.on("completed", (job) => {
    logger.info(`[worker:${queueName}] job concluído id=${job.id}`);
  });

  worker.on("failed", (job, err) => {
    logger.error(`[worker:${queueName}] job falhou id=${job?.id}: ${String(err)}`);
  });

  worker.on("error", (err) => {
    logger.error(`[worker:${queueName}] erro geral: ${String(err)}`);
  });

  logger.info(`[worker:${queueName}] iniciado em ${config.nodeEnv} (concorrência=${concurrency})`);
}

start().catch((err) => {
  logger.error("Falha ao iniciar worker", err);
  process.exit(1);
});
