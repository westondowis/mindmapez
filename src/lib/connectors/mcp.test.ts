import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { Client as LegacyClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport as LegacyTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createConnector, listAudit, revokeConnector } from "./admin.ts";
import { createConnectorMcpEndpoint } from "./mcp-server.ts";
import { openTestDb, seedValidationBrain, type TestDb } from "./test-harness.ts";
import type { PermissionFlags } from "./types.ts";

const flags = (...on: (keyof PermissionFlags)[]): PermissionFlags => ({
  read: on.includes("read"),
  search: on.includes("search"),
  write_review: on.includes("write_review"),
  write_direct: on.includes("write_direct"),
  execute: on.includes("execute"),
});

type Seen = { method: string; status: number; rpc: string[]; protocol: string | null };

let db: TestDb;
let server: Server;
let url: URL;
const seen: Seen[] = [];
const user = "user-weston";
let seed: Awaited<ReturnType<typeof seedValidationBrain>>;
let gmailToken = "";
let facebookToken = "";
let gmailId = "";

/** Serve the real endpoint over node:http so the SDK clients talk to it exactly as over the network. */
async function startServer(handler: (r: Request) => Promise<Response>) {
  const srv = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
    const request = new Request(new URL(req.url ?? "/", url), {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
    });
    let rpc: string[] = [];
    try {
      const parsed = JSON.parse(body.toString() || "null") as { method?: string } | { method?: string }[] | null;
      rpc = (Array.isArray(parsed) ? parsed : parsed ? [parsed] : []).map((m) => m.method ?? "(response)");
    } catch {
      rpc = [];
    }
    const response = await handler(request);
    seen.push({ method: req.method ?? "", status: response.status, rpc, protocol: req.headers["mcp-protocol-version"] as string ?? null });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
  return srv;
}

