import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { levelLabel } from "./quick-add-level.ts";

const tree = [
  { id: "a", name: "Negotiations", parentId: null },
  { id: "b", name: "Call scripts", parentId: "a" },
];

describe("levelLabel", () => {
  it("is just the sector at sector level", () => assert.equal(levelLabel(tree, "Work-Life", null), "Work-Life"));
  it("walks parents to build the path", () => assert.equal(levelLabel(tree, "Work-Life", "b"), "Work-Life > Negotiations > Call scripts"));
  it("ignores an unknown branch id", () => assert.equal(levelLabel(tree, "Work-Life", "zzz"), "Work-Life"));
  it("survives a parent cycle", () => {
    const cyc = [{ id: "x", name: "X", parentId: "y" }, { id: "y", name: "Y", parentId: "x" }];
    assert.equal(levelLabel(cyc, "S", "x"), "S > Y > X");
  });
});
