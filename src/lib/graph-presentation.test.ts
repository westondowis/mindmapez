import assert from "node:assert/strict";
import { test } from "node:test";
import { reconcileGraphNodes, graphNodeLayer } from "./graph-presentation.ts";
const branch = { id: "b", type: "concept", position: { x: 10, y: 20 }, data: {} };
const memory = { id: "m", type: "memory", position: { x: -90, y: 20 }, data: { anchorId: "b", expanded: false } };
test("selection preserves dragged branch coordinates and anchored memory offsets", () => {
  const local = [{ ...branch, position: { x: 300, y: 400 } }, memory];
  const out = reconcileGraphNodes([{ ...branch, data: { selected: true } }, { ...memory, data: { ...memory.data, expanded: true } }], local, true);
  assert.deepEqual(out[0].position, { x: 300, y: 400 });
  assert.deepEqual(out[1].position, { x: 200, y: 400 });
  assert.equal((out[1].data as Record<string, unknown>).anchorId, "b");
});
test("navigation starts a new coordinate frame instead of reusing the previous view", () => {
  assert.deepEqual(reconcileGraphNodes([branch], [{ ...branch, position: { x: 999, y: 999 } }], false)[0].position, branch.position);
});
test("memory edit cards always layer above selected branch circles", () => {
  assert.ok(graphNodeLayer("memory", true) > graphNodeLayer("concept", true));
  assert.ok(graphNodeLayer("memory", false) > graphNodeLayer("concept", true));
  assert.ok(graphNodeLayer("memory", true) > graphNodeLayer("memory", false));
});
