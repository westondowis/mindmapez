import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { addBranch, addMemory, openTestDb, type TestDb } from "./connectors/test-harness.ts";
import {
  buildSuggestionReason,
  cleanConceptNames,
  parseSuggestionReason,
  sharedConceptNames,
  suggestionReasonLine,
} from "./suggestion-reason.ts";

describe("suggestion reasons: build and parse", () => {
  test("builds readable lists for 1, 2 and 3+ concepts, capped at 3", () => {
    assert.equal(buildSuggestionReason(["Golf"]), "Both linked to Golf");
    assert.equal(buildSuggestionReason(["Golf", "Practice"]), "Both linked to Golf and Practice");
    assert.equal(buildSuggestionReason(["Golf", "Practice", "Putting", "Swing"]), "Both linked to Golf, Practice and Putting");
  });

  test("falls back to the old wording when nothing is shared", () => {
    assert.equal(buildSuggestionReason([], "Range day"), "Shared themes with: Range day");
    assert.equal(buildSuggestionReason([]), "Shared themes");
  });

  test("round-trips names, including ones holding separators", () => {
    for (const names of [["Golf"], ["Golf", "Practice"], ["A", "B", "C"], ["Rock and Roll", "Salt, Pepper"], ["golf", "Golf", " Practice  "]]) {
      const parsed = parseSuggestionReason(buildSuggestionReason(names));
      assert.deepEqual(parsed, cleanConceptNames(names));
    }
    assert.deepEqual(cleanConceptNames(["Rock and Roll", "Salt, Pepper"]), ["Rock & Roll", "Salt Pepper"]);
  });

  test("old free-text and empty reasons parse to no concepts but still render", () => {
    assert.deepEqual(parseSuggestionReason("Shared themes with: Range day"), []);
    assert.deepEqual(parseSuggestionReason(null), []);
    assert.deepEqual(parseSuggestionReason("Both linked to "), []);
    assert.equal(suggestionReasonLine([], "Shared themes with: Range day"), "Shared themes with: Range day");
    assert.equal(suggestionReasonLine([], "  "), null);
    assert.equal(suggestionReasonLine(["Golf", "Practice"], "Shared themes with: X"), "Both linked to Golf and Practice");
  });
});

describe("sharedConceptNames (PGLite, real migrations)", () => {
  const user = "sugg-user";
  let db: TestDb;
  let ids: { a: string; b: string; c: string };

  before(async () => {
    db = await openTestDb();
    await db.migrate();
    const golf = await addBranch(db.sql, user, "Golf");
    const practice = await addBranch(db.sql, user, "Practice");
    const family = await addBranch(db.sql, user, "Family");
    const a = await addMemory(db.sql, user, "Range day", [golf, practice, family]);
    const b = await addMemory(db.sql, user, "Putting drill", [golf, practice]);
    const c = await addMemory(db.sql, user, "Dinner", [family]);
    await addMemory(db.sql, user, "Tee times", [golf]);
    ids = { a, b, c };
  });
  after(async () => {
    await db.pg.close();
  });

  test("returns only concepts both memories share, most-used first", async () => {
    assert.deepEqual(await sharedConceptNames(db.sql, user, ids.a, ids.b), ["Golf", "Practice"]);
    assert.deepEqual(await sharedConceptNames(db.sql, user, ids.a, ids.c), ["Family"]);
    assert.deepEqual(await sharedConceptNames(db.sql, user, ids.b, ids.c), []);
  });

  test("is scoped to the user and respects the limit", async () => {
    assert.deepEqual(await sharedConceptNames(db.sql, "someone-else", ids.a, ids.b), []);
    assert.deepEqual(await sharedConceptNames(db.sql, user, ids.a, ids.b, 1), ["Golf"]);
  });
});
