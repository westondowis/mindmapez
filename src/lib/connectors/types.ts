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
  /** Composio toolkit slugs `execute` may reach through this grant (e.g. "gmail"). */
  allowedApps?: string[];
  /** Hostnames the browser bridge may act on through this grant (e.g. "facebook.com"). */
  allowedDomains?: string[];
};

/** Lowercase slugs, `[a-z0-9_]`, deduped, at most 64. */
export function cleanSlugs(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out = new Set<string>();
  for (const v of input) {
    const slug = typeof v === "string" ? v.trim().toLowerCase() : "";
    if (/^[a-z0-9_]{1,64}$/.test(slug)) out.add(slug);
  }
  return [...out].slice(0, 64);
}

/** Bare lowercase hostnames (no scheme, path or port), deduped, at most 64. */
export function cleanDomains(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out = new Set<string>();
  for (const v of input) {
    let host = typeof v === "string" ? v.trim().toLowerCase() : "";
    host = host.replace(/^[a-z]+:\/\//, "").replace(/[/:?#].*$/, "").replace(/^www\./, "");
    if (/^(?=.{1,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/.test(host)) out.add(host);
  }
  return [...out].slice(0, 64);
}

/** True when `host` is `domain` or a subdomain of it. */
export function hostMatches(host: string, domain: string) {
  const h = host.toLowerCase().replace(/^www\./, "");
  return h === domain || h.endsWith(`.${domain}`);
}

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
  | "create"
  | "propose"
  | "approve"
  | "reject"
  | "claim"
  | "app_connect"
  | "app_disconnect";

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
