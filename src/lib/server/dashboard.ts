import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import type { DashboardStats } from "@/lib/types";
import { mapMemory, type MemoryRow } from "./map";
import { ensureUserSettings, resetMind } from "./seed";

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<DashboardStats> => {
    const sql = await getSql();
    await ensureUserSettings(sql, context.userId);

    const memories = await sql<MemoryRow>`
      select * from memories where user_id = ${context.userId} order by created_at desc
    `;
    const mapped = memories.map(mapMemory);
    const settings = await sql<{ plan: string }>`
      select plan from user_settings where user_id = ${context.userId}
    `;
    const conn = await sql<{ n: number }>`
      select count(*)::int as n from connections where user_id = ${context.userId} and status = 'accepted'
    `;
    const topics = await sql<{ name: string; count: number }>`
      select c.name, count(*)::int as count
      from memory_concepts mc
      join concepts c on c.id = mc.concept_id
      where mc.user_id = ${context.userId}
      group by c.name
      order by count desc
      limit 6
    `;
    const since = new Date(Date.now() - 21 * 86_400_000).toISOString();
    const growing = await sql<{ name: string; count: number }>`
      select c.name, count(*)::int as count
      from memory_concepts mc
      join concepts c on c.id = mc.concept_id
      join memories m on m.id = mc.memory_id
      where mc.user_id = ${context.userId} and m.created_at > ${since}
      group by c.name
      order by count desc
      limit 5
    `;
    const emotions = await sql<{ name: string; count: number }>`
      select emotion as name, count(*)::int as count
      from memories
      where user_id = ${context.userId} and emotion is not null
      group by emotion
      order by count desc
      limit 6
    `;
    const suggestedRows = await sql<{
      id: string;
      reason: string | null;
      strength: number;
      source_type: string;
      source_id: string;
      target_type: string;
      target_id: string;
    }>`
      select id, reason, strength, source_type, source_id, target_type, target_id
      from connections
      where user_id = ${context.userId} and status = 'suggested'
      order by strength desc
      limit 8
    `;

    const labelFor = async (type: string, id: string): Promise<string> => {
      if (type === "memory") {
        const r = await sql<{ title: string }>`
          select title from memories where id = ${id} and user_id = ${context.userId}
        `;
        return r[0]?.title ?? "Memory";
      }
      const r = await sql<{ name: string }>`
        select name from concepts where id = ${id} and user_id = ${context.userId}
      `;
      return r[0]?.name ?? "Concept";
    };

    const suggested = [];
    for (const s of suggestedRows) {
      suggested.push({
        id: s.id,
        reason: s.reason,
        strength: Number(s.strength),
        a: { type: s.source_type, id: s.source_id, label: await labelFor(s.source_type, s.source_id) },
        b: { type: s.target_type, id: s.target_id, label: await labelFor(s.target_type, s.target_id) },
      });
    }

    return {
      plan: settings[0]?.plan === "pro" ? "pro" : "free",
      memoryCount: mapped.length,
      voiceCount: mapped.filter((m) => m.memoryType === "voice").length,
      photoCount: mapped.filter((m) => m.memoryType === "photo" || m.memoryType === "video").length,
      connectionCount: Number(conn[0]?.n ?? 0),
      topTopics: topics,
      growingConcepts: growing,
      topEmotions: emotions.filter((e) => e.name),
      recent: mapped.slice(0, 8),
      favorites: [...mapped].sort((a, b) => b.importance - a.importance || b.accessCount - a.accessCount).slice(0, 5),
      suggested,
    };
  });

export const setPlan = createServerFn({ method: "POST" })
  .validator((plan: "free" | "pro") => plan)
  .middleware([authMiddleware])
  .handler(async ({ context, data: plan }) => {
    const sql = await getSql();
    await sql`
      insert into user_settings (user_id, plan, seeded)
      values (${context.userId}, ${plan}, true)
      on conflict (user_id) do update set plan = ${plan}
    `;
    return { ok: true as const, plan };
  });

export const resetSampleMind = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await resetMind(sql, context.userId);
    return { ok: true as const };
  });
