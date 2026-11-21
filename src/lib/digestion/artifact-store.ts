/**
 * Viewer state persistence (html_app kv, checklist items, reader position) and the cached document
 * digest. Takes a Sql handle so PGlite tests run the exact SQL. Every statement filters on user_id.
 */
import type { Sql } from "../sql-template.ts";
import { EXTRACTED_METADATA_MAX_BYTES, jsonBytes, validateViewerFields, type JsonObject } from "./viewer-types.ts";

export type ArtifactSaveResult = { ok: true } | { ok: false; error: string };

/** ~1 save per second per memory across serverless instances (artifact_saved_at), 256 KB cap. */
export async function saveArtifactStateCore(sql: Sql, userId: string, id: string, raw: unknown): Promise<ArtifactSaveResult> {
  let state: JsonObject;
  try {
    state = validateViewerFields({ artifactState: raw }).artifactState as JsonObject;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Invalid state" };
  }
  const rows = await sql<{ id: string }>`
    update memories set artifact_state_json = ${JSON.stringify(state)}::jsonb, artifact_saved_at = now(), updated_at = now()
    where id = ${id} and user_id = ${userId}
      and (artifact_saved_at is null or artifact_saved_at < now() - interval '900 milliseconds')
    returning id
  `;
  if (rows.length) return { ok: true };
  const exists = await sql<{ id: string }>`select id from memories where id = ${id} and user_id = ${userId}`;
  return exists.length ? { ok: false, error: "rate_limited" } : { ok: false, error: "Not found" };
}

export type DocDigest = { summary: string; keyPoints: string[] };

export function parseDigestReply(text: string): DocDigest | null {
  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const v = JSON.parse(cleaned.slice(start, end + 1)) as { summary?: unknown; keyPoints?: unknown };
    if (typeof v.summary !== "string" || !v.summary.trim()) return null;
    const keyPoints = Array.isArray(v.keyPoints) ? v.keyPoints.filter((p): p is string => typeof p === "string" && !!p.trim()).slice(0, 12).map((p) => p.trim().slice(0, 400)) : [];
    return { summary: v.summary.trim().slice(0, 4000), keyPoints };
  } catch {
    return null;
  }
}

/** Reads the document text the digest is built from (document_reader memories only). */
export async function documentForDigest(sql: Sql, userId: string, id: string): Promise<{ title: string; body: string; meta: JsonObject } | null> {
  const rows = await sql<{ title: string; body: string; viewer_type: string; extracted_metadata_json: JsonObject | string | null }>`
    select title, body, viewer_type, extracted_metadata_json from memories where id = ${id} and user_id = ${userId}
  `;
  const r = rows[0];
  if (!r || r.viewer_type !== "document_reader") return null;
  const meta = typeof r.extracted_metadata_json === "string" ? (JSON.parse(r.extracted_metadata_json) as JsonObject) : (r.extracted_metadata_json ?? {});
  return { title: r.title, body: r.body, meta };
}

export async function cacheDocumentDigest(sql: Sql, userId: string, id: string, meta: JsonObject, digest: DocDigest): Promise<JsonObject | null> {
  const next: JsonObject = { ...meta, digest: { summary: digest.summary, keyPoints: digest.keyPoints } };
  if (jsonBytes(next) > EXTRACTED_METADATA_MAX_BYTES) return null;
  await sql`update memories set extracted_metadata_json = ${JSON.stringify(next)}::jsonb, updated_at = now() where id = ${id} and user_id = ${userId}`;
  return next;
}

// ── Vision (v5.37) ────────────────────────────────────────────────────────────

type VisionApply = {
  kind: "checklist" | "prompt" | "photo";
  caption: string;
  ocrText: string;
  items: { id: string; text: string; completed: boolean; dueDate?: string }[];
  promptText: string;
  body: string;
};

/**
 * Stores a vision result on an image memory: checklists switch the viewer to interactive_checklist
 * with items in artifact_state; prompts/captions/OCR stay images with the text in metadata. The body
 * is only filled when it is empty or just the title, so user-written notes are never replaced.
 */
export async function applyVisionCore(sql: Sql, userId: string, id: string, r: VisionApply): Promise<{ ok: true; viewerType: string } | { ok: false; error: string }> {
  const rows = await sql<{ title: string; body: string; viewer_type: string; media_name: string | null; extracted_metadata_json: JsonObject | string | null; artifact_state_json: JsonObject | string | null }>`
    select title, body, viewer_type, media_name, extracted_metadata_json, artifact_state_json from memories where id = ${id} and user_id = ${userId}
  `;
  const row = rows[0];
  if (!row) return { ok: false, error: "Not found" };
  if (row.viewer_type !== "image" && row.viewer_type !== "interactive_checklist") return { ok: false, error: "Only images can be read this way" };
  const parse = (v: JsonObject | string | null): JsonObject => (typeof v === "string" ? (JSON.parse(v) as JsonObject) : (v ?? {}));
  const prevMeta = parse(row.extracted_metadata_json);
  const prevState = parse(row.artifact_state_json);
  const viewerType = r.kind === "checklist" ? "interactive_checklist" : "image";
  const meta: JsonObject = { ...prevMeta, v: viewerType };
  if (r.caption) meta.caption = r.caption;
  if (r.ocrText) meta.ocrText = r.ocrText;
  if (r.kind === "prompt") meta.promptText = r.promptText;
  const state: JsonObject = { ...prevState };
  if (r.kind === "checklist") state.items = r.items as unknown as JsonObject[];
  const valid = validateViewerFields({ viewerType, extractedMetadata: meta, artifactState: state });
  const placeholder = !row.body.trim() || row.body.trim() === row.title.trim() || row.body.trim() === (row.media_name ?? "").trim();
  const body = placeholder && r.body ? r.body : row.body;
  await sql`
    update memories set viewer_type = ${viewerType}, extracted_metadata_json = ${JSON.stringify(valid.extractedMetadata)}::jsonb,
      artifact_state_json = ${JSON.stringify(valid.artifactState)}::jsonb, body = ${body}, updated_at = now()
    where id = ${id} and user_id = ${userId}
  `;
  return { ok: true, viewerType };
}

// ── Media transcripts (v5.37) ─────────────────────────────────────────────────

export async function saveMediaTranscriptCore(
  sql: Sql,
  userId: string,
  id: string,
  input: { segments: { startSec: number; endSec: number; text: string; speaker?: string }[]; text: string; source: "segments" | "text" },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = await sql<{ viewer_type: string; extracted_metadata_json: JsonObject | string | null }>`
    select viewer_type, extracted_metadata_json from memories where id = ${id} and user_id = ${userId}
  `;
  const row = rows[0];
  if (!row) return { ok: false, error: "Not found" };
  if (row.viewer_type !== "media") return { ok: false, error: "Only audio or video memories have transcripts" };
  const prev = typeof row.extracted_metadata_json === "string" ? (JSON.parse(row.extracted_metadata_json) as JsonObject) : (row.extracted_metadata_json ?? {});
  const meta: JsonObject = { ...prev, segments: input.segments as unknown as JsonObject[], transcriptSource: input.source };
  if (jsonBytes(meta) > EXTRACTED_METADATA_MAX_BYTES) return { ok: false, error: "Transcript is too long to store" };
  const transcript = input.text.slice(0, 400_000);
  await sql`
    update memories set extracted_metadata_json = ${JSON.stringify(meta)}::jsonb, transcript = ${transcript || null}, updated_at = now()
    where id = ${id} and user_id = ${userId}
  `;
  return { ok: true };
}
