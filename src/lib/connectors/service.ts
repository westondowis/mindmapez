/**
 * Policy enforcement point for connectors. Each tool call:
 *
 *   1. opens one transaction,
 *   2. pins `brain.user_id` / `brain.connector_id` and, when the migration could
 *      create it, switches to the `brain_connector` role so Postgres RLS filters
 *      every read a second time,
 *   3. runs only the scoped queries in ./scope.ts,
 *   4. drops back to the app role for writes and the audit row, which commit in
 *      the same transaction as the data access.
 *
 * Out-of-scope and nonexistent targets produce the same `not_found` result; only
 * the owner-only audit row tells them apart.
 */
import { BRAIN_SECTORS, branchKindForDepth, mergeSectors, parseSectorOverrides } from "../brain.ts";
import type { Sql, TxRunner } from "../sql-template.ts";
import { FREE_MEMORY_LIMIT } from "../types.ts";
import {
  containsPattern,
  listScopedBranches,
  listScopedMemories,
  probeBranch,
  scopedChildren,
  scopesFor,
  searchScopedBranches,
  type ScopedMemory,
} from "./scope.ts";
import { hashConnectorToken, parseBearerToken } from "./tokens.ts";
import {
  PERMISSIONS,
  type AuditAction,
  type AuditStatus,
  type ConnectorPrincipal,
  type Permission,
} from "./types.ts";

export type ConnectorDeps = {
  /** App-role connection for authentication and owner-side bookkeeping. */
  sql: Sql;
  /** Runs one transaction; every scoped query goes through the `sql` it hands out. */
  transaction: TxRunner;
  /** Use the brain_connector role + RLS when the database has it (default true). */
  rls?: boolean;
};

export type ToolError =
  | { ok: false; error: "not_found" }
  | { ok: false; error: "insufficient_scope"; required: Permission }
  | { ok: false; error: "invalid_arguments"; message: string }
  | { ok: false; error: "limit_reached"; message: string };

export type ToolResult<T> = { ok: true; data: T } | ToolError;

export type AuditEvent = {
  action: AuditAction;
  status: AuditStatus;
  toolName?: string | null;
  grantId?: string | null;
  targetBranchId?: string | null;
  targetPath?: string | null;
  detail?: Record<string, unknown>;
};

const NOT_FOUND = { ok: false, error: "not_found" } as const;

const newId = () => crypto.randomUUID();

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

/**
 * Resolve an `Authorization: Bearer mm_…` header to an active connector. The row
 * is read on every request, so a revoke takes effect on the very next call.
 */
export async function authenticateConnector(
  sql: Sql,
  authorization: string | null | undefined,
): Promise<ConnectorPrincipal | null> {
  const token = parseBearerToken(authorization);
  if (!token) return null;
  const hash = await hashConnectorToken(token);
  const rows = await sql<{ id: string; user_id: string; display_name: string; policy_version: number; stale: boolean }>`
    select id, user_id, display_name, policy_version,
           (last_used_at is null or last_used_at < now() - interval '1 minute') as stale
      from connectors
     where token_hash = ${hash} and status = 'active' and kind = 'mcp_static'
  `;
  const row = rows[0];
  if (!row) return null;
  if (row.stale) await sql`update connectors set last_used_at = now() where id = ${row.id}`;
  return {
    connectorId: row.id,
    userId: row.user_id,
    displayName: row.display_name,
    policyVersion: Number(row.policy_version),
  };
}

