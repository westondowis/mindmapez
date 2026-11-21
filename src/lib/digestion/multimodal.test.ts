import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { openTestDb, type TestDb } from "../connectors/test-harness.ts";
import { BACKUP_VERSION, parseMindBackup } from "../backup.ts";
import { mapMemory, mapMemorySummary, memoryDetailColumns, memorySummaryColumns, type MemoryRow } from "../server/map.ts";
import { sniffRoute, extensionOf, SUPPORTED_ACCEPT } from "./sniff.ts";
import { appendRowsCore, getDatasetForMemoryCore, queryRowsCore, restoreDatasetCore } from "./store.ts";
import {
  applyKvOp,
  BRIDGE_LIMITS,
  INLINE_DATA_URL_MAX_CHARS,
  inlineMediaOrNull,
  isViewerType,
  validateViewerFields,
  VIEWER_TYPES,
} from "./viewer-types.ts";

const enc = (s: string) => new TextEncoder().encode(s);

describe("sniffRoute", () => {
  test("routes by extension, case-insensitive", () => {
    assert.equal(sniffRoute("Leads.CSV", ""), "csv");
    assert.equal(sniffRoute("a.tab", ""), "tsv");
    assert.equal(sniffRoute("book.xlsx", ""), "xlsx");
    assert.equal(sniffRoute("photo.JPG", ""), "image");
    assert.equal(sniffRoute("anim.gif", ""), "gif");
    assert.equal(sniffRoute("x.geojson", ""), "json");
    assert.equal(extensionOf("archive.tar.gz"), "gz");
  });
  test("magic bytes beat a misleading extension for PDFs and fill in when there's no extension", () => {
    assert.equal(sniffRoute("report.txt", "text/plain", enc("%PDF-1.7\n")), "pdf");
    assert.equal(sniffRoute("noext", "", enc("%PDF-1.4")), "pdf");
    assert.equal(sniffRoute("noext", "", new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0])), "zip");
    const heic = new Uint8Array([0, 0, 0, 0x18, ...enc("ftypheic")]);
    assert.equal(sniffRoute("IMG_0001", "", heic), "heic");
  });
  test("falls back to MIME, then other", () => {
    assert.equal(sniffRoute("download", "text/csv"), "csv");
    assert.equal(sniffRoute("download", "application/octet-stream"), "other");
    assert.ok(SUPPORTED_ACCEPT.includes(".xlsx") && SUPPORTED_ACCEPT.includes("image/*"));
  });
});

