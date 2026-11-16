import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { mergeSectors, normalizeSectorId, parseSectorOverrides } from "@/lib/brain";
import { getSql, withTransaction } from "@/lib/db";
import { normalizeTagName, tagSlug, type TagTier } from "@/lib/tag-intel";
import {
  backfillTags,
  ensureTag,
  mapTag,
  recomputeTags,
  saveConnectorTagGrants,
  syncTagGrants,
  tagRelations,
  type TagRelations,
  type TagRow,
  type TargetType,
} from "@/lib/tags-core";

export type TagListItem = TagRow & { labels: string[] };
export type TagHub = {
  tags: TagListItem[];
  sectors: { id: string; label: string }[];
  branches: { id: string; path: string; sectorId: string | null }[];
  connectors: { id: string; name: string }[];
};

const tierOf = (v: unknown): TagTier => (v === "primary" ? "primary" : "secondary");

/** Tags plus what the Tagging page needs: attach targets, connectors, and searchable relation labels. */
export const listTags = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<TagHub> => {
    const sql = await getSql();
    await backfillTags(sql, context.userId);
    const [tags, links, concepts, memories, settings, connectors] = await Promise.all([
      sql<{ id: string; name: string; slug: string; tier: TagTier; is_manual_override: boolean; occurrence_count: number }>`
        select * from tags where user_id = ${context.userId} order by occurrence_count desc, name
      `,
      sql<{ tag_id: string; target_type: TargetType; target_id: string }>`
        select tag_id, target_type, target_id from tag_links where user_id = ${context.userId}
      `,
      sql<{ id: string; name: string; parent_id: string | null; sector_id: string | null }>`
        select id, name, parent_id, sector_id from concepts where user_id = ${context.userId}
      `,
      sql<{ id: string; title: string }>`select id, title from memories where user_id = ${context.userId}`,
      sql<{ brain_sectors_json: string | null }>`select brain_sectors_json from user_settings where user_id = ${context.userId}`,
      sql<{ id: string; name: string }>`
        select id, display_name as name from connectors where user_id = ${context.userId} and status = 'active' order by display_name
      `,
    ]);
    const sectors = mergeSectors(parseSectorOverrides(settings[0]?.brain_sectors_json ?? null)).map((s) => ({ id: s.id as string, label: s.label }));
    const sectorLabel = new Map(sectors.map((s) => [s.id, s.label]));
    const byId = new Map(concepts.map((c) => [c.id, c]));
    const memTitle = new Map(memories.map((m) => [m.id, m.title]));
    const pathOf = (id: string) => {
      const names: string[] = [];
      const seen = new Set<string>();
      for (let c = byId.get(id); c && !seen.has(c.id); c = c.parent_id ? byId.get(c.parent_id) : undefined) {
        seen.add(c.id);
        names.unshift(c.name);
      }
      return names.join(" → ");
    };
    const labels = new Map<string, string[]>();
    for (const l of links) {
      const label =
        l.target_type === "memory" ? memTitle.get(l.target_id) : l.target_type === "branch" ? pathOf(l.target_id) : sectorLabel.get(normalizeSectorId(l.target_id) ?? l.target_id);
      if (!label) continue;
      const list = labels.get(l.tag_id) ?? [];
      if (list.length < 40) list.push(label);
      labels.set(l.tag_id, list);
    }
    return {
      tags: tags.map((t) => ({ ...mapTag(t), labels: labels.get(t.id) ?? [] })),
      sectors,
      branches: concepts.map((c) => ({ id: c.id, path: pathOf(c.id), sectorId: normalizeSectorId(c.sector_id) })).sort((a, b) => a.path.localeCompare(b.path)),
      connectors,
    };
  });

/** A tag the user creates is locked into its tier from the start. */
export const createTag = createServerFn({ method: "POST" })
  .validator((input: { name: string; tier: TagTier }) => ({ name: String(input?.name ?? ""), tier: tierOf(input?.tier) }))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const name = normalizeTagName(data.name);
    if (name.length < 1) return { ok: false as const, error: "Give the tag a name." };
    const sql = await getSql();
    const t = await ensureTag(sql, context.userId, name, { tier: data.tier, manual: true });
    if (!t) return { ok: false as const, error: "Give the tag a name." };
    // An existing (possibly auto) tag with this name becomes a locked, user-chosen one.
    await sql`
      update tags set tier = ${data.tier}, is_manual_override = true, slug = ${tagSlug(name)}, updated_at = now()
       where id = ${t.id} and user_id = ${context.userId}
    `;
    return { ok: true as const, id: t.id };
  });

/** Drag-and-drop / tap: moves the tag and locks it there so automatic recounts never change it. */
export const setTagTier = createServerFn({ method: "POST" })
  .validator((input: { id: string; tier: TagTier }) => ({ id: String(input?.id ?? ""), tier: tierOf(input?.tier) }))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{ id: string }>`
      update tags set tier = ${data.tier}, is_manual_override = true, updated_at = now()
       where id = ${data.id} and user_id = ${context.userId} returning id
    `;
    return rows[0] ? { ok: true as const } : { ok: false as const, error: "Tag not found." };
  });

