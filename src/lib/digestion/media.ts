/**
 * Browser-side audio/video digestion: a poster frame at ~2 s, duration/size, 16 kHz mono decode and
 * chunked transcription through the transcribeChunk server function. Codec gaps (HEVC .mov in
 * Chrome, MKV in Safari, MPEG-1/2) fall back to metadata only, clearly labelled.
 */
import { chunkRanges, encodeWav, MEDIA_LIMITS } from "./media-core.ts";
import type { TranscriptSegment } from "./viewer-types.ts";
import { thumbFromCanvas } from "./image.ts";

export type MediaProbe = { kind: "audio" | "video"; durationSec: number; width?: number; height?: number; poster: string | null; posterAtSec?: number; playable: boolean };

function once<T extends keyof HTMLMediaElementEventMap>(el: HTMLMediaElement, ev: T, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const t = setTimeout(() => done(false), timeoutMs);
    const onErr = () => done(false);
    const onOk = () => done(true);
    function done(v: boolean) {
      clearTimeout(t);
      el.removeEventListener(ev, onOk);
      el.removeEventListener("error", onErr);
      resolve(v);
    }
    el.addEventListener(ev, onOk, { once: true });
    el.addEventListener("error", onErr, { once: true });
  });
}

export async function probeMedia(file: File, kind: "audio" | "video"): Promise<MediaProbe> {
  const url = URL.createObjectURL(file);
  const el = document.createElement(kind);
  el.preload = "metadata";
  el.muted = true;
  (el as HTMLVideoElement).playsInline = true;
  el.src = url;
  try {
    const ok = await once(el, "loadedmetadata", 15_000);
    if (!ok) return { kind, durationSec: 0, poster: null, playable: false };
    const durationSec = Number.isFinite(el.duration) ? el.duration : 0;
    if (kind === "audio") return { kind, durationSec, poster: null, playable: true };
    const v = el as HTMLVideoElement;
    const at = Math.min(MEDIA_LIMITS.posterAtSec, durationSec > 0 ? durationSec / 2 : 0);
    let poster: string | null = null;
    if (v.videoWidth) {
      v.currentTime = at;
      if (await once(v, "seeked", 10_000)) {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
        canvas.width = Math.max(1, Math.round(v.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(v.videoHeight * scale));
        try {
          canvas.getContext("2d")!.drawImage(v, 0, 0, canvas.width, canvas.height);
          poster = thumbFromCanvas(canvas);
        } catch {
          poster = null;
        }
      }
    }
    return { kind, durationSec, width: v.videoWidth || undefined, height: v.videoHeight || undefined, poster, posterAtSec: at, playable: Boolean(v.videoWidth) };
  } finally {
    el.removeAttribute("src");
    el.load();
    URL.revokeObjectURL(url);
  }
}

/** Decodes and resamples to 16 kHz mono (first 30 minutes). Throws when the codec isn't supported. */
export async function decodeMono16k(data: ArrayBuffer): Promise<{ samples: Float32Array; durationSec: number; truncated: boolean }> {
  const AC = (window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext) as typeof OfflineAudioContext;
  const probe = new AC(1, 1, MEDIA_LIMITS.sampleRate);
  const decoded = await probe.decodeAudioData(data);
  const keepSec = Math.min(decoded.duration, MEDIA_LIMITS.maxTranscribeSec);
  const frames = Math.max(1, Math.ceil(keepSec * MEDIA_LIMITS.sampleRate));
  const ctx = new AC(1, frames, MEDIA_LIMITS.sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = decoded;
  src.connect(ctx.destination);
  src.start(0, 0, keepSec);
  const rendered = await ctx.startRendering();
  return { samples: rendered.getChannelData(0), durationSec: decoded.duration, truncated: decoded.duration > MEDIA_LIMITS.maxTranscribeSec };
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let bin = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) bin += String.fromCharCode(...bytes.subarray(i, i + step));
  return `data:${mime};base64,${btoa(bin)}`;
}

export type TranscriptOutcome = { ok: true; text: string; segments: TranscriptSegment[]; source: "segments" | "text"; truncated: boolean } | { ok: false; error: string };

/** Decode → 60 s WAV chunks → transcribeChunk, in order. Silent chunks are skipped. */
export async function transcribeMediaFile(file: Blob, onProgress?: (done: number, total: number) => void): Promise<TranscriptOutcome> {
  if (file.size > MEDIA_LIMITS.maxDecodeBytes) return { ok: false, error: "File is too large to transcribe in the browser (150 MB limit)" };
  let decoded;
  try {
    decoded = await decodeMono16k(await file.arrayBuffer());
  } catch {
    return { ok: false, error: "This browser can't decode the audio track" };
  }
  const { transcribeChunk } = await import("../server/vision.ts");
  const ranges = chunkRanges(decoded.samples.length / MEDIA_LIMITS.sampleRate);
  const texts: string[] = [];
  const segments: TranscriptSegment[] = [];
  let source: "segments" | "text" = "text";
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i]!;
    const slice = decoded.samples.subarray(Math.floor(r.start * MEDIA_LIMITS.sampleRate), Math.floor(r.end * MEDIA_LIMITS.sampleRate));
    let peak = 0;
    for (let k = 0; k < slice.length; k += 64) peak = Math.max(peak, Math.abs(slice[k]!));
    onProgress?.(i, ranges.length);
    if (peak < 0.01) continue;
    const res = (await transcribeChunk({ data: { dataUrl: bytesToDataUrl(encodeWav(slice), "audio/wav"), offsetSec: r.start } })) as { ok: boolean; error?: string; text?: string; segments?: TranscriptSegment[]; source?: "segments" | "text" };
    if (!res.ok) return { ok: false, error: res.error ?? "Transcription failed" };
    if (res.text) texts.push(res.text);
    if (res.segments?.length) segments.push(...res.segments);
    if (res.source === "segments") source = "segments";
  }
  onProgress?.(ranges.length, ranges.length);
  return { ok: true, text: texts.join(" ").trim(), segments, source: segments.length ? source : "text", truncated: decoded.truncated };
}

/**
 * Originals over the 3 MB inline cap can't be stored, so the file stays playable only in this tab:
 * keyed by name + size, looked up by the media viewer after saving.
 */
const sessionMedia = new Map<string, string>();

export function sessionMediaKey(name: string, bytes: number): string {
  return `${name}:${bytes}`;
}

export function rememberSessionMedia(file: File): string {
  const key = sessionMediaKey(file.name, file.size);
  if (!sessionMedia.has(key)) sessionMedia.set(key, URL.createObjectURL(file));
  return key;
}

export function sessionMediaUrl(key: string | undefined): string | null {
  return key ? sessionMedia.get(key) ?? null : null;
}
