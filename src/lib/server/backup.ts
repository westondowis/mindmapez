import { createServerFn } from "@tanstack/react-start";
import {
  parseMindBackup,
  summarizeBackup,
  type BackupConcept,
  type BackupMemory,
  type MindBackup,
} from "@/lib/backup";
import { normalizeSectorId } from "@/lib/brain";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { newId } from "@/lib/utils";
import { ensureUserSettings } from "./seed";

type SettingsRow = {
  display_name: string | null;
  age: number | null;
  onboarded: boolean;
  plan: string;
  brain_sectors_json: string | null;
};

type ConceptDump = {
  id: string;
  name: string;
  kind: string;
  icon: string | null;
  emoji: string | null;
  color: string | null;
  position_x: number | null;
  position_y: number | null;
  parent_id: string | null;
  sector_id: string | null;
  description: string;
  created_at: string;
  updated_at: string;
};

type MemoryDump = {
  id: string;
  title: string;
  body: string;
  memory_type: string;
  emotion: string | null;
  importance: number;
  ai_impact: string;
  ai_summary: string | null;
  transcript: string | null;
  media_url: string | null;
  media_mime: string | null;
  media_name: string | null;
  node_kind: string;
  tags_json: string;
  access_count: number;
  position_x: number | null;
  position_y: number | null;
  emoji: string | null;
  color: string | null;
  source_url: string | null;
  source_kind: string | null;
  created_at: string;
  updated_at: string;
};

async function wipeUserMind(userId: string) {
  const sql = await getSql();
  await sql`delete from account_drafts where user_id = ${userId}`;
  await sql`delete from assistant_messages where user_id = ${userId}`;
  await sql`delete from connections where user_id = ${userId}`;
  await sql`delete from memory_concepts where user_id = ${userId}`;
  await sql`delete from memories where user_id = ${userId}`;
  await sql`delete from concepts where user_id = ${userId}`;
}

function remapIds(backup: MindBackup) {
  const conceptMap = new Map<string, string>();
  const memoryMap = new Map<string, string>();
  for (const c of backup.concepts) conceptMap.set(c.id, newId());
  for (const m of backup.memories) memoryMap.set(m.id, newId());
  const mapRef = (type: string, id: string) => {
    if (type === "concept") return conceptMap.get(id) ?? null;
    if (type === "memory") return memoryMap.get(id) ?? null;
    return null;
  };
  const concepts: BackupConcept[] = backup.concepts.map((c) => ({
    ...c,
    id: conceptMap.get(c.id)!,
    parentId: c.parentId && conceptMap.has(c.parentId) ? conceptMap.get(c.parentId)! : null,
  }));
  const memories: BackupMemory[] = backup.memories.map((m) => ({
    ...m,
    id: memoryMap.get(m.id)!,
  }));
  return {
    concepts,
    memories,
    memoryConcepts: backup.memoryConcepts
      .map((l) => ({
        memoryId: memoryMap.get(l.memoryId) ?? "",
        conceptId: conceptMap.get(l.conceptId) ?? "",
      }))
      .filter((l) => l.memoryId && l.conceptId),
    connections: backup.connections
      .map((c) => {
        const sourceId = mapRef(c.sourceType, c.sourceId);
        const targetId = mapRef(c.targetType, c.targetId);
        if (!sourceId || !targetId) return null;
        return { ...c, id: newId(), sourceId, targetId };
      })
      .filter((c): c is NonNullable<typeof c> => Boolean(c)),
    assistantMessages: backup.assistantMessages.map((m) => ({ ...m, id: newId() })),
  };
}

