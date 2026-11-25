/**
 * Composio provider for the outbound app hub (server only).
 *
 * One Composio "user" per MindMeld user: the Composio user id is the MindMeld
 * user id, so connections never cross accounts. Uses the session API from
 * @composio/core with Composio-managed auth; Composio returns a Connect Link,
 * MindMeld never handles provider OAuth. COMPOSIO_API_KEY comes from the
 * environment only and is never logged or returned.
 */
import type { AppProvider } from "./outbound.ts";

type ComposioModule = typeof import("@composio/core");

let client: InstanceType<ComposioModule["Composio"]> | null = null;

export function composioConfigured() {
  return Boolean(process.env.COMPOSIO_API_KEY);
}

async function getClient() {
  if (!composioConfigured()) throw new Error("composio_not_configured");
  if (!client) {
    const { Composio } = await import("@composio/core");
    client = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
  }
  return client;
}

type RawToolkit = {
  slug: string;
  name: string;
  meta?: { logo?: string; description?: string; categories?: { name?: string }[] };
  noAuth?: boolean;
};

const sessionFor = async (userId: string, app?: string) =>
  (await getClient()).create(userId, app ? { toolkits: [app] } : undefined);

export const composioProvider: AppProvider = {
  name: "composio",
  configured: composioConfigured,

  async listApps({ limit = 50, cursor, include = [] } = {}) {
    const c = await getClient();
    const res = (await c.toolkits.get({ limit, cursor, sortBy: "usage" })) as unknown;
    const raw = (Array.isArray(res) ? res : ((res as { items?: unknown[] }).items ?? [])) as RawToolkit[];
    const seen = new Set(raw.map((t) => t.slug));
    // Featured toolkits outside the usage-sorted page are fetched one by one; an unknown slug is skipped.
    const missing = include.filter((s) => !seen.has(s));
    const extra = await Promise.allSettled(missing.map((s) => c.toolkits.get(s) as Promise<unknown>));
    for (const r of extra) if (r.status === "fulfilled" && r.value && typeof (r.value as RawToolkit).slug === "string") raw.push(r.value as RawToolkit);
    return raw.map((t) => ({
      slug: t.slug,
      name: t.name,
      logo: t.meta?.logo ?? null,
      description: t.meta?.description ?? null,
      categories: (t.meta?.categories ?? []).map((c) => c.name ?? "").filter(Boolean),
    }));
  },

  async connectionState(userId, apps) {
    const session = await sessionFor(userId);
    const res = await session.toolkits({ toolkits: apps });
    return res.items.map((i) => ({
      app: i.slug,
      active: Boolean(i.connection?.isActive),
      accountId: i.connection?.connectedAccount?.id ?? null,
      status: i.connection?.connectedAccount?.status ?? null,
    }));
  },

  async connect(userId, app, callbackUrl) {
    const session = await sessionFor(userId, app);
    const req = await session.authorize(app, callbackUrl ? { callbackUrl } : undefined);
    return { requestId: req.id, redirectUrl: req.redirectUrl ?? null };
  },

  async disconnect(_userId, accountId) {
    await (await getClient()).connectedAccounts.delete(accountId);
  },

  async execute(userId, app, action, args) {
    const session = await sessionFor(userId, app);
    const res = await session.execute(action, args);
    const ok = res.resultType === "completed";
    return { ok, data: res.data ?? null, error: ok ? null : (res.error ?? res.resultType), logId: res.logId ?? null };
  },
};