describe("viewer field validation (server-side caps)", () => {
  test("viewer types are a closed set", () => {
    assert.ok(VIEWER_TYPES.includes("dataset") && isViewerType("image"));
    assert.equal(isViewerType("script"), false);
    assert.throws(() => validateViewerFields({ viewerType: "script" as never }), /viewer type/i);
  });
  test("metadata/artifact/thumbnail caps", () => {
    assert.throws(() => validateViewerFields({ viewerType: "image", extractedMetadata: [] as never }));
    assert.throws(() => validateViewerFields({ viewerType: "image", extractedMetadata: { big: "x".repeat(1_100_000) } }), /large|limit|cap/i);
    assert.throws(() => validateViewerFields({ viewerType: "interactive_checklist", artifactState: { kv: { a: "x".repeat(270_000) } } }));
    assert.throws(() => validateViewerFields({ viewerType: "image", thumbDataUrl: "javascript:alert(1)" }));
    assert.throws(() => validateViewerFields({ viewerType: "image", thumbDataUrl: "data:image/svg+xml;base64,PHN2Zz4=" }), "SVG thumbnails are refused");
    assert.throws(() => validateViewerFields({ viewerType: "image", thumbDataUrl: `data:image/webp;base64,${"A".repeat(24_001)}` }));
    const ok = validateViewerFields({ viewerType: "image", extractedMetadata: { v: "image", width: 2, height: 3 }, thumbDataUrl: "data:image/webp;base64,AAAA" });
    assert.equal(ok.viewerType, "image");
  });
  test("inline originals: https ≤2048 chars or data URLs within the 3 MB cap; anything else is dropped", () => {
    assert.equal(inlineMediaOrNull("https://x.test/a.png"), "https://x.test/a.png");
    assert.equal(inlineMediaOrNull(`https://x.test/${"a".repeat(2100)}`), null);
    assert.equal(inlineMediaOrNull("http://x.test/a.png"), null);
    assert.equal(inlineMediaOrNull("javascript:alert(1)"), null);
    assert.equal(inlineMediaOrNull("data:image/png;base64,AAAA"), "data:image/png;base64,AAAA");
    assert.equal(inlineMediaOrNull(`data:audio/webm;base64,${"A".repeat(INLINE_DATA_URL_MAX_CHARS)}`), null);
  });
  test("bridge key/value store ops enforce key, value and total limits", () => {
    let kv: Record<string, string> = {};
    const set = applyKvOp(kv, { op: "set", key: "a", value: "1" });
    assert.ok(set.ok);
    kv = set.ok ? set.kv : kv;
    assert.deepEqual(applyKvOp(kv, { op: "set", key: "k".repeat(BRIDGE_LIMITS.maxKeyChars + 1), value: "1" }), { ok: false, error: "bad_request" });
    assert.deepEqual(applyKvOp(kv, { op: "set", key: "b", value: "v".repeat(BRIDGE_LIMITS.maxValueBytes + 1) }), { ok: false, error: "too_large" });
    assert.deepEqual(applyKvOp(kv, { op: "bogus" as never, key: "a" }), { ok: false, error: "bad_request" });
    const many: Record<string, string> = {};
    for (let i = 0; i < BRIDGE_LIMITS.maxKeys; i++) many[`k${i}`] = "1";
    assert.deepEqual(applyKvOp(many, { op: "set", key: "one-more", value: "1" }), { ok: false, error: "too_large" });
    const removed = applyKvOp(kv, { op: "remove", key: "a" });
    assert.ok(removed.ok && !("a" in removed.kv));
    const cleared = applyKvOp(kv, { op: "clear" });
    assert.ok(cleared.ok && Object.keys(cleared.kv).length === 0);
  });
});

describe("lightweight graph payload (PGLite, real migrations)", () => {
  let db: TestDb;
  const u = "payload-user";
  before(async () => {
    db = await openTestDb();
    await db.migrate();
    await db.sql`insert into memories (id, user_id, title, body, transcript, memory_type, media_url, media_mime, ai_summary)
      values ('m1', ${u}, 'Voice note', ${"long body ".repeat(500)}, 'secret transcript', 'voice', 'data:audio/webm;base64,AAAA', 'audio/webm', null)`;
    await db.sql`insert into memories (id, user_id, title, body, memory_type, ai_summary) values ('m2', ${u}, 'Img', 'b', 'photo', 'summary wins')`;
  });
  after(async () => {
    await db.pg.close();
  });

  test("summary rows never carry body, transcript or media_url", async () => {
    const rows = await db.sql.query<MemoryRow>(`select ${memorySummaryColumns("m")} from memories m where m.user_id = $1 order by m.id`, [u]);
    for (const r of rows) {
      assert.ok(!("body" in r) && !("transcript" in r) && !("media_url" in r), Object.keys(r).join(","));
    }
    const s = rows.map(mapMemorySummary);
    assert.equal(s[0].hasMedia, true);
    assert.equal(s[0].snippet.length, 280);
    assert.equal(s[0].contentLength, "Voice note".length + "long body ".repeat(500).length + "secret transcript".length);
    assert.equal(s[1].snippet, "summary wins");
    assert.ok(!("body" in s[0]) && !("transcript" in s[0]) && !("mediaUrl" in s[0]));
  });

  test("detail rows add body/transcript but still not the media bytes", async () => {
    const rows = await db.sql.query<MemoryRow>(`select ${memoryDetailColumns()} from memories where id = 'm1'`);
    assert.ok(!("media_url" in rows[0]));
    const m = mapMemory(rows[0]);
    assert.equal(m.transcript, "secret transcript");
    assert.equal(m.mediaUrl, null);
    assert.equal(m.viewerType, "plain");
  });

  test("viewer_type check constraint rejects unknown viewers; thumbnails must be raster data URLs", async () => {
    await assert.rejects(db.sql`update memories set viewer_type = 'script' where id = 'm2'`);
    await assert.rejects(db.sql`update memories set thumb_data_url = 'javascript:alert(1)' where id = 'm2'`);
    await db.sql`update memories set viewer_type = 'image', thumb_data_url = 'data:image/webp;base64,AAAA' where id = 'm2'`;
  });

  test("backup restore rebuilds a dataset under the restored memory", async () => {
    await db.sql`insert into memories (id, user_id, title, body, memory_type, viewer_type) values ('m3', ${u}, 'Leads', 'x', 'dataset', 'dataset')`;
    let n = 0;
    const schema = {
      version: 1, archetype: "contacts_crm", confidence: 0.9, scores: {},
      columns: [{ key: "Name", header: "Name", type: "text", fill: 1, canonical: "name" }, { key: "Phone", header: "Phone", type: "phone", fill: 1, canonical: "phones" }, { key: "Notes2", header: "Notes2", type: "text", fill: 1 }],
      canonicalMap: { Name: "name", Phone: "phones" }, customKeys: ["Notes2"],
    };
    const rows = Array.from({ length: 1203 }, (_, i) => ({ canonical: { name: `Person ${i}`, phones: [`+1555000${String(i).padStart(4, "0")}`], evil: "<script>" }, custom: { Notes2: `n${i}` } }));
    const id = await restoreDatasetCore(db.sql, u, { memoryId: "m3", archetype: "contacts_crm", sourceFilename: "leads.csv", sourceFormat: "csv", schema, rows }, () => `rds-${++n}`);
    const header = await getDatasetForMemoryCore(db.sql, u, "m3");
    assert.equal(header?.datasetId, id);
    assert.equal(header?.status, "ready");
    assert.equal(header?.rowCount, 1203);
    const q = await queryRowsCore(db.sql, u, { datasetId: id, search: "person 1202" });
    assert.equal(q.total, 1);
    assert.ok(!("evil" in q.rows[0].canonical), "non-canonical keys are stripped");
    await assert.rejects(restoreDatasetCore(db.sql, "someone-else", { memoryId: "m3", archetype: "contacts_crm", sourceFilename: "x", sourceFormat: "csv", schema, rows }, () => "rds-x"));
    await assert.rejects(appendRowsCore(db.sql, u, { datasetId: id, startIndex: 0, rows: [{ canonical: {}, custom: {} }] }), /not accepting/);
  });
});

