/**
 * Scoped data access for connectors. These are the only queries the MCP endpoint
 * runs against brain data. Every one joins `connector_scope_paths()` on the
 * materialized `concepts.path` range, so scope is part of the query itself and
 * never a filter applied after an unscoped fetch.
 *
 *   in scope  <=>  scope_path <= concepts.path < brain_path_end(scope_path)   (collate "C")
 *
 * A memory is in scope when the branch that owns it (`memories.owner_branch_id`)
 * is. Memories with no owner are visible to a Full Brain grant only.
 */
import type { Sql } from "../sql-template.ts";
import { isPermission, type ConnectorPrincipal, type Permission } from "./types.ts";

export type ScopeRow = {
  grant_id: string;
  scope_kind: "root" | "sector" | "branch";
  scope_ref: string | null;
  scope_path: string;
  scope_end: string;
};

export type ScopedBranch = {
  id: string;
  name: string;
  kind: string;
  emoji: string | null;
  description: string | null;
  parent_id: string | null;
  sector_id: string | null;
  path: string;
  depth: number;
  grant_id: string;
};

export type ScopedMemory = {
  id: string;
  title: string;
  body: string;
  ai_summary: string | null;
  tags_json: string | null;
  memory_type: string;
  source_url: string | null;
  created_at: string | Date;
  owner_branch_id: string | null;
};

function perm(p: Permission): Permission {
  // Interpolated into SQL text below, so only the fixed literals are allowed.
  if (!isPermission(p)) throw new Error("unknown permission");
  return p;
}

/** Concepts in scope for `p`, as a join source. $1 = user id, $2 = connector id. */
function scopedConceptsSql(p: Permission) {
  return `
    select c.id, min(s.grant_id) as grant_id
      from connector_scope_paths($1, $2, '${perm(p)}') s
      join concepts c
        on c.user_id = $1
       and c.path >= s.scope_path collate "C"
       and c.path < s.scope_end collate "C"
     group by c.id`;
}

export async function scopesFor(sql: Sql, who: ConnectorPrincipal, p: Permission) {
  return sql.query<ScopeRow>(
    `select grant_id, scope_kind, scope_ref, scope_path, scope_end
       from connector_scope_paths($1, $2, '${perm(p)}')
      order by scope_path`,
    [who.userId, who.connectorId],
  );
}

/**
 * Q3: the single-target probe every tool runs before acting on a branch id.
 * Returns null both when the id doesn't exist and when it exists outside the
 * grant, with the same query, so callers can't tell the two apart.
 */
export async function probeBranch(
  sql: Sql,
  who: ConnectorPrincipal,
  branchId: string,
  p: Permission,
): Promise<ScopedBranch | null> {
  const rows = await sql.query<ScopedBranch>(
    `select c.id, c.name, c.kind, c.emoji, c.description, c.parent_id, c.sector_id, c.path,
            coalesce(c.depth, 1)::int as depth, s.grant_id
       from concepts c
       join lateral (
         select s.grant_id
           from connector_scope_paths($1, $2, '${perm(p)}') s
          where c.path >= s.scope_path collate "C" and c.path < s.scope_end collate "C"
          order by length(s.scope_path) desc
          limit 1
       ) s on true
      where c.user_id = $1 and c.id = $3`,
    [who.userId, who.connectorId, branchId],
  );
  return rows[0] ?? null;
}

/** Q1: every branch the connector may read, ordered by path. */
export async function listScopedBranches(sql: Sql, who: ConnectorPrincipal) {
  return sql.query<Omit<ScopedBranch, "grant_id"> & { via_sector: boolean; memory_count: number }>(
    `select c.id, c.name, c.kind, c.emoji, c.description, c.parent_id, c.sector_id, c.path,
            coalesce(c.depth, 1)::int as depth,
            bool_or(s.scope_kind <> 'branch') as via_sector,
            (select count(*)::int from memories m
              where m.user_id = $1 and m.owner_branch_id = c.id) as memory_count
       from connector_scope_paths($1, $2, 'read') s
       join concepts c
         on c.user_id = $1
        and c.path >= s.scope_path collate "C"
        and c.path < s.scope_end collate "C"
      group by c.id, c.name, c.kind, c.emoji, c.description, c.parent_id, c.sector_id, c.path, c.depth
      order by c.path`,
    [who.userId, who.connectorId],
  );
}

