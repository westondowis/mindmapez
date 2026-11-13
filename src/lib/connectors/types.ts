/**
 * Connector security model. A connector (one MCP client, one bearer token) holds
 * grants; each grant names one scope root (Full Brain, a sector, or a branch) and
 * five permission flags. Everything below the root is in scope, nothing above or
 * beside it. Shared by the server, the MCP route and the owner's settings UI.
 */
export const PERMISSIONS = ["read", "search", "write_review", "write_direct", "execute"] as const;
export type Permission = (typeof PERMISSIONS)[number];

export type ScopeKind = "root" | "sector" | "branch";

export type PermissionFlags = Record<Permission, boolean>;

export type GrantInput = {
  scopeKind: ScopeKind;
  /** Sector id for `sector`, branch id for `branch`, ignored for `root`. */
  scopeRef: string | null;
  permissions: PermissionFlags;
};

/** The authenticated caller on the MCP endpoint. Never derived from cookies. */
export type ConnectorPrincipal = {
  connectorId: string;
  userId: string;
  displayName: string;
  policyVersion: number;
};

export type AuditAction =
  | Permission
  | "auth"
  | "revoke"
  | "grant_change"
  | "create";

export type AuditStatus = "allowed" | "denied" | "boundary_violation" | "error" | "pending_approval";

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && (PERMISSIONS as readonly string[]).includes(value);
}

/** Search and execute only make sense on top of read; the database enforces the same rule. */
export function normalizeFlags(flags: Partial<PermissionFlags>): PermissionFlags {
  const read = Boolean(flags.read || flags.search || flags.execute);
  return {
    read,
    search: Boolean(flags.search),
    write_review: Boolean(flags.write_review),
    write_direct: Boolean(flags.write_direct),
    execute: Boolean(flags.execute),
  };
}

export const PERMISSION_LABELS: Record<Permission, { label: string; hint: string }> = {
  read: { label: "Read", hint: "See the branches and memories in scope" },
  search: { label: "Search", hint: "Keyword search inside the scope" },
  write_review: { label: "Suggest", hint: "Add memories or sub-branches to your review queue" },
  write_direct: { label: "Write", hint: "Add memories or sub-branches without review" },
  execute: { label: "Act", hint: "Use scoped memories as context for actions it runs" },
};
