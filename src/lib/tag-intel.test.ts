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

import { MAX_AUTO_TAGS, sanitizeGeneratedTags, scoreKeywords } from "./tag-intel.ts";

describe("scoreKeywords (strict ranking)", () => {
  const text = "Negotiations with Marisa went well. It's the vacant land call script that really matters. We should keep the script simple and ask about financing.";
  const ranked = scoreKeywords(text, "Vacant land call script").map((k) => k.word);
  it("never returns contraction fragments, articles or fillers", () => {
    for (const bad of ["it's", "its", "the", "that", "really", "should", "about", "keep", "with", "went", "well", "ask"]) assert.ok(!ranked.includes(bad), bad);
  });
  it("ranks title words and proper nouns first", () => {
    assert.ok(ranked.includes("script"));
    assert.ok(ranked.indexOf("script") < ranked.indexOf("financing") || !ranked.includes("financing"));
    assert.ok(ranked.includes("marisa"));
  });
  it("drops weak one-off words from later sentences", () => assert.ok(!ranked.includes("simple")));
  it("offers capitalised neighbours as one phrase", () => {
    const r = scoreKeywords("Notes on Seller Financing today. Seller Financing deals need a down payment.", "").map((k) => k.word);
    assert.ok(r.includes("seller financing"));
  });
  it("keeps 3-letter acronyms only in capitals", () => {
    assert.ok(scoreKeywords("Check the SEO plan for the site. SEO matters.", "SEO plan").some((k) => k.word === "seo"));
    assert.ok(!scoreKeywords("the cat sat on the mat. cat naps.", "").some((k) => k.word === "cat"));
  });
});

describe("sanitizeGeneratedTags", () => {
  it("removes filler, contractions and tiny tokens and caps at 4", () => {
    const out = sanitizeGeneratedTags(["it's", "the", "golf", "thing", "ab", "Seller Financing", "regarding", "irons", "putting", "driver"]);
    assert.deepEqual(out, ["golf", "Seller Financing", "irons", "putting"]);
  });
  it("prefers tags the text actually mentions", () => {
    const out = sanitizeGeneratedTags(["confidence", "golf", "mindset"], 2, "My golf swing needs work");
    assert.equal(out[0], "golf");
    assert.equal(out.length, 2);
  });
});

describe("selectAutoTags cap", () => {
  it("never returns more than MAX_AUTO_TAGS and ranks existing tags first", () => {
    const text = "Golf irons driver putting wedges chipping. Golf practice with irons and driver.";
    const out = selectAutoTags({
      text,
      title: "Golf irons driver",
      candidates: ["golf", "irons", "driver", "putting", "wedges", "chipping", "practice"],
      knownTags: [{ name: "wedges", tier: "primary", manual: true }],
      branchNames: ["Golf"],
      recurrence: () => 3,
      max: 10,
    });
    assert.equal(out.length, MAX_AUTO_TAGS);
    assert.deepEqual(out.slice(0, 2), ["wedges", "golf"]);
  });
});
