import fs from "fs";
import path from "path";
import os from "os";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffmpeg from "fluent-ffmpeg";
import FormDataLib from "form-data";
import { prisma } from "../config/prisma";
import { logger } from "../utils/logger";
import { writeAiUsageLog } from "./aiUsageMetricsService";

const DEFAULT_ABACUS_AUDIO_MODELS = [
  "gpt-4o-audio-preview",
  "gpt-4o-mini-audio-preview",
  "gemini-2.5-flash",
];

const AUDIO_CHAIN_CACHE_TTL_MS = 60 * 1000;
const ABACUS_AUDIO_TIMEOUT_MS = 25000;

let audioChainCache: { value: string[]; expiresAt: number } | null = null;

function normalizeAudioModelChain(raw: string | null | undefined): string[] {
  const parsed = String(raw || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const deduped = Array.from(new Set(parsed));
  const valid = deduped.filter((model) => DEFAULT_ABACUS_AUDIO_MODELS.includes(model));

  return valid.length > 0 ? valid : DEFAULT_ABACUS_AUDIO_MODELS;
}

async function getAbacusAudioModelChain(): Promise<string[]> {
  if (audioChainCache && Date.now() < audioChainCache.expiresAt) {
    return audioChainCache.value;
  }

  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: "abacus_audio_model_chain" },
    });
    const value = normalizeAudioModelChain(setting?.value);
    audioChainCache = { value, expiresAt: Date.now() + AUDIO_CHAIN_CACHE_TTL_MS };
    return value;
  } catch (err) {
    logger.warn(`[Transcription] Falha ao carregar cadeia de modelos ABACUS, usando padrão: ${String(err)}`);
    return DEFAULT_ABACUS_AUDIO_MODELS;
  }
}

// Configura path do ffmpeg bundled
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// ─── Converte qualquer áudio para WAV 16kHz mono (necessário para Whisper local) ─
async function convertToWav(inputPath: string): Promise<string> {
  const outputPath = path.join(os.tmpdir(), `whisper_${Date.now()}.wav`);
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioFrequency(16000)
      .audioChannels(1)
      .audioCodec("pcm_s16le")
      .format("wav")
      .on("end", () => resolve(outputPath))
      .on("error", (err) => reject(err))
      .save(outputPath);
  });
}

// ─── Converte qualquer áudio para MP3 (ABACUS/Whisper API aceitam wav/mp3) ──
async function convertToMp3(inputPath: string): Promise<string> {
  const outputPath = path.join(os.tmpdir(), `whisper_${Date.now()}.mp3`);
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioCodec("libmp3lame")
      .audioBitrate(96)
      .format("mp3")
      .on("end", () => resolve(outputPath))
      .on("error", (err) => reject(err))
      .save(outputPath);
  });
}

function detectAudioFormatFromPath(audioPath: string): "ogg" | "mp3" | "wav" | "mp4" {
  const ext = path.extname(audioPath).toLowerCase();
  if (ext === ".mp3") return "mp3";
  if (ext === ".wav") return "wav";
  if (ext === ".mp4" || ext === ".m4a") return "mp4";
  return "ogg";
}

// ─── Transcrição local com Whisper via @xenova/transformers ──────────────────
let localPipeline: any = null;
async function transcribeLocal(audioPath: string, language = "pt"): Promise<string | null> {
  try {
    const startedAt = Date.now();
    if (!localPipeline) {
      logger.info("[Transcription] Carregando modelo Whisper local (primeira vez — pode demorar)...");
      // Importação dinâmica para não bloquear startup
      const { pipeline } = await import("@xenova/transformers");
      localPipeline = await pipeline("automatic-speech-recognition", "Xenova/whisper-small", {
        revision: "main",
      });
      logger.info("[Transcription] Modelo Whisper local carregado.");
    }

    const wavPath = await convertToWav(audioPath);
    try {
      const result = await localPipeline(wavPath, {
        language,
        task: "transcribe",
        chunk_length_s: 30,
        stride_length_s: 5,
      });
      const text: string = typeof result === "string" ? result : result?.text ?? "";
      logger.info(`[Transcription] Whisper local: "${text.substring(0, 80)}"`);
      await writeAiUsageLog({
        ts: new Date().toISOString(),
        provider: "LOCAL_WHISPER",
        model: "Xenova/whisper-small",
        channel: "audio",
        stage: "transcribe",
        success: Boolean(text.trim()),
        latencyMs: Date.now() - startedAt,
        fallbackUsed: true,
        attempt: 99,
      });
      return text.trim() || null;
    } finally {
      fs.unlink(wavPath, () => {});
    }
  } catch (err) {
    logger.error("[Transcription] Erro no Whisper local:", err);
    await writeAiUsageLog({
      ts: new Date().toISOString(),
      provider: "LOCAL_WHISPER",
      model: "Xenova/whisper-small",
      channel: "audio",
      stage: "transcribe",
      success: false,
      latencyMs: 0,
      fallbackUsed: true,
      attempt: 99,
      error: String(err),
    });
    return null;
  }
}

