import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { layoutAnchoredMemories } from "./branch-memories.ts";

const w = (c: number) => 40 + c;
const mems = [
  { id: "m1", anchorId: "A", contentLength: 10 },
  { id: "m2", anchorId: "A", contentLength: 200 },
  { id: "m3", anchorId: "B", contentLength: 50 },
  { id: "m4", anchorId: "C", contentLength: 50 },
];
const anchors = new Map([
  ["A", { x: 0, y: 0 }],
  ["B", { x: 300, y: 200 }],
  ["C", { x: -300, y: 200 }],
]);

describe("layoutAnchoredMemories", () => {
  it("each memory anchors to its own sibling branch", () => {
    const p = layoutAnchoredMemories(mems, anchors, w);
    assert.equal(p.get("m1")!.anchorId, "A");
    assert.equal(p.get("m2")!.anchorId, "A");
    assert.equal(p.get("m3")!.anchorId, "B");
    assert.equal(p.get("m4")!.anchorId, "C");
    assert.equal(p.get("m3")!.x, 300 + p.get("m3")!.dx);
  });
  it("moving/selecting a different branch leaves other memories' anchor and offset unchanged", () => {
    const before = layoutAnchoredMemories(mems, anchors, w);
    const after = layoutAnchoredMemories(mems, new Map([...anchors, ["B", { x: 999, y: -50 }]]), w);
    for (const id of ["m1", "m2", "m4"]) assert.deepEqual(after.get(id), before.get(id));
    assert.equal(after.get("m3")!.anchorId, "B");
    assert.equal(after.get("m3")!.dx, before.get("m3")!.dx);
    assert.equal(after.get("m3")!.dy, before.get("m3")!.dy);
  });
  it("hides memories whose branch is not rendered instead of reattaching", () => {
    const p = layoutAnchoredMemories(mems, new Map([["B", { x: 0, y: 0 }]]), w);
    assert.deepEqual([...p.keys()], ["m3"]);
  });
});
