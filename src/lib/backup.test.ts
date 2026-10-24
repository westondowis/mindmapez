import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseMindBackup, summarizeBackup } from "./backup.ts";

describe("mind backup", () => {
  it("rejects non-mindmesh json", () => {
    const bad = parseMindBackup({ hello: "world" });
    assert.equal(bad.ok, false);
  });

  it("round-trips a small mind including nested branches", () => {
    const parsed = parseMindBackup({
      format: "mindmesh-backup",
      version: 1,
      exportedAt: "2026-09-18T18:00:00.000Z",
      settings: { displayName: "Weston", age: 34, onboarded: true, plan: "pro" },
      concepts: [
        { id: "fam", name: "Family", kind: "category", sectorId: "creativity", parentId: null },
        { id: "par", name: "Parents", kind: "subcategory", sectorId: "creativity", parentId: "fam" },
      ],
      memories: [
        {
          id: "m1",
          title: "Dad's birthday",
          body: "May 4",
          memoryType: "voice",
          transcript: "Dad's birthday is May 4",
          tags: ["family"],
        },
      ],
      memoryConcepts: [{ memoryId: "m1", conceptId: "par" }],
      connections: [
        {
          id: "e1",
          sourceType: "concept",
          sourceId: "fam",
          targetType: "concept",
          targetId: "par",
          strength: 0.9,
          status: "accepted",
        },
      ],
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.backup.concepts[1]?.parentId, "fam");
    assert.equal(parsed.backup.memories[0]?.transcript, "Dad's birthday is May 4");
    const summary = summarizeBackup(parsed.backup);
    assert.equal(summary.branchCount, 2);
    assert.equal(summary.memoryCount, 1);
    assert.equal(summary.displayName, "Weston");
  });

  it("drops links to missing nodes", () => {
    const parsed = parseMindBackup({
      format: "mindmesh-backup",
      version: 1,
      concepts: [{ id: "a", name: "A" }],
      memories: [{ id: "m", title: "M" }],
      memoryConcepts: [{ memoryId: "m", conceptId: "missing" }],
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.backup.memoryConcepts.length, 0);
  });
});
