/**
 * Saves one ingested item from the browser. Datasets stream: begin → 500-row normalized batches
 * (each retried up to 3 times; the server ignores duplicates) → finalize. A failed upload is
 * abandoned so no half-finished dataset lingers. Everything else is a single createMemory call.
 */
import type { IngestItem } from "../ingest.ts";
import { createMemory, type CreateMemoryInput } from "../server/memories.ts";
import { abandonDataset, appendDigestRows, beginDataset, finalizeDataset } from "../server/digestion.ts";
import { normalizeRow } from "./normalize.ts";
import { DATASET_LIMITS } from "./limits.ts";
import type { JsonObject } from "./viewer-types.ts";

export type SaveOptions = {
  conceptId?: string | null;
  tags?: string[];
  emoji?: string | null;
  color?: string | null;
  onProgress?: (done: number, total: number) => void;
};

export type SaveResult = { ok: true; memoryId: string } | { ok: false; error: string };

export function payloadFromIngestItem(item: IngestItem, opts: SaveOptions): CreateMemoryInput {
  const memoryType = item.memoryType ?? (item.kind === "link" ? "link" : item.kind === "rich" || item.kind === "dataset" ? "document" : item.kind);
  return {
    title: item.title || undefined,
    body: item.body || item.title || item.mediaName || item.sourceUrl || "Imported memory",
    memoryType,
    transcript: item.transcript ?? null,
    mediaUrl: item.mediaUrl,
    mediaMime: item.mediaMime,
    mediaName: item.mediaName,
    emoji: opts.emoji ?? null,
    color: opts.color ?? null,
    tags: opts.tags ?? [],
    sourceUrl: item.sourceUrl,
    conceptId: opts.conceptId ?? null,
    aiSummary: item.aiSummary ?? null,
    viewerType: item.viewerType,
    extractedMetadata: item.extractedMetadata ?? null,
    artifactState: item.artifactState ?? null,
    thumbDataUrl: item.thumbDataUrl ?? null,
  };
}

async function withRetry<T extends { ok: boolean }>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: T | undefined;
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      last = await fn();
      if (last.ok) return last;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }
  if (last) return last;
  throw lastErr instanceof Error ? lastErr : new Error("Upload failed");
}

export async function saveDatasetItem(item: IngestItem, opts: SaveOptions): Promise<SaveResult> {
  const draft = item.dataset!;
  const begun = await beginDataset({
    data: {
      filename: draft.filename,
      format: draft.format,
      archetype: draft.schema.archetype,
      schema: draft.schema as unknown as JsonObject,
      conceptId: opts.conceptId ?? null,
      title: item.title,
      tags: opts.tags,
      expectedRows: draft.rows.length,
      emoji: opts.emoji ?? null,
      color: opts.color ?? null,
    },
  });
  if (!begun.ok) return begun;
  const total = draft.rows.length;
  try {
    let batch: { canonical: JsonObject; custom: JsonObject }[] = [];
    let start = 0;
    let bytes = 0;
    const flush = async () => {
      if (!batch.length) return;
      const rows = batch;
      const startIndex = start;
      const res = await withRetry(() => appendDigestRows({ data: { datasetId: begun.datasetId, startIndex, rows } }));
      if (!res.ok) throw new Error(res.error);
      start += rows.length;
      batch = [];
      bytes = 0;
      opts.onProgress?.(start, total);
      await new Promise((r) => setTimeout(r, 0));
    };
    for (const values of draft.rows) {
      const n = normalizeRow(values, draft.schema);
      const row = { canonical: n.canonical as JsonObject, custom: n.custom as JsonObject };
      const size = JSON.stringify(row).length;
      if (batch.length >= DATASET_LIMITS.batchRows || bytes + size > DATASET_LIMITS.maxBatchBytes - 4096) await flush();
      batch.push(row);
      bytes += size;
    }
    await flush();
    const fin = await withRetry(() => finalizeDataset({ data: { datasetId: begun.datasetId } }));
    if (!fin.ok) throw new Error(fin.error);
    return { ok: true, memoryId: begun.memoryId };
  } catch (err) {
    await abandonDataset({ data: { datasetId: begun.datasetId } }).catch(() => undefined);
    return { ok: false, error: err instanceof Error ? err.message : "Dataset upload failed" };
  }
}

export async function saveIngestItem(item: IngestItem, opts: SaveOptions): Promise<SaveResult> {
  if (item.dataset) return saveDatasetItem(item, opts);
  const res = await createMemory({ data: payloadFromIngestItem(item, opts) });
  return res.ok ? { ok: true, memoryId: res.memory.id } : res;
}
