import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_SYNAPSE_LENGTH,
  MIN_SYNAPSE_LENGTH,
  SYNAPSE_PITCH,
  SYNAPSE_TAIL,
  synapseAxonLength,
  synapseLayout,
} from "./synapse.ts";

describe("synapse length", () => {
  it("never goes below the minimum, even for empty or junk input", () => {
    for (const n of [0, -5, 1, 10, Number.NaN, Number.NEGATIVE_INFINITY]) {
      assert.equal(synapseAxonLength(n), MIN_SYNAPSE_LENGTH);
    }
  });

  it("never exceeds the maximum, even for huge documents", () => {
    for (const n of [1e5, 1e9, Number.POSITIVE_INFINITY]) {
      assert.ok(synapseAxonLength(n) <= MAX_SYNAPSE_LENGTH);
    }
    assert.equal(synapseAxonLength(1e9), MAX_SYNAPSE_LENGTH);
  });

  it("grows with content length", () => {
    const sizes = [12, 100, 1_000, 5_000, 20_000].map(synapseAxonLength);
    for (let i = 1; i < sizes.length; i++) assert.ok(sizes[i]! >= sizes[i - 1]!);
    assert.ok(sizes[sizes.length - 1]! > sizes[0]!);
  });
});

describe("synapse layout", () => {
  it("always draws at least 3 segments and keeps terminals inside the width", () => {
    for (const n of [0, 12, 80, 500, 3_000, 40_000, 1e9]) {
      const l = synapseLayout(n);
      assert.ok(l.beads >= 3);
      assert.equal(l.width, l.axonEnd + SYNAPSE_TAIL);
      assert.equal(l.length, l.beads * SYNAPSE_PITCH);
    }
  });

  it("a short note is shorter than a long document", () => {
    assert.ok(synapseLayout(40).width < synapseLayout(30_000).width);
  });
});