function extractAssistantText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";

  const parts = content as Array<Record<string, unknown>>;
  const collected = parts
    .map((part) => {
      if (typeof part?.text === "string") return part.text;
      if (typeof part?.transcript === "string") return part.transcript;
      if (typeof part?.content === "string") return part.content;
      return "";
    })
    .filter(Boolean)
    .join(" ")
    .trim();

  return collected;
}

async function transcribeViaAbacusAudioModels(audioPath: string, language: string): Promise<string | null> {
  const provider = await prisma.aiProviderConfig.findFirst({
    where: { provider: "ABACUS", enabled: true },
    orderBy: { isDefault: "desc" },
  });

  if (!provider?.apiKey) return null;

  const baseUrl = (provider.apiUrl || "https://routellm.abacus.ai").replace(/\/+$/, "");
  const endpoint = `${baseUrl}/v1/chat/completions`;

  try {
    const audioFormat = detectAudioFormatFromPath(audioPath);
    const audioBuffer = await fs.promises.readFile(audioPath);
    const audioBase64 = audioBuffer.toString("base64");

    const modelChain = await getAbacusAudioModelChain();

    for (const model of modelChain) {
      const startedAt = Date.now();
      const attempt = modelChain.indexOf(model) + 1;
      try {
        // ── Prioridade 3: Gemini audio transcription ───────────────────────────
        if (model.startsWith("gemini")) {
          const geminiProvider = await prisma.aiProviderConfig.findFirst({
            where: { provider: "GEMINI", enabled: true },
          });
          if (!geminiProvider?.apiKey) {
            logger.warn(`[Transcription] GEMINI não configurado; pulando modelo ${model}.`);
            continue;
          }
          const geminiMimeType =
            audioFormat === "mp3" ? "audio/mpeg" :
            audioFormat === "wav" ? "audio/wav" : "audio/ogg";
          const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiProvider.apiKey}`;

          const geminiResponse = await fetch(geminiEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              system_instruction: {
                parts: [{ text: "Você é um assistente de transcrição. Retorne somente a transcrição do áudio em português brasileiro, sem explicações adicionais." }],
              },
              contents: [{
                role: "user",
                parts: [
                  { text: `Transcreva este áudio em português brasileiro (idioma: ${language}).` },
                  { inline_data: { mime_type: geminiMimeType, data: audioBase64 } },
                ],
              }],
              generationConfig: { temperature: 0, maxOutputTokens: 800 },
            }),
            signal: AbortSignal.timeout(45000),
          });

          if (!geminiResponse.ok) {
            const errText = await geminiResponse.text();
            logger.warn(`[Transcription] GEMINI ${model} falhou (${geminiResponse.status}): ${errText.substring(0, 220)}`);
            await writeAiUsageLog({
              ts: new Date().toISOString(),
              provider: "GEMINI",
              model,
              channel: "audio",
              stage: "transcribe",
              success: false,
              latencyMs: Date.now() - startedAt,
              fallbackUsed: attempt > 1,
              attempt,
              error: `HTTP ${geminiResponse.status}`,
            });
            continue;
          }

          const geminiData = (await geminiResponse.json()) as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
            usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
          };
          const geminiTranscript = (geminiData.candidates?.[0]?.content?.parts ?? [])
            .map((p) => p.text || "")
            .join(" ")
            .trim();

          if (geminiTranscript) {
            logger.info(`[Transcription] GEMINI ${model} respondeu em ${Date.now() - startedAt}ms: "${geminiTranscript.substring(0, 80)}"`);
            await writeAiUsageLog({
              ts: new Date().toISOString(),
              provider: "GEMINI",
              model,
              channel: "audio",
              stage: "transcribe",
              success: true,
              latencyMs: Date.now() - startedAt,
              fallbackUsed: attempt > 1,
              attempt,
              promptTokens: Number(geminiData.usageMetadata?.promptTokenCount || 0),
              completionTokens: Number(geminiData.usageMetadata?.candidatesTokenCount || 0),
              totalTokens: Number(geminiData.usageMetadata?.totalTokenCount || 0),
            });
            return geminiTranscript;
          }

          logger.warn(`[Transcription] GEMINI ${model} respondeu sem texto. Tentando próximo modelo.`);
          continue;
        }

        // ── Prioridades 1 & 2: ABACUS audio transcription ─────────────────────
        if (audioFormat !== "mp3" && audioFormat !== "wav") {
          logger.info(`[Transcription] ABACUS aceita apenas wav/mp3; modelo ${model} pulado para formato ${audioFormat}.`);
          continue;
        }

        const body = {
          model,
          temperature: 0,
          max_tokens: 800,
          messages: [
            {
              role: "system",
              content:
                "Você é um assistente de transcrição. Retorne somente a transcrição do áudio, sem explicações.",
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Transcreva este áudio em português brasileiro (idioma: ${language}).`,
                },
                {
                  type: "input_audio",
                  input_audio: {
                    data: audioBase64,
                    format: audioFormat,
                  },
                },
              ],
            },
          ],
        };

        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${provider.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(ABACUS_AUDIO_TIMEOUT_MS),
        });

        if (!response.ok) {
          const errText = await response.text();
          logger.warn(
            `[Transcription] ABACUS ${model} falhou (${response.status}) em ${Date.now() - startedAt}ms. Tentando próximo modelo. Detalhe: ${errText.substring(0, 220)}`,
          );
          await writeAiUsageLog({
            ts: new Date().toISOString(),
            provider: "ABACUS",
            model,
            channel: "audio",
            stage: "transcribe",
            success: false,
            latencyMs: Date.now() - startedAt,
            fallbackUsed: attempt > 1,
            attempt,
            error: `HTTP ${response.status}`,
          });
          continue;
        }

        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: unknown } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
        };

        const rawContent = data?.choices?.[0]?.message?.content;
        const transcript = extractAssistantText(rawContent);

        if (transcript) {
          logger.info(`[Transcription] ABACUS ${model} respondeu em ${Date.now() - startedAt}ms: "${transcript.substring(0, 80)}"`);
          await writeAiUsageLog({
            ts: new Date().toISOString(),
            provider: "ABACUS",
            model,
            channel: "audio",
            stage: "transcribe",
            success: true,
            latencyMs: Date.now() - startedAt,
            fallbackUsed: attempt > 1,
            attempt,
            promptTokens: Number(data.usage?.prompt_tokens || 0),
            completionTokens: Number(data.usage?.completion_tokens || 0),
            totalTokens: Number(data.usage?.total_tokens || 0),
          });
          return transcript;
        }

        logger.warn(`[Transcription] ABACUS ${model} respondeu sem texto de transcrição. Tentando próximo modelo.`);
      } catch (err) {
        await writeAiUsageLog({
          ts: new Date().toISOString(),
          provider: "ABACUS",
          model,
          channel: "audio",
          stage: "transcribe",
          success: false,
          latencyMs: Date.now() - startedAt,
          fallbackUsed: attempt > 1,
          attempt,
          error: String(err),
        });
        logger.warn(`[Transcription] Erro com ABACUS ${model} após ${Date.now() - startedAt}ms; fallback para próximo modelo: ${String(err)}`);
      }
    }

    return null;
  } catch (err) {
    logger.warn(`[Transcription] Falha geral no fluxo ABACUS de transcrição: ${String(err)}`);
    return null;
  }
}

