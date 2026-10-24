import { newId } from "@/lib/utils";
import type { Sql } from "@/lib/db";
import { assignSectorFromName } from "@/lib/brain";
import { SEED_CONCEPTS, SEED_EDGES, SEED_MEMORIES } from "./seed-data";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(9, 12, 0, 0);
  return d.toISOString();
}

function layout(): Record<string, { x: number; y: number }> {
  const cats = SEED_CONCEPTS.filter((c) => c.kind === "category");
  const others = SEED_CONCEPTS.filter((c) => c.kind !== "category");
  const pos: Record<string, { x: number; y: number }> = {};
  cats.forEach((c, i) => {
    const angle = (i / cats.length) * Math.PI * 2 - Math.PI / 2;
    pos[c.key] = { x: Math.cos(angle) * 420, y: Math.sin(angle) * 420 };
  });
  others.forEach((c, i) => {
    const angle = (i / Math.max(others.length, 1)) * Math.PI * 2 - Math.PI / 3;
    pos[c.key] = { x: Math.cos(angle) * 230, y: Math.sin(angle) * 230 };
  });
  const byConcept = new Map<string, typeof SEED_MEMORIES>();
  for (const m of SEED_MEMORIES) {
    const primary = m.concepts[0] ?? "mindset";
    const list = byConcept.get(primary) ?? [];
    list.push(m);
    byConcept.set(primary, list);
  }
  for (const [ckey, list] of byConcept) {
    const origin = pos[ckey] ?? { x: 0, y: 500 };
    list.forEach((m, j) => {
      const spread = (j - (list.length - 1) / 2) * 0.42;
      const angle = Math.atan2(origin.y, origin.x) + spread;
      pos[m.key] = {
        x: origin.x + Math.cos(angle) * 175,
        y: origin.y + Math.sin(angle) * 175,
      };
    });
  }
  return pos;
}

export async function ensureUserSettings(sql: Sql, userId: string): Promise<void> {
  await sql`
    insert into user_settings (user_id, plan, seeded, onboarded)
    values (${userId}, 'free', false, false)
    on conflict (user_id) do nothing
  `;
}

export async function ensureSeeded(sql: Sql, userId: string): Promise<void> {
  await ensureUserSettings(sql, userId);
}

async function insertSampleMind(sql: Sql, userId: string): Promise<void> {
  const settings = await sql<{ seeded: boolean }>`
    select seeded from user_settings where user_id = ${userId}
  `;
  if (settings[0]?.seeded) return;

  await sql`
    insert into user_settings (user_id, plan, seeded, onboarded)
    values (${userId}, 'free', true, true)
    on conflict (user_id) do update set seeded = true, onboarded = true
  `;

  const pos = layout();
  const conceptIds = new Map<string, string>();

  for (const c of SEED_CONCEPTS) {
    const id = newId();
    conceptIds.set(c.key, id);
  }
  for (const c of SEED_CONCEPTS) {
    const id = conceptIds.get(c.key)!;
    const p = pos[c.key] ?? { x: 0, y: 0 };
    const parentId = c.parent ? conceptIds.get(c.parent) ?? null : null;
    const sectorId = c.sector || assignSectorFromName(c.name);
    await sql`
      insert into concepts (id, user_id, name, kind, icon, parent_id, sector_id, position_x, position_y)
      values (${id}, ${userId}, ${c.name}, ${c.kind}, ${c.icon}, ${parentId}, ${sectorId}, ${p.x}, ${p.y})
    `;
  }

  const memoryIds = new Map<string, string>();
  for (const m of SEED_MEMORIES) {
    const id = newId();
    memoryIds.set(m.key, id);
    const p = pos[m.key] ?? { x: 0, y: 0 };
    const created = daysAgo(m.daysAgo);
    await sql`
      insert into memories (
        id, user_id, title, body, memory_type, emotion, importance, ai_impact,
        ai_summary, transcript, node_kind, tags_json, access_count, position_x, position_y, created_at, updated_at
      ) values (
        ${id}, ${userId}, ${m.title}, ${m.body}, ${m.memoryType}, ${m.emotion},
        ${m.importance}, ${m.aiImpact}, ${m.aiSummary}, ${m.transcript ?? null},
        ${m.nodeKind}, ${JSON.stringify(m.tags)}, ${Math.max(0, 8 - m.daysAgo)},
        ${p.x}, ${p.y}, ${created}, ${created}
      )
    `;
    for (const ckey of m.concepts) {
      const cid = conceptIds.get(ckey);
      if (!cid) continue;
      await sql`
        insert into memory_concepts (user_id, memory_id, concept_id)
        values (${userId}, ${id}, ${cid})
        on conflict do nothing
      `;
      await sql`
        insert into connections (
          id, user_id, source_type, source_id, target_type, target_id, strength, reason, status
        ) values (
          ${newId()}, ${userId}, 'memory', ${id}, 'concept', ${cid}, 0.72, ${"belongs to " + ckey}, 'accepted'
        )
      `;
    }
  }

  for (const e of SEED_EDGES) {
    const a = e.aType === "memory" ? memoryIds.get(e.a) : conceptIds.get(e.a);
    const b = e.bType === "memory" ? memoryIds.get(e.b) : conceptIds.get(e.b);
    if (!a || !b) continue;
    await sql`
      insert into connections (
        id, user_id, source_type, source_id, target_type, target_id, strength, reason, status
      ) values (
        ${newId()}, ${userId}, ${e.aType}, ${a}, ${e.bType}, ${b}, ${e.strength}, ${e.reason}, ${e.status ?? "accepted"}
      )
    `;
  }
}

export async function resetMind(sql: Sql, userId: string): Promise<void> {
  await sql`delete from account_drafts where user_id = ${userId}`;
  await sql`delete from assistant_messages where user_id = ${userId}`;
  await sql`delete from connections where user_id = ${userId}`;
  await sql`delete from memory_concepts where user_id = ${userId}`;
  await sql`delete from memories where user_id = ${userId}`;
  await sql`delete from concepts where user_id = ${userId}`;
  await sql`delete from user_settings where user_id = ${userId}`;
  await insertSampleMind(sql, userId);
}
