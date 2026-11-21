import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { newId } from "@/lib/utils";
import { applyVisionCore, saveMediaTranscriptCore } from "@/lib/digestion/artifact-store";
import { buildVisionMessages, parseVisionReply, VISION_LIMITS, VISION_MODES, visionBody, type VisionMode, type VisionResult } from "@/lib/digestion/vision-core";
import { cleanSegments, parseVerboseJson, transcriptionConfig } from "@/lib/digestion/media-core";
import type { JsonObject } from "@/lib/digestion/viewer-types";
import { llmChat, llmConfig } from "./ai";

type VisionReply = { ok: true; result: VisionResult & { body: string } } | { ok: false; error: string };

async function runVision(dataUrl: string, mode: VisionMode): Promise<VisionReply> {
  if (!llmConfig()) return { ok: false, error: "AI vision is off (no LLM_API_KEY or XAI_API_KEY)" };
  if (!/^data:image\/(png|jpeg|webp|gif);base64,/.test(dataUrl)) return { ok: false, error: "Vision needs a PNG, JPEG, WebP or GIF image" };
  if (dataUrl.length > VISION_LIMITS.maxImageChars) return { ok: false, error: "Image is too large for vision" };
  const reply = await llmChat(buildVisionMessages(mode, dataUrl), { maxTokens: 1500, temperature: 0.1, timeoutMs: 45_000 });
  if (!reply.ok) return { ok: false, error: reply.error.includes("400") ? "The configured AI model can't read images (set LLM_MODEL to a vision model)" : reply.error };
  const result = parseVisionReply(reply.text, mode, newId);
  if (!result) return { ok: false, error: "The AI reply could not be read; try again" };
  return { ok: true, result: { ...result, body: visionBody(result) } };
}

export const visionStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => ({ vision: Boolean(llmConfig()), transcription: transcriptionConfig(process.env)?.provider ?? null }));

/** Reads an image that is being captured (not saved yet): checklist / prompt / caption / OCR. */
export const analyzeImage = createServerFn({ method: "POST" })
  .validator((input: { dataUrl: string; mode: VisionMode }) => {
    if (!VISION_MODES.includes(input.mode)) throw new Error("Unknown vision mode");
    return input;
  })
  .middleware([authMiddleware])
  .handler(async ({ data }): Promise<JsonObject> => (await runVision(data.dataUrl, data.mode)) as unknown as JsonObject);

/** Re-reads a saved image memory from its stored copy (no re-upload) and stores the result. */
export const analyzeImageMemory = createServerFn({ method: "POST" })
  .validator((input: { id: string; mode: VisionMode }) => {
    if (!VISION_MODES.includes(input.mode)) throw new Error("Unknown vision mode");
    return input;
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true; viewerType: string } | { ok: false; error: string }> => {
    const sql = await getSql();
    const rows = await sql<{ media_url: string | null }>`select media_url from memories where id = ${data.id} and user_id = ${context.userId}`;
    const url = rows[0]?.media_url;
    if (!url) return { ok: false, error: "This image's original isn't stored" };
    const res = await runVision(url, data.mode);
    if (!res.ok) return res;
    return applyVisionCore(sql, context.userId, data.id, res.result);
  });

/**
 * Transcribes one ≤60 s, 16 kHz mono WAV chunk. OpenAI whisper-1 verbose_json gives timed segments
 * (LLM_API_KEY); the xAI endpoint returns text only (XAI_API_KEY), so segments come back empty.
 */
export const transcribeChunk = createServerFn({ method: "POST" })
  .validator((input: { dataUrl: string; offsetSec: number }) => {
    if (!/^data:audio\/wav;base64,/.test(input.dataUrl)) throw new Error("Chunk must be a WAV data URL");
    if (input.dataUrl.length > 3_400_000) throw new Error("Chunk is too large");
    if (!Number.isFinite(input.offsetSec) || input.offsetSec < 0) throw new Error("Bad offset");
    return input;
  })
  .middleware([authMiddleware])
  .handler(async ({ data }): Promise<JsonObject> => {
    const cfg = transcriptionConfig(process.env);
    if (!cfg) return { ok: false, error: "Transcription is off (no LLM_API_KEY or XAI_API_KEY)" };
    const bytes = Buffer.from(data.dataUrl.slice(data.dataUrl.indexOf(",") + 1), "base64");
    const form = new FormData();
    form.append("model", "whisper-1");
    form.append("file", new Blob([bytes], { type: "audio/wav" }), "chunk.wav");
    if (cfg.segments) form.append("response_format", "verbose_json");
    try {
      const res = await fetch(cfg.url, { method: "POST", headers: { Authorization: `Bearer ${cfg.apiKey}` }, body: form, signal: AbortSignal.timeout(60_000) });
      if (!res.ok) return { ok: false, error: `Transcription error ${res.status}` };
      const parsed = parseVerboseJson(await res.json(), data.offsetSec);
      return { ok: true, text: parsed.text, segments: (cfg.segments ? parsed.segments : []) as unknown as JsonObject[], source: cfg.segments ? "segments" : "text" };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Transcription failed" };
    }
  });

export const saveMediaTranscript = createServerFn({ method: "POST" })
  .validator((input: { id: string; segments: unknown; text: string; source: "segments" | "text" }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const segments = cleanSegments(data.segments);
    if (!segments) return { ok: false, error: "Invalid transcript segments" };
    if (typeof data.text !== "string" || (data.source !== "segments" && data.source !== "text")) return { ok: false, error: "Invalid transcript" };
    const sql = await getSql();
    return saveMediaTranscriptCore(sql, context.userId, data.id, { segments, text: data.text, source: data.source });
  });
