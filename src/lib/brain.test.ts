import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ancestorsOf,
  assignSectorFromName,
  breadcrumbPath,
  childrenOf,
  descendantsOf,
  mergeSectors,
  overridesFromSectors,
  wouldCycle,
} from "./brain.ts";
import type { Concept } from "./types.ts";

function concept(
  id: string,
  name: string,
  parentId: string | null,
  sectorId: string,
): Concept {
  return {
    id,
    name,
    kind: parentId ? "subcategory" : "category",
    icon: "brain",
    emoji: "🧠",
    color: "cyan",
    memoryCount: 0,
    positionX: null,
    positionY: null,
    createdAt: "2026-01-01",
    parentId,
    sectorId,
    description: "",
    updatedAt: "2026-01-01",
  };
}

const tree = [
  concept("fam", "Family", null, "temporal"),
  concept("par", "Parents", "fam", "temporal"),
  concept("dates", "Important dates", "par", "temporal"),
  concept("med", "Medical information", "par", "temporal"),
  concept("work", "Work", null, "frontal"),
];

describe("brain hierarchy", () => {
  it("assigns sectors from names", () => {
    assert.equal(assignSectorFromName("Family"), "temporal");
    assert.equal(assignSectorFromName("Golf swing"), "cerebellum");
    assert.equal(assignSectorFromName("Learning"), "parietal");
  });

  it("lists children of a parent, not siblings or roots", () => {
    const kids = childrenOf(tree, "par");
    assert.deepEqual(
      kids.map((c) => c.id).sort(),
      ["dates", "med"],
    );
    assert.deepEqual(
      childrenOf(tree, null, "temporal").map((c) => c.id),
      ["fam"],
    );
  });

  it("walks ancestors and descendants", () => {
    assert.deepEqual(
      ancestorsOf(tree, "dates").map((c) => c.id),
      ["dates", "par", "fam"],
    );
    const down = descendantsOf(tree, "fam");
    assert.equal(down.has("par"), true);
    assert.equal(down.has("dates"), true);
    assert.equal(down.has("work"), false);
  });

  it("blocks moving a branch under itself or a descendant", () => {
    assert.equal(wouldCycle(tree, "fam", "fam"), true);
    assert.equal(wouldCycle(tree, "fam", "dates"), true);
    assert.equal(wouldCycle(tree, "par", "work"), false);
    assert.equal(wouldCycle(tree, "par", null), false);
  });

  it("builds a breadcrumb from overview through the selected branch", () => {
    const crumbs = breadcrumbPath(tree, "temporal", "dates");
    assert.deepEqual(
      crumbs.map((c) => c.label),
      ["Brain Overview", "Temporal lobe", "Family", "Parents", "Important dates"],
    );
  });

  it("lets a user rename a default main branch without changing its id", () => {
    const merged = mergeSectors([{ id: "frontal", label: "Sparks", kicker: "Wild thoughts", emoji: "⚡", color: "gold" }]);
    const ideas = merged.find((s) => s.id === "frontal");
    assert.equal(ideas?.label, "Sparks");
    assert.equal(ideas?.kicker, "Wild thoughts");
    assert.equal(ideas?.emoji, "⚡");
    const crumbs = breadcrumbPath(tree, "frontal", null, merged);
    assert.equal(crumbs[1]?.label, "Sparks");
    const saved = overridesFromSectors(merged);
    assert.equal(saved.length, 1);
    assert.equal(saved[0]?.id, "frontal");
  });
});