before(async () => {
  db = await openTestDb();
  await db.migrate();
  await db.sql`insert into user_settings (user_id) values (${user})`;
  seed = await seedValidationBrain(db.sql, user);
  const gmail = await createConnector(db.transaction, user, {
    displayName: "Gmail",
    grants: [{ scopeKind: "branch", scopeRef: seed.b.realEstate, permissions: flags("read", "search", "write_review", "execute") }],
  });
  const facebook = await createConnector(db.transaction, user, {
    displayName: "Facebook Browser Agent",
    grants: [{ scopeKind: "sector", scopeRef: "frontal", permissions: flags("read") }],
  });
  assert.ok(gmail.ok && facebook.ok);
  if (!gmail.ok || !facebook.ok) return;
  gmailToken = gmail.token;
  gmailId = gmail.connectorId;
  facebookToken = facebook.token;
  const endpoint = createConnectorMcpEndpoint(
    { sql: db.sql, transaction: db.transaction },
    { allowedOrigins: ["https://claude.ai"] },
  );
  url = new URL("http://127.0.0.1/mcp");
  server = await startServer(endpoint);
  url = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`);
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.pg.close();
});

function text(result: unknown) {
  const r = result as { content: { type: string; text: string }[]; isError?: boolean };
  return { text: r.content.map((c) => c.text).join(""), isError: Boolean(r.isError) };
}

const authed = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

describe("MCP endpoint with the official SDK clients", () => {
  test("@modelcontextprotocol/client 2.4 (default initialize handshake): connect, scoped tools/list, calls in and out of scope", async (t) => {
    const client = new Client({ name: "mindmeld-test-modern", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(url, { requestInit: authed(gmailToken) }));
    const info = client.getServerVersion();
    assert.equal(info?.name, "mindmeld-brain");

    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((x) => x.name).sort(), ["ingest_memory", "list_authorized_tree", "read_branch", "search_brain"]);
    const schema = tools.tools.find((x) => x.name === "read_branch")!.inputSchema as { required?: string[]; additionalProperties?: boolean };
    assert.deepEqual(schema.required, ["branch_id"]);
    assert.equal(schema.additionalProperties, false);

    const tree = text(await client.callTool({ name: "list_authorized_tree", arguments: {} }));
    assert.equal(tree.isError, false);
    const parsed = JSON.parse(tree.text) as { branches: { name: string; parent_id: string | null }[] };
    assert.deepEqual(parsed.branches.map((b) => [b.name, b.parent_id === null]), [["Real-Estate", true], ["Wholesaling", false]]);

    const inScope = text(await client.callTool({ name: "read_branch", arguments: { branch_id: seed.b.wholesaling } }));
    assert.equal(inScope.isError, false);
    assert.deepEqual((JSON.parse(inScope.text) as { memories: { title: string }[] }).memories.map((m) => m.title), ["Assignment fee script"]);

    const outs = [];
    for (const id of [seed.b.workLife, seed.b.saas, seed.b.family, "00000000-0000-4000-8000-000000000000"]) {
      outs.push(await client.callTool({ name: "read_branch", arguments: { branch_id: id } }));
    }
    for (const o of outs) assert.deepEqual(o, outs[0], "out-of-scope and missing ids answer byte-identically");
    assert.deepEqual(text(outs[0]), { text: '{"error":"not_found"}', isError: true });

    const search = text(await client.callTool({ name: "search_brain", arguments: { query: "script" } }));
    assert.deepEqual((JSON.parse(search.text) as { memories: { title: string }[] }).memories.map((m) => m.title), ["Assignment fee script"]);

    const queued = text(
      await client.callTool({
        name: "ingest_memory",
        arguments: { target_branch_id: seed.b.wholesaling, kind: "memory", title: "Seller reply", body: "Counter at 182k" },
      }),
    );
    assert.equal(queued.isError, false);
    assert.equal((JSON.parse(queued.text) as { status: string }).status, "pending_review");
    const sideways = text(
      await client.callTool({ name: "ingest_memory", arguments: { target_branch_id: seed.b.saas, kind: "memory", title: "x" } }),
    );
    assert.deepEqual(sideways, { text: '{"error":"not_found"}', isError: true });

    // Extra arguments are rejected by the strict schema.
    const bad = await client.callTool({ name: "read_branch", arguments: { branch_id: seed.b.realEstate, path: "/" } }).catch((e: Error) => e);
    assert.ok(bad instanceof Error || text(bad).isError, "unknown argument must not be accepted");

    await client.close();
    t.diagnostic(`modern exchanges: ${JSON.stringify(seen.filter((s) => s.rpc.length).map((s) => [s.rpc.join(","), s.status, s.protocol]))}`);
  });

  test("2026-07-28 era (client pinned to the stateless modern revision): tools/list and calls", async (t) => {
    const before = seen.length;
    const client = new Client(
      { name: "mindmeld-test-pinned", version: "1.0.0" },
      { versionNegotiation: { mode: { pin: "2026-07-28" } } },
    );
    await client.connect(new StreamableHTTPClientTransport(url, { requestInit: authed(gmailToken) }));
    assert.equal(client.getProtocolEra(), "modern");
    assert.equal(client.getNegotiatedProtocolVersion(), "2026-07-28");
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((x) => x.name).sort(), ["ingest_memory", "list_authorized_tree", "read_branch", "search_brain"]);
    const ok = text(await client.callTool({ name: "read_branch", arguments: { branch_id: seed.b.realEstate } }));
    assert.equal(ok.isError, false);
    assert.deepEqual((JSON.parse(ok.text) as { memories: { title: string }[] }).memories.map((m) => m.title), ["Cap rate notes"]);
    const out = text(await client.callTool({ name: "read_branch", arguments: { branch_id: seed.b.workLife } }));
    assert.deepEqual(out, { text: '{"error":"not_found"}', isError: true });
    await client.close();
    t.diagnostic(`modern-era exchanges: ${JSON.stringify(seen.slice(before).map((s) => [s.rpc.join(","), s.status, s.protocol]))}`);
  });

  test("legacy client (@modelcontextprotocol/sdk 1.32): initialize, scoped tools/list, calls", async (t) => {
    const before = seen.length;
    const client = new LegacyClient({ name: "mindmeld-test-legacy", version: "1.0.0" });
    await client.connect(new LegacyTransport(url, { requestInit: authed(facebookToken) }));
    assert.equal(client.getServerVersion()?.name, "mindmeld-brain");
    const tools = await client.listTools();
    // Facebook holds read only: no search, no ingest.
    assert.deepEqual(tools.tools.map((x) => x.name).sort(), ["list_authorized_tree", "read_branch"]);
    const tree = text(await client.callTool({ name: "list_authorized_tree", arguments: { max_depth: 12 } }));
    assert.deepEqual(
      (JSON.parse(tree.text) as { branches: { name: string }[] }).branches.map((b) => b.name).sort(),
      ["Ideas", "Real-Estate", "SaaS CRM", "Wholesaling", "Work-Life"],
    );
    const out = text(await client.callTool({ name: "read_branch", arguments: { branch_id: seed.b.family } }));
    assert.deepEqual(out, { text: '{"error":"not_found"}', isError: true });
    // A tool that isn't granted isn't callable either.
    const search = await client.callTool({ name: "search_brain", arguments: { query: "script" } }).catch((e: Error) => e);
    assert.ok(search instanceof Error || text(search).isError);
    await client.close();
    const exchanges = seen.slice(before);
    assert.ok(exchanges.some((s) => s.rpc.includes("initialize") && s.status === 200), "legacy initialize handshake served");
    t.diagnostic(`legacy exchanges: ${JSON.stringify(exchanges.map((s) => [s.method, s.rpc.join(","), s.status, s.protocol]))}`);
  });

  test("HTTP guards: no token, bad token, revoked token, foreign Origin, GET", async () => {
    const init = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "raw", version: "1" } } };
    const post = (headers: Record<string, string>) =>
      fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
        body: JSON.stringify(init),
      });
    const none = await post({});
    assert.equal(none.status, 401);
    assert.match(none.headers.get("www-authenticate") ?? "", /^Bearer /);
    assert.equal((await post({ authorization: "Bearer mm_notarealtokennotarealtoken" })).status, 401);
    assert.equal((await post({ authorization: `Bearer ${gmailToken}`, origin: "https://evil.example" })).status, 403);
    assert.equal((await post({ authorization: `Bearer ${gmailToken}`, origin: "https://claude.ai" })).status, 200);
    // A session cookie alone is never enough.
    assert.equal((await post({ cookie: "better-auth.session_token=abc" })).status, 401);
    const get = await fetch(url, { headers: { authorization: `Bearer ${gmailToken}` } });
    assert.equal(get.status, 405);
    assert.equal(get.headers.get("allow"), "POST");

    assert.deepEqual(await revokeConnector(db.transaction, user, gmailId), { ok: true });
    assert.equal((await post({ authorization: `Bearer ${gmailToken}` })).status, 401);
    const client = new Client({ name: "after-revoke", version: "1.0.0" });
    await assert.rejects(client.connect(new StreamableHTTPClientTransport(url, { requestInit: authed(gmailToken) })));
  });

  test("every tool call left an audit row, including the boundary violations", async () => {
    const rows = await listAudit(db.sql, user, { connectorId: gmailId, limit: 500 });
    assert.ok(rows.some((r) => r.toolName === "read_branch" && r.status === "boundary_violation"));
    assert.ok(rows.some((r) => r.toolName === "read_branch" && r.status === "denied"));
    assert.ok(rows.some((r) => r.toolName === "ingest_memory" && r.status === "pending_approval"));
    assert.ok(rows.some((r) => r.action === "revoke"));
  });
});
