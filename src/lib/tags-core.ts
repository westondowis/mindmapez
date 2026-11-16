/**
 * Tag persistence and access resolution, written against the shared `Sql` surface so the same
 * code runs on Postgres in production and on PGLite in tests. Pure rules live in tag-intel.ts.
 */
import type { Sql, TxRunner } from "./sql-template.ts";
import {
  computeTier,
  extractCandidates,
  normalizeTagName,
  selectAutoTags,
  shouldAutoDelete,
  tagSlug,
  type KnownTag,
  type TagTier,
} from "./tag-intel.ts";

const newTagId = () => globalThis.crypto.randomUUID();

export type TargetType = "sector" | "branch" | "memory";

export type TagRow = {
  id: string;
  name: string;
  slug: string;
  tier: TagTier;
  isManualOverride: boolean;
  occurrenceCount: number;
};

type DbTag = {
  id: string;
  name: string;
  slug: string;
  tier: TagTier;
  is_manual_override: boolean;
  occurrence_count: number;
};
const mapTag = (t: DbTag): TagRow => ({
  id: t.id,
  name: t.name,
  slug: t.slug,
  tier: t.tier,
  isManualOverride: t.is_manual_override,
  occurrenceCount: Number(t.occurrence_count),
});

/** Create the tag if missing (never touches an existing tag's tier or lock) and return its id. */
export async function ensureTag(
  sql: Sql,
  userId: string,
  rawName: string,
  opts: { tier?: TagTier; manual?: boolean } = {},
): Promise<{ id: string; created: boolean } | null> {
  const name = normalizeTagName(rawName);
  if (!name) return null;
  const id = newTagId();
  const rows = await sql<{ id: string; inserted: boolean }>`
    insert into tags (id, user_id, name, slug, tier, is_manual_override)
    values (${id}, ${userId}, ${name}, ${tagSlug(name)}, ${opts.tier ?? "secondary"}, ${opts.manual ?? false})
    on conflict (user_id, name) do update set updated_at = tags.updated_at
    returning id, (xmax = 0) as inserted
  `;
  return rows[0] ? { id: rows[0].id, created: rows[0].inserted } : null;
}

/**
 * Recount tags: cached occurrence_count, automatic promotion, and removal of orphaned
 * non-manual tags. A manual override keeps its tier and is never deleted here.
 */
export async function recomputeTags(sql: Sql, userId: string, tagIds?: string[]): Promise<void> {
  const rows = await sql.query<{ id: string; tier: TagTier; manual: boolean; items: number; branches: number }>(
    `select t.id, t.tier, t.is_manual_override as manual,
            (select count(*) from tag_links l where l.tag_id = t.id)::int as items,
            (select count(distinct x) from (
               select l.target_type || ':' || l.target_id as x
                 from tag_links l where l.tag_id = t.id and l.target_type in ('sector', 'branch')
               union
               select 'branch:' || m.owner_branch_id
                 from tag_links l
                 join memories m on m.id = l.target_id and m.user_id = l.user_id
                where l.tag_id = t.id and l.target_type = 'memory' and m.owner_branch_id is not null
             ) b)::int as branches
       from tags t
      where t.user_id = $1 ${tagIds ? "and t.id = any($2::text[])" : ""}`,
    tagIds ? [userId, tagIds] : [userId],
  );
  for (const r of rows) {
    if (shouldAutoDelete({ manual: r.manual, items: r.items })) {
      await sql`delete from tags where id = ${r.id} and user_id = ${userId}`;
      continue;
    }
    const tier = computeTier({ tier: r.tier, manual: r.manual, items: r.items, branches: r.branches });
    await sql`
      update tags set occurrence_count = ${r.items}, tier = ${tier},
             updated_at = case when tier is distinct from ${tier} or occurrence_count <> ${r.items} then now() else updated_at end
       where id = ${r.id} and user_id = ${userId}
    `;
  }
}

/** Mirror a memory's tag list into tags / tag_links, then recount everything it touched. */
export async function syncMemoryTags(sql: Sql, userId: string, memoryId: string, names: string[]): Promise<void> {
  const wanted = [...new Set(names.map(normalizeTagName).filter(Boolean))];
  const before = await sql<{ tag_id: string }>`
    select tag_id from tag_links where user_id = ${userId} and target_type = 'memory' and target_id = ${memoryId}
  `;
  const keep: string[] = [];
  for (const name of wanted) {
    const t = await ensureTag(sql, userId, name);
    if (!t) continue;
    keep.push(t.id);
    await sql`
      insert into tag_links (tag_id, user_id, target_type, target_id)
      values (${t.id}, ${userId}, 'memory', ${memoryId})
      on conflict do nothing
    `;
  }
  await sql`
    delete from tag_links
     where user_id = ${userId} and target_type = 'memory' and target_id = ${memoryId}
       and not (tag_id = any(${keep}::text[]))
  `;
  await recomputeTags(sql, userId, [...new Set([...before.map((b) => b.tag_id), ...keep])]);
}

