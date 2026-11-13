/**
 * Outbound app hub + browser bridge (v5.29).
 *
 * A connector with `execute` can only *propose* an action. Nothing runs until
 * the owner approves it on /connectors:
 *
 *   connector --propose_action--> pending_actions (pending)
 *   owner approves --> app action: run through the provider (Composio) now
 *                  --> browser action: queued for the MindMeld Bridge extension
 *
 * Proposals are checked against the grant at propose time AND again at approve
 * and claim time, so a revoke or a narrowed grant stops queued work.
 * Context memories must sit inside an `execute` grant that also allows the app
 * (or domain), checked in SQL on the materialized path.
 */
import type { Sql } from "../sql-template.ts";
import { runScoped, type ConnectorDeps, type ToolResult } from "./service.ts";
import { hostMatches, type ConnectorPrincipal } from "./types.ts";

export type AppInfo = {
  slug: string;
  name: string;
  logo: string | null;
  description: string | null;
  categories: string[];
};

export type AppConnection = { app: string; active: boolean; accountId: string | null; status: string | null };

export type ExecuteResult = { ok: boolean; data: unknown; error: string | null; logId: string | null };

/** What the hub needs from an integration platform. Composio is the first. */
export interface AppProvider {
  name: string;
  configured(): boolean;
  listApps(opts?: { limit?: number; cursor?: string }): Promise<AppInfo[]>;
  connectionState(userId: string, apps?: string[]): Promise<AppConnection[]>;
  connect(userId: string, app: string, callbackUrl?: string): Promise<{ requestId: string; redirectUrl: string | null }>;
  disconnect(userId: string, accountId: string): Promise<void>;
  execute(userId: string, app: string, action: string, args: Record<string, unknown>): Promise<ExecuteResult>;
}

export const BROWSER_ACTIONS = ["navigate", "read", "click", "type", "submit"] as const;
export type BrowserAction = (typeof BROWSER_ACTIONS)[number];

export type ProposeInput =
  | {
      kind: "app";
      app: string;
      action: string;
      arguments: Record<string, unknown>;
      contextMemoryIds?: string[];
      summary: string;
    }
  | {
      kind: "browser";
      url: string;
      browserAction: BrowserAction;
      selector?: string;
      text?: string;
      contextMemoryIds?: string[];
      summary: string;
    };

export type ActionStatus = "pending" | "approved" | "rejected" | "claimed" | "executed" | "failed" | "expired";

export type PendingAction = {
  id: string;
  connectorId: string;
  connectorName: string | null;
  kind: "app" | "browser";
  app: string | null;
  action: string | null;
  arguments: string;
  targetUrl: string | null;
  targetDomain: string | null;
  browserAction: string | null;
  contextMemoryIds: string[];
  summary: string;
  status: ActionStatus;
  result: string | null;
  error: string | null;
  createdAt: string;
  decidedAt: string | null;
};

type GrantRow = { id: string; allowed_apps: string[] | null; allowed_domains: string[] | null };

const newId = () => crypto.randomUUID();
const MAX_RESULT = 20_000;

/** Active execute grants of one connector. */
async function executeGrants(sql: Sql, userId: string, connectorId: string) {
  return sql<GrantRow>`
    select g.id, g.allowed_apps, g.allowed_domains
      from connector_grants g join connectors k on k.id = g.connector_id
     where g.user_id = ${userId} and g.connector_id = ${connectorId} and g.revoked_at is null
       and g.can_execute and k.status = 'active' and k.user_id = ${userId}
  `;
}

function grantsFor(grants: GrantRow[], kind: "app" | "browser", target: string) {
  return grants.filter((g) =>
    kind === "app"
      ? (g.allowed_apps ?? []).includes(target)
      : (g.allowed_domains ?? []).some((d) => hostMatches(target, d)),
  );
}

/** Apps and domains this connector may propose actions for. */
export async function listExecutableTargets(deps: ConnectorDeps, who: ConnectorPrincipal) {
  const grants = await executeGrants(deps.sql, who.userId, who.connectorId);
  return {
    apps: [...new Set(grants.flatMap((g) => g.allowed_apps ?? []))].sort(),
    domains: [...new Set(grants.flatMap((g) => g.allowed_domains ?? []))].sort(),
  };
}

