import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BRANCH_RADIUS,
  CELL_PITCH,
  FORK_LEN,
  getMemoryCellCount,
  routeMemory,
  spreadSomaY,
  targetAxonLength,
  terminalAngles,
} from "./synapse-route.ts";

describe("getMemoryCellCount", () => {
  it("is 3 for small memories up to 1.5 pages", () => {
    for (const n of [0, 12, 500, 4_500, -10, Number.NaN]) assert.equal(getMemoryCellCount(n), 3);
  });
  it("is 15 from 100 pages", () => {
    for (const n of [300_000, 1e7, Number.POSITIVE_INFINITY]) assert.equal(getMemoryCellCount(n), 15);
  });
  it("matches the spec's anchor points", () => {
    assert.equal(getMemoryCellCount(2 * 3000), 4);
    assert.equal(getMemoryCellCount(10 * 3000), 8);
  });
  it("never decreases and stays in 3..15", () => {
    let prev = 3;
    for (let c = 0; c <= 400_000; c += 997) {
      const n = getMemoryCellCount(c);
      assert.ok(n >= prev && n >= 3 && n <= 15);
      prev = n;
    }
  });
});

describe("terminalAngles", () => {
  it("fans a single terminal straight out the left", () => assert.deepEqual(terminalAngles(1), [180]));
  it("keeps up to five on the left arc 130..230, distinct", () => {
    const a = terminalAngles(5);
    assert.equal(new Set(a).size, 5);
    for (const x of a) assert.ok(x >= 130 && x <= 230);
  });
  it("overflows to the right arc -50..50", () => {
    const a = terminalAngles(9);
    assert.equal(a.length, 9);
    const right = a.slice(5);
    assert.equal(right.length, 4);
    for (const x of right) assert.ok(x >= -50 && x <= 50);
    assert.equal(new Set(a).size, 9);
  });
  it("is empty for no memories", () => assert.deepEqual(terminalAngles(0), []));
});

describe("routeMemory", () => {
  const center = { x: 600, y: 300 };
  it("docks the terminal on the ring and ends head-on", () => {
    for (const angle of [130, 180, 230, -50, 0, 50]) {
      const r = routeMemory({ center, angleDeg: angle, cellCount: 5 });
      assert.ok(Math.abs(Math.hypot(r.terminal.x - center.x, r.terminal.y - center.y) - BRANCH_RADIUS) < 1e-6);
      assert.ok(Math.abs(Math.hypot(r.forkBase.x - r.terminal.x, r.forkBase.y - r.terminal.y) - FORK_LEN) < 1e-6);
      // The axon arrives travelling toward the ring centre (inward tangent).
      const want = Math.atan2(center.y - r.forkBase.y, center.x - r.forkBase.x);
      const got = (r.forkAngle * Math.PI) / 180;
      assert.ok(Math.abs(Math.atan2(Math.sin(got - want), Math.cos(got - want))) < 0.02);
    }
  });
  it("places one cell per count, at tangent angles", () => {
    for (const n of [3, 8, 15]) {
      const r = routeMemory({ center, angleDeg: 180, cellCount: n });
      assert.equal(r.cells.length, n);
    }
  });
  it("keeps the soma inside the safe x band and bends to keep the length", () => {
    const wide = routeMemory({ center, angleDeg: 180, cellCount: 15 });
    const bounded = routeMemory({ center, angleDeg: 180, cellCount: 15, minX: 560, maxX: 900 });
    assert.ok(bounded.soma.x >= 560 && bounded.soma.x <= 900);
    assert.ok(bounded.length >= targetAxonLength(15) - 1, `length ${bounded.length}`);
    assert.ok(bounded.length >= wide.length - 1);
    const straight = Math.hypot(bounded.soma.x - bounded.forkBase.x, bounded.soma.y - bounded.forkBase.y);
    assert.ok(bounded.length > straight, "curve is longer than the straight line");
  });
  it("is longer for bigger documents", () => {
    const a = routeMemory({ center, angleDeg: 180, cellCount: 3, minX: 560, maxX: 900 });
    const b = routeMemory({ center, angleDeg: 180, cellCount: 15, minX: 560, maxX: 900 });
    assert.ok(b.length > a.length + 10 * CELL_PITCH * 0.8);
  });
  it("lets a right-side terminal bend inside the right bound", () => {
    const r = routeMemory({ center, angleDeg: 20, cellCount: 12, minX: 100, maxX: 760 });
    assert.ok(r.soma.x <= 760);
    for (const c of r.cells) assert.ok(c.x <= 760 + 1 && c.x >= 100 - 1);
  });
});

describe("spreadSomaY", () => {
  it("leaves well-spaced values alone", () => assert.deepEqual(spreadSomaY([0, 100, 200], 62), [0, 100, 200]));
  it("enforces the gap, keeps order and the centre of mass", () => {
    const out = spreadSomaY([100, 110, 120, 130], 62);
    for (let i = 1; i < out.length; i++) assert.ok(out[i]! - out[i - 1]! >= 62 - 1e-9);
    assert.ok(Math.abs(out.reduce((a, b) => a + b, 0) / 4 - 115) < 1e-9);
  });
  it("handles empty and single inputs", () => {
    assert.deepEqual(spreadSomaY([], 62), []);
    assert.deepEqual(spreadSomaY([5], 62), [5]);
  });
});
