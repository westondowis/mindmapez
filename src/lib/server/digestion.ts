import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import type { DigestArchetype, SchemaJson } from "@/lib/digestion/detect";
import {
  appendRowsCore,
  beginDatasetCore,
  DatasetError,
  failDatasetCore,
  finalizeDatasetCore,
  getDatasetForMemoryCore,
  queryRowsCore,
  type RowQuery,
  type SourceFormat,
} from "@/lib/digestion/store";
import type { JsonObject } from "@/lib/digestion/viewer-types";
import { newId } from "@/lib/utils";
import { createMemoryForUser } from "./memories";

function errorText(err: unknown): string {
  if (err instanceof DatasetError) return err.message;
  console.error("dataset operation failed", err);
  return err instanceof Error ? err.message : "Dataset operation failed";
}

export const beginDataset = createServerFn({ method: "POST" })
  .validator(
    (input: {
      filename: string;
      format: SourceFormat;
      archetype: DigestArchetype;
      schema: JsonObject;
      conceptId?: string | null;
      title?: string;
      tags?: string[];
      expectedRows: number;
      emoji?: string | null;
      color?: string | null;
    }) => input,
  )
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    try {
      const res = await beginDatasetCore(
        sql,
        context.userId,
        { ...data, schema: data.schema as unknown as SchemaJson },
        async (m) => {
          const created = await createMemoryForUser(sql, context.userId, {
            title: m.title,
            body: m.body,
            memoryType: m.memoryType,
            viewerType: m.viewerType,
            conceptId: m.conceptId,
            tags: m.tags,
            aiSummary: m.aiSummary,
            mediaName: m.mediaName,
            emoji: m.emoji,
            color: m.color,
          });
          return created.ok ? { ok: true, memoryId: created.memory.id } : created;
        },
        newId,
      );
      return { ok: true as const, ...res };
    } catch (err) {
      return { ok: false as const, error: errorText(err) };
    }
  });

export const appendDigestRows = createServerFn({ method: "POST" })
  .validator((input: { datasetId: string; startIndex: number; rows: { canonical: JsonObject; custom: JsonObject }[] }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    try {
      return { ok: true as const, ...(await appendRowsCore(sql, context.userId, data)) };
    } catch (err) {
      return { ok: false as const, error: errorText(err) };
    }
  });

export const finalizeDataset = createServerFn({ method: "POST" })
  .validator((input: { datasetId: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    try {
      const res = await finalizeDatasetCore(sql, context.userId, data.datasetId);
      await sql`update user_settings set last_saved_at = now() where user_id = ${context.userId}`;
      return { ok: true as const, memoryId: res.memoryId, rows: res.metrics.rows };
    } catch (err) {
      return { ok: false as const, error: errorText(err) };
    }
  });

export const abandonDataset = createServerFn({ method: "POST" })
  .validator((input: { datasetId: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await failDatasetCore(sql, context.userId, data.datasetId);
    return { ok: true as const };
  });

export const queryDigestedRows = createServerFn({ method: "POST" })
  .validator((input: RowQuery) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    try {
      const res = await queryRowsCore(sql, context.userId, data);
      return { ok: true as const, rows: res.rows as unknown as { rowIndex: number; canonical: JsonObject; custom: JsonObject }[], total: res.total };
    } catch (err) {
      return { ok: false as const, error: errorText(err), rows: [], total: 0 };
    }
  });

export const getDigestForMemory = createServerFn({ method: "GET" })
  .validator((memoryId: string) => memoryId)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const header = await getDatasetForMemoryCore(sql, context.userId, data);
    return header ? (JSON.parse(JSON.stringify(header)) as JsonObject & { datasetId: string }) : null;
  });