function parseTarget(url: string): { host: string; href: string } | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    return { host: u.hostname.toLowerCase(), href: u.toString() };
  } catch {
    return null;
  }
}

export async function proposeAction(
  deps: ConnectorDeps,
  who: ConnectorPrincipal,
  input: ProposeInput,
): Promise<ToolResult<{ action_id: string; status: "pending" }>> {
  const summary = input.summary.trim().slice(0, 500);
  const memoryIds = [...new Set(input.contextMemoryIds ?? [])].slice(0, 50);
  let target: string;
  let href: string | null = null;
  if (input.kind === "app") {
    target = input.app.trim().toLowerCase();
    if (!/^[A-Z0-9_]{1,120}$/.test(input.action)) {
      return { ok: false, error: "invalid_arguments", message: "action must be a tool slug like GMAIL_SEND_EMAIL" };
    }
  } else {
    const parsed = parseTarget(input.url);
    if (!parsed) return { ok: false, error: "invalid_arguments", message: "url must be an https URL" };
    target = parsed.host;
    href = parsed.href;
  }
  if (!summary) return { ok: false, error: "invalid_arguments", message: "summary is required" };

  return runScoped(deps, who, "propose_action", async (s) => {
    const allowed = grantsFor(await executeGrants(s.tx, who.userId, who.connectorId), input.kind, target);
    if (!allowed.length) {
      s.audit({ action: "execute", status: "denied", detail: { kind: input.kind, target } });
      return { ok: false as const, error: "insufficient_scope" as const, required: "execute" as const };
    }
    if (memoryIds.length) {
      const rows = await s.tx.query<{ id: string }>(
        `select m.id
           from memories m
           join concepts c on c.id = m.owner_branch_id and c.user_id = $1
           join connector_scope_paths($1, $2, 'execute') s
             on c.path >= s.scope_path collate "C" and c.path < s.scope_end collate "C"
          where m.user_id = $1 and m.id = any($3::text[]) and s.grant_id = any($4::text[])`,
        [who.userId, who.connectorId, memoryIds, allowed.map((g) => g.id)],
      );
      const seen = new Set(rows.map((r) => r.id));
      const missing = memoryIds.filter((id) => !seen.has(id));
      if (missing.length) {
        await s.elevate();
        const exists = await s.tx`select 1 from memories where user_id = ${who.userId} and id = any(${missing}::text[])`;
        s.audit({
          action: "execute",
          status: exists.length ? "boundary_violation" : "denied",
          detail: { kind: input.kind, target, context_outside_scope: missing.length },
        });
        return { ok: false as const, error: "not_found" as const };
      }
    }
    await s.elevate();
    const id = newId();
    const grantId = allowed[0]!.id;
    if (input.kind === "app") {
      await s.tx`
        insert into pending_actions (id, user_id, connector_id, grant_id, kind, provider, app_slug, action_slug,
          arguments_json, context_memory_ids, summary)
        values (${id}, ${who.userId}, ${who.connectorId}, ${grantId}, 'app', 'composio', ${target}, ${input.action},
          ${JSON.stringify(input.arguments ?? {})}::jsonb, ${memoryIds}::text[], ${summary})
      `;
    } else {
      const args = { selector: input.selector?.slice(0, 500) ?? null, text: input.text?.slice(0, 5000) ?? null };
      await s.tx`
        insert into pending_actions (id, user_id, connector_id, grant_id, kind, arguments_json, context_memory_ids,
          target_domain, target_url, browser_action, summary)
        values (${id}, ${who.userId}, ${who.connectorId}, ${grantId}, 'browser', ${JSON.stringify(args)}::jsonb,
          ${memoryIds}::text[], ${target}, ${href}, ${input.browserAction}, ${summary})
      `;
    }
    s.audit({
      action: "propose",
      status: "pending_approval",
      grantId,
      detail: { action_id: id, kind: input.kind, target, tool: input.kind === "app" ? input.action : input.browserAction },
    });
    return { ok: true as const, data: { action_id: id, status: "pending" as const } };
  });
}

/** A connector may read the status/result of its own proposals only. */
export async function getActionStatus(deps: ConnectorDeps, who: ConnectorPrincipal, actionId: string) {
  const rows = await deps.sql<{ status: ActionStatus; result_json: unknown; error: string | null }>`
    select status, result_json, error from pending_actions
     where id = ${actionId} and user_id = ${who.userId} and connector_id = ${who.connectorId}
  `;
  const row = rows[0];
  if (!row) return { ok: false as const, error: "not_found" as const };
  return { ok: true as const, data: { status: row.status, result: row.result_json ?? null, error: row.error } };
}