/** Build the user's tag list rows from memories.tags_json when no canonical tags exist yet. */
export async function backfillTags(sql: Sql, userId: string): Promise<number> {
  const have = await sql<{ n: number }>`select count(*)::int as n from tags where user_id = ${userId}`;
  if (Number(have[0]?.n ?? 0) > 0) return 0;
  const mems = await sql<{ id: string; tags_json: string }>`
    select id, tags_json from memories where user_id = ${userId}
  `;
  let n = 0;
  for (const m of mems) {
    let list: string[] = [];
    try {
      const p = JSON.parse(m.tags_json) as unknown;
      list = Array.isArray(p) ? p.map(String) : [];
    } catch {
      list = [];
    }
    if (list.length) {
      await syncMemoryTags(sql, userId, m.id, list);
      n += 1;
    }
  }
  return n;
}

/**
 * Stage-2 auto-tagging against the whole brain. Counts, for each candidate, the OTHER memories and
 * branches that mention it, then applies the pure rules (blocklist, existing tags and branch names
 * first, >= 2 distinct items for anything new).
 */
export async function autoTagText(
  sql: Sql,
  userId: string,
  input: { text: string; extraCandidates?: string[]; excludeMemoryId?: string; max?: number },
): Promise<string[]> {
  const text = input.text;
  const local = extractCandidates(text, 12);
  const candidates = [...new Set([...(input.extraCandidates ?? []).map(normalizeTagName), ...local])].filter(Boolean).slice(0, 18);
  const known = await sql<{ name: string; tier: TagTier; is_manual_override: boolean }>`
    select name, tier, is_manual_override from tags where user_id = ${userId}
  `;
  const knownTags: KnownTag[] = known.map((k) => ({ name: k.name, tier: k.tier, manual: k.is_manual_override }));
  const branches = await sql<{ name: string }>`select name from concepts where user_id = ${userId}`;
  const safe = candidates.map((c) => c.replace(/[^a-z0-9 ]/g, "").trim()).filter(Boolean);
  const counts = new Map<string, number>();
  if (safe.length) {
    const rows = await sql<{ word: string; n: number }>`
      select w.word,
             ((select count(*) from memories m
                where m.user_id = ${userId} and m.id <> ${input.excludeMemoryId ?? ""}
                  and (m.title || ' ' || m.body || ' ' || coalesce(m.ai_summary, '')) ~* ('\\m' || w.word || 's?\\M'))
              + (select count(*) from concepts c
                  where c.user_id = ${userId}
                    and (c.name || ' ' || coalesce(c.description, '')) ~* ('\\m' || w.word || 's?\\M')))::int as n
        from unnest(${safe}::text[]) as w(word)
    `;
    for (const r of rows) counts.set(r.word, Number(r.n));
  }
  return selectAutoTags({
    text,
    candidates: safe,
    knownTags,
    branchNames: branches.map((b) => b.name),
    recurrence: (w) => counts.get(w.replace(/[^a-z0-9 ]/g, "").trim()) ?? 0,
    max: input.max,
  });
}

export type TagAccessScope = { sectorIds: string[]; branchIds: string[]; memoryIds: string[] };

/**
 * Everything the given tags reach, with downward inheritance only:
 *  - a tagged sector brings that whole sector (every branch, sub-branch and memory in it);
 *  - a tagged branch / sub-branch brings itself and its descendants, never its parent or siblings;
 *  - a tagged memory brings just that memory.
 * Returns the de-duplicated union across all sectors of the user's brain.
 */
