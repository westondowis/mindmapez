import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { escapeLike, likePatterns } from "./search-tokens.ts";

describe("likePatterns", () => {
  it("drops stop words and short words, longest first", () => {
    assert.deepEqual(likePatterns("What did I learn about my golf swing?"), ["%learn%", "%swing%", "%golf%"]);
  });
  it("returns nothing for a question with no usable words", () => {
    assert.deepEqual(likePatterns("how is it?"), []);
  });
  it("escapes LIKE wildcards and caps the count", () => {
    assert.equal(escapeLike("50%_off"), "50\\%\\_off");
    assert.equal(likePatterns("alpha bravo charlie delta echo foxtrot golf hotel india juliet", 4).length, 4);
  });
});
