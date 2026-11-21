import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { openTestDb, type TestDb } from "./connectors/test-harness.ts";
import { combineTermHits, escapeLike, searchTerms, tieredSearch, TIER_SCORES } from "./search-tiers.ts";

const u = "tier-user";
const other = "tier-other";

describe("searchTerms / escapeLike", () => {
  test("drops stop words, punctuation and duplicates", () => {
    assert.deepEqual(searchTerms("What golf thought helped me stop slicing? golf"), ["golf", "thought", "helped", "stop", "slicing"]);
    assert.deepEqual(searchTerms("#Seller-financing"), ["seller-financing"]);
    assert.deepEqual(searchTerms("the a of"), []);
  });
  test("escapes LIKE wildcards", () => {
    assert.equal(escapeLike("50%_off\\"), "50\\%\\_off\\\\");
  });
  test("ranks by terms matched, then score", () => {
    const r = combineTermHits(
      [
        [{ memoryId: "a", score: 100, tier: 1, via: "#x" }, { memoryId: "b", score: 30, tier: 3, via: "title" }],
        [{ memoryId: "b", score: 30, tier: 3, via: "title" }],
      ],
      10,
    );
    assert.deepEqual(r.map((x) => x.memoryId), ["b", "a"]);
    assert.equal(r[0].termsMatched, 2);
  });
});

describe("tieredSearch (PGLite, real migrations)", () => {
  let db: TestDb;
  before(async () => {
    db = await openTestDb();
    await db.migrate();
    const sql = db.sql;
    // Tree: strategy sector → "Real Estate" → "Seller Calls"
    await sql`insert into concepts (id, user_id, name, sector_id) values ('c-re', ${u}, 'Real Estate', 'strategy')`;
    await sql`insert into concepts (id, user_id, name, sector_id, parent_id) values ('c-calls', ${u}, 'Seller Calls', 'strategy', 'c-re')`;
    await sql`insert into concepts (id, user_id, name, sector_id) values ('c-golf', ${u}, 'Golf', 'growth')`;
    const mem = async (id: string, title: string, body: string, opts: { branch?: string; summary?: string; uid?: string } = {}) =>
      sql`insert into memories (id, user_id, title, body, memory_type, ai_summary, owner_branch_id)
          values (${id}, ${opts.uid ?? u}, ${title}, ${body}, 'text', ${opts.summary ?? null}, ${opts.branch ?? null})`;
    await mem("m-tag", "Morning routine", "nothing relevant");
    await mem("m-call", "Call with Jim", "talked about terms", { branch: "c-calls" });
    await mem("m-title", "Negotiation anchors", "x");
    await mem("m-summary", "Notes", "y", { summary: "a negotiation lesson about anchoring" });
    await mem("m-body", "Untitled", "deep negotiation detail only in the body");
    await mem("m-golf", "Driver", "fix the slice", { branch: "c-golf" });
    await mem("m-other", "Negotiation anchors", "z", { uid: other });
    await sql`insert into tags (id, user_id, name, slug, tier) values ('t-neg', ${u}, 'negotiation', 'negotiation', 'primary')`;
    await sql`insert into tags (id, user_id, name, slug) values ('t-negp', ${u}, 'negotiation-prep', 'negotiation-prep')`;
    await sql`insert into tags (id, user_id, name, slug) values ('t-o', ${other}, 'negotiation', 'negotiation')`;
    await sql`insert into tag_links (tag_id, user_id, target_type, target_id) values ('t-neg', ${u}, 'memory', 'm-tag')`;
    await sql`insert into tag_links (tag_id, user_id, target_type, target_id) values ('t-negp', ${u}, 'branch', 'c-re')`;
    await sql`insert into tag_links (tag_id, user_id, target_type, target_id) values ('t-o', ${other}, 'memory', 'm-other')`;
  });
  after(async () => {
    await db.pg.close();
  });

  test("tag > inherited tag > title > summary; body only with deep; other users invisible", async () => {
    const light = await tieredSearch(db.sql, u, "negotiation");
    const ids = light.map((r) => r.memoryId);
    assert.deepEqual(ids, ["m-tag", "m-call", "m-title", "m-summary"]);
    assert.equal(light[0].score, TIER_SCORES.tagExact);
    assert.equal(light[1].score, TIER_SCORES.tagInherited, "tag on Real Estate reaches the Seller Calls sub-branch");
    assert.equal(light[1].via, "#negotiation-prep");
    assert.ok(!ids.includes("m-body") && !ids.includes("m-other"));
    const deep = await tieredSearch(db.sql, u, "negotiation", { deep: true });
    assert.ok(deep.some((r) => r.memoryId === "m-body" && r.tier === 4));
    assert.ok(!deep.some((r) => r.memoryId === "m-other"));
  });

  test("branch names reach memories in their subtree (tier 2)", async () => {
    const r = await tieredSearch(db.sql, u, "real estate");
    assert.ok(r.some((x) => x.memoryId === "m-call" && x.tier === 2));
    const g = await tieredSearch(db.sql, u, "golf slice");
    assert.equal(g[0].memoryId, "m-golf");
  });

  test("wildcards in queries are literal", async () => {
    assert.deepEqual(await tieredSearch(db.sql, u, "%%"), []);
    assert.deepEqual(await tieredSearch(db.sql, u, "zz%"), []);
  });

  test("5k memories: light tiers never touch body and stay fast; tag prefix uses its index", async () => {
    await db.pg.exec(`
      insert into memories (id, user_id, title, body, memory_type)
      select 'bulk-' || g, '${u}', 'Bulk note ' || g, repeat('lorem ipsum ', 200), 'text' from generate_series(1, 5000) g;
      insert into tags (id, user_id, name, slug) select 'bt-' || g, '${u}', 'bulk' || g, 'bulk' || g from generate_series(1, 2000) g;
      analyze;`);
    const t0 = performance.now();
    const r = await tieredSearch(db.sql, u, "negotiation anchors");
    const ms = performance.now() - t0;
    assert.equal(r[0].memoryId, "m-title");
    assert.ok(ms < 1500, `took ${ms}ms`);
    await db.pg.exec("set enable_seqscan = off");
    const plan = await db.pg.query<{ "QUERY PLAN": string }>(
      `explain select id from tags where user_id = '${u}' and name like 'negotiation%'`,
    );
    await db.pg.exec("set enable_seqscan = on");
    const text = plan.rows.map((x) => x["QUERY PLAN"]).join("\n");
    assert.match(text, /tags_user_name_(prefix_)?idx/);
  });
});