/** Union of the flags across a connector's active grants (drives tools/list). */
export async function effectivePermissions(sql: Sql, who: ConnectorPrincipal): Promise<Set<Permission>> {
  const out = new Set<Permission>();
  for (const p of PERMISSIONS) {
    const rows = await scopesFor(sql, who, p);
    if (rows.length) out.add(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Transaction + audit plumbing
// ---------------------------------------------------------------------------

async function connectorRoleReady(tx: Sql) {
  const rows = await tx<{ ok: boolean }>`
    select case
             when exists (select 1 from pg_roles where rolname = 'brain_connector')
              and exists (select 1 from pg_policies where policyname = 'concepts_connector_scope')
             then pg_has_role(current_user, 'brain_connector', 'MEMBER')
             else false
           end as ok
  `;
  return Boolean(rows[0]?.ok);
}

export type Scoped = {
  /** The transaction's `sql`; reads here run under RLS when it is active. */
  tx: Sql;
  /** Leave the restricted role (for writes and audit). Idempotent. */
  elevate: () => Promise<void>;
  audit: (event: AuditEvent) => void;
};

async function writeAudit(sql: Sql, who: ConnectorPrincipal, e: AuditEvent) {
  await sql`
    insert into connector_audit_logs
      (id, user_id, connector_id, grant_id, action, tool_name, target_branch_id, target_path, status, detail_json)
    values (${newId()}, ${who.userId}, ${who.connectorId}, ${e.grantId ?? null}, ${e.action},
      ${e.toolName ?? null}, ${e.targetBranchId ?? null}, ${e.targetPath ?? null}, ${e.status},
      ${JSON.stringify(e.detail ?? {})}::jsonb)
  `;
}

/** Owner-side audit outside any tool transaction (auth failures, owner actions). */
export async function recordAudit(sql: Sql, who: ConnectorPrincipal, e: AuditEvent) {
  await writeAudit(sql, who, e);
}

export async function runScoped<T>(
  deps: ConnectorDeps,
  who: ConnectorPrincipal,
  toolName: string,
  fn: (s: Scoped) => Promise<T>,
): Promise<T> {
  try {
    return await deps.transaction(async (tx) => {
      await tx`select set_config('brain.user_id', ${who.userId}, true), set_config('brain.connector_id', ${who.connectorId}, true)`;
      let restricted = false;
      if (deps.rls !== false && (await connectorRoleReady(tx))) {
        await tx.query("set local role brain_connector");
        restricted = true;
      }
      const events: AuditEvent[] = [];
      const elevate = async () => {
        if (!restricted) return;
        await tx.query("reset role");
        restricted = false;
      };
      const result = await fn({ tx, elevate, audit: (e) => events.push(e) });
      await elevate();
      for (const e of events) await writeAudit(tx, who, { toolName, ...e });
      return result;
    });
  } catch (err) {
    await writeAudit(deps.sql, who, {
      action: "read",
      status: "error",
      toolName,
      detail: { message: err instanceof Error ? err.message.slice(0, 200) : "error" },
    }).catch(() => undefined);
    throw err;
  }
}

/**
 * Record a miss without changing what the caller sees: `boundary_violation`
 * when the id exists for this user outside the grant, `denied` otherwise.
 */
async function auditMiss(s: Scoped, action: AuditAction, branchId: string, detail?: Record<string, unknown>) {
  await s.elevate();
  const rows = await s.tx<{ path: string }>`
    select path from concepts where id = ${branchId} and user_id = current_setting('brain.user_id', true)
  `;
  s.audit({
    action,
    status: rows[0] ? "boundary_violation" : "denied",
    targetBranchId: branchId,
    targetPath: rows[0]?.path ?? null,
    detail,
  });
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export type TreeNode = {
  id: string;
  name: string;
  kind: string;
  emoji: string | null;
  description: string | null;
  /** Null at a granted root: nothing above the grant is ever disclosed. */
  parent_id: string | null;
  /** 0 at a granted root. */
  depth: number;
  memory_count: number;
  /** Only when the branch is visible through a Full Brain or sector grant. */
  sector_id: string | null;
};

export type TreeScope =
  | { kind: "root"; label: string }
  | { kind: "sector"; sector_id: string; label: string }
  | { kind: "branch"; branch_id: string; name: string };

export async function listAuthorizedTree(
  deps: ConnectorDeps,
  who: ConnectorPrincipal,
  input: { rootId?: string; maxDepth?: number } = {},
): Promise<ToolResult<{ scopes: TreeScope[]; branches: TreeNode[]; truncated: boolean }>> {
  const maxDepth = Math.min(Math.max(Math.trunc(input.maxDepth ?? 4), 1), 12);
  return runScoped(deps, who, "list_authorized_tree", async (s) => {
    const scopes = await scopesFor(s.tx, who, "read");
    if (!scopes.length) {
      s.audit({ action: "read", status: "denied", detail: { reason: "no read grant" } });
      return { ok: false as const, error: "insufficient_scope" as const, required: "read" as const };
    }
    const rows = await listScopedBranches(s.tx, who);
    const byId = new Map(rows.map((r) => [r.id, r]));
    let rootPath: string | null = null;
    if (input.rootId) {
      const root = byId.get(input.rootId);
      if (!root) {
        await auditMiss(s, "read", input.rootId);
        return NOT_FOUND;
      }
      rootPath = root.path;
    }
    // Relative depth: walk up through visible parents only.
    const depthOf = new Map<string, number>();
    const rel = (id: string): number => {
      const known = depthOf.get(id);
      if (known !== undefined) return known;
      const row = byId.get(id)!;
      const atRoot = (rootPath && row.path === rootPath) || !row.parent_id || !byId.has(row.parent_id);
      const d = atRoot ? 0 : rel(row.parent_id!) + 1;
      depthOf.set(id, d);
      return d;
    };
    let truncated = false;
    const branches: TreeNode[] = [];
    for (const r of rows) {
      if (rootPath && !r.path.startsWith(rootPath)) continue;
      const depth = rel(r.id);
      if (depth >= maxDepth) {
        truncated = true;
        continue;
      }
      const parentVisible = Boolean(r.parent_id && byId.has(r.parent_id)) && !(rootPath && r.path === rootPath);
      branches.push({
        id: r.id,
        name: r.name,
        kind: r.kind,
        emoji: r.emoji,
        description: r.description,
        parent_id: parentVisible ? r.parent_id : null,
        depth,
        memory_count: Number(r.memory_count),
        sector_id: r.via_sector ? r.sector_id : null,
      });
    }
    await s.elevate();
    const settings = await s.tx<{ brain_sectors_json: string | null }>`
      select brain_sectors_json from user_settings where user_id = ${who.userId}
    `;
    const sectors = mergeSectors(parseSectorOverrides(settings[0]?.brain_sectors_json ?? null));
    const label = (id: string) =>
      sectors.find((x) => x.id === id)?.label ?? BRAIN_SECTORS.find((x) => x.id === id)?.label ?? id;
    const outScopes: TreeScope[] = scopes.map((g) =>
      g.scope_kind === "root"
        ? { kind: "root", label: "Full brain" }
        : g.scope_kind === "sector"
          ? { kind: "sector", sector_id: g.scope_ref!, label: label(g.scope_ref!) }
          : { kind: "branch", branch_id: g.scope_ref!, name: byId.get(g.scope_ref!)?.name ?? "" },
    );
    s.audit({ action: "read", status: "allowed", targetBranchId: input.rootId ?? null, detail: { count: branches.length } });
    return { ok: true as const, data: { scopes: outScopes, branches, truncated } };
  });
}

export type MemoryOut = {
  id: string;
  title: string;
  body: string;
  summary: string | null;
  tags: string[];
  type: string;
  source_url: string | null;
  created_at: string;
  branch_id: string | null;
};

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function memoryOut(m: ScopedMemory): MemoryOut {
  return {
    id: m.id,
    title: m.title,
    body: m.body,
    summary: m.ai_summary,
    tags: parseTags(m.tags_json),
    type: m.memory_type,
    source_url: m.source_url,
    created_at: new Date(m.created_at).toISOString(),
    branch_id: m.owner_branch_id,
  };
}

function decodeCursor(cursor: string | undefined): number | null {
  if (!cursor) return 0;
  if (!/^o[0-9]{1,6}$/.test(cursor)) return null;
  return Number(cursor.slice(1));
}

export async function readBranch(
  deps: ConnectorDeps,
  who: ConnectorPrincipal,
  input: { branchId: string; includeChildren?: boolean; limit?: number; cursor?: string },
): Promise<
  ToolResult<{
    branch: { id: string; name: string; kind: string; emoji: string | null; description: string | null; parent_id: string | null };
    children: { id: string; name: string; kind: string; emoji: string | null }[];
    memories: MemoryOut[];
    next_cursor: string | null;
  }>
> {
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 25), 1), 100);
  const offset = decodeCursor(input.cursor);
  if (offset === null) return { ok: false, error: "invalid_arguments", message: "cursor is not valid" };
  return runScoped(deps, who, "read_branch", async (s) => {
    const branch = await probeBranch(s.tx, who, input.branchId, "read");
    if (!branch) {
      await auditMiss(s, "read", input.branchId);
      return NOT_FOUND;
    }
    const parent = branch.parent_id ? await probeBranch(s.tx, who, branch.parent_id, "read") : null;
    const children = await scopedChildren(s.tx, who, branch.id);
    const rows = await listScopedMemories(s.tx, who, "read", {
      ...(input.includeChildren ? { withinPath: branch.path } : { ownerBranchId: branch.id }),
      limit: limit + 1,
      offset,
    });
    const page = rows.slice(0, limit);
    s.audit({
      action: "read",
      status: "allowed",
      grantId: branch.grant_id,
      targetBranchId: branch.id,
      targetPath: branch.path,
      detail: { memories: page.length },
    });
    return {
      ok: true as const,
      data: {
        branch: {
          id: branch.id,
          name: branch.name,
          kind: branch.kind,
          emoji: branch.emoji,
          description: branch.description,
          parent_id: parent ? parent.id : null,
        },
        children,
        memories: page.map(memoryOut),
        next_cursor: rows.length > limit ? `o${offset + limit}` : null,
      },
    };
  });
}

export type SearchHit = {
  id: string;
  title: string;
  snippet: string;
  tags: string[];
  branch_id: string | null;
  score: number;
};

function searchTerms(query: string) {
  const terms = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 2);
  return [...new Set(terms)].slice(0, 8);
}

