import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { createConnector, listAudit, saveGrants } from "./admin.ts";
import {
  claimBrowserActions,
  completeBrowserAction,
  decideAction,
  getActionStatus,
  listActions,
  listExecutableTargets,
  proposeAction,
  type AppProvider,
} from "./outbound.ts";
import { authenticateConnector, effectivePermissions, type ConnectorDeps } from "./service.ts";
import { addBranch, addMemory, openTestDb, seedValidationBrain, type TestDb } from "./test-harness.ts";
import { cleanDomains, cleanSlugs, hostMatches, type GrantInput, type PermissionFlags } from "./types.ts";

const flags = (...on: (keyof PermissionFlags)[]): PermissionFlags => ({
  read: on.includes("read"),
  search: on.includes("search"),
  write_review: on.includes("write_review"),
  write_direct: on.includes("write_direct"),
  execute: on.includes("execute"),
});

function fakeProvider() {
  const calls: { userId: string; app: string; action: string; args: Record<string, unknown> }[] = [];
  const provider: AppProvider = {
    name: "fake",
    configured: () => true,
    listApps: async () => [],
    connectionState: async () => [],
    connect: async () => ({ requestId: "ca_1", redirectUrl: "https://connect.example/link" }),
    disconnect: async () => undefined,
    execute: async (userId, app, action, args) => {
      calls.push({ userId, app, action, args });
      return { ok: true, data: { messages: [] }, error: null, logId: "log_1" };
    },
  };
  return { provider, calls };
}

test("slug, domain and host helpers", () => {
  assert.deepEqual(cleanSlugs(["Gmail", "gmail", "bad slug", 3]), ["gmail"]);
  assert.deepEqual(cleanDomains(["https://www.Facebook.com/groups", "evil", "m.facebook.com:443"]), [
    "facebook.com",
    "m.facebook.com",
  ]);
  assert.equal(hostMatches("m.facebook.com", "facebook.com"), true);
  assert.equal(hostMatches("facebook.com.evil.io", "facebook.com"), false);
  assert.equal(hostMatches("notfacebook.com", "facebook.com"), false);
});

