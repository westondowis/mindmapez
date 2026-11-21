/**
 * Audio/video transcription helpers: 16 kHz mono 16-bit WAV encoding, chunk planning, provider
 * selection and verbose_json segment parsing. Pure (node-tested); decoding lives in media.ts.
 */
import type { TranscriptSegment } from "./viewer-types.ts";

export const MEDIA_LIMITS = {
  sampleRate: 16_000,
  chunkSec: 60,
  /** Longest stretch transcribed per file (decoding happens in browser memory). */
  maxTranscribeSec: 30 * 60,
  /** Largest upload decoded for a transcript; bigger files keep poster + metadata only. */
  maxDecodeBytes: 150 * 1024 * 1024,
  maxSegments: 4000,
  posterAtSec: 2,
} as const;

export function encodeWav(samples: Float32Array, sampleRate: number = MEDIA_LIMITS.sampleRate): Uint8Array {
  const out = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(out.buffer);
  const ascii = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i);
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return out;
}

export function chunkRanges(durationSec: number, chunkSec: number = MEDIA_LIMITS.chunkSec, maxSec: number = MEDIA_LIMITS.maxTranscribeSec): { start: number; end: number }[] {
  const total = Math.min(durationSec, maxSec);
  const out: { start: number; end: number }[] = [];
  for (let s = 0; s < total; s += chunkSec) out.push({ start: s, end: Math.min(total, s + chunkSec) });
  return out;
}

export type TranscriptionConfig = { provider: "openai" | "xai"; url: string; apiKey: string; segments: boolean };

/** OpenAI whisper-1 verbose_json (segments) when LLM_API_KEY is set; otherwise xAI text only. */
export function transcriptionConfig(env: Record<string, string | undefined>): TranscriptionConfig | null {
  const llm = env.LLM_API_KEY?.trim();
  if (llm) {
    const base = (env.LLM_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");
    return { provider: "openai", url: `${base}/audio/transcriptions`, apiKey: llm, segments: true };
  }
  const xai = env.XAI_API_KEY?.trim();
  if (xai) return { provider: "xai", url: "https://api.x.ai/v1/audio/transcriptions", apiKey: xai, segments: false };
  return null;
}

export function parseVerboseJson(json: unknown, offsetSec: number): { text: string; segments: TranscriptSegment[] } {
  const j = (json ?? {}) as { text?: unknown; segments?: unknown };
  const text = typeof j.text === "string" ? j.text.trim() : "";
  const segments: TranscriptSegment[] = [];
  if (Array.isArray(j.segments)) {
    for (const s of j.segments as Record<string, unknown>[]) {
      const t = typeof s.text === "string" ? s.text.trim() : "";
      const a = Number(s.start);
      const b = Number(s.end);
      if (!t || !Number.isFinite(a)) continue;
      const seg: TranscriptSegment = { startSec: round(a + offsetSec), endSec: round((Number.isFinite(b) ? b : a) + offsetSec), text: t.slice(0, 2000) };
      if (typeof s.speaker === "string" && s.speaker) seg.speaker = s.speaker.slice(0, 40);
      segments.push(seg);
    }
  }
  return { text, segments };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function segmentsText(segments: TranscriptSegment[]): string {
  return segments.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim();
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

/** Validates transcript segments sent from the browser before they're stored. */
export function cleanSegments(raw: unknown): TranscriptSegment[] | null {
  if (!Array.isArray(raw) || raw.length > MEDIA_LIMITS.maxSegments) return null;
  const out: TranscriptSegment[] = [];
  for (const s of raw as Record<string, unknown>[]) {
    if (!s || typeof s !== "object") return null;
    const a = Number(s.startSec);
    const b = Number(s.endSec);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < a || typeof s.text !== "string") return null;
    const seg: TranscriptSegment = { startSec: a, endSec: b, text: s.text.slice(0, 2000) };
    if (typeof s.speaker === "string" && s.speaker) seg.speaker = s.speaker.slice(0, 40);
    out.push(seg);
  }
  return out;
}
