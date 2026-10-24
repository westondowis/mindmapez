import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyFile,
  formatTextStat,
  htmlToText,
  ingestTextBlock,
  isTextFile,
  MAX_TEXT_CHARS,
  titleFromBody,
  titleFromFilename,
  wordCount,
} from "./ingest.ts";

describe("ingest text", () => {
  it("counts words and formats stats", () => {
    assert.equal(wordCount("one two  three"), 3);
    assert.equal(formatTextStat("one two three"), "3 words · 13 characters");
  });

  it("strips html into readable text", () => {
    const text = htmlToText("<h1>Lesson</h1><p>Keep the <b>shoulder</b> low.</p><script>alert(1)</script>");
    assert.match(text, /Lesson/);
    assert.match(text, /shoulder/);
    assert.doesNotMatch(text, /alert/);
  });

  it("treats a long paste as a text node, not a truncated 8k clip", () => {
    const block = "word ".repeat(5000).trim();
    const item = ingestTextBlock(block);
    assert.equal(item.kind, "text");
    assert.equal(item.truncated, false);
    assert.ok(item.body.length > 8000);
    assert.equal(item.body.split(/\s+/).length, 5000);
  });

  it("caps extremely large pastes instead of failing", () => {
    const block = "x".repeat(MAX_TEXT_CHARS + 50);
    const item = ingestTextBlock(block, "huge.txt");
    assert.equal(item.truncated, true);
    assert.equal(item.body.length, MAX_TEXT_CHARS);
    assert.match(item.warning ?? "", /400,000/);
  });

  it("detects a pasted url as a link", () => {
    const item = ingestTextBlock("https://example.com/article");
    assert.equal(item.kind, "link");
    assert.equal(item.sourceUrl, "https://example.com/article");
  });

  it("titles markdown files from the heading", () => {
    assert.equal(titleFromBody("# Seller financing notes\n\nDetails here."), "Seller financing notes");
    assert.equal(titleFromFilename("swing-thought.md"), "Swing Thought");
  });

  it("classifies files from the Files app", () => {
    const note = new File(["hello"], "journal.md", { type: "text/markdown" });
    const photo = new File([new Uint8Array([1, 2, 3])], "green.jpg", { type: "image/jpeg" });
    const pdf = new File([new Uint8Array([1])], "term-sheet.pdf", { type: "application/pdf" });
    assert.equal(isTextFile(note), true);
    assert.equal(classifyFile(note), "text");
    assert.equal(classifyFile(photo), "photo");
    assert.equal(classifyFile(pdf), "document");
  });
});