export async function resolveTagAccessScope(sql: Sql, userId: string, allowedTagIds: string[]): Promise<TagAccessScope> {
  const ids = [...new Set(allowedTagIds.filter(Boolean))];
  if (!ids.length) return { sectorIds: [], branchIds: [], memoryIds: [] };
  const sectors = await sql.query<{ id: string }>(
    `select distinct brain_sector_key(l.target_id) as id
       from tag_links l
      where l.user_id = $1 and l.tag_id = any($2::text[]) and l.target_type = 'sector'`,
    [userId, ids],
  );
  const branches = await sql.query<{ id: string }>(
    `select distinct c.id
       from concepts c
      where c.user_id = $1
        and (
          exists (select 1
                    from tag_links l
                    join concepts t on t.id = l.target_id and t.user_id = $1
                   where l.user_id = $1 and l.tag_id = any($2::text[]) and l.target_type = 'branch'
                     and c.path >= t.path collate "C" and c.path < brain_path_end(t.path) collate "C")
          or exists (select 1
                       from tag_links l
                      where l.user_id = $1 and l.tag_id = any($2::text[]) and l.target_type = 'sector'
                        and c.path >= ('/' || brain_sector_key(l.target_id) || '/') collate "C"
                        and c.path < brain_path_end('/' || brain_sector_key(l.target_id) || '/') collate "C")
        )
      order by c.id`,
    [userId, ids],
  );
  const branchIds = branches.map((b) => b.id);
  const memories = await sql.query<{ id: string }>(
    `select distinct m.id
       from memories m
      where m.user_id = $1
        and (m.owner_branch_id = any($3::text[])
             or m.id in (select l.target_id from tag_links l
                          where l.user_id = $1 and l.tag_id = any($2::text[]) and l.target_type = 'memory'))
      order by m.id`,
    [userId, ids, branchIds],
  );
  return { sectorIds: sectors.map((s) => s.id).sort(), branchIds, memoryIds: memories.map((m) => m.id) };
}

/**
 * Make the derived connector_grants rows match the tag links: one live row per (connector, granted
 * tag, tagged sector or branch), none for anything else. Run after every change to a granted tag's
 * sector/branch links or to a connector's tag grants. Pass a connector id to limit the pass.
 */
export async function syncTagGrants(sql: Sql, userId: string, connectorId?: string): Promise<void> {
  const grants = await sql.query<{ connector_id: string; tag_id: string; can_read: boolean; can_search: boolean }>(
    `select tg.connector_id, tg.tag_id, tg.can_read, tg.can_search
       from connector_tag_grants tg
       join connectors k on k.id = tg.connector_id and k.status = 'active' and k.user_id = tg.user_id
      where tg.user_id = $1 and tg.revoked_at is null ${connectorId ? "and tg.connector_id = $2" : ""}`,
    connectorId ? [userId, connectorId] : [userId],
  );
  const desired = new Map<string, { connectorId: string; tagId: string; kind: "sector" | "branch"; ref: string; read: boolean; search: boolean }>();
  for (const g of grants) {
    const links = await sql<{ target_type: TargetType; target_id: string; ok: boolean }>`
      select l.target_type, l.target_id,
             (l.target_type = 'sector' or exists (select 1 from concepts c where c.id = l.target_id and c.user_id = ${userId})) as ok
        from tag_links l
       where l.user_id = ${userId} and l.tag_id = ${g.tag_id} and l.target_type in ('sector', 'branch')
    `;
    for (const l of links) {
      if (!l.ok) continue;
      const kind = l.target_type === "sector" ? "sector" : "branch";
      desired.set(`${g.connector_id}|${g.tag_id}|${kind}|${l.target_id}`, {
        connectorId: g.connector_id, tagId: g.tag_id, kind, ref: l.target_id, read: g.can_read, search: g.can_search,
      });
    }
  }
  const live = await sql.query<{ id: string; connector_id: string; via_tag_id: string; scope_kind: string; ref: string }>(
    `select id, connector_id, via_tag_id, scope_kind, coalesce(branch_id, sector_id) as ref
       from connector_grants
      where user_id = $1 and via_tag_id is not null and revoked_at is null ${connectorId ? "and connector_id = $2" : ""}`,
    connectorId ? [userId, connectorId] : [userId],
  );
  const have = new Set<string>();
  for (const r of live) {
    const key = `${r.connector_id}|${r.via_tag_id}|${r.scope_kind}|${r.ref}`;
    if (desired.has(key) && !have.has(key)) have.add(key);
    else await sql`update connector_grants set revoked_at = now() where id = ${r.id}`;
  }
  for (const [key, d] of desired) {
    if (have.has(key)) continue;
    await sql`
      insert into connector_grants (id, user_id, connector_id, scope_kind, sector_id, branch_id, can_read, can_search, via_tag_id)
      values (${newTagId()}, ${userId}, ${d.connectorId}, ${d.kind},
              ${d.kind === "sector" ? d.ref : null}, ${d.kind === "branch" ? d.ref : null},
              ${d.read}, ${d.search}, ${d.tagId})
    `;
  }
}

