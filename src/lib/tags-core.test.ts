import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { createConnector } from "./connectors/admin.ts";
import { listScopedMemories } from "./connectors/scope.ts";
import { addBranch, addMemory, openTestDb, seedValidationBrain, tid, type TestDb } from "./connectors/test-harness.ts";
import { authenticateConnector } from "./connectors/service.ts";
import { generateConnectorToken } from "./connectors/tokens.ts";
import {
  autoTagText,
  backfillTags,
  ensureTag,
  recomputeTags,
  resolveTagAccessScope,
  saveConnectorTagGrants,
  syncTagGrants,
  syncMemoryTags,
  tagRelations,
} from "./tags-core.ts";

const user = "tag-user";
const other = "tag-other";

describe("tagging system (PGLite, real migrations)", () => {
  let db: TestDb;
  let seed: Awaited<ReturnType<typeof seedValidationBrain>>;
  const link = (tagId: string, type: string, id: string) =>
    db.sql`insert into tag_links (tag_id, user_id, target_type, target_id) values (${tagId}, ${user}, ${type}, ${id}) on conflict do nothing`;

  before(async () => {
    db = await openTestDb();
    await db.migrate();
    await db.sql`insert into user_settings (user_id) values (${user}), (${other})`;
    seed = await seedValidationBrain(db.sql, user);
    // Owner branch is what scoped memory access keys on.
    await db.sql`update memories m set owner_branch_id = mc.concept_id from memory_concepts mc where mc.memory_id = m.id`;
  });
  after(async () => {
    await db.pg.close();
  });

  describe("resolveTagAccessScope", () => {
    test("a tagged branch brings only itself and its descendants, never parents or siblings", async () => {
      const t = (await ensureTag(db.sql, user, "deals"))!;
      await link(t.id, "branch", seed.b.realEstate);
      const s = await resolveTagAccessScope(db.sql, user, [t.id]);
      assert.deepEqual(new Set(s.branchIds), new Set([seed.b.realEstate, seed.b.wholesaling]));
      assert.ok(!s.branchIds.includes(seed.b.workLife));
      assert.ok(!s.branchIds.includes(seed.b.saas));
      assert.deepEqual(s.sectorIds, []);
      assert.ok(s.memoryIds.includes(seed.m.capRate) && s.memoryIds.includes(seed.m.assignment));
      assert.ok(!s.memoryIds.includes(seed.m.balance) && !s.memoryIds.includes(seed.m.crmPricing));
    });

    test("a tagged sector brings the whole sector and its memories", async () => {
      const t = (await ensureTag(db.sql, user, "life"))!;
      await link(t.id, "sector", "frontal");
      const s = await resolveTagAccessScope(db.sql, user, [t.id]);
      assert.deepEqual(s.sectorIds, ["frontal"]);
      for (const id of [seed.b.workLife, seed.b.realEstate, seed.b.wholesaling, seed.b.saas, seed.b.ideas]) assert.ok(s.branchIds.includes(id));
      assert.ok(!s.branchIds.includes(seed.b.family));
      assert.ok(s.memoryIds.includes(seed.m.ideaList) && !s.memoryIds.includes(seed.m.birthday));
    });

    test("a tagged memory brings just that memory", async () => {
      const t = (await ensureTag(db.sql, user, "pin"))!;
      await link(t.id, "memory", seed.m.grip);
      const s = await resolveTagAccessScope(db.sql, user, [t.id]);
      assert.deepEqual(s.memoryIds, [seed.m.grip]);
      assert.deepEqual(s.branchIds, []);
    });

    test("unions across sectors and de-duplicates, and ignores other users' tags", async () => {
      const a = (await ensureTag(db.sql, user, "cross-a"))!;
      const b = (await ensureTag(db.sql, user, "cross-b"))!;
      await link(a.id, "branch", seed.b.wholesaling); // 3rd level in frontal
      await link(b.id, "branch", seed.b.golf); // other sector
      await link(b.id, "branch", seed.b.wholesaling); // duplicate path
      const s = await resolveTagAccessScope(db.sql, user, [a.id, b.id]);
      assert.deepEqual(new Set(s.branchIds), new Set([seed.b.wholesaling, seed.b.golf]));
      assert.equal(new Set(s.memoryIds).size, s.memoryIds.length);
      const foreign = await resolveTagAccessScope(db.sql, other, [a.id, b.id]);
      assert.deepEqual(foreign, { sectorIds: [], branchIds: [], memoryIds: [] });
      assert.deepEqual(await resolveTagAccessScope(db.sql, user, []), { sectorIds: [], branchIds: [], memoryIds: [] });
    });
  });

  describe("connector tag grants", () => {
    test("a connector reaches tagged subtrees across sectors, and nothing above them", async () => {
      const created = await createConnector(db.transaction, user, {
        displayName: "Tag bridge",
        grants: [{ scopeKind: "branch", scopeRef: seed.b.taxes, permissions: { read: true, search: true, write_review: false, write_direct: false, execute: false } }],
      });
      assert.ok(created.ok);
      if (!created.ok) return;
      const who = await authenticateConnector(db.sql, `Bearer ${created.token}`);
      assert.ok(who);
      const before = await listScopedMemories(db.sql, who, "read", { limit: 100 });
      assert.deepEqual(before.map((m) => m.title).sort(), ["1031 deadline"]);

      const t = (await ensureTag(db.sql, user, "bridge"))!;
      await link(t.id, "branch", seed.b.realEstate);
      await link(t.id, "memory", seed.m.grip);
      await link(t.id, "sector", "temporal");
      const saved = await saveConnectorTagGrants(db.transaction, user, who.connectorId, [t.id]);
      assert.equal(saved.ok, true);

      const after = await listScopedMemories(db.sql, who, "read", { limit: 100 });
      const titles = new Set(after.map((m) => m.title));
      for (const want of ["1031 deadline", "Cap rate notes", "Assignment fee script", "Mom birthday", "Driver grip"]) assert.ok(titles.has(want), want);
      for (const nope of ["Work-life balance rule", "CRM pricing", "Idea list"]) assert.ok(!titles.has(nope), nope);

      const rel = await tagRelations(db.sql, user, t.id);
      assert.deepEqual(rel?.connectors.map((c) => c.name), ["Tag bridge"]);
      assert.ok(rel?.branches.some((b) => b.path === "Work-Life → Real-Estate"));
      assert.equal(rel?.memories.length, 1);

      // Removing the tag grant removes the access.
      await saveConnectorTagGrants(db.transaction, user, who.connectorId, []);
      const gone = await listScopedMemories(db.sql, who, "read", { limit: 100 });
      assert.deepEqual(gone.map((m) => m.title).sort(), ["1031 deadline"]);
    });

    test("attaching and detaching a granted tag updates access after a sync", async () => {
      const created = await createConnector(db.transaction, user, {
        displayName: "Live sync",
        grants: [{ scopeKind: "branch", scopeRef: seed.b.taxes, permissions: { read: true, search: true, write_review: false, write_direct: false, execute: false } }],
      });
      assert.ok(created.ok);
      if (!created.ok) return;
      const who = (await authenticateConnector(db.sql, `Bearer ${created.token}`))!;
      const t = (await ensureTag(db.sql, user, "live"))!;
      await saveConnectorTagGrants(db.transaction, user, who.connectorId, [t.id]);
      const titles = async () => new Set((await listScopedMemories(db.sql, who, "read", { limit: 100 })).map((m) => m.title));
      assert.ok(!(await titles()).has("Mom birthday"));
      await link(t.id, "branch", seed.b.family);
      await syncTagGrants(db.sql, user);
      assert.ok((await titles()).has("Mom birthday"));
      await db.sql`delete from tag_links where tag_id = ${t.id} and target_id = ${seed.b.family}`;
      await syncTagGrants(db.sql, user);
      assert.ok(!(await titles()).has("Mom birthday"));
      // Derived grants never show up as the connector's own editable scopes.
      const own = await db.sql`select 1 from connector_grants where connector_id = ${who.connectorId} and via_tag_id is null and revoked_at is null`;
      assert.equal(own.length, 1);
    });

    test("deleting a tag detaches it from nodes and connectors", async () => {
      const created = await createConnector(db.transaction, user, {
        displayName: "Doomed",
        grants: [{ scopeKind: "branch", scopeRef: seed.b.taxes, permissions: { read: true, search: false, write_review: false, write_direct: false, execute: false } }],
      });
      assert.ok(created.ok);
      if (!created.ok) return;
      const who = (await authenticateConnector(db.sql, `Bearer ${created.token}`))!;
      const t = (await ensureTag(db.sql, user, "doomed"))!;
      await link(t.id, "branch", seed.b.ideas);
      await saveConnectorTagGrants(db.transaction, user, who.connectorId, [t.id]);
      await db.sql`delete from tags where id = ${t.id}`;
      assert.equal((await db.sql`select 1 from tag_links where tag_id = ${t.id}`).length, 0);
      assert.equal((await db.sql`select 1 from connector_tag_grants where tag_id = ${t.id}`).length, 0);
    });

    test("rejects tags the user does not own", async () => {
      const created = await createConnector(db.transaction, user, {
        displayName: "Nosy",
        grants: [{ scopeKind: "branch", scopeRef: seed.b.taxes, permissions: { read: true, search: false, write_review: false, write_direct: false, execute: false } }],
      });
      assert.ok(created.ok);
      if (!created.ok) return;
      const theirs = (await ensureTag(db.sql, other, "theirs"))!;
      const r = await saveConnectorTagGrants(db.transaction, user, created.connectorId, [theirs.id]);
      assert.equal(r.ok, false);
    });
  });

  describe("tiers and sync", () => {
    test("auto tags promote at 5 items or 2 branches; manual locks never move or vanish", async () => {
      const u = "tier-user";
      await db.sql`insert into user_settings (user_id) values (${u})`;
      const b1 = await addBranch(db.sql, u, "A", { sectorId: "frontal" });
      const b2 = await addBranch(db.sql, u, "B", { sectorId: "temporal" });
      const m1 = await addMemory(db.sql, u, "m1", [b1]);
      const m2 = await addMemory(db.sql, u, "m2", [b2]);
      await db.sql`update memories m set owner_branch_id = mc.concept_id from memory_concepts mc where mc.memory_id = m.id and m.user_id = ${u}`;
      await syncMemoryTags(db.sql, u, m1, ["pricing"]);
      const tier = async (n: string) => (await db.sql<{ tier: string; c: number; m: boolean }>`select tier, occurrence_count as c, is_manual_override as m from tags where user_id = ${u} and name = ${n}`)[0]!;
      assert.equal((await tier("pricing")).tier, "secondary");
      await syncMemoryTags(db.sql, u, m2, ["pricing"]);
      assert.deepEqual(await tier("pricing"), { tier: "primary", c: 2, m: false });

      const manual = (await ensureTag(db.sql, u, "pinned", { tier: "secondary", manual: true }))!;
      for (let i = 0; i < 6; i += 1) await db.sql`insert into tag_links (tag_id, user_id, target_type, target_id) values (${manual.id}, ${u}, 'memory', ${tid("x")})`;
      await recomputeTags(db.sql, u);
      assert.deepEqual(await tier("pinned"), { tier: "secondary", c: 6, m: true });

      await syncMemoryTags(db.sql, u, m1, []); // drops the last auto link for "pricing" from m1 only
      assert.equal((await tier("pricing")).c, 1);
      await syncMemoryTags(db.sql, u, m2, []);
      assert.equal((await db.sql`select 1 from tags where user_id = ${u} and name = 'pricing'`).length, 0, "orphan auto tag is removed");
      await db.sql`delete from tag_links where tag_id = ${manual.id}`;
      await recomputeTags(db.sql, u);
      assert.equal((await db.sql`select 1 from tags where id = ${manual.id}`).length, 1, "manual tag survives with zero uses");
    });

    test("backfill builds tags from existing memory tag lists once", async () => {
      const u = "backfill-user";
      await db.sql`insert into user_settings (user_id) values (${u})`;
      const b = await addBranch(db.sql, u, "Only", { sectorId: "frontal" });
      await addMemory(db.sql, u, "n1", [b], { tags: ["Alpha", "beta"] });
      assert.equal(await backfillTags(db.sql, u), 1);
      assert.equal((await db.sql`select 1 from tags where user_id = ${u}`).length, 2);
      assert.equal(await backfillTags(db.sql, u), 0);
    });
  });

  describe("autoTagText", () => {
    test("needs recurrence across the brain, ignores filler, matches branch names", async () => {
      const u = "auto-user";
      await db.sql`insert into user_settings (user_id) values (${u})`;
      const b = await addBranch(db.sql, u, "Negotiations", { sectorId: "frontal" });
      await addMemory(db.sql, u, "Earlier", [b], { body: "Notes on mortgage rates and refinancing" });
      const tags = await autoTagText(db.sql, u, {
        text: "Basically I just thought about negotiations and mortgage rates, and also zebra crossings",
      });
      assert.ok(tags.includes("negotiations"), "branch name matched");
      assert.ok(tags.includes("mortgage"), "recurs in another memory");
      assert.ok(tags.includes("rates"));
      assert.ok(!tags.includes("zebra"), "single occurrence never becomes a tag");
      for (const bad of ["basically", "just", "thought", "about", "also"]) assert.ok(!tags.includes(bad));
    });
  });
});
