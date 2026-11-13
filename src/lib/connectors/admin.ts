/**
 * Owner-side connector control plane: create, grant, revoke, preview, audit.
 * Called only from session-authenticated server functions (never over MCP), so
 * grant editing can't be reached by a connector.
 */
import { BRAIN_SECTORS } from "../brain.ts";
import type { Sql, TxRunner } from "../sql-template.ts";
import { generateConnectorToken, hashConnectorToken } from "./tokens.ts";
import { normalizeFlags, type AuditStatus, type GrantInput, type PermissionFlags, type ScopeKind } from "./types.ts";

const newId = () => crypto.randomUUID();

export type ConnectorGrant = {
  id: string;
  scopeKind: ScopeKind;
  scopeRef: string | null;
  /** Branch name or sector id, for display. */
  scopeLabel: string | null;
  permissions: PermissionFlags;
  createdAt: string;
};

export type ConnectorSummary = {
  id: string;
  displayName: string;
  tokenPrefix: string | null;
  status: "active" | "revoked";
  policyVersion: number;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  grants: ConnectorGrant[];
};

export type AuditEntry = {
  seq: number;
  connectorId: string;
  connectorName: string | null;
  action: string;
  toolName: string | null;
  targetBranchId: string | null;
  targetBranchName: string | null;
  status: AuditStatus;
  detail: Record<string, unknown>;
  createdAt: string;
  rowHash: string;
};

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

async function ownerAudit(
  sql: Sql,
  userId: string,
  connectorId: string,
  action: "create" | "grant_change" | "revoke",
  detail: Record<string, unknown>,
) {
  await sql`
    insert into connector_audit_logs (id, user_id, connector_id, action, status, detail_json)
    values (${newId()}, ${userId}, ${connectorId}, ${action}, 'allowed', ${JSON.stringify(detail)}::jsonb)
  `;
}

/** Validate grants against this user's brain. Returns an error message or null. */
async function checkGrants(sql: Sql, userId: string, grants: GrantInput[]): Promise<string | null> {
  if (grants.length > 32) return "Too many scopes on one connector.";
  for (const g of grants) {
    const flags = normalizeFlags(g.permissions);
    if (!Object.values(flags).some(Boolean)) return "Each scope needs at least one permission.";
    if (g.scopeKind === "root") continue;
    if (g.scopeKind === "sector") {
      if (!BRAIN_SECTORS.some((s) => s.id === g.scopeRef)) return "That main branch doesn't exist.";
      continue;
    }
    if (g.scopeKind !== "branch" || !g.scopeRef) return "Pick a branch for this scope.";
    const rows = await sql`select 1 from concepts where id = ${g.scopeRef} and user_id = ${userId}`;
    if (!rows.length) return "That branch is gone.";
  }
  return null;
}

async function insertGrants(sql: Sql, userId: string, connectorId: string, grants: GrantInput[]) {
  for (const g of grants) {
    const f = normalizeFlags(g.permissions);
    await sql`
      insert into connector_grants (id, user_id, connector_id, scope_kind, sector_id, branch_id, scope_path,
        can_read, can_search, can_write_review, can_write_direct, can_execute)
      values (${newId()}, ${userId}, ${connectorId}, ${g.scopeKind},
        ${g.scopeKind === "sector" ? g.scopeRef : null}, ${g.scopeKind === "branch" ? g.scopeRef : null}, '/',
        ${f.read}, ${f.search}, ${f.write_review}, ${f.write_direct}, ${f.execute})
    `;
  }
}

export async function createConnector(
  transaction: TxRunner,
  userId: string,
  input: { displayName: string; grants: GrantInput[] },
): Promise<{ ok: true; connectorId: string; token: string } | { ok: false; error: string }> {
  const displayName = input.displayName.trim().slice(0, 60);
  if (!displayName) return { ok: false, error: "Give the connector a name." };
  const { token, prefix } = generateConnectorToken();
  const hash = await hashConnectorToken(token);
  const id = newId();
  return transaction(async (sql) => {
    const bad = await checkGrants(sql, userId, input.grants);
    if (bad) return { ok: false as const, error: bad };
    await sql`
      insert into connectors (id, user_id, kind, display_name, token_hash, token_prefix)
      values (${id}, ${userId}, 'mcp_static', ${displayName}, ${hash}, ${prefix})
    `;
    await insertGrants(sql, userId, id, input.grants);
    await ownerAudit(sql, userId, id, "create", { name: displayName, scopes: input.grants.length });
    return { ok: true as const, connectorId: id, token };
  });
}