/** Replace the tags a connector may read through. Removed grants are revoked (audit trail kept). */
export async function saveConnectorTagGrants(
  transaction: TxRunner,
  userId: string,
  connectorId: string,
  tagIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const want = [...new Set(tagIds.filter(Boolean))];
  return transaction(async (sql) => {
    const k = await sql<{ status: string }>`
      select status from connectors where id = ${connectorId} and user_id = ${userId} for update
    `;
    if (!k[0] || k[0].status !== "active") return { ok: false as const, error: "Connector not found." };
    if (want.length > 32) return { ok: false as const, error: "Too many tags on one connector." };
    if (want.length) {
      const owned = await sql<{ id: string }>`select id from tags where user_id = ${userId} and id = any(${want}::text[])`;
      if (owned.length !== want.length) return { ok: false as const, error: "Unknown tag." };
    }
    await sql`
      update connector_tag_grants set revoked_at = now()
       where connector_id = ${connectorId} and user_id = ${userId} and revoked_at is null
         and not (tag_id = any(${want}::text[]))
    `;
    for (const tagId of want) {
      await sql`
        insert into connector_tag_grants (id, user_id, connector_id, tag_id)
        values (${newTagId()}, ${userId}, ${connectorId}, ${tagId})
        on conflict do nothing
      `;
    }
    await syncTagGrants(sql, userId, connectorId);
    await sql`
      update connectors set policy_version = policy_version + 1 where id = ${connectorId} and user_id = ${userId}
    `;
    await sql`
      insert into connector_audit_logs (id, user_id, connector_id, action, status, detail_json)
      values (${newTagId()}, ${userId}, ${connectorId}, 'grant_change', 'allowed',
              ${JSON.stringify({ tags: want.length })}::jsonb)
    `;
    return { ok: true as const };
  });
}

export type TagRelations = {
  tag: TagRow;
  sectors: string[];
  /** Full branch path per tagged branch, e.g. "Work-Life → Negotiations → Call Scripts". */
  branches: { id: string; path: string; sectorId: string | null }[];
  memories: { id: string; title: string }[];
  connectors: { id: string; name: string }[];
  /** Size of the inherited scope the tag opens up. */
  scope: { sectors: number; branches: number; memories: number };
};

/** Everything one tag touches: where it is attached, what it inherits, who can read through it. */
export async function tagRelations(sql: Sql, userId: string, tagId: string): Promise<TagRelations | null> {
  const t = await sql<DbTag>`select * from tags where id = ${tagId} and user_id = ${userId}`;
  if (!t[0]) return null;
  const links = await sql<{ target_type: TargetType; target_id: string }>`
    select target_type, target_id from tag_links where tag_id = ${tagId} and user_id = ${userId}
  `;
  const concepts = await sql<{ id: string; name: string; parent_id: string | null; sector_id: string | null }>`
    select id, name, parent_id, sector_id from concepts where user_id = ${userId}
  `;
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const pathOf = (id: string): string => {
    const names: string[] = [];
    const seen = new Set<string>();
    for (let cur = byId.get(id); cur && !seen.has(cur.id); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined) {
      seen.add(cur.id);
      names.unshift(cur.name);
    }
    return names.join(" → ");
  };
  const branchLinks = links.filter((l) => l.target_type === "branch" && byId.has(l.target_id));
  const memIds = links.filter((l) => l.target_type === "memory").map((l) => l.target_id);
  const memories = memIds.length
    ? await sql<{ id: string; title: string }>`
        select id, title from memories where user_id = ${userId} and id = any(${memIds}::text[]) order by created_at desc
      `
    : [];
  const connectors = await sql<{ id: string; name: string }>`
    select k.id, k.display_name as name
      from connector_tag_grants g join connectors k on k.id = g.connector_id
     where g.user_id = ${userId} and g.tag_id = ${tagId} and g.revoked_at is null and k.status = 'active'
     order by k.display_name
  `;
  const scope = await resolveTagAccessScope(sql, userId, [tagId]);
  return {
    tag: mapTag(t[0]),
    sectors: links.filter((l) => l.target_type === "sector").map((l) => l.target_id),
    branches: branchLinks.map((l) => ({ id: l.target_id, path: pathOf(l.target_id), sectorId: byId.get(l.target_id)?.sector_id ?? null })),
    memories,
    connectors,
    scope: { sectors: scope.sectorIds.length, branches: scope.branchIds.length, memories: scope.memoryIds.length },
  };
}

export { mapTag };
