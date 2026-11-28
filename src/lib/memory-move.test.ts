import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkNewBranchName, flattenSectorTree, subtreeStats } from "./memory-move.ts";

const c = (id: string, name: string, parentId: string | null, sectorId = "frontal", memoryCount = 0) => ({ id, name, parentId, sectorId, memoryCount });

describe("flattenSectorTree", () => {
  it("orders parents before children with depth, alphabetical siblings", () => {
    const rows = flattenSectorTree([c("b", "Beta", null), c("a", "Alpha", null), c("a1", "Zed", "a"), c("a2", "Able", "a"), c("x", "Other", null, "temporal")], "frontal");
    assert.deepEqual(rows.map((r) => `${r.depth}:${r.concept.name}`), ["0:Alpha", "1:Able", "1:Zed", "0:Beta"]);
  });
  it("excludes branches and survives a cycle", () => {
    const rows = flattenSectorTree([c("a", "A", "b"), c("b", "B", "a")], "frontal");
    assert.ok(rows.length <= 2);
    const ex = flattenSectorTree([c("a", "A", null), c("a1", "A1", "a")], "frontal", new Set(["a"]));
    assert.deepEqual(ex.map((r) => r.concept.id), ["a1"]);
  });
});

describe("subtreeStats", () => {
  it("counts descendants and all memories", () => {
    const s = subtreeStats([c("r", "R", null, "f", 2), c("k1", "K1", "r", "f", 3), c("k2", "K2", "k1", "f", 4), c("o", "O", null, "f", 9)], "r");
    assert.deepEqual(s, { branches: 2, memories: 9 });
  });
  it("a leaf has no sub-branches", () => {
    assert.deepEqual(subtreeStats([c("r", "R", null, "f", 1)], "r"), { branches: 0, memories: 1 });
  });
});

describe("checkNewBranchName", () => {
  it("trims, collapses spaces and bounds length", () => {
    assert.deepEqual(checkNewBranchName("  New   idea "), { ok: true, name: "New idea" });
    assert.equal(checkNewBranchName("   ").ok, false);
    assert.equal(checkNewBranchName("x".repeat(81)).ok, false);
  });
});
