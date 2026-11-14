import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, withTransaction } from "@/lib/db";
import { assignSectorFromName, branchKindForDepth, isSectorId } from "@/lib/brain";
import { newBranchPosition } from "@/lib/branch-memories";
import { organizeLocal } from "@/lib/organize";
import { normalizeTags } from "@/lib/tags";
import { FREE_MEMORY_LIMIT } from "@/lib/types";
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
  connector_name: string | null;
  suggested_title: string | null;
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
      select r.id, r.raw, r.key_points_json, r.keywords_json, r.action, r.concept_id, r.concept_name,
             r.suggested_name, r.created_at,
             case when r.source_kind = 'connector' then coalesce(k.display_name, 'Connector') end as connector_name,
             r.untrusted_payload_json ->> 'title' as suggested_title
      from pending_reviews r
      left join connectors k on k.id = r.connector_id and k.user_id = r.user_id
      where r.user_id = ${context.userId} and r.status = 'pending'
      order by r.created_at asc limit 100
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
      connectorName: r.connector_name,
      suggestedTitle: r.suggested_title,
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

type ConceptLite = { id: string; parent_id: string | null; sector_id: string | null; position_x: number | null; position_y: number | null };

/**
 * Approve a queued voice note in ONE transaction: claim the review row, create the branch or
 * sub-branch if asked, insert the memory with its tags and concept links, and stamp the save.
 * Any failure rolls everything back, so an orphaned branch or a half-approved item is impossible.
 * The note text comes from the queued row, not the client; only the user's edits are accepted.
 */
export const approveReviewItem = createServerFn({ method: "POST" })
  .validator(
    (input: {
      id: string;
      action: ReviewAction;
      /** Existing branch to file under; for a sub-branch, its parent. */
      targetId: string | null;
      /** Name for a new branch or sub-branch. */
      branchName?: string;
      title?: string;
      keyPoints?: string[];
    }) => input,
  )
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const userId = context.userId;
    try {
      return await withTransaction(async (tx) => {
        const claimed = await tx<{ raw: string }>`
          update pending_reviews set status = 'approved'
          where id = ${data.id} and user_id = ${userId} and status = 'pending'
          returning raw
        `;
        const raw = claimed[0]?.raw;
        if (!raw) throw new Error("That item was already handled.");

        const plan = await tx<{ plan: string }>`select plan from user_settings where user_id = ${userId}`;
        if (plan[0]?.plan !== "pro") {
          const n = await tx<{ n: number }>`select count(*)::int as n from memories where user_id = ${userId}`;
          if (Number(n[0]?.n ?? 0) >= FREE_MEMORY_LIMIT) throw new Error("Free plan limit reached. Upgrade to Pro for unlimited memories.");
        }

        const concepts = await tx<ConceptLite>`
          select id, parent_id, sector_id, position_x, position_y from concepts where user_id = ${userId}
        `;
        const byId = new Map(concepts.map((c) => [c.id, c]));
        let conceptId: string | null = null;

        if (data.action !== "memory") {
          const name = (data.branchName ?? "").trim();
          if (!name) throw new Error("Give the branch a name.");
          if (name.length > 80) throw new Error("Keep the name under 80 characters.");
          let parent: ConceptLite | null = null;
          if (data.action === "sub-branch") {
            parent = (data.targetId && byId.get(data.targetId)) || null;
            if (!parent) throw new Error("Choose an existing parent branch.");
          }
          let depth = 0;
          if (parent) {
            depth = 1;
            const seen = new Set<string>();
            for (let w: ConceptLite | undefined = parent; w?.parent_id && !seen.has(w.id); w = byId.get(w.parent_id)) {
              seen.add(w.id);
              depth += 1;
            }
          }
          const sectorId = parent ? parent.sector_id : assignSectorFromName(name);
          const siblings = concepts.filter((c) => (c.parent_id ?? null) === (parent?.id ?? null) && (parent ? true : c.sector_id === sectorId)).length;
          const pos = newBranchPosition(parent ? { positionX: parent.position_x, positionY: parent.position_y } : null, siblings);
          conceptId = newId();
          await tx`
            insert into concepts (id, user_id, name, kind, icon, emoji, color, description, parent_id, sector_id, position_x, position_y, updated_at)
            values (${conceptId}, ${userId}, ${name}, ${branchKindForDepth(depth)}, 'brain', '🧠', 'cyan', '',
              ${parent?.id ?? null}, ${sectorId && isSectorId(sectorId) ? sectorId : assignSectorFromName(name)}, ${pos.x}, ${pos.y}, now())
          `;
          if (parent) {
            await tx`
              insert into connections (id, user_id, source_type, source_id, target_type, target_id, strength, reason, status)
              values (${newId()}, ${userId}, 'concept', ${parent.id}, 'concept', ${conceptId}, 0.8, 'branch', 'accepted')
            `;
          }
        } else if (data.targetId) {
          if (!byId.has(data.targetId)) throw new Error("That branch is gone.");
          conceptId = data.targetId;
        }

        const points = (data.keyPoints ?? []).map((k) => k.trim()).filter(Boolean).slice(0, 8);
        const body = raw + (points.length ? "\n\nKey points:\n" + points.map((k) => "• " + k).join("\n") : "");
        const organized = organizeLocal(body, data.title);
        const title = (data.title ?? "").trim().slice(0, 120) || organized.title;
        const tags = JSON.stringify(normalizeTags(organized.tags));
        const id = newId();

        let posX: number | null = null;
        let posY: number | null = null;
        if (conceptId) {
          const hub = (await tx<{ position_x: number | null; position_y: number | null }>`
            select position_x, position_y from concepts where id = ${conceptId} and user_id = ${userId}
          `)[0];
          const sib = await tx<{ n: number }>`select count(*)::int as n from memory_concepts where user_id = ${userId} and concept_id = ${conceptId}`;
          const i = Number(sib[0]?.n ?? 0);
          const angle = (i / Math.max(i + 1, 1)) * Math.PI * 2 - Math.PI / 2;
          posX = (hub?.position_x ?? 0) + Math.cos(angle) * 175;
          posY = (hub?.position_y ?? 0) + Math.sin(angle) * 175;
        }
        await tx`
          insert into memories (id, user_id, title, body, memory_type, emotion, importance, ai_impact, ai_summary, transcript, node_kind, tags_json, position_x, position_y)
          values (${id}, ${userId}, ${title}, ${body}, 'voice', ${organized.emotion}, ${organized.importance}, ${organized.impact},
            ${organized.summary}, ${raw}, ${organized.kind}, ${tags}, ${posX}, ${posY})
        `;
        if (conceptId) {
          await tx`insert into memory_concepts (user_id, memory_id, concept_id) values (${userId}, ${id}, ${conceptId}) on conflict do nothing`;
          await tx`
            insert into connections (id, user_id, source_type, source_id, target_type, target_id, strength, reason, status)
            values (${newId()}, ${userId}, 'memory', ${id}, 'concept', ${conceptId}, 0.7, 'voice review', 'accepted')
          `;
        }
        await tx`update user_settings set last_saved_at = now() where user_id = ${userId}`;
        return { ok: true as const, memoryId: id, conceptId };
      });
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : "Could not approve that item." };
    }
  });