const MEMORY_COLUMNS = `m.id, m.title, m.body, m.ai_summary, m.tags_json, m.memory_type, m.source_url,
       m.created_at, m.owner_branch_id`;

/**
 * Q2: memories owned by in-scope branches (plus unowned ones for a Full Brain
 * grant), optionally narrowed to one in-scope subtree and a keyword prefilter.
 */
export async function listScopedMemories(
  sql: Sql,
  who: ConnectorPrincipal,
  p: Permission,
  opts: {
    /** Only memories owned by exactly this (already probed) branch. */
    ownerBranchId?: string;
    /** Only memories under this (already probed) branch path. */
    withinPath?: string;
    /** ILIKE patterns; a row matches when any column matches any pattern. */
    patterns?: string[];
    limit: number;
    offset?: number;
  },
): Promise<ScopedMemory[]> {
  const params: unknown[] = [who.userId, who.connectorId];
  const conds: string[] = [];
  let ownerClause: string;
  if (opts.ownerBranchId) {
    params.push(opts.ownerBranchId);
    ownerClause = `m.owner_branch_id = $${params.length}
      and m.owner_branch_id in (select x.id from (${scopedConceptsSql(p)}) x)`;
  } else if (opts.withinPath) {
    params.push(opts.withinPath);
    const at = params.length;
    ownerClause = `m.owner_branch_id in (
      select c.id
        from connector_scope_paths($1, $2, '${perm(p)}') s
        join concepts c
          on c.user_id = $1
         and c.path >= s.scope_path collate "C"
         and c.path < s.scope_end collate "C"
       where c.path >= $${at}::text collate "C"
         and c.path < brain_path_end($${at}::text) collate "C")`;
  } else {
    ownerClause = `(m.owner_branch_id in (select x.id from (${scopedConceptsSql(p)}) x)
      or (m.owner_branch_id is null and exists (
        select 1 from connector_scope_paths($1, $2, '${perm(p)}') r where r.scope_kind = 'root')))`;
  }
  if (opts.patterns?.length) {
    params.push(opts.patterns);
    const at = params.length;
    conds.push(`(m.title ilike any($${at}::text[]) or m.body ilike any($${at}::text[])
      or coalesce(m.tags_json, '') ilike any($${at}::text[]) or coalesce(m.ai_summary, '') ilike any($${at}::text[]))`);
  }
  params.push(opts.limit, opts.offset ?? 0);
  return sql.query<ScopedMemory>(
    `select ${MEMORY_COLUMNS}
       from memories m
      where m.user_id = $1
        and ${ownerClause}
        ${conds.map((c) => `and ${c}`).join("\n        ")}
      order by m.created_at desc, m.id
      limit $${params.length - 1} offset $${params.length}`,
    params,
  );
}

/** Branch-name search inside the scope (for search_brain scope "all" / "branches"). */
export async function searchScopedBranches(
  sql: Sql,
  who: ConnectorPrincipal,
  patterns: string[],
  withinPath: string | null,
  limit: number,
) {
  const params: unknown[] = [who.userId, who.connectorId, patterns];
  let within = "";
  if (withinPath) {
    params.push(withinPath);
    within = `and c.path >= $4::text collate "C" and c.path < brain_path_end($4::text) collate "C"`;
  }
  params.push(limit);
  return sql.query<{ id: string; name: string; kind: string; description: string | null }>(
    `select distinct c.id, c.name, c.kind, c.description
       from connector_scope_paths($1, $2, 'search') s
       join concepts c
         on c.user_id = $1
        and c.path >= s.scope_path collate "C"
        and c.path < s.scope_end collate "C"
      where (c.name ilike any($3::text[]) or coalesce(c.description, '') ilike any($3::text[]))
        ${within}
      order by c.name
      limit $${params.length}`,
    params,
  );
}

/** Ids of the in-scope children of an in-scope branch. */
export async function scopedChildren(sql: Sql, who: ConnectorPrincipal, parentId: string) {
  return sql.query<{ id: string; name: string; kind: string; emoji: string | null }>(
    `select c.id, c.name, c.kind, c.emoji
       from concepts c
      where c.user_id = $1 and c.parent_id = $3
        and c.id in (select x.id from (${scopedConceptsSql("read")}) x)
      order by c.name`,
    [who.userId, who.connectorId, parentId],
  );
}

/** Escape a user term for ILIKE and wrap it as a contains-pattern. */
export function containsPattern(term: string) {
  return `%${term.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}
