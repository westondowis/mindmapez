/**
 * Multimodal memory viewers (v5.35+). Pure types + server-side validation, shared by the
 * client dispatcher, the server functions and node tests (no runtime imports).
 */

/** Serializable JSON (server functions need a concrete, serializable type rather than unknown). */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export const VIEWER_TYPES = [
  "plain",
  "dataset",
  "html_app",
  "structured_tree",
  "svg_viewer",
  "image",
  "interactive_checklist",
  "media",
  "document_reader",
  "calendar_event",
  "contacts_crm",
  "email_thread",
  "geo_map",
  "archive_tree",
  "file",
] as const;
export type ViewerType = (typeof VIEWER_TYPES)[number];

export function isViewerType(v: unknown): v is ViewerType {
  return typeof v === "string" && (VIEWER_TYPES as readonly string[]).includes(v);
}

/** Raw original kept inline as a data URL only up to this size (Vercel body ≈ 4.5 MB after base64). */
export const INLINE_ORIGINAL_MAX_BYTES = 3_000_000;
/** base64 data URL length that corresponds to INLINE_ORIGINAL_MAX_BYTES plus a mime header. */
export const INLINE_DATA_URL_MAX_CHARS = Math.ceil(INLINE_ORIGINAL_MAX_BYTES / 3) * 4 + 128;
export const ARTIFACT_STATE_MAX_BYTES = 262_144;
export const EXTRACTED_METADATA_MAX_BYTES = 1_048_576;
export const THUMB_MAX_CHARS = 24_000;

export type ChecklistItem = { id: string; text: string; completed: boolean; dueDate?: string };
export type TranscriptSegment = { startSec: number; endSec: number; text: string; speaker?: string };
export type OutlineEntry = { level: number; text: string; anchor: string };

export type CalendarEvent = {
  uid: string;
  summary: string;
  start: string;
  end?: string;
  allDay: boolean;
  tz?: string;
  location?: string;
  joinUrl?: string;
  rrule?: string;
  organizer?: string;
  attendees?: string[];
  description?: string;
};

export type EmailMessage = {
  id: string;
  from: string;
  to: string[];
  cc?: string[];
  date: string;
  subject: string;
  text: string;
  html?: string;
  attachments: { name: string; mime: string; bytes: number }[];
};

export type GeoFeature = {
  kind: "point" | "line" | "polygon";
  name?: string;
  description?: string;
  coords: [number, number][]; // [lat, lng]
  lengthKm?: number;
};

export type ArchiveEntry = { path: string; bytes: number; compressed: number; previewable: boolean; dir: boolean };

export type TreeNode = { k: string; t: "object" | "array" | "string" | "number" | "boolean" | "null"; v?: string; c?: TreeNode[] };

export type ExtractedMetadata =
  | { v: "dataset"; datasetId: string }
  | { v: "html_app"; title?: string; bytes: number; hasScripts: boolean }
  | { v: "structured_tree"; format: "json" | "yaml" | "xml"; nodes: number; depth: number; truncated: boolean; raw?: boolean; tree: TreeNode | null }
  | { v: "svg_viewer"; width?: number; height?: number; texts: string[] }
  | { v: "image"; width: number; height: number; caption?: string; ocrText?: string; promptText?: string; heicNotice?: boolean }
  | { v: "interactive_checklist"; width?: number; height?: number; caption?: string; ocrText?: string }
  | {
      v: "media";
      kind: "audio" | "video";
      durationSec: number;
      width?: number;
      height?: number;
      segments: TranscriptSegment[];
      originalStored: boolean;
      posterAtSec?: number;
      transcriptSource?: "segments" | "text" | "none";
      previewUnsupported?: boolean;
    }
  | {
      v: "document_reader";
      format: "pdf" | "docx" | "doc" | "rtf" | "epub" | "txt" | "md" | "html";
      pages?: number;
      words: number;
      outline: OutlineEntry[];
      digest?: { summary: string; keyPoints: string[] };
      lossy?: boolean;
      originalStored: boolean;
    }
  | { v: "calendar_event"; events: CalendarEvent[] }
  | { v: "contacts_crm"; datasetId: string; count: number }
  | { v: "email_thread"; messages: EmailMessage[]; truncated: boolean }
  | { v: "geo_map"; bbox: [number, number, number, number] | null; features: GeoFeature[] }
  | { v: "archive_tree"; entries: ArchiveEntry[]; totalBytes: number; truncated: boolean }
  | { v: "file"; mime: string; bytes: number; note?: string };