async function hubAudit(
  sql: Sql,
  userId: string,
  connectorId: string,
  action: "approve" | "reject" | "execute" | "claim" | "app_connect" | "app_disconnect",
  status: "allowed" | "denied" | "error",
  detail: Record<string, unknown>,
  grantId: string | null = null,
) {
  await sql`
    insert into connector_audit_logs (id, user_id, connector_id, grant_id, action, status, detail_json)
    values (${newId()}, ${userId}, ${connectorId}, ${grantId}, ${action}, ${status}, ${JSON.stringify(detail)}::jsonb)
  `;
}

type ActionRow = {
  id: string;
  connector_id: string;
  connector_name: string | null;
  grant_id: string | null;
  kind: "app" | "browser";
  app_slug: string | null;
  action_slug: string | null;
  arguments_json: unknown;
  target_url: string | null;
  target_domain: string | null;
  browser_action: string | null;
  context_memory_ids: string[] | null;
  summary: string;
  status: ActionStatus;
  result_json: unknown;
  error: string | null;
  created_at: string;
  decided_at: string | null;
};

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const json = (v: unknown) => (v == null ? null : typeof v === "string" ? v : JSON.stringify(v));

function toPending(r: ActionRow): PendingAction {
  return {
    id: r.id,
    connectorId: r.connector_id,
    connectorName: r.connector_name,
    kind: r.kind,
    app: r.app_slug,
    action: r.action_slug ?? r.browser_action,
    arguments: json(r.arguments_json) ?? "{}",
    targetUrl: r.target_url,
    targetDomain: r.target_domain,
    browserAction: r.browser_action,
    contextMemoryIds: r.context_memory_ids ?? [],
    summary: r.summary,
    status: r.status,
    result: json(r.result_json),
    error: r.error,
    createdAt: iso(r.created_at)!,
    decidedAt: iso(r.decided_at),
  };
}

export async function listActions(sql: Sql, userId: string, limit = 50): Promise<PendingAction[]> {
  const rows = await sql<ActionRow>`
    select a.*, k.display_name as connector_name
      from pending_actions a left join connectors k on k.id = a.connector_id
     where a.user_id = ${userId}
     order by (a.status = 'pending') desc, a.created_at desc
     limit ${Math.min(Math.max(limit, 1), 200)}
  `;
  return rows.map(toPending);
}

/** Is the action still allowed by a live grant of a live connector? */
async function stillAllowed(sql: Sql, userId: string, a: ActionRow) {
  const grants = await executeGrants(sql, userId, a.connector_id);
  return grantsFor(grants, a.kind, a.kind === "app" ? a.app_slug! : a.target_domain!).length > 0;
}

/**
 * Owner decision. Approving an app action runs it through the provider now;
 * approving a browser action queues it for the extension.
 */
