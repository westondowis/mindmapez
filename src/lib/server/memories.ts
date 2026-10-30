import { createServerFn } from "@tanstack/react-start";
import { assignSectorFromName, mergeSectors, parseSectorOverrides } from "@/lib/brain";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { FREE_MEMORY_LIMIT, type MemoryDetail } from "@/lib/types";
import { newId } from "@/lib/utils";
import { organizeLocal } from "@/lib/organize";
import { mergeTags, normalizeTags } from "@/lib/tags";
import { organizeMemory, suggestTags, transcribeAudio } from "./ai";
import { mapConcept, mapConnection, mapMemory, type MemoryRow } from "./map";
import { ensureUserSettings } from "./seed";

async function getPlan(userId: string) {
  const sql = await getSql();
  const rows = await sql<{ plan: string }>`
    select plan from user_settings where user_id = ${userId}
  `;
  return (rows[0]?.plan === "pro" ? "pro" : "free") as "free" | "pro";
}

export const listMemories = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await ensureUserSettings(sql, context.userId);
    const rows = await sql<MemoryRow>`
      select * from memories where user_id = ${context.userId} order by created_at desc
    `;
    return rows.map(mapMemory);
  });

export const getMemory = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .middleware([authMiddleware])
  .handler(async ({ context, data: id }): Promise<MemoryDetail | null> => {
    const sql = await getSql();
    const rows = await sql<MemoryRow>`
      select * from memories where id = ${id} and user_id = ${context.userId}
    `;
    const row = rows[0];
    if (!row) return null;
    await sql`
      update memories set access_count = access_count + 1
      where id = ${id} and user_id = ${context.userId}
    `;
    const concepts = await sql<{ id: string; name: string; kind: string; icon: string | null; position_x: number | null; position_y: number | null; created_at: string }>`
      select c.* from concepts c
      join memory_concepts mc on mc.concept_id = c.id
      where mc.memory_id = ${id} and mc.user_id = ${context.userId}
    `;
    const relatedRows = await sql<{
      id: string;
      title: string;
      node_kind: string;
      strength: number;
    }>`
      select m.id, m.title, m.node_kind, c.strength
      from connections c
      join memories m on (
        (c.source_type = 'memory' and c.source_id = ${id} and c.target_type = 'memory' and m.id = c.target_id)
        or
        (c.target_type = 'memory' and c.target_id = ${id} and c.source_type = 'memory' and m.id = c.source_id)
      )
      where c.user_id = ${context.userId} and c.status = 'accepted' and m.user_id = ${context.userId}
      order by c.strength desc
      limit 12
    `;
    return {
      ...mapMemory({ ...row, access_count: Number(row.access_count) + 1 }),
      concepts: concepts.map((c) => ({ id: c.id, name: c.name, kind: c.kind as MemoryDetail["concepts"][number]["kind"] })),
      related: relatedRows.map((r) => ({
        id: r.id,
        title: r.title,
        nodeKind: r.node_kind as MemoryDetail["related"][number]["nodeKind"],
        strength: Number(r.strength),
      })),
      connectedConcepts: concepts.map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind as MemoryDetail["connectedConcepts"][number]["kind"],
      })),
    };
  });

export type CreateMemoryInput = {
  title?: string;
  body: string;
  memoryType: MemoryDetail["memoryType"];
  transcript?: string | null;
  mediaUrl?: string | null;
  mediaMime?: string | null;
  mediaName?: string | null;
  emotion?: string | null;
  importance?: number;
  emoji?: string | null;
  color?: string | null;
  conceptId?: string | null;
  tags?: string[];
  sourceUrl?: string | null;
  sourceKind?: string | null;
  /** Caller-supplied quick overview (e.g. from an uploaded document); wins over the auto summary. */
  aiSummary?: string | null;
};