for (const rls of [true, false]) {
  describe(`outbound hub (${rls ? "RLS" : "query layer only"})`, () => {
    let db: TestDb;
    let deps: ConnectorDeps;
    const user = "user-weston";
    let seed: Awaited<ReturnType<typeof seedValidationBrain>>;

    before(async () => {
      db = await openTestDb();
      await db.migrate();
      deps = { sql: db.sql, transaction: db.transaction, rls };
      await db.sql`insert into user_settings (user_id) values (${user})`;
      seed = await seedValidationBrain(db.sql, user);
    });
    after(async () => {
      await db.pg.close();
    });

    async function connector(name: string, grants: GrantInput[]) {
      const made = await createConnector(db.transaction, user, { displayName: name, grants });
      assert.equal(made.ok, true);
      if (!made.ok) throw new Error("create failed");
      const who = await authenticateConnector(db.sql, `Bearer ${made.token}`);
      assert.ok(who);
      return who;
    }

    test("Gmail: deep grant proposes, owner approves, provider runs once", async () => {
      const who = await connector("Gmail", [
        {
          scopeKind: "branch",
          scopeRef: seed.b.realEstate,
          permissions: flags("read", "search", "write_review", "execute"),
          allowedApps: ["gmail"],
        },
      ]);
      assert.deepEqual(await listExecutableTargets(deps, who), { apps: ["gmail"], domains: [] });
      const proposed = await proposeAction(deps, who, {
        kind: "app",
        app: "gmail",
        action: "GMAIL_SEND_EMAIL",
        arguments: { to: "buyer@example.com" },
        contextMemoryIds: [seed.m.capRate, seed.m.assignment],
        summary: "Email the buyer the cap rate",
      });
      assert.equal(proposed.ok, true);
      if (!proposed.ok) return;
      const { provider, calls } = fakeProvider();
      assert.equal(calls.length, 0, "nothing runs before approval");
      const st = await getActionStatus(deps, who, proposed.data.action_id);
      assert.equal(st.ok && st.data.status, "pending");

      const decided = await decideAction(db.sql, provider, user, proposed.data.action_id, true);
      assert.equal(decided.ok, true);
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0], { userId: user, app: "gmail", action: "GMAIL_SEND_EMAIL", args: { to: "buyer@example.com" } });
      const done = await getActionStatus(deps, who, proposed.data.action_id);
      assert.equal(done.ok && done.data.status, "executed");
      const again = await decideAction(db.sql, provider, user, proposed.data.action_id, true);
      assert.equal(again.ok, false, "an action runs at most once");
      assert.equal(calls.length, 1);

      const audit = await listAudit(db.sql, user, { connectorId: who.connectorId });
      const actions = audit.map((a) => `${a.action}:${a.status}`);
      for (const want of ["propose:pending_approval", "approve:allowed", "execute:allowed"]) {
        assert.ok(actions.includes(want), `audit has ${want}`);
      }
    });

    test("Gmail: context outside Real-Estate and apps not allowed are refused", async () => {
      const who = await connector("Gmail 2", [
        { scopeKind: "branch", scopeRef: seed.b.realEstate, permissions: flags("read", "execute"), allowedApps: ["gmail"] },
      ]);
      for (const memory of [seed.m.balance, seed.m.crmPricing, seed.m.birthday, "missing-id"]) {
        const r = await proposeAction(deps, who, {
          kind: "app", app: "gmail", action: "GMAIL_SEND_EMAIL", arguments: {}, contextMemoryIds: [memory], summary: "x",
        });
        assert.deepEqual(r, { ok: false, error: "not_found" });
      }
      const slack = await proposeAction(deps, who, { kind: "app", app: "slack", action: "SLACK_SEND_MESSAGE", arguments: {}, summary: "x" });
      assert.equal(slack.ok, false);
      if (!slack.ok) assert.equal(slack.error, "insufficient_scope");
      const audit = await listAudit(db.sql, user, { connectorId: who.connectorId });
      assert.ok(audit.some((a) => a.status === "boundary_violation"), "cross-branch context is logged as a violation");
      assert.equal((await listActions(db.sql, user)).filter((a) => a.connectorId === who.connectorId).length, 0);
    });

    test("execute flag is required even when apps are listed", async () => {
      const who = await connector("Reader", [
        { scopeKind: "root", scopeRef: null, permissions: flags("read", "search"), allowedApps: ["gmail"] },
      ]);
      assert.equal((await effectivePermissions(db.sql, who)).has("execute"), false);
      assert.deepEqual(await listExecutableTargets(deps, who), { apps: [], domains: [] });
      const r = await proposeAction(deps, who, { kind: "app", app: "gmail", action: "GMAIL_FETCH_EMAILS", arguments: {}, summary: "x" });
      assert.equal(r.ok, false);
    });

    test("rejecting never runs; revoking between propose and approve blocks the run", async () => {
      const who = await connector("Gmail 3", [
        { scopeKind: "sector", scopeRef: "frontal", permissions: flags("read", "execute"), allowedApps: ["gmail"] },
      ]);
      const { provider, calls } = fakeProvider();
      const a = await proposeAction(deps, who, { kind: "app", app: "gmail", action: "GMAIL_FETCH_EMAILS", arguments: {}, summary: "x" });
      const b = await proposeAction(deps, who, { kind: "app", app: "gmail", action: "GMAIL_FETCH_EMAILS", arguments: {}, summary: "y" });
      assert.ok(a.ok && b.ok);
      if (!a.ok || !b.ok) return;
      assert.equal((await decideAction(db.sql, provider, user, a.data.action_id, false)).ok, true);
      await saveGrants(db.transaction, user, who.connectorId, [
        { scopeKind: "sector", scopeRef: "frontal", permissions: flags("read") },
      ]);
      assert.equal((await decideAction(db.sql, provider, user, b.data.action_id, true)).ok, false);
      assert.equal(calls.length, 0);
    });

    test("Facebook browser bridge: domain allowlist, approval, claim, complete", async () => {
      const who = await connector("Facebook Browser Agent", [
        { scopeKind: "sector", scopeRef: "frontal", permissions: flags("read", "search", "execute"), allowedDomains: ["facebook.com"] },
      ]);
      const blocked = await proposeAction(deps, who, {
        kind: "browser", url: "https://facebook.com.evil.io/x", browserAction: "type", text: "hi", summary: "x",
      });
      assert.equal(blocked.ok, false);
      const http = await proposeAction(deps, who, { kind: "browser", url: "http://facebook.com/", browserAction: "read", summary: "x" });
      assert.equal(http.ok, false);
      const outside = await proposeAction(deps, who, {
        kind: "browser", url: "https://www.facebook.com/groups/1", browserAction: "type", contextMemoryIds: [seed.m.birthday], summary: "x",
      });
      assert.deepEqual(outside, { ok: false, error: "not_found" });

      const ok = await proposeAction(deps, who, {
        kind: "browser",
        url: "https://www.facebook.com/groups/1",
        browserAction: "type",
        selector: "textarea",
        text: "Looking for deals",
        contextMemoryIds: [seed.m.assignment, seed.m.ideaList],
        summary: "Post in the group",
      });
      assert.equal(ok.ok, true);
      if (!ok.ok) return;
      assert.deepEqual(await claimBrowserActions(deps, who), [], "nothing to claim before approval");
      assert.equal((await decideAction(db.sql, null, user, ok.data.action_id, true)).ok, true);
      const claimed = await claimBrowserActions(deps, who);
      assert.equal(claimed.length, 1);
      assert.equal(claimed[0]!.domain, "www.facebook.com");
      assert.deepEqual(await claimBrowserActions(deps, who), [], "claimed once");
      assert.equal(await completeBrowserAction(deps, who, { id: claimed[0]!.id, ok: true, result: { typed: true } }), true);
      const st = await getActionStatus(deps, who, ok.data.action_id);
      assert.equal(st.ok && st.data.status, "executed");
      const audit = await listAudit(db.sql, user, { connectorId: who.connectorId });
      assert.ok(audit.some((a) => a.action === "claim"));
    });

    test("another connector can't see or claim my actions", async () => {
      const mine = await connector("Mine", [
        { scopeKind: "root", scopeRef: null, permissions: flags("read", "execute"), allowedDomains: ["example.com"] },
      ]);
      const theirs = await connector("Theirs", [
        { scopeKind: "root", scopeRef: null, permissions: flags("read", "execute"), allowedDomains: ["example.com"] },
      ]);
      const p = await proposeAction(deps, mine, { kind: "browser", url: "https://example.com/", browserAction: "read", summary: "x" });
      assert.ok(p.ok);
      if (!p.ok) return;
      await decideAction(db.sql, null, user, p.data.action_id, true);
      assert.deepEqual(await getActionStatus(deps, theirs, p.data.action_id), { ok: false, error: "not_found" });
      assert.deepEqual(await claimBrowserActions(deps, theirs), []);
      const extra = await addBranch(db.sql, user, "Scratch", { sectorId: "frontal" });
      await addMemory(db.sql, user, "Scratch note", [extra]);
    });
  });
}
