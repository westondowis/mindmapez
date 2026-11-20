import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EMOJI_ROWS } from "./emoji-data.ts";
import { EMOJI_CATEGORIES, entriesInCategory, parseEmojiRows, searchEmojiEntries } from "./emoji-search.ts";

const entries = parseEmojiRows(EMOJI_ROWS);
const find = (q: string, n = 30) => searchEmojiEntries(entries, q, n).map((e) => e.emoji);

describe("emoji library", () => {
  it("covers every Unicode group without skin-tone variants", () => {
    assert.ok(entries.length > 1500, `only ${entries.length}`);
    for (const c of EMOJI_CATEGORIES) assert.ok(entriesInCategory(entries, c.id).length > 30, c.id);
    assert.ok(!entries.some((e) => /skin tone/.test(e.name)));
    assert.equal(new Set(entries.map((e) => e.emoji)).size, entries.length);
  });

  it("finds by name and keyword", () => {
    assert.ok(find("dog").includes("🐶"));
    assert.ok(find("golf").includes("⛳"));
    assert.ok(find("pizza").includes("🍕"));
    assert.ok(find("united states").includes("🇺🇸"));
    assert.ok(find("red heart").includes("❤️"));
  });

  it("uses synonyms on word boundaries", () => {
    const re = find("real estate");
    assert.ok(re.includes("🏠") && re.includes("🔑"));
    assert.ok(!re.includes("🙈"), "monkey must not match key");
    assert.ok(find("money").includes("💰"));
    assert.ok(find("putter").includes("⛳"));
  });

  it("falls back to any-word matches and finds pasted emoji", () => {
    assert.ok(find("golf zzzqqq").includes("⛳"));
    assert.deepEqual(find("🐶"), ["🐶"]);
    assert.deepEqual(find("   "), []);
    assert.deepEqual(find("qqqzzzxx"), []);
  });
});