/** Replace a connector's grants. Old grants are revoked (kept for the audit trail), not deleted. */
export async function saveGrants(
  transaction: TxRunner,
  userId: string,
  connectorId: string,
  grants: GrantInput[],
): Promise<{ ok: true; policyVersion: number } | { ok: false; error: string }> {
  return transaction(async (sql) => {
    const rows = await sql<{ status: string }>`
      select status from connectors where id = ${connectorId} and user_id = ${userId} for update
    `;
    if (!rows[0] || rows[0].status !== "active") return { ok: false as const, error: "Connector not found." };
    const bad = await checkGrants(sql, userId, grants);
    if (bad) return { ok: false as const, error: bad };
    await sql`
      update connector_grants set revoked_at = now()
      where connector_id = ${connectorId} and user_id = ${userId} and revoked_at is null
    `;
    await insertGrants(sql, userId, connectorId, grants);
    const v = await sql<{ policy_version: number }>`
      update connectors set policy_version = policy_version + 1
      where id = ${connectorId} and user_id = ${userId}
      returning policy_version
    `;
    await ownerAudit(sql, userId, connectorId, "grant_change", {
      scopes: grants.map((g) => ({ kind: g.scopeKind, ref: g.scopeRef, ...normalizeFlags(g.permissions) })),
    });
    return { ok: true as const, policyVersion: Number(v[0]?.policy_version ?? 0) };
  });
}

export async function revokeConnector(
  transaction: TxRunner,
  userId: string,
  connectorId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return transaction(async (sql) => {
    const rows = await sql<{ id: string }>`
      update connectors set status = 'revoked', revoked_at = now()
      where id = ${connectorId} and user_id = ${userId} and status = 'active'
      returning id
    `;
    if (!rows.length) return { ok: false as const, error: "Connector not found or already revoked." };
    await sql`
      update connector_grants set revoked_at = now()
      where connector_id = ${connectorId} and user_id = ${userId} and revoked_at is null
    `;
    await ownerAudit(sql, userId, connectorId, "revoke", {});
    return { ok: true as const };
  });
}

export async function listConnectors(sql: Sql, userId: string): Promise<ConnectorSummary[]> {
  const connectors = await sql<{
    id: string;
    display_name: string;
    token_prefix: string | null;
    status: "active" | "revoked";
    policy_version: number;
    created_at: string;
    last_used_at: string | null;
    revoked_at: string | null;
  }>`
    select id, display_name, token_prefix, status, policy_version, created_at, last_used_at, revoked_at
    from connectors where user_id = ${userId}
    order by status asc, created_at desc
  `;
  const grants = await sql<{
    id: string;
    connector_id: string;
    scope_kind: ScopeKind;
    sector_id: string | null;
    branch_id: string | null;
    branch_name: string | null;
    can_read: boolean;
    can_search: boolean;
    can_write_review: boolean;
    can_write_direct: boolean;
    can_execute: boolean;
    created_at: string;
  }>`
    select g.id, g.connector_id, g.scope_kind, g.sector_id, g.branch_id, c.name as branch_name,
           g.can_read, g.can_search, g.can_write_review, g.can_write_direct, g.can_execute, g.created_at
    from connector_grants g
    left join concepts c on c.id = g.branch_id and c.user_id = g.user_id
    where g.user_id = ${userId} and g.revoked_at is null
    order by g.created_at
  `;
  return connectors.map((c) => ({
    id: c.id,
    displayName: c.display_name,
    tokenPrefix: c.token_prefix,
    status: c.status,
    policyVersion: Number(c.policy_version),
    createdAt: iso(c.created_at)!,
    lastUsedAt: iso(c.last_used_at),
    revokedAt: iso(c.revoked_at),
    grants: grants
      .filter((g) => g.connector_id === c.id)
      .map((g) => ({
        id: g.id,
        scopeKind: g.scope_kind,
        scopeRef: g.branch_id ?? g.sector_id,
        scopeLabel: g.scope_kind === "branch" ? g.branch_name : g.sector_id,
        permissions: {
          read: g.can_read,
          search: g.can_search,
          write_review: g.can_write_review,
          write_direct: g.can_write_direct,
          execute: g.can_execute,
        },
        createdAt: iso(g.created_at)!,
      })),
  }));
}

