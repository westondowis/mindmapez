import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { newId } from "@/lib/utils";
import type { ReviewAction, ReviewItem } from "@/lib/voice";

type Row = {
  id: string;
  raw: string;
  key_points_json: string;
  keywords_json: string;
  action: string;
  concept_id: string | null;
  concept_name: string | null;
  suggested_name: string | null;
  created_at: string | Date;
};

const parse = (s: string): string[] => {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
};

/** Queue a parsed voice note for manual review instead of committing it to the graph. */
export const queueReview = createServerFn({ method: "POST" })
  .validator(
    (input: {
      raw: string;
      keyPoints: string[];
      keywords: string[];
      action: ReviewAction;
      conceptId: string | null;
      conceptName: string | null;
      suggestedName: string | null;
    }) => input,
  )
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const raw = data.raw.trim().slice(0, 8000);
    if (!raw) return { ok: false as const, error: "Nothing to save" };
    const sql = await getSql();
    const id = newId();
    await sql`
      insert into pending_reviews
        (id, user_id, raw, key_points_json, keywords_json, action, concept_id, concept_name, suggested_name)
      values (${id}, ${context.userId}, ${raw}, ${JSON.stringify(data.keyPoints.slice(0, 6))},
        ${JSON.stringify(data.keywords.slice(0, 8))}, ${data.action}, ${data.conceptId},
        ${data.conceptName}, ${data.suggestedName})
    `;
    return { ok: true as const, id };
  });

export const listReviews = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ReviewItem[]> => {
    const sql = await getSql();
    const rows = await sql<Row>`
      select id, raw, key_points_json, keywords_json, action, concept_id, concept_name, suggested_name, created_at
      from pending_reviews where user_id = ${context.userId} and status = 'pending'
      order by created_at asc limit 100
    `;
    return rows.map((r) => ({
      id: r.id,
      raw: r.raw,
      keyPoints: parse(r.key_points_json),
      keywords: parse(r.keywords_json),
      action: (["memory", "branch", "sub-branch"].includes(r.action) ? r.action : "memory") as ReviewAction,
      conceptId: r.concept_id,
      conceptName: r.concept_name,
      suggestedName: r.suggested_name,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  });

/** Mark a review approved/rejected. The client commits approved items through the normal create fns. */
export const resolveReview = createServerFn({ method: "POST" })
  .validator((input: { id: string; status: "approved" | "rejected" }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`
      update pending_reviews set status = ${data.status}
      where id = ${data.id} and user_id = ${context.userId}
    `;
    return { ok: true as const };
  });

/** Record one voice turn: whether the user cut the assistant off, and the topics they talked about. */
export const recordVoiceTurn = createServerFn({ method: "POST" })
  .validator((input: { bargeIn: boolean; keywords: string[] }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{ topics_json: string }>`select topics_json from voice_telemetry where user_id = ${context.userId}`;
    let topics: Record<string, number> = {};
    try {
      topics = JSON.parse(rows[0]?.topics_json ?? "{}") as Record<string, number>;
    } catch {
      topics = {};
    }
    for (const k of data.keywords.slice(0, 6)) topics[k] = (topics[k] ?? 0) + 1;
    const top = Object.entries(topics).sort((a, b) => b[1] - a[1]).slice(0, 20);
    await sql`
      insert into voice_telemetry (user_id, turns, barge_ins, topics_json)
      values (${context.userId}, 1, ${data.bargeIn ? 1 : 0}, ${JSON.stringify(Object.fromEntries(top))})
      on conflict (user_id) do update set
        turns = voice_telemetry.turns + 1,
        barge_ins = voice_telemetry.barge_ins + ${data.bargeIn ? 1 : 0},
        topics_json = excluded.topics_json
    `;
    return { ok: true as const };
  });
