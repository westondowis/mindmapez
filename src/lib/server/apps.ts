import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";

/**
 * Owner-side app hub: Composio catalog, connect links, and the approval queue
 * for actions proposed by connectors. Session-authenticated only.
 */
const hub = async () => {
  const [{ composioProvider }, outbound] = await Promise.all([
    import("@/lib/connectors/composio"),
    import("@/lib/connectors/outbound"),
  ]);
  return { provider: composioProvider, outbound };
};

const slug = (v: unknown) => {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (!/^[a-z0-9_]{1,64}$/.test(s)) throw new Error("Invalid app.");
  return s;
};

export const listApps = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { provider } = await hub();
    if (!provider.configured()) return { configured: false as const, apps: [], connections: [] };
    try {
      const apps = await provider.listApps({ limit: 60 });
      const connections = await provider.connectionState(context.userId, apps.map((a) => a.slug));
      return { configured: true as const, apps, connections };
    } catch (err) {
      console.error("composio listApps failed", err instanceof Error ? err.message : err);
      return { configured: true as const, apps: [], connections: [], error: "Couldn't reach Composio." };
    }
  });

export const connectApp = createServerFn({ method: "POST" })
  .validator((input: { app: string; callbackUrl?: string }) => ({
    app: slug(input?.app),
    callbackUrl: typeof input?.callbackUrl === "string" && /^https?:\/\//.test(input.callbackUrl) ? input.callbackUrl : undefined,
  }))
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { provider } = await hub();
    if (!provider.configured()) return { ok: false as const, error: "Composio isn't configured." };
    const res = await provider.connect(context.userId, data.app, data.callbackUrl);
    return { ok: true as const, redirectUrl: res.redirectUrl };
  });

export const disconnectApp = createServerFn({ method: "POST" })
  .validator((input: { accountId: string }) => ({ accountId: String(input?.accountId ?? "").slice(0, 100) }))
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { provider } = await hub();
    const owned = await provider.connectionState(context.userId);
    if (!owned.some((c) => c.accountId === data.accountId)) return { ok: false as const, error: "Not your connection." };
    await provider.disconnect(context.userId, data.accountId);
    return { ok: true as const };
  });

export const listPendingActions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { outbound } = await hub();
    return outbound.listActions(await getSql(), context.userId);
  });

export const decidePendingAction = createServerFn({ method: "POST" })
  .validator((input: { id: string; approve: boolean }) => ({ id: String(input?.id ?? ""), approve: input?.approve === true }))
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { provider, outbound } = await hub();
    const res = await outbound.decideAction(await getSql(), provider, context.userId, data.id, data.approve);
    return res.ok ? { ok: true as const, status: res.action.status, error: res.action.error } : res;
  });