export async function listAudit(
  sql: Sql,
  userId: string,
  opts: { connectorId?: string | null; status?: AuditStatus | null; limit?: number } = {},
): Promise<AuditEntry[]> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const rows = await sql<{
    seq: number;
    connector_id: string;
    connector_name: string | null;
    action: string;
    tool_name: string | null;
    target_branch_id: string | null;
    target_branch_name: string | null;
    status: AuditStatus;
    detail_json: Record<string, unknown> | string;
    created_at: string;
    row_hash: string;
  }>`
    select a.seq, a.connector_id, k.display_name as connector_name, a.action, a.tool_name,
           a.target_branch_id, c.name as target_branch_name, a.status, a.detail_json, a.created_at, a.row_hash
    from connector_audit_logs a
    left join connectors k on k.id = a.connector_id and k.user_id = a.user_id
    left join concepts c on c.id = a.target_branch_id and c.user_id = a.user_id
    where a.user_id = ${userId}
      and (${opts.connectorId ?? null}::text is null or a.connector_id = ${opts.connectorId ?? null})
      and (${opts.status ?? null}::text is null or a.status = ${opts.status ?? null})
    order by a.seq desc
    limit ${limit}
  `;
  return rows.map((r) => ({
    seq: Number(r.seq),
    connectorId: r.connector_id,
    connectorName: r.connector_name,
    action: r.action,
    toolName: r.tool_name,
    targetBranchId: r.target_branch_id,
    targetBranchName: r.target_branch_name,
    status: r.status,
    detail: typeof r.detail_json === "string" ? (JSON.parse(r.detail_json) as Record<string, unknown>) : r.detail_json,
    createdAt: iso(r.created_at)!,
    rowHash: r.row_hash,
  }));
}

/** Recompute this user's audit hash chain. `ok` is false if any row was altered or removed. */
export async function verifyAuditChain(sql: Sql, userId: string): Promise<{ ok: boolean; rows: number }> {
  const rows = await sql<{ ok: boolean; n: number }>`
    with chain as (
      select a.*, lag(a.row_hash) over (order by a.seq) as expected_prev
      from connector_audit_logs a where a.user_id = ${userId}
    )
    select coalesce(bool_and(
             prev_hash is not distinct from expected_prev
             and row_hash = encode(sha256(convert_to(
               coalesce(prev_hash, '') || '|' || id || '|' || user_id || '|' || connector_id || '|' ||
               action || '|' || coalesce(tool_name, '') || '|' || coalesce(target_branch_id, '') || '|' ||
               coalesce(target_path, '') || '|' || status || '|' || detail_json::text || '|' ||
               to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), 'UTF8')), 'hex')
           ), true) as ok,
           count(*)::int as n
    from chain
  `;
  return { ok: Boolean(rows[0]?.ok), rows: Number(rows[0]?.n ?? 0) };
}

/** What one scope would expose, before it is saved: branch and memory counts. */
export async function previewScope(
  sql: Sql,
  userId: string,
  scope: { scopeKind: ScopeKind; scopeRef: string | null },
): Promise<{ ok: true; branches: number; memories: number } | { ok: false; error: string }> {
  let path: string | null = null;
  if (scope.scopeKind === "root") path = "/";
  else if (scope.scopeKind === "sector") {
    if (!BRAIN_SECTORS.some((s) => s.id === scope.scopeRef)) return { ok: false, error: "Unknown main branch." };
    const rows = await sql<{ p: string }>`select '/' || brain_sector_key(${scope.scopeRef}) || '/' as p`;
    path = rows[0]?.p ?? null;
  } else {
    const rows = await sql<{ path: string }>`
      select path from concepts where id = ${scope.scopeRef} and user_id = ${userId}
    `;
    path = rows[0]?.path ?? null;
  }
  if (!path) return { ok: false, error: "That branch is gone." };
  const rows = await sql<{ branches: number; memories: number }>`
    with b as (
      select c.id from concepts c
      where c.user_id = ${userId}
        and c.path >= ${path}::text collate "C" and c.path < brain_path_end(${path}::text) collate "C"
    )
    select (select count(*)::int from b) as branches,
           (select count(*)::int from memories m
             where m.user_id = ${userId}
               and (m.owner_branch_id in (select id from b)
                    or (${scope.scopeKind} = 'root' and m.owner_branch_id is null))) as memories
  `;
  return { ok: true, branches: Number(rows[0]?.branches ?? 0), memories: Number(rows[0]?.memories ?? 0) };
}