export type ArtifactState = {
  kv?: Record<string, string>;
  items?: ChecklistItem[];
  mode?: "summary" | "reader" | "original";
  lastSec?: number;
  expanded?: string[];
  promptText?: string;
  caption?: string;
};

function byteLength(text: string): number {
  // UTF-8 length without TextEncoder dependency differences.
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

export function jsonBytes(value: unknown): number {
  return byteLength(JSON.stringify(value ?? {}));
}

export type ViewerFieldsInput = {
  viewerType?: unknown;
  extractedMetadata?: unknown;
  artifactState?: unknown;
  thumbDataUrl?: unknown;
};

/** Keeps an inline original only when it fits the 3 MB cap; larger originals are dropped, never the memory. */
export function inlineMediaOrNull(mediaUrl: string | null | undefined): string | null {
  if (!mediaUrl) return null;
  if (/^https:\/\//i.test(mediaUrl)) return mediaUrl.length <= 2048 ? mediaUrl : null;
  if (!mediaUrl.startsWith("data:")) return null;
  return mediaUrl.length <= INLINE_DATA_URL_MAX_CHARS ? mediaUrl : null;
}

export type ViewerFields = {
  viewerType: ViewerType;
  extractedMetadata: Record<string, unknown>;
  artifactState: Record<string, unknown>;
  thumbDataUrl: string | null;
};

/**
 * Server-side re-validation of everything the client dispatcher produced. Throws with a
 * user-readable message when a cap is exceeded; never trusts client sizes.
 */
export function validateViewerFields(input: ViewerFieldsInput): ViewerFields {
  const viewerType = input.viewerType === undefined || input.viewerType === null ? "plain" : input.viewerType;
  if (!isViewerType(viewerType)) throw new Error("Unknown viewer type");
  const asObject = (v: unknown, label: string): Record<string, unknown> => {
    if (v === undefined || v === null) return {};
    if (typeof v !== "object" || Array.isArray(v)) throw new Error(`${label} must be an object`);
    return v as Record<string, unknown>;
  };
  const extractedMetadata = asObject(input.extractedMetadata, "Extracted metadata");
  const artifactState = asObject(input.artifactState, "Viewer state");
  if (jsonBytes(extractedMetadata) > EXTRACTED_METADATA_MAX_BYTES) throw new Error("Extracted details are larger than 1 MB");
  if (jsonBytes(artifactState) > ARTIFACT_STATE_MAX_BYTES) throw new Error("Viewer state is larger than 256 KB");
  let thumbDataUrl: string | null = null;
  if (typeof input.thumbDataUrl === "string" && input.thumbDataUrl) {
    if (!/^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(input.thumbDataUrl)) throw new Error("Thumbnail must be a base64 image");
    if (input.thumbDataUrl.length > THUMB_MAX_CHARS) throw new Error("Thumbnail is too large");
    thumbDataUrl = input.thumbDataUrl;
  }
  return { viewerType, extractedMetadata, artifactState, thumbDataUrl };
}

export const BRIDGE_LIMITS = {
  maxKeyChars: 128,
  maxValueBytes: 32_768,
  maxKeys: 200,
  maxTotalBytes: ARTIFACT_STATE_MAX_BYTES - 4_096,
  maxOpsPerSecond: 50,
} as const;

/** Applies one brainStorage op to a kv map, enforcing the bridge caps. Pure for tests. */
export function applyKvOp(
  kv: Record<string, string>,
  op: { op: "set" | "remove" | "clear"; key?: string; value?: string },
): { ok: true; kv: Record<string, string> } | { ok: false; error: "too_large" | "bad_request" } {
  if (op.op === "clear") return { ok: true, kv: {} };
  if (typeof op.key !== "string" || !op.key || op.key.length > BRIDGE_LIMITS.maxKeyChars) return { ok: false, error: "bad_request" };
  if (op.op === "remove") {
    const next = { ...kv };
    delete next[op.key];
    return { ok: true, kv: next };
  }
  if (typeof op.value !== "string") return { ok: false, error: "bad_request" };
  if (byteLength(op.value) > BRIDGE_LIMITS.maxValueBytes) return { ok: false, error: "too_large" };
  const next = { ...kv, [op.key]: op.value };
  if (Object.keys(next).length > BRIDGE_LIMITS.maxKeys) return { ok: false, error: "too_large" };
  if (jsonBytes(next) > BRIDGE_LIMITS.maxTotalBytes) return { ok: false, error: "too_large" };
  return { ok: true, kv: next };
}
