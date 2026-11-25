/**
 * The "Connect your apps" shortlist on /connectors: well-known Composio toolkits shown as big cards
 * above the full catalog. Slugs were checked against the live Composio toolkit API (note OneDrive is
 * `one_drive`). Pure, so the merge of catalog + connection state is node-testable.
 */
import type { AppConnection, AppInfo } from "./connectors/outbound.ts";

export type FeaturedDef = { slug: string; name: string; blurb: string };

export const FEATURED_APPS: readonly FeaturedDef[] = [
  { slug: "googledrive", name: "Google Drive", blurb: "Files and folders" },
  { slug: "one_drive", name: "Microsoft OneDrive", blurb: "Files and folders" },
  { slug: "gmail", name: "Gmail", blurb: "Email" },
  { slug: "outlook", name: "Outlook", blurb: "Microsoft 365 mail and calendar" },
  { slug: "googlecalendar", name: "Google Calendar", blurb: "Events and invites" },
  { slug: "notion", name: "Notion", blurb: "Pages and databases" },
  { slug: "slack", name: "Slack", blurb: "Channels and messages" },
];

export const FEATURED_SLUGS: readonly string[] = FEATURED_APPS.map((f) => f.slug);

/**
 * connected: active account (Disconnect available). pending: Composio has the request but the user
 * hasn't finished sign-in, or they just opened the Connect Link here. attention: expired or failed,
 * Connect again. available: can connect. unavailable: the catalog didn't return this toolkit.
 */
export type FeaturedState = "connected" | "pending" | "attention" | "available" | "unavailable";

export type FeaturedApp = FeaturedDef & { logo: string | null; state: FeaturedState; accountId: string | null };

const PENDING = new Set(["INITIATED", "INITIALIZING", "PENDING"]);
const ATTENTION = new Set(["EXPIRED", "FAILED", "INACTIVE"]);

export function connectionFor(connections: readonly AppConnection[], slug: string): AppConnection | null {
  const mine = connections.filter((c) => c.app === slug);
  return mine.find((c) => c.active && c.accountId) ?? mine[0] ?? null;
}

export function appState(app: AppInfo | undefined, conn: AppConnection | null, opening = false): FeaturedState {
  if (conn?.active && conn.accountId) return "connected";
  if (!app) return "unavailable";
  const status = (conn?.status ?? "").toUpperCase();
  if (opening || PENDING.has(status)) return "pending";
  if (ATTENTION.has(status)) return "attention";
  return "available";
}

/** Featured cards in shortlist order, merged with whatever the catalog and connection state returned. */
export function mergeFeatured(
  apps: readonly AppInfo[],
  connections: readonly AppConnection[],
  opening: ReadonlySet<string> = new Set(),
): FeaturedApp[] {
  const bySlug = new Map(apps.map((a) => [a.slug, a]));
  return FEATURED_APPS.map((def) => {
    const app = bySlug.get(def.slug);
    const conn = connectionFor(connections, def.slug);
    const state = appState(app, conn, opening.has(def.slug));
    return { ...def, logo: app?.logo ?? null, state, accountId: state === "connected" ? conn!.accountId : null };
  });
}

/** The full catalog minus the featured toolkits (they already have cards), filtered by name or slug. */
export function otherApps(apps: readonly AppInfo[], filter = ""): AppInfo[] {
  const featured = new Set(FEATURED_SLUGS);
  const q = filter.trim().toLowerCase();
  return apps.filter((a) => !featured.has(a.slug) && (!q || a.name.toLowerCase().includes(q) || a.slug.includes(q)));
}

/** "Google Drive" → "GD", "Slack" → "S"; logo fallback. */
export function appInitials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return words.length === 1 ? words[0]![0]!.toUpperCase() : (words[0]![0]! + words[1]![0]!).toUpperCase();
}