// ─── Transcrição via API (OpenAI / Groq) ────────────────────────────────────
async function transcribeViaWhisperApi(audioPath: string, language: string): Promise<string | null> {
  const provider = await prisma.aiProviderConfig.findFirst({
    where: {
      OR: [
        { provider: "OPENAI", enabled: true },
        { provider: "GROQ", enabled: true },
      ],
    },
    orderBy: { isDefault: "desc" },
  });

  if (!provider?.apiKey) return null;

  try {
    const startedAt = Date.now();
    const audioBuffer = await fs.promises.readFile(audioPath);
    const ext = (path.extname(audioPath) || ".mp3").toLowerCase();
    const contentTypeByExt: Record<string, string> = {
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".ogg": "audio/ogg",
      ".m4a": "audio/mp4",
      ".mp4": "audio/mp4",
      ".webm": "audio/webm",
    };
    const fileName = `audio${ext}`;
    const contentType = contentTypeByExt[ext] || "application/octet-stream";

    const formData = new FormDataLib();
    formData.append("file", audioBuffer, { filename: fileName, contentType });
    const whisperModel = provider.provider === "GROQ" ? "whisper-large-v3" : "whisper-1";
    formData.append("model", whisperModel);
    formData.append("language", language);
    formData.append("response_format", "json");

    const whisperUrl =
      provider.provider === "GROQ"
        ? "https://api.groq.com/openai/v1/audio/transcriptions"
        : "https://api.openai.com/v1/audio/transcriptions";

    const response = await fetch(whisperUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        ...formData.getHeaders(),
      },
      body: formData as any,
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const err = await response.text();
      logger.error(`[Transcription] Erro API Whisper (${provider.provider}): ${response.status} ${err}`);
      await writeAiUsageLog({
        ts: new Date().toISOString(),
        provider: provider.provider,
        model: whisperModel,
        channel: "audio",
        stage: "transcribe",
        success: false,
        latencyMs: Date.now() - startedAt,
        fallbackUsed: true,
        attempt: 98,
        error: `HTTP ${response.status}`,
      });
      return null;
    }

    const result = (await response.json()) as { text: string; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } };
    logger.info(`[Transcription] API (${provider.provider}): "${result.text?.substring(0, 80)}"`);
    await writeAiUsageLog({
      ts: new Date().toISOString(),
      provider: provider.provider,
      model: whisperModel,
      channel: "audio",
      stage: "transcribe",
      success: Boolean(result.text),
      latencyMs: Date.now() - startedAt,
      fallbackUsed: true,
      attempt: 98,
      promptTokens: Number(result.usage?.prompt_tokens || 0),
      completionTokens: Number(result.usage?.completion_tokens || 0),
      totalTokens: Number(result.usage?.total_tokens || 0),
    });
    return result.text || null;
  } catch (err) {
    logger.error("[Transcription] Erro ao chamar API:", err);
    await writeAiUsageLog({
      ts: new Date().toISOString(),
      provider: "WHISPER_API",
      model: "whisper-1",
      channel: "audio",
      stage: "transcribe",
      success: false,
      latencyMs: 0,
      fallbackUsed: true,
      attempt: 98,
      error: String(err),
    });
    return null;
  }
}

