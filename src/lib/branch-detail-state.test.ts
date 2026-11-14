import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DETAIL_CLOSED,
  centerYAbovePanel,
  collapseDetail,
  hiddenByPanel,
  isDoubleTap,
  selectDetail,
  toggleDetail,
} from "./branch-detail-state.ts";

describe("detail state", () => {
  it("selecting a branch is always collapsed", () => {
    assert.deepEqual(selectDetail(DETAIL_CLOSED, "a"), { branchId: "a", expanded: false });
    assert.deepEqual(selectDetail({ branchId: "a", expanded: true }, "b"), { branchId: "b", expanded: false });
  });
  it("re-selecting the open branch keeps it expanded", () => {
    const open = { branchId: "a", expanded: true };
    assert.equal(selectDetail(open, "a"), open);
  });
  it("toggles only when a branch is selected", () => {
    assert.deepEqual(toggleDetail(DETAIL_CLOSED), DETAIL_CLOSED);
    const once = toggleDetail({ branchId: "a", expanded: false });
    assert.equal(once.expanded, true);
    assert.equal(toggleDetail(once).expanded, false);
  });
  it("collapse leaves the selection in place", () => {
    assert.deepEqual(collapseDetail({ branchId: "a", expanded: true }), { branchId: "a", expanded: false });
  });
});

describe("double tap", () => {
  it("matches the same node inside the window only", () => {
    assert.equal(isDoubleTap({ id: "a", at: 1000 }, "a", 1300), true);
    assert.equal(isDoubleTap({ id: "a", at: 1000 }, "a", 1351), false);
    assert.equal(isDoubleTap({ id: "a", at: 1000 }, "b", 1100), false);
    assert.equal(isDoubleTap(null, "a", 1100), false);
    assert.equal(isDoubleTap({ id: "a", at: 1000 }, "a", 900), false);
  });
});

describe("panel clearance", () => {
  it("centres below the node by half the panel, scaled by zoom", () => {
    assert.equal(centerYAbovePanel(100, 1, 300), 250);
    assert.equal(centerYAbovePanel(100, 2, 300), 175);
  });
  it("ignores bad zoom or panel values", () => {
    assert.equal(centerYAbovePanel(100, 0, 300), 250);
    assert.equal(centerYAbovePanel(100, 1, Number.NaN), 100);
  });
  it("flags nodes that would sit under the panel", () => {
    assert.equal(hiddenByPanel(500, 600, 250), true);
    assert.equal(hiddenByPanel(200, 600, 250), false);
  });
});
