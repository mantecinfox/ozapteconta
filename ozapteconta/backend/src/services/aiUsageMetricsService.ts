import fs from "fs";
import path from "path";
import { logger } from "../utils/logger";

export type AiUsageChannel = "text" | "audio";
export type AiUsageStage = "extract" | "transcribe" | "all";

export interface AiUsageLogEntry {
  ts: string;
  provider: string;
  model: string;
  channel: AiUsageChannel;
  stage: "extract" | "transcribe";
  success: boolean;
  latencyMs: number;
  fallbackUsed: boolean;
  attempt: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  error?: string;
}

const metricsDir = path.resolve(__dirname, "../../logs");
const metricsFile = path.join(metricsDir, "ai-usage.ndjson");
const RETENTION_DAYS = 10;
let pruneInProgress = false;

function safeNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toDay(ts: string): string {
  return new Date(ts).toISOString().slice(0, 10);
}

async function pruneAiUsageLogs(days: number): Promise<void> {
  if (pruneInProgress) return;
  pruneInProgress = true;

  try {
    if (!fs.existsSync(metricsFile)) return;

    const raw = await fs.promises.readFile(metricsFile, "utf8");
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const minTs = Date.now() - days * 24 * 60 * 60 * 1000;

    const kept: string[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as AiUsageLogEntry;
        if (new Date(parsed.ts).getTime() >= minTs) {
          kept.push(JSON.stringify(parsed));
        }
      } catch {
        // descarta linhas inválidas durante limpeza
      }
    }

    await fs.promises.writeFile(metricsFile, kept.join("\n") + (kept.length ? "\n" : ""), "utf8");
  } catch (err) {
    logger.warn(`[AIMetrics] Falha ao limpar logs antigos: ${String(err)}`);
  } finally {
    pruneInProgress = false;
  }
}

export async function writeAiUsageLog(entry: AiUsageLogEntry): Promise<void> {
  try {
    await fs.promises.mkdir(metricsDir, { recursive: true });
    await fs.promises.appendFile(metricsFile, `${JSON.stringify(entry)}\n`, "utf8");
    await pruneAiUsageLogs(RETENTION_DAYS);
  } catch (err) {
    logger.warn(`[AIMetrics] Falha ao salvar log de uso: ${String(err)}`);
  }
}

export async function getAiUsageReport(days = 7, stage: AiUsageStage = "all"): Promise<{
  summary: {
    totalRequests: number;
    successRequests: number;
    failedRequests: number;
    avgLatencyMs: number;
    totalTokens: number;
    fallbackRequests: number;
  };
  byProvider: Array<{
    provider: string;
    requests: number;
    success: number;
    failed: number;
    avgLatencyMs: number;
    totalTokens: number;
    textRequests: number;
    audioRequests: number;
    fallbackRequests: number;
  }>;
  timeline: Array<{
    day: string;
    requests: number;
    success: number;
    totalTokens: number;
    avgLatencyMs: number;
  }>;
}> {
  try {
    const exists = fs.existsSync(metricsFile);
    if (!exists) {
      return {
        summary: {
          totalRequests: 0,
          successRequests: 0,
          failedRequests: 0,
          avgLatencyMs: 0,
          totalTokens: 0,
          fallbackRequests: 0,
        },
        byProvider: [],
        timeline: [],
      };
    }

    const raw = await fs.promises.readFile(metricsFile, "utf8");
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const minTs = Date.now() - days * 24 * 60 * 60 * 1000;

    const entries = lines
      .map((line) => {
        try {
          return JSON.parse(line) as AiUsageLogEntry;
        } catch {
          return null;
        }
      })
      .filter((x): x is AiUsageLogEntry => Boolean(x))
      .filter((e) => new Date(e.ts).getTime() >= minTs)
      .filter((e) => stage === "all" ? true : e.stage === stage);

    const summary = {
      totalRequests: entries.length,
      successRequests: entries.filter((e) => e.success).length,
      failedRequests: entries.filter((e) => !e.success).length,
      avgLatencyMs:
        entries.length > 0
          ? Math.round(entries.reduce((s, e) => s + safeNum(e.latencyMs), 0) / entries.length)
          : 0,
      totalTokens: entries.reduce((s, e) => s + safeNum(e.totalTokens), 0),
      fallbackRequests: entries.filter((e) => e.fallbackUsed).length,
    };

    const byProviderMap = new Map<string, AiUsageLogEntry[]>();
    for (const entry of entries) {
      const key = entry.provider;
      const list = byProviderMap.get(key) || [];
      list.push(entry);
      byProviderMap.set(key, list);
    }

    const byProvider = Array.from(byProviderMap.entries()).map(([provider, list]) => ({
      provider,
      requests: list.length,
      success: list.filter((e) => e.success).length,
      failed: list.filter((e) => !e.success).length,
      avgLatencyMs: Math.round(list.reduce((s, e) => s + safeNum(e.latencyMs), 0) / Math.max(1, list.length)),
      totalTokens: list.reduce((s, e) => s + safeNum(e.totalTokens), 0),
      textRequests: list.filter((e) => e.channel === "text").length,
      audioRequests: list.filter((e) => e.channel === "audio").length,
      fallbackRequests: list.filter((e) => e.fallbackUsed).length,
    })).sort((a, b) => b.requests - a.requests);

    const timelineMap = new Map<string, AiUsageLogEntry[]>();
    for (const entry of entries) {
      const day = toDay(entry.ts);
      const list = timelineMap.get(day) || [];
      list.push(entry);
      timelineMap.set(day, list);
    }

    const timeline = Array.from(timelineMap.entries())
      .map(([day, list]) => ({
        day,
        requests: list.length,
        success: list.filter((e) => e.success).length,
        totalTokens: list.reduce((s, e) => s + safeNum(e.totalTokens), 0),
        avgLatencyMs: Math.round(list.reduce((s, e) => s + safeNum(e.latencyMs), 0) / Math.max(1, list.length)),
      }))
      .sort((a, b) => a.day.localeCompare(b.day));

    return { summary, byProvider, timeline };
  } catch (err) {
    logger.error(`[AIMetrics] Erro ao gerar relatório: ${String(err)}`);
    return {
      summary: {
        totalRequests: 0,
        successRequests: 0,
        failedRequests: 0,
        avgLatencyMs: 0,
        totalTokens: 0,
        fallbackRequests: 0,
      },
      byProvider: [],
      timeline: [],
    };
  }
}
