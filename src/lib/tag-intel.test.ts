import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeTier,
  extractCandidates,
  isBlockedTag,
  mentions,
  normalizeTagName,
  selectAutoTags,
  shouldAutoDelete,
  tagSlug,
} from "./tag-intel.ts";

describe("blocklist", () => {
  for (const w of ["regarding", "thought", "about", "basically", "essentially", "really", "something", "wanted", "thing", "things", "just", "like", "maybe", "kind", "sort", "the", "and", "to", "of", "in"]) {
    it(`blocks "${w}"`, () => assert.equal(isBlockedTag(w), true));
  }
  it("blocks short tokens and numbers", () => {
    for (const w of ["ab", "x", "12", "2024", "--"]) assert.equal(isBlockedTag(w), true);
  });
  it("lets real topics through", () => {
    for (const w of ["golf", "negotiations", "seller financing", "cap rate"]) assert.equal(isBlockedTag(w), false);
  });
  it("blocks a phrase made only of filler", () => assert.equal(isBlockedTag("kind of thing"), true));
});

describe("extractCandidates", () => {
  it("drops filler, keeps content words by frequency", () => {
    const c = extractCandidates("I just thought about golf, basically golf grip and the grip again. Something about putting.");
    assert.deepEqual(c.slice(0, 2), ["golf", "grip"]);
    for (const bad of ["just", "thought", "about", "basically", "something", "the", "and"]) assert.ok(!c.includes(bad));
  });
});

describe("mentions / names", () => {
  it("matches whole words and simple plurals only", () => {
    assert.equal(mentions("Notes on negotiations today", "negotiation"), true);
    assert.equal(mentions("The golfer swung", "golf"), false);
  });
  it("normalizes names and slugs", () => {
    assert.equal(normalizeTagName("  #Seller   Financing "), "seller financing");
    assert.equal(tagSlug("Seller Financing!"), "seller-financing");
  });
});

describe("selectAutoTags", () => {
  const base = { text: "Call script for negotiations with the seller about financing", branchNames: [] as string[], knownTags: [] as { name: string; tier: "primary" | "secondary"; manual: boolean }[] };
  it("never creates a tag from a single isolated occurrence", () => {
    const out = selectAutoTags({ ...base, candidates: ["negotiations", "financing"], recurrence: () => 0 });
    assert.deepEqual(out, []);
  });
  it("creates a tag once it appears in another item too", () => {
    const out = selectAutoTags({ ...base, candidates: ["negotiations", "financing"], recurrence: (w) => (w === "negotiations" ? 1 : 0) });
    assert.deepEqual(out, ["negotiations"]);
  });
  it("always matches existing tags and branch names first", () => {
    const out = selectAutoTags({
      ...base,
      knownTags: [{ name: "seller", tier: "primary", manual: false }],
      branchNames: ["Call Script", "Golf"],
      candidates: ["negotiations"],
      recurrence: () => 5,
    });
    assert.deepEqual(out, ["seller", "call script", "negotiations"]);
  });
  it("never auto-selects a filler word, even if it recurs", () => {
    const out = selectAutoTags({ ...base, text: "just maybe something about stuff", candidates: ["just", "maybe", "something"], recurrence: () => 9 });
    assert.deepEqual(out, []);
  });
  it("lets a manually pinned filler tag match", () => {
    const out = selectAutoTags({ ...base, text: "that was just a thing", knownTags: [{ name: "thing", tier: "primary", manual: true }], candidates: [], recurrence: () => 0 });
    assert.deepEqual(out, ["thing"]);
  });
  it("ignores a stale non-manual tag that is now filler", () => {
    const out = selectAutoTags({ ...base, text: "just a thing", knownTags: [{ name: "thing", tier: "secondary", manual: false }], candidates: [], recurrence: () => 0 });
    assert.deepEqual(out, []);
  });
});

describe("computeTier", () => {
  it("promotes at 5 items", () => assert.equal(computeTier({ tier: "secondary", manual: false, items: 5, branches: 1 }), "primary"));
  it("promotes at 2 branches", () => assert.equal(computeTier({ tier: "secondary", manual: false, items: 2, branches: 2 }), "primary"));
  it("stays secondary below both", () => assert.equal(computeTier({ tier: "secondary", manual: false, items: 4, branches: 1 }), "secondary"));
  it("never moves a manual override", () => {
    assert.equal(computeTier({ tier: "secondary", manual: true, items: 50, branches: 9 }), "secondary");
    assert.equal(computeTier({ tier: "primary", manual: true, items: 0, branches: 0 }), "primary");
  });
  it("does not demote automatically", () => assert.equal(computeTier({ tier: "primary", manual: false, items: 1, branches: 1 }), "primary"));
  it("auto-deletes only orphaned non-manual tags", () => {
    assert.equal(shouldAutoDelete({ manual: false, items: 0 }), true);
    assert.equal(shouldAutoDelete({ manual: true, items: 0 }), false);
    assert.equal(shouldAutoDelete({ manual: false, items: 1 }), false);
  });
});