function count(hay: string, term: string) {
  let n = 0;
  let at = hay.indexOf(term);
  while (at !== -1) {
    n += 1;
    at = hay.indexOf(term, at + term.length);
  }
  return n;
}

export async function searchBrain(
  deps: ConnectorDeps,
  who: ConnectorPrincipal,
  input: { query: string; scope?: "all" | "branches" | "memories"; tags?: string[]; withinBranchId?: string; limit?: number },
): Promise<ToolResult<{ memories: SearchHit[]; branches: { id: string; name: string; kind: string }[] }>> {
  const query = (input.query ?? "").slice(0, 300);
  const terms = searchTerms(query);
  if (!terms.length) return { ok: false, error: "invalid_arguments", message: "query needs at least one word" };
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 10), 1), 24);
  const scope = input.scope ?? "all";
  const wantTags = (input.tags ?? []).slice(0, 8).map((t) => t.toLowerCase());
  return runScoped(deps, who, "search_brain", async (s) => {
    const scopes = await scopesFor(s.tx, who, "search");
    if (!scopes.length) {
      s.audit({ action: "search", status: "denied", detail: { reason: "no search grant" } });
      return { ok: false as const, error: "insufficient_scope" as const, required: "search" as const };
    }
    let withinPath: string | null = null;
    let grantId: string | null = null;
    if (input.withinBranchId) {
      const within = await probeBranch(s.tx, who, input.withinBranchId, "search");
      if (!within) {
        await auditMiss(s, "search", input.withinBranchId);
        return NOT_FOUND;
      }
      withinPath = within.path;
      grantId = within.grant_id;
    }
    const patterns = terms.map(containsPattern);
    let memories: SearchHit[] = [];
    if (scope !== "branches") {
      const rows = await listScopedMemories(s.tx, who, "search", {
        ...(withinPath ? { withinPath } : {}),
        patterns,
        limit: 400,
      });
      memories = rows
        .map((m) => {
          const tags = parseTags(m.tags_json);
          const title = m.title.toLowerCase();
          const body = `${m.body} ${m.ai_summary ?? ""}`.toLowerCase();
          const tagText = tags.join(" ").toLowerCase();
          let score = 0;
          for (const t of terms) score += count(title, t) * 3 + count(tagText, t) * 2 + Math.min(count(body, t), 5);
          return { m, tags, score };
        })
        .filter((x) => x.score > 0)
        .filter((x) => wantTags.every((t) => x.tags.some((have) => have.toLowerCase() === t)))
        .sort((a, b) => b.score - a.score || new Date(b.m.created_at).getTime() - new Date(a.m.created_at).getTime())
        .slice(0, limit)
        .map(({ m, tags, score }) => ({
          id: m.id,
          title: m.title,
          snippet: (m.ai_summary || m.body).slice(0, 280),
          tags,
          branch_id: m.owner_branch_id,
          score,
        }));
    }
    const branches =
      scope === "memories" ? [] : await searchScopedBranches(s.tx, who, patterns, withinPath, limit);
    s.audit({
      action: "search",
      status: "allowed",
      grantId,
      targetBranchId: input.withinBranchId ?? null,
      detail: { terms: terms.length, memories: memories.length, branches: branches.length },
    });
    return {
      ok: true as const,
      data: { memories, branches: branches.map((b) => ({ id: b.id, name: b.name, kind: b.kind })) },
    };
  });
}