export async function decideAction(
  sql: Sql,
  provider: AppProvider | null,
  userId: string,
  actionId: string,
  approve: boolean,
): Promise<{ ok: true; action: PendingAction } | { ok: false; error: string }> {
  const claimed = await sql<ActionRow>`
    update pending_actions set status = ${approve ? "approved" : "rejected"}, decided_at = now()
     where id = ${actionId} and user_id = ${userId} and status = 'pending'
    returning *, null::text as connector_name
  `;
  const a = claimed[0];
  if (!a) return { ok: false, error: "That action is no longer waiting for approval." };
  const detail = { action_id: a.id, kind: a.kind, target: a.app_slug ?? a.target_domain };
  if (!approve) {
    await hubAudit(sql, userId, a.connector_id, "reject", "allowed", detail, a.grant_id);
    return { ok: true, action: toPending({ ...a, status: "rejected" }) };
  }
  if (!(await stillAllowed(sql, userId, a))) {
    await sql`update pending_actions set status = 'failed', error = 'grant_revoked' where id = ${a.id}`;
    await hubAudit(sql, userId, a.connector_id, "execute", "denied", { ...detail, reason: "grant_revoked" }, a.grant_id);
    return { ok: false, error: "The connector no longer has permission for this action." };
  }
  await hubAudit(sql, userId, a.connector_id, "approve", "allowed", detail, a.grant_id);
  if (a.kind === "browser") return { ok: true, action: toPending({ ...a, status: "approved" }) };

  if (!provider?.configured()) {
    await sql`update pending_actions set status = 'failed', error = 'provider_not_configured' where id = ${a.id}`;
    return { ok: false, error: "Composio isn't configured on this server." };
  }
  const args = (typeof a.arguments_json === "string" ? JSON.parse(a.arguments_json) : a.arguments_json) as Record<string, unknown>;
  let out: ExecuteResult;
  try {
    out = await provider.execute(userId, a.app_slug!, a.action_slug!, args ?? {});
  } catch (err) {
    out = { ok: false, data: null, error: err instanceof Error ? err.message.slice(0, 300) : "error", logId: null };
  }
  const result = JSON.stringify(out.data ?? null);
  const stored = result.length > MAX_RESULT ? JSON.stringify({ truncated: true, preview: result.slice(0, MAX_RESULT) }) : result;
  const rows = await sql<ActionRow>`
    update pending_actions
       set status = ${out.ok ? "executed" : "failed"}, result_json = ${stored}::jsonb, error = ${out.error},
           executed_at = now()
     where id = ${a.id}
    returning *, null::text as connector_name
  `;
  await hubAudit(sql, userId, a.connector_id, "execute", out.ok ? "allowed" : "error",
    { ...detail, tool: a.action_slug, log_id: out.logId }, a.grant_id);
  return { ok: true, action: toPending(rows[0]!) };
}

/** Browser bridge: hand approved browser actions of this connector to the extension. */
export async function claimBrowserActions(deps: ConnectorDeps, who: ConnectorPrincipal) {
  const rows = await deps.sql<ActionRow>`
    select *, null::text as connector_name from pending_actions
     where user_id = ${who.userId} and connector_id = ${who.connectorId} and kind = 'browser' and status = 'approved'
     order by decided_at limit 10
  `;
  const out: { id: string; url: string; domain: string; action: string; selector: string | null; text: string | null; summary: string }[] = [];
  for (const a of rows) {
    if (!(await stillAllowed(deps.sql, who.userId, a))) {
      await deps.sql`update pending_actions set status = 'failed', error = 'grant_revoked' where id = ${a.id} and status = 'approved'`;
      await hubAudit(deps.sql, who.userId, who.connectorId, "claim", "denied", { action_id: a.id, reason: "grant_revoked" }, a.grant_id);
      continue;
    }
    const got = await deps.sql`update pending_actions set status = 'claimed' where id = ${a.id} and status = 'approved' returning id`;
    if (!got.length) continue;
    await hubAudit(deps.sql, who.userId, who.connectorId, "claim", "allowed", { action_id: a.id, domain: a.target_domain }, a.grant_id);
    const args = (typeof a.arguments_json === "string" ? JSON.parse(a.arguments_json) : a.arguments_json) as {
      selector?: string | null;
      text?: string | null;
    };
    out.push({
      id: a.id,
      url: a.target_url!,
      domain: a.target_domain!,
      action: a.browser_action!,
      selector: args?.selector ?? null,
      text: args?.text ?? null,
      summary: a.summary,
    });
  }
  return out;
}

/** Browser bridge: report the outcome of a claimed action. */
export async function completeBrowserAction(
  deps: ConnectorDeps,
  who: ConnectorPrincipal,
  input: { id: string; ok: boolean; result?: unknown; error?: string },
) {
  const result = JSON.stringify(input.result ?? null).slice(0, MAX_RESULT);
  const rows = await deps.sql<{ grant_id: string | null }>`
    update pending_actions
       set status = ${input.ok ? "executed" : "failed"}, executed_at = now(),
           result_json = ${input.ok ? result : null}::jsonb, error = ${input.ok ? null : (input.error ?? "failed").slice(0, 300)}
     where id = ${input.id} and user_id = ${who.userId} and connector_id = ${who.connectorId} and status = 'claimed'
    returning grant_id
  `;
  if (!rows[0]) return false;
  await hubAudit(deps.sql, who.userId, who.connectorId, "execute", input.ok ? "allowed" : "error",
    { action_id: input.id, kind: "browser" }, rows[0].grant_id);
  return true;
}
