import { createFileRoute } from "@tanstack/react-router";

/**
 * Remote MCP endpoint for connectors: https://<app host>/mcp
 * POST only, `Authorization: Bearer mm_…` only (session cookies are ignored).
 * Tokens and scopes are managed by the owner on /connectors.
 */
let endpoint: Promise<(request: Request) => Promise<Response>> | null = null;

function getEndpoint() {
  endpoint ??= (async () => {
    const [{ getSql, withTransaction }, { createConnectorMcpEndpoint, parseAllowedOrigins }] = await Promise.all([
      import("@/lib/db"),
      import("@/lib/connectors/mcp-server"),
    ]);
    const sql = await getSql();
    return createConnectorMcpEndpoint(
      { sql, transaction: withTransaction },
      { allowedOrigins: parseAllowedOrigins(process.env.MCP_ALLOWED_ORIGINS) },
    );
  })().catch((err) => {
    endpoint = null;
    throw err;
  });
  return endpoint;
}

async function handle(request: Request) {
  try {
    return await (await getEndpoint())(request);
  } catch (err) {
    console.error("mcp endpoint failed", err);
    return new Response(JSON.stringify({ error: "server_error" }), {
      status: 500,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
}

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
      GET: ({ request }) => handle(request),
      DELETE: ({ request }) => handle(request),
    },
  },
});