export const createMemory = createServerFn({ method: "POST" })
  .validator((input: CreateMemoryInput) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    try {
      const sql = await getSql();
      await ensureUserSettings(sql, context.userId);
      const countRows = await sql<{ n: number }>`
        select count(*)::int as n from memories where user_id = ${context.userId}
      `;
      const plan = await getPlan(context.userId);
      const count = Number(countRows[0]?.n ?? 0);
      if (plan === "free" && count >= FREE_MEMORY_LIMIT) {
        return { ok: false as const, error: "Free plan limit reached. Upgrade to Pro for unlimited memories." };
      }

      const raw = [data.title, data.body, data.transcript].filter(Boolean).join("\n");
      let transcript = data.transcript ?? null;
      if (data.memoryType === "voice" && data.mediaUrl && (!transcript || transcript.trim().length < 24)) {
        const better = await transcribeAudio(data.mediaUrl);
        if (better) transcript = better;
      }
      const organized =
        data.conceptId || (data.tags && data.tags.length >= 2)
          ? organizeLocal(raw || transcript || "", data.title)
          : await organizeMemory(raw || transcript || "", data.title);
      const id = newId();
      const summary = data.aiSummary?.trim().slice(0, 600) || organized.summary;
      const title = data.title?.trim() || organized.title;
      const emotion = data.emotion || organized.emotion;
      const importance = data.importance ?? organized.importance;
      const tags = JSON.stringify(
        data.tags && data.tags.length ? normalizeTags(data.tags) : mergeTags(data.tags, organized.tags),
      );
      const emoji = data.emoji?.trim() || null;
      const color = data.color?.trim() || null;
      const body = data.body?.trim() || transcript || title;
      const sourceUrl = data.sourceUrl?.trim() || null;
      const sourceKind = data.sourceKind?.trim() || null;

      let posX: number | null = null;
      let posY: number | null = null;
      if (data.conceptId) {
        const hub = await sql<{ position_x: number | null; position_y: number | null }>`
          select position_x, position_y from concepts
          where id = ${data.conceptId} and user_id = ${context.userId}
        `;
        if (hub[0]) {
          const siblings = await sql<{ n: number }>`
            select count(*)::int as n from memory_concepts
            where user_id = ${context.userId} and concept_id = ${data.conceptId}
          `;
          const i = Number(siblings[0]?.n ?? 0);
          const angle = (i / Math.max(i + 1, 1)) * Math.PI * 2 - Math.PI / 2;
          posX = (hub[0].position_x ?? 0) + Math.cos(angle) * 175;
          posY = (hub[0].position_y ?? 0) + Math.sin(angle) * 175;
        }
      }

      await sql`
        insert into memories (
          id, user_id, title, body, memory_type, emotion, importance, ai_impact,
          ai_summary, transcript, media_url, media_mime, media_name, node_kind, tags_json,
          emoji, color, position_x, position_y, source_url, source_kind
        ) values (
          ${id}, ${context.userId}, ${title}, ${body}, ${data.memoryType}, ${emotion},
          ${importance}, ${organized.impact}, ${summary}, ${transcript},
          ${data.mediaUrl ?? null}, ${data.mediaMime ?? null}, ${data.mediaName ?? null},
          ${organized.kind}, ${tags}, ${emoji}, ${color}, ${posX}, ${posY},
          ${sourceUrl}, ${sourceKind}
        )
      `;

      const pinned = data.conceptId
        ? await sql<{ id: string; name: string; kind: string }>`
            select id, name, kind from concepts
            where id = ${data.conceptId} and user_id = ${context.userId}
          `
        : [];
      const conceptsToLink =
        pinned[0]
          ? [{ name: pinned[0].name, kind: pinned[0].kind as "category" }]
          : organized.concepts;

      for (const concept of conceptsToLink) {
        const existing = await sql<{ id: string }>`
          select id from concepts where user_id = ${context.userId} and lower(name) = ${concept.name.toLowerCase()}
        `;
        let conceptId = existing[0]?.id;
        if (!conceptId) {
          conceptId = newId();
          const sectorId = assignSectorFromName(concept.name);
          await sql`
            insert into concepts (id, user_id, name, kind, sector_id)
            values (${conceptId}, ${context.userId}, ${concept.name}, ${concept.kind}, ${sectorId})
          `;
        }
        await sql`
          insert into memory_concepts (user_id, memory_id, concept_id)
          values (${context.userId}, ${id}, ${conceptId})
          on conflict do nothing
        `;
        await sql`
          insert into connections (
            id, user_id, source_type, source_id, target_type, target_id, strength, reason, status
          ) values (
            ${newId()}, ${context.userId}, 'memory', ${id}, 'concept', ${conceptId}, 0.7, ${"auto: " + concept.name}, 'accepted'
          )
        `;
      }

      const siblings = await sql<{ id: string; title: string }>`
        select distinct m.id, m.title
        from memories m
        join memory_concepts mc on mc.memory_id = m.id
        where m.user_id = ${context.userId}
          and m.id <> ${id}
          and mc.concept_id in (select concept_id from memory_concepts where memory_id = ${id})
        limit 6
      `;
      for (const sib of siblings) {
        await sql`
          insert into connections (
            id, user_id, source_type, source_id, target_type, target_id, strength, reason, status
          ) values (
            ${newId()}, ${context.userId}, 'memory', ${id}, 'memory', ${sib.id}, 0.55, ${"Shared themes with: " + sib.title}, 'suggested'
          )
        `;
      }

      const created = await sql<MemoryRow>`
        select * from memories where id = ${id} and user_id = ${context.userId}
      `;
      await sql`update user_settings set last_saved_at = now() where user_id = ${context.userId}`;
      return { ok: true as const, memory: mapMemory(created[0]!) };
    } catch (err) {
      console.error("createMemory failed", err);
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "Could not save that memory",
      };
    }
  });

