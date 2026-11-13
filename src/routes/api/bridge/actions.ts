import { createFileRoute } from "@tanstack/react-router";

/**
 * MindMeld Bridge extension endpoint. `Authorization: Bearer mm_…` of a
 * connector whose grant has `execute` + allowed domains.
 *   GET  -> claim approved browser actions for this connector
 *   POST -> { id, ok, result?, error? } report the outcome of a claimed action
 * Only actions the owner approved on /connectors are ever returned.
 */
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

async function handle(request: Request) {
  try {
    const [{ getSql, withTransaction }, service, outbound] = await Promise.all([
      import("@/lib/db"),
      import("@/lib/connectors/service"),
      import("@/lib/connectors/outbound"),
    ]);
    const sql = await getSql();
    const who = await service.authenticateConnector(sql, request.headers.get("authorization"));
    if (!who) return json(401, { error: "unauthorized" });
    const deps = { sql, transaction: withTransaction };
    if (request.method === "GET") return json(200, { actions: await outbound.claimBrowserActions(deps, who) });
    const body = (await request.json().catch(() => null)) as { id?: unknown; ok?: unknown; result?: unknown; error?: unknown } | null;
    if (!body || typeof body.id !== "string") return json(400, { error: "invalid_arguments" });
    const done = await outbound.completeBrowserAction(deps, who, {
      id: body.id,
      ok: body.ok === true,
      result: body.result,
      error: typeof body.error === "string" ? body.error : undefined,
    });
    return done ? json(200, { ok: true }) : json(404, { error: "not_found" });
  } catch (err) {
    console.error("bridge endpoint failed", err instanceof Error ? err.message : err);
    return json(500, { error: "server_error" });
  }
}

export const Route = createFileRoute("/api/bridge/actions")({
  server: { handlers: { GET: ({ request }) => handle(request), POST: ({ request }) => handle(request) } },
});