export const exportMind = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<MindBackup> => {
    const sql = await getSql();
    await ensureUserSettings(sql, context.userId);
    const settings = await sql<SettingsRow>`
      select display_name, age, onboarded, plan, brain_sectors_json
      from user_settings where user_id = ${context.userId}
    `;
    const concepts = await sql<ConceptDump>`
      select id, name, kind, icon, emoji, color, position_x, position_y, parent_id, sector_id,
             description, created_at, updated_at
      from concepts where user_id = ${context.userId}
    `;
    const memories = await sql<MemoryDump>`
      select id, title, body, memory_type, emotion, importance, ai_impact, ai_summary, transcript,
             media_url, media_mime, media_name, node_kind, tags_json, access_count, position_x, position_y,
             emoji, color, source_url, source_kind, created_at, updated_at
      from memories where user_id = ${context.userId}
    `;
    const links = await sql<{ memory_id: string; concept_id: string }>`
      select memory_id, concept_id from memory_concepts where user_id = ${context.userId}
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
      created_at: string;
    }>`
      select id, source_type, source_id, target_type, target_id, strength, reason, status, created_at
      from connections where user_id = ${context.userId}
    `;
    const assistant = await sql<{ id: string; role: string; content: string; created_at: string }>`
      select id, role, content, created_at from assistant_messages where user_id = ${context.userId}
      order by created_at
    `;
    const drafts = await sql<{ capture_json: string | null }>`
      select capture_json from account_drafts where user_id = ${context.userId}
    `;
    let draftJson: string | null = drafts[0]?.capture_json ?? null;
    if (draftJson === "") draftJson = null;
    const s = settings[0];
    return {
      format: "mindmesh-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: {
        displayName: s?.display_name?.trim() || "",
        age: s?.age ?? null,
        onboarded: Boolean(s?.onboarded),
        plan: s?.plan === "pro" ? "pro" : "free",
        brainSectorsJson: s?.brain_sectors_json ?? null,
      },
      concepts: concepts.map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        icon: c.icon,
        emoji: c.emoji,
        color: c.color,
        positionX: c.position_x,
        positionY: c.position_y,
        parentId: c.parent_id,
        sectorId: c.sector_id,
        description: c.description ?? "",
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      })),
      memories: memories.map((m) => {
        let tags: string[] = [];
        try {
          const parsed = JSON.parse(m.tags_json || "[]") as unknown;
          tags = Array.isArray(parsed) ? parsed.map(String) : [];
        } catch {
          tags = [];
        }
        return {
          id: m.id,
          title: m.title,
          body: m.body,
          memoryType: m.memory_type,
          emotion: m.emotion,
          importance: m.importance,
          aiImpact: m.ai_impact,
          aiSummary: m.ai_summary,
          transcript: m.transcript,
          mediaUrl: m.media_url,
          mediaMime: m.media_mime,
          mediaName: m.media_name,
          nodeKind: m.node_kind,
          tags,
          accessCount: m.access_count,
          positionX: m.position_x,
          positionY: m.position_y,
          emoji: m.emoji,
          color: m.color,
          sourceUrl: m.source_url,
          sourceKind: m.source_kind,
          createdAt: m.created_at,
          updatedAt: m.updated_at,
        };
      }),
      memoryConcepts: links.map((l) => ({ memoryId: l.memory_id, conceptId: l.concept_id })),
      connections: connections.map((c) => ({
        id: c.id,
        sourceType: c.source_type,
        sourceId: c.source_id,
        targetType: c.target_type,
        targetId: c.target_id,
        strength: c.strength,
        reason: c.reason,
        status: c.status,
        createdAt: c.created_at,
      })),
      assistantMessages: assistant.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.created_at,
      })),
      draftJson,
    };
  });

export const importMind = createServerFn({ method: "POST" })
  .validator((input: { backup: unknown }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const parsed = parseMindBackup(data.backup);
    if (!parsed.ok) return { ok: false as const, error: parsed.error };

    const sql = await getSql();
    await ensureUserSettings(sql, context.userId);
    const remapped = remapIds(parsed.backup);

    await wipeUserMind(context.userId);

    for (const c of remapped.concepts) {
      await sql`
        insert into concepts (
          id, user_id, name, kind, icon, emoji, color, position_x, position_y,
          parent_id, sector_id, description, created_at, updated_at
        ) values (
          ${c.id}, ${context.userId}, ${c.name}, ${c.kind}, ${c.icon}, ${c.emoji}, ${c.color},
          ${c.positionX}, ${c.positionY}, ${c.parentId}, ${normalizeSectorId(c.sectorId) || "frontal"}, ${c.description},
          ${c.createdAt}, ${c.updatedAt}
        )
      `;
    }

    for (const m of remapped.memories) {
      await sql`
        insert into memories (
          id, user_id, title, body, memory_type, emotion, importance, ai_impact, ai_summary,
          transcript, media_url, media_mime, media_name, node_kind, tags_json, access_count,
          position_x, position_y, emoji, color, source_url, source_kind, created_at, updated_at
        ) values (
          ${m.id}, ${context.userId}, ${m.title}, ${m.body}, ${m.memoryType}, ${m.emotion},
          ${m.importance}, ${m.aiImpact}, ${m.aiSummary}, ${m.transcript}, ${m.mediaUrl},
          ${m.mediaMime}, ${m.mediaName}, ${m.nodeKind}, ${JSON.stringify(m.tags)}, ${m.accessCount},
          ${m.positionX}, ${m.positionY}, ${m.emoji}, ${m.color}, ${m.sourceUrl}, ${m.sourceKind},
          ${m.createdAt}, ${m.updatedAt}
        )
      `;
    }

    for (const l of remapped.memoryConcepts) {
      await sql`
        insert into memory_concepts (user_id, memory_id, concept_id)
        values (${context.userId}, ${l.memoryId}, ${l.conceptId})
        on conflict do nothing
      `;
    }

    for (const c of remapped.connections) {
      await sql`
        insert into connections (
          id, user_id, source_type, source_id, target_type, target_id, strength, reason, status, created_at
        ) values (
          ${c.id}, ${context.userId}, ${c.sourceType}, ${c.sourceId}, ${c.targetType}, ${c.targetId},
          ${c.strength}, ${c.reason}, ${c.status}, ${c.createdAt}
        )
      `;
    }

    for (const m of remapped.assistantMessages) {
      await sql`
        insert into assistant_messages (id, user_id, role, content, created_at)
        values (${m.id}, ${context.userId}, ${m.role}, ${m.content}, ${m.createdAt})
      `;
    }

    if (parsed.backup.draftJson) {
      const json = parsed.backup.draftJson;
      await sql`
        insert into account_drafts (user_id, capture_json, updated_at)
        values (${context.userId}, ${json}, now())
        on conflict (user_id) do update set capture_json = ${json}, updated_at = now()
      `;
    }

    const s = parsed.backup.settings;
    await sql`
      update user_settings
      set display_name = ${s.displayName || null},
          age = ${s.age},
          onboarded = ${true},
          plan = ${s.plan},
          brain_sectors_json = ${s.brainSectorsJson},
          seeded = ${true},
          last_saved_at = now()
      where user_id = ${context.userId}
    `;

    return { ok: true as const, summary: summarizeBackup(parsed.backup) };
  });