describe("backup v2", () => {
  const base = { format: "mindmesh-backup", exportedAt: "2026-11-20T00:00:00.000Z", settings: {}, concepts: [] };
  test("v1 backups still restore as plain memories", () => {
    const r = parseMindBackup({ ...base, version: 1, memories: [{ id: "a", title: "T", body: "B" }] });
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.backup.version, BACKUP_VERSION);
    assert.equal(r.backup.memories[0].viewerType, "plain");
    assert.deepEqual(r.backup.datasets, []);
  });
  test("v2 carries viewer fields and datasets; invalid viewer data falls back to plain", () => {
    const r = parseMindBackup({
      ...base,
      version: 2,
      memories: [
        { id: "a", title: "Img", body: "", viewerType: "image", extractedMetadata: { v: "image", width: 1, height: 1 }, thumbDataUrl: "data:image/webp;base64,AAAA" },
        { id: "b", title: "Bad", body: "", viewerType: "script", thumbDataUrl: "javascript:x" },
        { id: "c", title: "Leads", body: "", viewerType: "dataset" },
      ],
      datasets: [
        { memoryId: "c", archetype: "contacts_crm", sourceFilename: "l.csv", sourceFormat: "csv", schema: { columns: [] }, rows: [{ canonical: { name: "A" }, custom: {} }] },
        { memoryId: "missing", archetype: "contacts_crm", sourceFilename: "x", sourceFormat: "csv", schema: {}, rows: [] },
      ],
    });
    assert.ok(r.ok);
    if (!r.ok) return;
    const [a, b] = r.backup.memories;
    assert.equal(a.viewerType, "image");
    assert.equal(a.thumbDataUrl, "data:image/webp;base64,AAAA");
    assert.equal(b.viewerType, "plain");
    assert.equal(b.thumbDataUrl, null);
    assert.equal(r.backup.datasets.length, 1);
    assert.equal(r.backup.datasets[0].rows[0].canonical.name, "A");
  });
  test("rejects backups from a newer version", () => {
    assert.equal(parseMindBackup({ ...base, version: BACKUP_VERSION + 1, memories: [] }).ok, false);
  });
});
