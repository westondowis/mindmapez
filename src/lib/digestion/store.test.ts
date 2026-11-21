import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { migrationFiles, migrationText, openTestDb, type TestDb } from "../connectors/test-harness.ts";
import { parseCsv } from "./csv.ts";
import { detectDigestArchetype } from "./detect.ts";
import { normalizeRow } from "./normalize.ts";
import {
  appendRowsCore,
  beginDatasetCore,
  datasetRowMatches,
  finalizeDatasetCore,
  getDatasetForMemoryCore,
  queryRowsCore,
  type InsertMemoryFn,
} from "./store.ts";

const user = "ds-user";
const other = "ds-other";
let n = 0;
const newId = () => `id-${++n}`;

describe("dataset store (PGLite, real migrations)", () => {
  let db: TestDb;
  const insertMemory = (uid: string): InsertMemoryFn => async (input) => {
    const id = newId();
    await db.sql`insert into memories (id, user_id, title, body, memory_type, viewer_type, ai_summary, tags_json, media_name)
      values (${id}, ${uid}, ${input.title}, ${input.body}, ${input.memoryType}, ${input.viewerType}, ${input.aiSummary}, ${JSON.stringify(input.tags)}, ${input.mediaName})`;
    return { ok: true, memoryId: id };
  };

  before(async () => {
    db = await openTestDb();
    await db.migrate();
  });
  after(async () => {
    await db.pg.close();
  });

  async function load(csv: string, filename: string, uid = user) {
    const all = parseCsv(csv);
    const schema = detectDigestArchetype(all[0]!, all.slice(1), filename);
    const { datasetId, memoryId } = await beginDatasetCore(db.sql, uid, { filename, format: "csv", archetype: schema.archetype, schema, expectedRows: all.length - 1 }, insertMemory(uid), newId);
    const rows = all.slice(1).map((r) => {
      const x = normalizeRow(r, schema);
      return { canonical: x.canonical, custom: x.custom };
    });
    return { datasetId, memoryId, rows, schema };
  }

  test("begin → append (retried batch is idempotent) → finalize → query", async () => {
    const lines = ["Name,Email,Phone,Photo,Team"];
    for (let i = 0; i < 1200; i++) lines.push(`Person ${i},p${i}@ex.com,${i % 3 ? `555-010-${String(i).padStart(4, "0")}` : ""},${i % 4 === 0 ? `https://x.com/${i}.png` : ""},T${i % 5}`);
    const { datasetId, memoryId, rows } = await load(lines.join("\n"), "contacts.csv");
    for (let i = 0; i < rows.length; i += 500) {
      const r = await appendRowsCore(db.sql, user, { datasetId, startIndex: i, rows: rows.slice(i, i + 500) });
      assert.equal(r.inserted, Math.min(500, rows.length - i));
    }
    const retry = await appendRowsCore(db.sql, user, { datasetId, startIndex: 500, rows: rows.slice(500, 1000) });
    assert.equal(retry.inserted, 0);
    const fin = await finalizeDatasetCore(db.sql, user, datasetId);
    assert.equal(fin.metrics.rows, 1200);
    assert.equal(fin.metrics.contacts?.withPhone, 800);
    const header = await getDatasetForMemoryCore(db.sql, user, memoryId);
    assert.equal(header?.status, "ready");
    assert.equal(header?.rowCount, 1200);
    const mem = (await db.sql<{ body: string; content_length: number; extracted_metadata_json: { datasetId: string } }>`select body, content_length, extracted_metadata_json from memories where id = ${memoryId}`)[0]!;
    assert.match(mem.body, /Contacts dataset/);
    assert.equal(mem.extracted_metadata_json.datasetId, datasetId);
    assert.ok(mem.content_length > 0);

    const page = await queryRowsCore(db.sql, user, { datasetId, limit: 50, filters: { has: ["avatar"] } });
    assert.equal(page.total, 300);
    assert.equal(page.rows.length, 50);
    const s = await queryRowsCore(db.sql, user, { datasetId, search: "person 1199" });
    assert.equal(s.total, 1);
    const sorted = await queryRowsCore(db.sql, user, { datasetId, sortBy: { key: "name", dir: "desc" }, limit: 1 });
    assert.equal(sorted.rows[0]!.canonical.name, "Person 999");
    assert.equal((await queryRowsCore(db.sql, user, { datasetId, search: "100%" })).total, 0);

    // Deep-search boost sees the matches.
    const hits = await datasetRowMatches(db.sql, user, "p77@ex.com");
    assert.deepEqual(hits.map((h) => h.memoryId), [memoryId]);

    // Ownership: another user's id returns nothing and cannot append.
    assert.deepEqual(await queryRowsCore(db.sql, other, { datasetId }), { rows: [], total: 0 });
    await assert.rejects(appendRowsCore(db.sql, other, { datasetId, startIndex: 0, rows: rows.slice(0, 1) }), /not found/);
    assert.equal(await getDatasetForMemoryCore(db.sql, other, memoryId), null);
    assert.deepEqual(await datasetRowMatches(db.sql, other, "p77@ex.com"), []);

    // Whitelisted sort/filter keys only; injection attempts are rejected, not executed.
    await assert.rejects(queryRowsCore(db.sql, user, { datasetId, sortBy: { key: "name; drop table memories", dir: "asc" } }), /Cannot sort/);
    await assert.rejects(queryRowsCore(db.sql, user, { datasetId, filters: { eq: { "x') or 1=1 --": "a" } } }), /Cannot filter/);
    await assert.rejects(queryRowsCore(db.sql, user, { datasetId, filters: { has: ["ssn" as "phone"] } }), /Unknown filter/);

    // Finished datasets refuse more rows; deleting the memory cascades.
    await assert.rejects(appendRowsCore(db.sql, user, { datasetId, startIndex: 1200, rows: rows.slice(0, 1) }), /not accepting/);
    await db.sql`delete from memories where id = ${memoryId}`;
    assert.equal((await db.sql<{ n: number }>`select count(*)::int as n from digested_rows where dataset_id = ${datasetId}`)[0]!.n, 0);
    assert.equal((await db.sql<{ n: number }>`select count(*)::int as n from digested_datasets where id = ${datasetId}`)[0]!.n, 0);
  });

  test("server re-validates rows: unknown canonical keys, bad types, javascript urls, cell caps, batch caps", async () => {
    const { datasetId } = await load("Name,Email\nA,a@b.co\nB,b@c.co\n", "people.csv");
    await appendRowsCore(db.sql, user, {
      datasetId,
      startIndex: 0,
      rows: [{ canonical: { name: "x".repeat(10_000), emails: ["a@b.co", 5], website: "javascript:alert(1)", evil: "y", amount: "NaN" }, custom: { note: "z" } }],
    });
    const row = (await db.sql<{ canonical_json: Record<string, unknown>; search_text: string }>`select canonical_json, search_text from digested_rows where dataset_id = ${datasetId}`)[0]!;
    assert.equal((row.canonical_json.name as string).length, 4096);
    assert.deepEqual(row.canonical_json.emails, ["a@b.co"]);
    assert.equal(row.canonical_json.website, undefined);
    assert.equal(row.canonical_json.evil, undefined);
    assert.ok(row.search_text.length <= 4096);
    await assert.rejects(appendRowsCore(db.sql, user, { datasetId, startIndex: 0, rows: Array.from({ length: 501 }, () => ({ canonical: {} })) }), /500 rows/);
    await assert.rejects(appendRowsCore(db.sql, user, { datasetId, startIndex: 99_999, rows: [{}, {}] }), /out of range/);
    await assert.rejects(beginDatasetCore(db.sql, user, { filename: "x.csv", format: "csv", archetype: "generic_table", schema: { columns: [{ key: "a" }] } as never, expectedRows: 100_001 }, insertMemory(user), newId), /rows/);
  });
});

test("digestion migrations apply on a host without pg_trgm (plain ILIKE fallback)", async () => {
  const pg = new PGlite();
  await pg.waitReady;
  await pg.exec("create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())");
  for (const name of migrationFiles()) await pg.transaction(async (tx) => {
    await tx.exec(migrationText(name));
  });
  const idx = await pg.query<{ indexname: string }>("select indexname from pg_indexes where indexname like '%trgm%'");
  assert.equal(idx.rows.length, 0);
  const t = await pg.query<{ n: number }>("select count(*)::int as n from information_schema.tables where table_name in ('digested_datasets','digested_rows')");
  assert.equal(t.rows[0]!.n, 2);
  await pg.close();
});
