import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { mergeSectors, normalizeSectorId, parseSectorOverrides } from "@/lib/brain";
import {
  createConnector as createConnectorCore,
  listAudit as listAuditCore,
  listConnectors as listConnectorsCore,
  previewScope as previewScopeCore,
  revokeConnector as revokeConnectorCore,
  saveGrants as saveGrantsCore,
  verifyAuditChain,
} from "@/lib/connectors/admin";
import { cleanDomains, cleanSlugs } from "@/lib/connectors/types";
import type { AuditStatus, GrantInput, PermissionFlags, ScopeKind } from "@/lib/connectors/types";
import { getSql, withTransaction } from "@/lib/db";

export type ConnectorTreeNode = {
  id: string;
  name: string;
  emoji: string | null;
  parentId: string | null;
  /** Normalized lobe id, or null when the branch only shows under Full brain. */
  sectorId: string | null;
};

const SCOPE_KINDS: ScopeKind[] = ["root", "sector", "branch"];
const AUDIT_STATUSES: AuditStatus[] = ["allowed", "denied", "boundary_violation", "error", "pending_approval"];

function cleanGrants(input: unknown): GrantInput[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 32).map((g) => {
    const row = (g ?? {}) as {
      scopeKind?: unknown;
      scopeRef?: unknown;
      permissions?: Partial<PermissionFlags>;
      allowedApps?: unknown;
      allowedDomains?: unknown;
    };
    const scopeKind = SCOPE_KINDS.includes(row.scopeKind as ScopeKind) ? (row.scopeKind as ScopeKind) : "branch";
    const p = row.permissions ?? {};
    return {
      scopeKind,
      scopeRef: scopeKind === "root" ? null : typeof row.scopeRef === "string" ? row.scopeRef : null,
      permissions: {
        read: p.read === true,
        search: p.search === true,
        write_review: p.write_review === true,
        write_direct: p.write_direct === true,
        execute: p.execute === true,
      },
      allowedApps: cleanSlugs(row.allowedApps),
      allowedDomains: cleanDomains(row.allowedDomains),
    };
  });
}

/** Connectors, their live grants, and the branch tree the scope picker needs. */
export const listConnectors = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const [connectors, concepts, settings] = await Promise.all([
      listConnectorsCore(sql, context.userId),
      sql<{ id: string; name: string; emoji: string | null; parent_id: string | null; sector_id: string | null }>`
        select id, name, emoji, parent_id, sector_id from concepts where user_id = ${context.userId} order by name
      `,
      sql<{ brain_sectors_json: string | null }>`
        select brain_sectors_json from user_settings where user_id = ${context.userId}
      `,
    ]);
    const sectors = mergeSectors(parseSectorOverrides(settings[0]?.brain_sectors_json ?? null)).map((s) => ({
      id: s.id,
      label: s.label,
      emoji: s.emoji,
    }));
    const tree: ConnectorTreeNode[] = concepts.map((c) => ({
      id: c.id,
      name: c.name,
      emoji: c.emoji,
      parentId: c.parent_id,
      sectorId: normalizeSectorId(c.sector_id),
    }));
    return { connectors, sectors, tree };
  });

export const createConnector = createServerFn({ method: "POST" })
  .validator((input: { displayName: string; grants: GrantInput[] }) => ({
    displayName: String(input?.displayName ?? ""),
    grants: cleanGrants(input?.grants),
  }))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    if (!data.grants.length) return { ok: false as const, error: "Add at least one scope." };
    return createConnectorCore(withTransaction, context.userId, data);
  });

export const saveConnectorGrants = createServerFn({ method: "POST" })
  .validator((input: { connectorId: string; grants: GrantInput[] }) => ({
    connectorId: String(input?.connectorId ?? ""),
    grants: cleanGrants(input?.grants),
  }))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    if (!data.grants.length) return { ok: false as const, error: "Add at least one scope, or revoke the connector." };
    return saveGrantsCore(withTransaction, context.userId, data.connectorId, data.grants);
  });

export const revokeConnector = createServerFn({ method: "POST" })
  .validator((input: { connectorId: string }) => ({ connectorId: String(input?.connectorId ?? "") }))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => revokeConnectorCore(withTransaction, context.userId, data.connectorId));

export const listConnectorAudit = createServerFn({ method: "GET" })
  .validator((input: { connectorId?: string | null; status?: AuditStatus | null } | undefined) => ({
    connectorId: typeof input?.connectorId === "string" && input.connectorId ? input.connectorId : null,
    status: AUDIT_STATUSES.includes(input?.status as AuditStatus) ? (input!.status as AuditStatus) : null,
  }))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const [entries, chain] = await Promise.all([
      listAuditCore(sql, context.userId, { ...data, limit: 200 }),
      verifyAuditChain(sql, context.userId),
    ]);
    return { entries, chain };
  });

export const previewConnectorScope = createServerFn({ method: "POST" })
  .validator((input: { scopeKind: ScopeKind; scopeRef: string | null }) => ({
    scopeKind: SCOPE_KINDS.includes(input?.scopeKind) ? input.scopeKind : ("branch" as ScopeKind),
    scopeRef: typeof input?.scopeRef === "string" ? input.scopeRef : null,
  }))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => previewScopeCore(await getSql(), context.userId, data));
