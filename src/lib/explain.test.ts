import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleanScript, contentHash, fitScript, formatClock, localScript, localSummary, nextSpeed, parseSummaryJson, wordCountOf } from "./explain.ts";

describe("explain helpers", () => {
  it("hash changes with content", () => {
    assert.notEqual(contentHash("a"), contentHash("b"));
    assert.equal(contentHash("same"), contentHash("same"));
  });
  it("parses fenced JSON and rejects junk", () => {
    const r = parseSummaryJson('```json\n{"summary":"Short.","bullets":["- one","two"]}\n```');
    assert.deepEqual(r, { summary: "Short.", bullets: ["one", "two"] });
    assert.equal(parseSummaryJson("nope"), null);
    assert.equal(parseSummaryJson('{"summary":""}'), null);
  });
  it("caps bullets at five", () => {
    const r = parseSummaryJson(JSON.stringify({ summary: "S.", bullets: ["1", "2", "3", "4", "5", "6", "7"] }));
    assert.equal(r?.bullets.length, 5);
  });
  it("local summary handles empty and short text", () => {
    assert.deepEqual(localSummary(""), { summary: "", bullets: [] });
    const r = localSummary("One thing happened. Another thing followed it closely today. A third detail matters here. Fourth is the longest sentence of them all by far.");
    assert.ok(r.summary.startsWith("One thing happened."));
    assert.ok(r.bullets.length >= 1 && r.bullets.length <= 4);
  });
  it("script is stripped of markdown and jargon", () => {
    const s = cleanScript("**Hello** there.\n- the mesh node holds it\n1. done");
    assert.ok(!/[*#-]/.test(s.replace(/-/g, "")), s);
    assert.ok(!/mesh|node/i.test(s));
  });
  it("fitScript trims on a sentence boundary", () => {
    const long = Array.from({ length: 60 }, (_, i) => `This is sentence number ${i} with some words.`).join(" ");
    const out = fitScript(long, 100);
    assert.ok(wordCountOf(out) <= 100);
    assert.ok(out.endsWith("."));
  });
  it("local script mentions the title and bullets", () => {
    const s = localScript("Quarterly goals", "We set targets.", ["Revenue up ten percent", "Hire two people"]);
    assert.match(s, /Quarterly goals/);
    assert.match(s, /revenue up ten percent/i);
  });
  it("speed cycles 1 -> 1.25 -> 1.5 -> 1 and clock formats", () => {
    assert.equal(nextSpeed(1), 1.25);
    assert.equal(nextSpeed(1.25), 1.5);
    assert.equal(nextSpeed(1.5), 1);
    assert.equal(formatClock(75), "1:15");
    assert.equal(formatClock(NaN), "0:00");
  });
});
