import { analyzeNutrition, extractTransaction } from "../services/aiService";
import { runFipeQueryWithRateLimit } from "../services/fipeRateLimitService";
import { runFipeZapQueryWithRateLimit } from "../services/fipeZapRateLimitService";
import { runFlightSearchWithRateLimit } from "../services/flightRateLimitService";
import { executeMarketQuery } from "../services/marketDataService";
import type { QueueName } from "./names";
import { QUEUE_NAMES } from "./names";
import type { QueueJobMap } from "./types";

export async function runQueueJob<N extends QueueName>(queueName: N, data: QueueJobMap[N]): Promise<unknown> {
  switch (queueName) {
    case QUEUE_NAMES.FIPE: {
      const payload = data as QueueJobMap[typeof QUEUE_NAMES.FIPE];
      return runFipeQueryWithRateLimit(payload.phone, payload.rawQuery, payload.vehicleType);
    }
    case QUEUE_NAMES.MARKET: {
      const payload = data as QueueJobMap[typeof QUEUE_NAMES.MARKET];
      return executeMarketQuery(payload.query);
    }
    case QUEUE_NAMES.FIPEZAP: {
      const payload = data as QueueJobMap[typeof QUEUE_NAMES.FIPEZAP];
      return runFipeZapQueryWithRateLimit(
        payload.phone,
        payload.rawQuery,
        payload.fipeZapQuery,
      );
    }
    case QUEUE_NAMES.FLIGHTS: {
      const payload = data as QueueJobMap[typeof QUEUE_NAMES.FLIGHTS];
      return runFlightSearchWithRateLimit(payload.phone, payload.flightQuery);
    }
    case QUEUE_NAMES.NUTRITION: {
      const payload = data as QueueJobMap[typeof QUEUE_NAMES.NUTRITION];
      return analyzeNutrition(payload.text, payload.history);
    }
    case QUEUE_NAMES.EXPENSES: {
      const payload = data as QueueJobMap[typeof QUEUE_NAMES.EXPENSES];
      return extractTransaction(payload.text, payload.history, payload.allowedContexts, payload.source);
    }
    case QUEUE_NAMES.RESERVE_2:
    case QUEUE_NAMES.RESERVE_3:
    case QUEUE_NAMES.RESERVE_4:
    case QUEUE_NAMES.RESERVE_5:
      return { success: true, reserve: true };
    default:
      throw new Error(`Fila não suportada: ${String(queueName)}`);
  }
}
