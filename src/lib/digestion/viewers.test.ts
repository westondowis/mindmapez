import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, test } from "node:test";
import { openTestDb, type TestDb } from "../connectors/test-harness.ts";
import { cacheDocumentDigest, documentForDigest, parseDigestReply, saveArtifactStateCore } from "./artifact-store.ts";
import { fitMetadata, overRequestBudget, REQUEST_BUDGET_BYTES } from "./fit.ts";
import { icsInstant } from "./ics.ts";
import { sniffRoute, SUPPORTED_ACCEPT } from "./sniff.ts";
import { jsonBytes } from "./viewer-types.ts";

/** Component source without comments (so prose like "never allow-same-origin" doesn't count). */
const src = (p: string) =>
  readFileSync(new URL(`../../components/digestion/${p}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("metadata fitting", () => {
  test("shrinks the biggest arrays/strings until under budget, leaves small metadata alone", () => {
    const small = { v: "x", a: [1, 2, 3] };
    assert.equal(fitMetadata(small).shrunk, false);
    const big = { v: "email_thread", truncated: false, messages: Array.from({ length: 400 }, (_, i) => ({ id: `m${i}`, text: "y".repeat(6000) })) };
    const r = fitMetadata(big, 200_000);
    assert.ok(r.shrunk && jsonBytes(r.meta) <= 200_000);
    assert.ok((r.meta.messages as unknown[]).length > 0);
  });
  test("request budget counts original + metadata + text + thumb", () => {
    assert.equal(overRequestBudget({ mediaUrl: "data:,x", meta: {}, body: "hi" }), false);
    assert.equal(overRequestBudget({ mediaUrl: "x".repeat(REQUEST_BUDGET_BYTES - 1000), meta: { t: "y".repeat(5000) }, body: "" }), true);
  });
});

describe("routing for v5.36 formats", () => {
  test("every new format has a route and is in the picker", () => {
    const cases: [string, string][] = [
      ["a.yaml", "yaml"], ["a.xml", "xml"], ["a.html", "html"], ["a.svg", "svg"], ["a.epub", "epub"], ["a.rtf", "rtf"],
      ["a.ics", "ics"], ["a.vcf", "vcf"], ["a.eml", "eml"], ["a.mbox", "mbox"], ["a.msg", "msg"], ["a.kml", "kml"],
      ["a.kmz", "kmz"], ["a.gpx", "gpx"], ["a.zip", "zip"], ["a.geojson", "json"], ["a.md", "md"],
    ];
    for (const [name, route] of cases) {
      assert.equal(sniffRoute(name, ""), route, name);
      if (!name.endsWith(".geojson") || SUPPORTED_ACCEPT.includes(".geojson")) assert.ok(SUPPORTED_ACCEPT.includes(name.slice(1)), name);
    }
  });
});

describe("calendar instants", () => {
  test("UTC, TZID wall time (DST-aware), floating and all-day", () => {
    assert.equal(icsInstant("2026-03-01T15:00:00Z").toISOString(), "2026-03-01T15:00:00.000Z");
    assert.equal(icsInstant("2026-07-01T09:00:00", "America/New_York").toISOString(), "2026-07-01T13:00:00.000Z");
    assert.equal(icsInstant("2026-01-15T09:00:00", "America/Denver").toISOString(), "2026-01-15T16:00:00.000Z");
    assert.equal(icsInstant("2026-01-15T09:00:00", "Not/AZone").getTime(), new Date("2026-01-15T09:00:00").getTime());
    assert.equal(icsInstant("2026-01-15").getDate(), 15);
  });
});

describe("viewer security (source checks)", () => {
  test("SVG renders only through <img>, never inline markup", () => {
    const s = src("svg-view.tsx");
    assert.ok(!s.includes("dangerouslySetInnerHTML"));
    assert.ok(/<img\b/.test(s) && s.includes('startsWith("data:image/svg+xml")'));
  });
  test("html_app iframe never gets allow-same-origin; email frames run with no scripts", () => {
    const h = src("html-app-view.tsx");
    assert.ok(h.includes("sandbox={HTML_APP_SANDBOX}") && !h.includes("allow-same-origin"));
    const e = src("email-thread-view.tsx");
    assert.ok(e.includes('sandbox=""') && e.includes("img-src data:") && e.includes("sanitizeHtml("));
  });
  test("document HTML is sanitized before it is injected", () => {
    const d = src("document-reader-view.tsx");
    const injections = d.match(/dangerouslySetInnerHTML=\{\{ __html: (\w+) \}\}/g) ?? [];
    assert.ok(injections.length >= 1);
    assert.ok(d.includes("setHtml(sanitizeHtml(out))") && d.includes("sanitizeHtml(markdownToHtml(memory.body))"));
  });
});

describe("artifact state + document digest (PGLite, real migrations)", () => {
  let db: TestDb;
  const u = "art-user";
  before(async () => {
    db = await openTestDb();
    await db.migrate();
    await db.sql`insert into memories (id, user_id, title, body, memory_type, viewer_type, extracted_metadata_json)
      values ('d1', ${u}, 'Doc', 'Some long text', 'document', 'document_reader', ${JSON.stringify({ v: "document_reader", format: "txt", words: 3, outline: [], originalStored: false })}::jsonb)`;
    await db.sql`insert into memories (id, user_id, title, body, memory_type) values ('p1', ${u}, 'Plain', 'b', 'text')`;
  });
  after(async () => {
    await db.pg.close();
  });

  test("saves, then rate-limits a second save inside a second, then accepts after the window", async () => {
    assert.deepEqual(await saveArtifactStateCore(db.sql, u, "d1", { kv: { a: "1" } }), { ok: true });
    assert.deepEqual(await saveArtifactStateCore(db.sql, u, "d1", { kv: { a: "2" } }), { ok: false, error: "rate_limited" });
    await db.sql`update memories set artifact_saved_at = now() - interval '2 seconds' where id = 'd1'`;
    assert.deepEqual(await saveArtifactStateCore(db.sql, u, "d1", { kv: { a: "3" } }), { ok: true });
    const rows = await db.sql<{ s: { kv: { a: string } } }>`select artifact_state_json as s from memories where id = 'd1'`;
    assert.equal(rows[0]!.s.kv.a, "3");
  });
  test("over-256 KB state is rejected; other users' memories are not found", async () => {
    await db.sql`update memories set artifact_saved_at = null where id = 'd1'`;
    const big = await saveArtifactStateCore(db.sql, u, "d1", { kv: { a: "x".repeat(270_000) } });
    assert.equal(big.ok, false);
    assert.deepEqual(await saveArtifactStateCore(db.sql, "someone-else", "d1", { kv: {} }), { ok: false, error: "Not found" });
  });
  test("digest reply parsing and caching only for document_reader memories", async () => {
    assert.equal(parseDigestReply("nope"), null);
    const d = parseDigestReply('```json\n{"summary":"Short.","keyPoints":["a"," ",3,"b"]}\n```');
    assert.deepEqual(d, { summary: "Short.", keyPoints: ["a", "b"] });
    assert.equal(await documentForDigest(db.sql, u, "p1"), null);
    assert.equal(await documentForDigest(db.sql, "someone-else", "d1"), null);
    const doc = await documentForDigest(db.sql, u, "d1");
    assert.ok(doc);
    await cacheDocumentDigest(db.sql, u, "d1", doc.meta, d!);
    const again = await documentForDigest(db.sql, u, "d1");
    assert.deepEqual((again!.meta as { digest: unknown }).digest, d);
  });
});
