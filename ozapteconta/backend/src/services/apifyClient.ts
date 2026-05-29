import { config } from "../config";
import { logger } from "../utils/logger";

export type ApifyRunStatus = "READY" | "RUNNING" | "SUCCEEDED" | "FAILED" | "TIMED-OUT" | "ABORTED";

type ApifyRunResponse = {
  data?: {
    id?: string;
    status?: ApifyRunStatus;
    defaultDatasetId?: string;
  };
};

function buildApifyHeaders(): Record<string, string> {
  const token = config.apify.apiToken;
  if (!token) throw new Error("APIFY_API_TOKEN não configurado");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function encodeActorId(actorId: string): string {
  const trimmed = String(actorId || "").trim();
  if (!trimmed) throw new Error("APIFY_FLIGHT_ACTOR_ID não configurado");
  return encodeURIComponent(trimmed.replace("/", "~"));
}

export async function startApifyActorRun(
  actorId: string,
  actorInput: Record<string, unknown>,
): Promise<string> {
  const encodedActor = encodeActorId(actorId);
  const response = await fetch(`https://api.apify.com/v2/acts/${encodedActor}/runs`, {
    method: "POST",
    headers: buildApifyHeaders(),
    body: JSON.stringify(actorInput),
    signal: AbortSignal.timeout(config.apify.requestTimeoutMs),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Apify run falhou (${response.status}): ${body.slice(0, 200)}`);
  }

  const payload = (await response.json()) as ApifyRunResponse;
  const runId = payload.data?.id;
  if (!runId) throw new Error("Apify não retornou runId");
  return runId;
}

export async function waitApifyRunFinished(
  runId: string,
  pollIntervalMs = 3000,
): Promise<ApifyRunResponse["data"]> {
  const deadline = Date.now() + config.apify.runTimeoutMs;
  /* MAX_ITER: poll até runTimeoutMs / pollIntervalMs */
  while (Date.now() < deadline) {
    const response = await fetch(`https://api.apify.com/v2/actor-runs/${runId}`, {
      headers: buildApifyHeaders(),
      signal: AbortSignal.timeout(config.apify.requestTimeoutMs),
    });
    if (!response.ok) {
      throw new Error(`Apify status falhou (${response.status})`);
    }

    const payload = (await response.json()) as ApifyRunResponse;
    const status = payload.data?.status;
    if (status === "SUCCEEDED") return payload.data;
    if (status === "FAILED" || status === "TIMED-OUT" || status === "ABORTED") {
      throw new Error(`Apify run encerrou com status ${status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error("Apify run excedeu tempo máximo de espera");
}

export async function fetchApifyDatasetItems<T extends Record<string, unknown>>(
  datasetId: string,
  limit = 20,
): Promise<T[]> {
  const response = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?limit=${limit}&clean=true`,
    {
      headers: buildApifyHeaders(),
      signal: AbortSignal.timeout(config.apify.requestTimeoutMs),
    },
  );

  if (!response.ok) {
    throw new Error(`Apify dataset falhou (${response.status})`);
  }

  const items = (await response.json()) as T[];
  if (!Array.isArray(items)) {
    logger.warn("[apify] dataset retornou formato inesperado");
    return [];
  }
  return items;
}

export async function runApifyActorAndGetItems<T extends Record<string, unknown>>(
  actorId: string,
  actorInput: Record<string, unknown>,
  limit = 20,
): Promise<T[]> {
  if (!config.apify.configured) {
    throw new Error("Integração Apify não configurada (token ou actor ausente)");
  }

  const runId = await startApifyActorRun(actorId, actorInput);
  const runData = await waitApifyRunFinished(runId);
  const datasetId = runData?.defaultDatasetId;
  if (!datasetId) return [];
  return fetchApifyDatasetItems<T>(datasetId, limit);
}
