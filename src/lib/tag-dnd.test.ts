import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dropResult, isDrag, matchesTag, otherTier, tierAtPoint } from "./tag-dnd.ts";

const zones = [
  { tier: "primary" as const, rect: { left: 0, top: 0, right: 100, bottom: 100 } },
  { tier: "secondary" as const, rect: { left: 0, top: 120, right: 100, bottom: 220 } },
];

describe("tag drag and drop", () => {
  it("finds the zone under the pointer", () => {
    assert.equal(tierAtPoint(50, 50, zones), "primary");
    assert.equal(tierAtPoint(50, 150, zones), "secondary");
    assert.equal(tierAtPoint(50, 110, zones), null);
    assert.equal(tierAtPoint(500, 50, zones), null);
  });
  it("a small wobble is a tap, a real move is a drag", () => {
    assert.equal(isDrag(2, 3), false);
    assert.equal(isDrag(6, 0), true);
  });
  it("only a different tier changes anything", () => {
    assert.equal(dropResult("primary", "secondary"), "secondary");
    assert.equal(dropResult("primary", "primary"), null);
    assert.equal(dropResult("secondary", null), null);
    assert.equal(otherTier("primary"), "secondary");
  });
  it("search matches names and what the tag is attached to", () => {
    const t = { name: "deals", labels: ["Work-Life → Negotiations → Call Scripts", "Cap rate notes"] };
    assert.deepEqual(matchesTag("", t), { match: true, via: null });
    assert.deepEqual(matchesTag("DEAL", t), { match: true, via: null });
    assert.deepEqual(matchesTag("call scripts", t), { match: true, via: "Work-Life → Negotiations → Call Scripts" });
    assert.deepEqual(matchesTag("zebra", t), { match: false, via: null });
  });
});
