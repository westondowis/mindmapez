import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { ensureUserSettings } from "./seed";

export type CaptureDraft = {
  mode: string;
  title: string;
  body: string;
  transcript: string;
  mediaUrl: string | null;
  mediaMime: string | null;
  mediaName: string | null;
  tags: string[];
  emoji: string;
  color: string;
  sourceUrl: string;
  sourceKind?: string | null;
};

export const saveAccountDraft = createServerFn({ method: "POST" })
  .validator((input: { capture: CaptureDraft | null }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureUserSettings(sql, context.userId);
    const json = data.capture ? JSON.stringify(data.capture) : null;
    await sql`
      insert into account_drafts (user_id, capture_json, updated_at)
      values (${context.userId}, ${json}, now())
      on conflict (user_id) do update set capture_json = ${json}, updated_at = now()
    `;
    await sql`update user_settings set last_saved_at = now() where user_id = ${context.userId}`;
    return { ok: true as const };
  });

export const getAccountDraft = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await ensureUserSettings(sql, context.userId);
    const rows = await sql<{ capture_json: string | null; updated_at: string }>`
      select capture_json, updated_at from account_drafts where user_id = ${context.userId}
    `;
    const settings = await sql<{ last_saved_at: string | null }>`
      select last_saved_at from user_settings where user_id = ${context.userId}
    `;
    let capture: CaptureDraft | null = null;
    if (rows[0]?.capture_json) {
      try {
        capture = JSON.parse(rows[0].capture_json) as CaptureDraft;
      } catch {
        capture = null;
      }
    }
    return {
      capture,
      lastSavedAt: settings[0]?.last_saved_at ?? rows[0]?.updated_at ?? null,
    };
  });

export const clearAccountDraft = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await sql`delete from account_drafts where user_id = ${context.userId}`;
    return { ok: true as const };
  });