export const updateMemory = createServerFn({ method: "POST" })
  .validator(
    (input: {
      id: string;
      title?: string;
      body?: string;
      emotion?: string | null;
      importance?: number;
      nodeKind?: string;
      emoji?: string | null;
      color?: string | null;
      tags?: string[];
      aiSummary?: string | null;
    }) => input,
  )
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const existing = await sql<MemoryRow>`
      select * from memories where id = ${data.id} and user_id = ${context.userId}
    `;
    if (!existing[0]) return { ok: false as const, error: "Not found" };
    const title = data.title ?? existing[0].title;
    const body = data.body ?? existing[0].body;
    const emotion = data.emotion === undefined ? existing[0].emotion : data.emotion;
    const importance = data.importance ?? existing[0].importance;
    const nodeKind = data.nodeKind ?? existing[0].node_kind;
    const emoji = data.emoji === undefined ? existing[0].emoji : data.emoji;
    const color = data.color === undefined ? existing[0].color : data.color;
    const tags =
      data.tags === undefined ? existing[0].tags_json : JSON.stringify(normalizeTags(data.tags));
    const aiSummary = data.aiSummary === undefined ? existing[0].ai_summary : data.aiSummary;
    await sql`
      update memories
      set title = ${title}, body = ${body}, emotion = ${emotion},
          importance = ${importance}, node_kind = ${nodeKind},
          emoji = ${emoji}, color = ${color}, tags_json = ${tags},
          ai_summary = ${aiSummary}, updated_at = now()
      where id = ${data.id} and user_id = ${context.userId}
    `;
    await sql`update user_settings set last_saved_at = now() where user_id = ${context.userId}`;
    return { ok: true as const };
  });

export const deleteMemory = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .middleware([authMiddleware])
  .handler(async ({ context, data: id }) => {
    const sql = await getSql();
    await sql`delete from connections where user_id = ${context.userId} and ((source_type = 'memory' and source_id = ${id}) or (target_type = 'memory' and target_id = ${id}))`;
    await sql`delete from memory_concepts where user_id = ${context.userId} and memory_id = ${id}`;
    await sql`delete from memories where id = ${id} and user_id = ${context.userId}`;
    return { ok: true as const };
  });