/** Delete a tag and detach it from every memory, branch, sector and connector. */
export const deleteTag = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => ({ id: String(input?.id ?? "") }))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) =>
    withTransaction(async (sql) => {
      const affected = await sql<{ connector_id: string }>`
        select distinct connector_id from connector_tag_grants where tag_id = ${data.id} and user_id = ${context.userId}
      `;
      // Memories keep a plain tag list too; drop the name from it so it does not come back.
      const t = await sql<{ name: string }>`select name from tags where id = ${data.id} and user_id = ${context.userId}`;
      if (!t[0]) return { ok: false as const, error: "Tag not found." };
      const mems = await sql<{ id: string; tags_json: string }>`
        select m.id, m.tags_json from tag_links l join memories m on m.id = l.target_id and m.user_id = l.user_id
         where l.tag_id = ${data.id} and l.user_id = ${context.userId} and l.target_type = 'memory'
      `;
      for (const m of mems) {
        let list: string[] = [];
        try {
          const p = JSON.parse(m.tags_json) as unknown;
          list = Array.isArray(p) ? p.map(String) : [];
        } catch {
          list = [];
        }
        const next = list.filter((x) => normalizeTagName(x) !== t[0]!.name);
        await sql`update memories set tags_json = ${JSON.stringify(next)} where id = ${m.id} and user_id = ${context.userId}`;
      }
      await sql`delete from tags where id = ${data.id} and user_id = ${context.userId}`;
      for (const a of affected) {
        await sql`update connectors set policy_version = policy_version + 1 where id = ${a.connector_id} and user_id = ${context.userId}`;
      }
      return { ok: true as const };
    }),
  );

const TARGETS: TargetType[] = ["sector", "branch", "memory"];

async function targetExists(sql: Awaited<ReturnType<typeof getSql>>, userId: string, type: TargetType, id: string) {
  if (type === "sector") return Boolean(normalizeSectorId(id));
  if (type === "branch") return (await sql`select 1 from concepts where id = ${id} and user_id = ${userId}`).length > 0;
  return (await sql`select 1 from memories where id = ${id} and user_id = ${userId}`).length > 0;
}

/** Attach / detach a tag at any level of the hierarchy. Connector access follows immediately. */
export const setTagLink = createServerFn({ method: "POST" })
  .validator((input: { tagId: string; targetType: TargetType; targetId: string; attached: boolean }) => ({
    tagId: String(input?.tagId ?? ""),
    targetType: input?.targetType,
    targetId: String(input?.targetId ?? ""),
    attached: Boolean(input?.attached),
  }))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) =>
    withTransaction(async (sql) => {
      if (!TARGETS.includes(data.targetType)) return { ok: false as const, error: "Unknown target." };
      const own = await sql`select 1 from tags where id = ${data.tagId} and user_id = ${context.userId}`;
      if (!own.length) return { ok: false as const, error: "Tag not found." };
      const targetId = data.targetType === "sector" ? (normalizeSectorId(data.targetId) ?? "") : data.targetId;
      if (!targetId || !(await targetExists(sql, context.userId, data.targetType, targetId))) {
        return { ok: false as const, error: "Target not found." };
      }
      if (data.attached) {
        await sql`
          insert into tag_links (tag_id, user_id, target_type, target_id)
          values (${data.tagId}, ${context.userId}, ${data.targetType}, ${targetId}) on conflict do nothing
        `;
      } else {
        await sql`
          delete from tag_links where tag_id = ${data.tagId} and user_id = ${context.userId}
             and target_type = ${data.targetType} and target_id = ${targetId}
        `;
      }
      await syncTagGrants(sql, context.userId);
      await recomputeTags(sql, context.userId, [data.tagId]);
      return { ok: true as const };
    }),
  );

export const getTagRelations = createServerFn({ method: "GET" })
  .validator((input: { id: string }) => ({ id: String(input?.id ?? "") }))
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<TagRelations | null> => {
    const sql = await getSql();
    return tagRelations(sql, context.userId, data.id);
  });

/** Let a connector read everything this tag reaches (or stop). Other tags it already has are kept. */
export const setConnectorTag = createServerFn({ method: "POST" })
  .validator((input: { connectorId: string; tagId: string; enabled: boolean }) => ({
    connectorId: String(input?.connectorId ?? ""),
    tagId: String(input?.tagId ?? ""),
    enabled: Boolean(input?.enabled),
  }))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const have = await sql<{ tag_id: string }>`
      select tag_id from connector_tag_grants
       where connector_id = ${data.connectorId} and user_id = ${context.userId} and revoked_at is null
    `;
    const next = new Set(have.map((h) => h.tag_id));
    if (data.enabled) next.add(data.tagId);
    else next.delete(data.tagId);
    return saveConnectorTagGrants(withTransaction, context.userId, data.connectorId, [...next]);
  });