// ─── Ponto de entrada principal ──────────────────────────────────────────────
// Tenta: 1) ABACUS (cadeia de modelos de áudio) → 2) Whisper API (OpenAI/Groq) → 3) Whisper local
export async function transcribeAudio(audioPath: string, language = "pt"): Promise<string | null> {
  // Converte para MP3 antes para que ABACUS aceite (só recebe wav/mp3) e
  // que o Whisper API receba um Content-Type correto.
  let workPath = audioPath;
  const ext = path.extname(audioPath).toLowerCase();
  let tempMp3: string | null = null;
  if (ext !== ".mp3" && ext !== ".wav") {
    try {
      tempMp3 = await convertToMp3(audioPath);
      workPath = tempMp3;
      logger.info(`[Transcription] Áudio convertido para MP3: ${tempMp3}`);
    } catch (err) {
      logger.warn(`[Transcription] Falha ao converter para MP3 (${err}); seguindo com formato original.`);
    }
  }

  try {
    // 1) Transcreve o áudio para texto via Whisper API (OpenAI/Groq)
    const apiResult = await transcribeViaWhisperApi(workPath, language);
    if (apiResult) return apiResult;

    // 2) Tenta ABACUS nativo (agora com mp3 garantido)
    const abacusAudioResult = await transcribeViaAbacusAudioModels(workPath, language);
    if (abacusAudioResult) return abacusAudioResult;

    // 3) Fallback local
    logger.info("[Transcription] ABACUS/Whisper API indisponíveis — usando Whisper local...");
    return await transcribeLocal(workPath, language);
  } finally {
    if (tempMp3) {
      fs.promises.unlink(tempMp3).catch(() => {});
    }
  }
}