export const savePositions = createServerFn({ method: "POST" })
  .validator((input: { nodes: { id: string; type: "memory" | "concept"; x: number; y: number }[] }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    for (const n of data.nodes.slice(0, 400)) {
      if (n.type === "memory") {
        await sql`
          update memories set position_x = ${n.x}, position_y = ${n.y}
          where id = ${n.id} and user_id = ${context.userId}
        `;
      } else {
        await sql`
          update concepts set position_x = ${n.x}, position_y = ${n.y}
          where id = ${n.id} and user_id = ${context.userId}
        `;
      }
    }
    await sql`update user_settings set last_saved_at = now() where user_id = ${context.userId}`;
    return { ok: true as const };
  });

export const setConnectionStatus = createServerFn({ method: "POST" })
  .validator((input: { id: string; status: "accepted" | "rejected" }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`
      update connections set status = ${data.status}
      where id = ${data.id} and user_id = ${context.userId}
    `;
    return { ok: true as const };
  });

export const getGraph = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await ensureUserSettings(sql, context.userId);
    const memories = await sql<MemoryRow>`
      select * from memories where user_id = ${context.userId}
    `;
    const concepts = await sql<{
      id: string;
      name: string;
      kind: string;
      icon: string | null;
      emoji: string | null;
      color: string | null;
      position_x: number | null;
      position_y: number | null;
      created_at: string;
      memory_count: number;
    }>`
      select c.*, coalesce(cnt.n, 0)::int as memory_count
      from concepts c
      left join (
        select concept_id, count(*) as n from memory_concepts
        where user_id = ${context.userId}
        group by concept_id
      ) cnt on cnt.concept_id = c.id
      where c.user_id = ${context.userId}
    `;
    const connections = await sql<{
      id: string;
      source_type: string;
      source_id: string;
      target_type: string;
      target_id: string;
      strength: number;
      reason: string | null;
      status: string;
    }>`
      select id, source_type, source_id, target_type, target_id, strength, reason, status
      from connections where user_id = ${context.userId}
    `;
    const settings = await sql<{
      plan: string;
      display_name: string | null;
      onboarded: boolean;
      last_saved_at?: string | null;
      brain_sectors_json?: string | null;
    }>`
      select plan, display_name, onboarded, last_saved_at, brain_sectors_json from user_settings where user_id = ${context.userId}
    `;
    const voiceCount = memories.filter((m) => m.memory_type === "voice").length;
    const accepted = connections.filter((c) => c.status === "accepted");
    const me = settings[0]?.display_name?.trim() || "ME";
    return {
      displayName: me,
      onboarded: Boolean(settings[0]?.onboarded),
      plan: (settings[0]?.plan === "pro" ? "pro" : "free") as "free" | "pro",
      memoryCount: memories.length,
      voiceCount,
      connectionCount: accepted.length,
      concepts: concepts.map(mapConcept),
      memories: memories.map(mapMemory),
      connections: accepted.map(mapConnection),
      suggested: connections.filter((c) => c.status === "suggested").map(mapConnection),
      lastSavedAt: settings[0]?.last_saved_at ?? null,
      sectors: mergeSectors(parseSectorOverrides(settings[0]?.brain_sectors_json)),
    };
  });

export const suggestMemoryTags = createServerFn({ method: "POST" })
  .validator((input: { memoryId?: string; text?: string; existing?: string[] }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    let raw = data.text?.trim() || "";
    let existing = data.existing ?? [];
    if (data.memoryId) {
      const rows = await sql<MemoryRow>`
        select * from memories where id = ${data.memoryId} and user_id = ${context.userId}
      `;
      const row = rows[0];
      if (!row) return { tags: [] as string[] };
      raw = [row.title, row.body, row.ai_summary, row.transcript].filter(Boolean).join("\n");
      if (!existing.length) {
        try {
          const parsed = JSON.parse(row.tags_json) as unknown;
          existing = Array.isArray(parsed) ? parsed.map(String) : [];
        } catch {
          existing = [];
        }
      }
    }
    if (!raw) return { tags: normalizeTags(existing) };
    const tags = await suggestTags(raw, existing);
    return { tags: mergeTags(existing, tags) };
  });
