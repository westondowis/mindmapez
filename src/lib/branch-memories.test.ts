import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupMemoriesByBranch, memoriesForBranch, newBranchPosition, type OwnershipEdge } from "./branch-memories.ts";

const link = (m: string, c: string): OwnershipEdge => ({ sourceType: "memory", sourceId: m, targetType: "concept", targetId: c });
const branchEdge = (p: string, c: string): OwnershipEdge => ({ sourceType: "concept", sourceId: p, targetType: "concept", targetId: c });

describe("memory ownership survives sub-branch creation", () => {
  const memories = [{ id: "m1" }, { id: "m2" }, { id: "m3" }];
  const before: OwnershipEdge[] = [
    branchEdge("neg", "vacant"),
    link("m1", "vacant"),
    link("m2", "neg"),
    link("m3", "neg"),
  ];
  // Creating "slow" under "neg" only adds a concept→concept edge.
  const after = [...before, branchEdge("neg", "slow")];

  it("keeps every memory's branch id unchanged", () => {
    for (const b of ["vacant", "neg"]) {
      assert.deepEqual(
        memoriesForBranch(memories, after, b).map((m) => m.id),
        memoriesForBranch(memories, before, b).map((m) => m.id),
      );
    }
  });

  it("groups memories under their own branch, none under the new one", () => {
    const g = groupMemoriesByBranch(["m1", "m2", "m3"], after, ["neg", "vacant", "slow"]);
    assert.deepEqual(g.get("vacant"), ["m1"]);
    assert.deepEqual(g.get("neg"), ["m2", "m3"]);
    assert.deepEqual(g.get("slow"), []);
  });

  it("concept→concept edges never count as memory ownership", () => {
    assert.deepEqual(memoriesForBranch([{ id: "vacant" }], after, "neg"), []);
  });

  it("places new sub-branches below the parent, clear of its memory column", () => {
    const p = newBranchPosition({ positionX: 500, positionY: 300 }, 1);
    assert.ok(p.y >= 300 + 150);
    assert.ok(p.x >= 500);
  });
});