export type IngestInput = {
  targetBranchId: string;
  kind: "memory" | "sub-branch";
  title: string;
  body?: string;
  tags?: string[];
  sourceUrl?: string;
  mode?: "review" | "direct";
};

function validateIngest(input: IngestInput): string | null {
  if (input.kind !== "memory" && input.kind !== "sub-branch") return "kind must be memory or sub-branch";
  const title = (input.title ?? "").trim();
  if (!title) return "title is required";
  if (title.length > 200) return "title is too long";
  if (input.kind === "sub-branch" && title.length > 80) return "branch names must be under 80 characters";
  if ((input.body ?? "").length > 8000) return "body is too long";
  if ((input.tags ?? []).length > 8 || (input.tags ?? []).some((t) => typeof t !== "string" || t.length > 40)) {
    return "at most 8 tags of up to 40 characters";
  }
  if (input.sourceUrl) {
    try {
      const u = new URL(input.sourceUrl);
      if (u.protocol !== "https:" && u.protocol !== "http:") return "source_url must be http(s)";
    } catch {
      return "source_url must be a URL";
    }
  }
  if (input.mode && input.mode !== "review" && input.mode !== "direct") return "mode must be review or direct";
  return null;
}

export async function ingestMemory(
  deps: ConnectorDeps,
  who: ConnectorPrincipal,
  input: IngestInput,
): Promise<ToolResult<{ status: "pending_review"; review_id: string } | { status: "created"; id: string; kind: "memory" | "sub-branch" }>> {
  const invalid = validateIngest(input);
  if (invalid) return { ok: false, error: "invalid_arguments", message: invalid };
  const mode = input.mode ?? "review";
  const need: Permission = mode === "direct" ? "write_direct" : "write_review";
  const title = input.title.trim();
  const body = (input.body ?? "").trim();
  const tags = (input.tags ?? []).map((t) => t.trim()).filter(Boolean);
  return runScoped(deps, who, "ingest_memory", async (s) => {
    const target = await probeBranch(s.tx, who, input.targetBranchId, need);
    if (!target) {
      // Inside the readable scope but missing this flag: the target's existence
      // is already known to the caller, so say which flag is missing.
      const readable = await probeBranch(s.tx, who, input.targetBranchId, "read");
      if (readable) {
        s.audit({
          action: need,
          status: "denied",
          grantId: readable.grant_id,
          targetBranchId: readable.id,
          targetPath: readable.path,
          detail: { reason: `missing ${need}` },
        });
        return { ok: false as const, error: "insufficient_scope" as const, required: need };
      }
      await auditMiss(s, need, input.targetBranchId, { kind: input.kind });
      return NOT_FOUND;
    }

    if (mode === "review") {
      const id = newId();
      const raw = body ? `${title}\n\n${body}` : title;
      // Inserted under the restricted role: the RLS insert policy re-checks the target.
      await s.tx`
        insert into pending_reviews
          (id, user_id, raw, key_points_json, keywords_json, action, concept_id, concept_name, suggested_name,
           connector_id, grant_id, target_branch_id, source_kind, untrusted_payload_json)
        values (${id}, ${who.userId}, ${raw.slice(0, 8000)}, ${"[]"}, ${JSON.stringify(tags)},
          ${input.kind === "memory" ? "memory" : "sub-branch"}, ${target.id}, ${target.name},
          ${input.kind === "sub-branch" ? title : null}, ${who.connectorId}, ${target.grant_id}, ${target.id},
          ${"connector"},
          ${JSON.stringify({ title, body, tags, source_url: input.sourceUrl ?? null, connector: who.displayName })}::jsonb)
      `;
      s.audit({
        action: "write_review",
        status: "pending_approval",
        grantId: target.grant_id,
        targetBranchId: target.id,
        targetPath: target.path,
        detail: { kind: input.kind, review_id: id },
      });
      return { ok: true as const, data: { status: "pending_review" as const, review_id: id } };
    }

    await s.elevate();
    if (input.kind === "memory") {
      const counts = await s.tx<{ n: number; plan: string | null }>`
        select (select count(*)::int from memories where user_id = ${who.userId}) as n,
               (select plan from user_settings where user_id = ${who.userId}) as plan
      `;
      if (counts[0]?.plan !== "pro" && Number(counts[0]?.n ?? 0) >= FREE_MEMORY_LIMIT) {
        s.audit({ action: "write_direct", status: "denied", grantId: target.grant_id, targetBranchId: target.id, detail: { reason: "plan limit" } });
        return { ok: false as const, error: "limit_reached" as const, message: "The brain's free plan memory limit is reached." };
      }
      const id = newId();
      await s.tx`
        insert into memories (id, user_id, title, body, memory_type, tags_json, source_url, source_kind, owner_branch_id)
        values (${id}, ${who.userId}, ${title}, ${body}, ${"text"}, ${JSON.stringify(tags)},
          ${input.sourceUrl ?? null}, ${input.sourceUrl ? "other" : null}, ${target.id})
      `;
      await s.tx`
        insert into memory_concepts (user_id, memory_id, concept_id) values (${who.userId}, ${id}, ${target.id})
        on conflict do nothing
      `;
      await s.tx`
        insert into connections (id, user_id, source_type, source_id, target_type, target_id, strength, reason, status)
        values (${newId()}, ${who.userId}, 'memory', ${id}, 'concept', ${target.id}, 0.7, ${"auto: " + target.name}, 'accepted')
      `;
      await s.tx`update user_settings set last_saved_at = now() where user_id = ${who.userId}`;
      s.audit({ action: "write_direct", status: "allowed", grantId: target.grant_id, targetBranchId: target.id, targetPath: target.path, detail: { kind: "memory", id } });
      return { ok: true as const, data: { status: "created" as const, id, kind: "memory" as const } };
    }

    const id = newId();
    const pos = await s.tx<{ x: number | null; y: number | null; n: number }>`
      select c.position_x as x, c.position_y as y,
             (select count(*)::int from concepts k where k.user_id = ${who.userId} and k.parent_id = c.id) as n
        from concepts c where c.id = ${target.id} and c.user_id = ${who.userId}
    `;
    const angle = ((pos[0]?.n ?? 0) * 47 * Math.PI) / 180;
    await s.tx`
      insert into concepts (id, user_id, name, kind, icon, emoji, color, description, parent_id, sector_id,
                            position_x, position_y, updated_at)
      values (${id}, ${who.userId}, ${title}, ${branchKindForDepth(target.depth)}, ${"brain"}, ${"🧠"}, ${"cyan"},
        ${body.slice(0, 500)}, ${target.id}, ${target.sector_id},
        ${(pos[0]?.x ?? 0) + Math.cos(angle) * 180}, ${(pos[0]?.y ?? 0) + Math.sin(angle) * 180}, now())
    `;
    await s.tx`
      insert into connections (id, user_id, source_type, source_id, target_type, target_id, strength, reason, status)
      values (${newId()}, ${who.userId}, 'concept', ${target.id}, 'concept', ${id}, 0.8, ${"branch"}, 'accepted')
    `;
    await s.tx`update user_settings set last_saved_at = now() where user_id = ${who.userId}`;
    s.audit({ action: "write_direct", status: "allowed", grantId: target.grant_id, targetBranchId: target.id, targetPath: target.path, detail: { kind: "sub-branch", id } });
    return { ok: true as const, data: { status: "created" as const, id, kind: "sub-branch" as const } };
  });
}
