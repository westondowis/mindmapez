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
