import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  customEmojiToken,
  emojiText,
  extractSvg,
  isCustomEmojiValue,
  normalizeEmojiValue,
  parseCustomEmojiToken,
  sanitizeSvg,
  svgDataUri,
} from "./custom-emoji.ts";
import { generateEmojiSvg, matchGlyphs } from "./emoji-generator.ts";
import { normalizeStrokes, refineStrokes, simplifyRdp, sketchToSvg, smoothChaikin, strokesBounds } from "./sketch.ts";

const ID = "0b5c2f9e-4a8d-4c1e-9f3a-2d7b6e1a9c44";

describe("custom: tokens", () => {
  it("round-trips an id", () => {
    const token = customEmojiToken(ID);
    assert.equal(token, `custom:${ID}`);
    assert.equal(parseCustomEmojiToken(token), ID);
    assert.equal(parseCustomEmojiToken(`  ${token} `), ID);
    assert.ok(isCustomEmojiValue(token));
  });

  it("treats normal emoji and malformed tokens as not custom", () => {
    assert.equal(parseCustomEmojiToken("🧠"), null);
    assert.equal(parseCustomEmojiToken(null), null);
    assert.equal(parseCustomEmojiToken("custom:"), null);
    assert.equal(parseCustomEmojiToken("custom:../../etc"), null);
    assert.equal(parseCustomEmojiToken("custom:<script>"), null);
    assert.throws(() => customEmojiToken("bad id!"));
  });

  it("normalizes values bound for the emoji column", () => {
    assert.equal(normalizeEmojiValue(`custom:${ID}`, "🧠"), `custom:${ID}`);
    assert.equal(normalizeEmojiValue("custom:nope!", "🧠"), "🧠");
    assert.equal(normalizeEmojiValue("", "🧠"), "🧠");
    assert.equal(normalizeEmojiValue("👨‍👩‍👧‍👦", "🧠"), "👨‍👩‍👧‍👦"); // 11 UTF-16 units survive
    assert.equal(Array.from(normalizeEmojiValue("x".repeat(40), "🧠")).length, 16);
  });

  it("text-only fallback hides tokens", () => {
    assert.equal(emojiText(`custom:${ID}`), "✨");
    assert.equal(emojiText("⛳"), "⛳");
    assert.equal(emojiText(null), "");
  });
});

describe("sanitizeSvg", () => {
  const wrap = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${inner}</svg>`;

  it("keeps whitelisted shapes and gradients", () => {
    const out = sanitizeSvg(wrap(`<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><circle cx="32" cy="32" r="20" fill="url(#g)" stroke="#123456" stroke-width="3"/>`));
    assert.ok(out);
    assert.match(out!, /<circle cx="32" cy="32" r="20" fill="url\(#g\)" stroke="#123456" stroke-width="3"\/>/);
    assert.match(out!, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 64 64" width="64" height="64">/);
  });

  it("drops script, foreignObject, event handlers and links", () => {
    const evil = wrap(
      `<script>alert(1)</script><foreignObject><div>hi</div><circle r="5"/></foreignObject>` +
        `<rect x="1" y="1" width="5" height="5" onload="alert(1)" onclick="x()"/>` +
        `<a href="javascript:alert(1)"><path d="M0 0L10 10"/></a>` +
        `<image href="https://evil.example/x.png"/><use href="#x"/><style>*{}</style>` +
        `<path d="M1 1L2 2" fill="url(https://evil.example/#a)" style="fill:url(x)" xlink:href="#a"/>`,
    );
    const out = sanitizeSvg(evil)!;
    assert.ok(out);
    for (const bad of ["script", "alert", "foreignObject", "onload", "onclick", "href", "javascript", "image", "use", "style", "evil", "<div", "<a"]) {
      assert.ok(!out.includes(bad), `should not contain ${bad}: ${out}`);
    }
    assert.match(out, /<rect x="1" y="1" width="5" height="5"\/>/);
    assert.match(out, /<path d="M1 1L2 2"\/>/);
    assert.ok(!out.includes("M0 0L10 10"), "children of a dropped element are dropped too");
  });

  it("rejects non-svg, nested svg roots, entity tricks, and empty drawings", () => {
    assert.equal(sanitizeSvg("<div>no</div>"), null);
    assert.equal(sanitizeSvg(42), null);
    assert.equal(sanitizeSvg(wrap("")), null);
    assert.equal(sanitizeSvg(wrap("<g></g>")), null);
    const ent = sanitizeSvg(wrap(`<path d="M0 0" fill="&#106;avascript"/>`))!;
    assert.ok(!ent.includes("&"));
    const nested = sanitizeSvg(wrap(`<svg onload="x"><circle r="2"/></svg><circle r="3"/>`))!;
    assert.ok(!nested.includes("onload"));
    assert.equal((nested.match(/<svg/g) ?? []).length, 1);
  });

  it("extracts the svg from a model reply and builds a data uri", () => {
    const reply = "Here you go:\n```svg\n" + wrap(`<circle cx="1" cy="1" r="1"/>`) + "\n```";
    const svg = extractSvg(reply);
    assert.ok(svg && svg.startsWith("<svg"));
    assert.ok(svgDataUri("<svg/>").startsWith("data:image/svg+xml;charset=utf-8,%3Csvg"));
  });
});

describe("sketch refine", () => {
  it("RDP drops collinear points and keeps corners", () => {
    const line = Array.from({ length: 20 }, (_, i) => ({ x: i, y: 0 }));
    assert.deepEqual(simplifyRdp(line, 0.5), [{ x: 0, y: 0 }, { x: 19, y: 0 }]);
    const corner = [...line, ...Array.from({ length: 10 }, (_, i) => ({ x: 19, y: i + 1 }))];
    assert.equal(simplifyRdp(corner, 0.5).length, 3);
  });

  it("Chaikin keeps open endpoints", () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    const s = smoothChaikin(pts, 2);
    assert.deepEqual(s[0], pts[0]);
    assert.deepEqual(s[s.length - 1], pts[2]);
    assert.ok(s.length > pts.length);
  });

  it("normalizes into the padded 64 box, centered, aspect preserved", () => {
    const norm = normalizeStrokes([[{ x: 100, y: 200 }, { x: 300, y: 300 }]]);
    const b = strokesBounds(norm)!;
    assert.ok(Math.abs(b.minX - 10) < 1e-9 && Math.abs(b.maxX - 54) < 1e-9);
    assert.ok(Math.abs((b.minY + b.maxY) / 2 - 32) < 1e-9);
    assert.ok(Math.abs(b.maxY - b.minY - 22) < 1e-9);
  });

  it("detects closed outlines and produces a sanitizer-clean svg", () => {
    const circle = Array.from({ length: 48 }, (_, i) => ({ x: 50 + 40 * Math.cos((i / 47) * Math.PI * 2), y: 50 + 40 * Math.sin((i / 47) * Math.PI * 2) }));
    const refined = refineStrokes([circle]);
    assert.equal(refined[0]!.closed, true);
    const svg = sketchToSvg([circle, [{ x: 50, y: 50 }]])!;
    assert.equal(sanitizeSvg(svg), svg);
    assert.match(svg, /<circle /);
    assert.equal(sketchToSvg([]), null);
  });
});

describe("deterministic generator", () => {
  it("is stable for the same text and differs for different text", () => {
    const a = generateEmojiSvg("golf putter").svg;
    assert.equal(generateEmojiSvg("  Golf   Putter ").svg, a);
    assert.notEqual(generateEmojiSvg("golf club").svg, a);
  });

  it("reads compounds head-last and output passes the sanitizer", () => {
    assert.deepEqual(matchGlyphs("family tree"), ["tree", "family"]);
    assert.deepEqual(matchGlyphs("real estate key"), ["key", "house"]);
    assert.deepEqual(matchGlyphs("golf putter"), ["golf"]);
    for (const d of ["golf putter", "real estate key", "family tree", "zebra stripes", ""]) {
      const { svg } = generateEmojiSvg(d);
      assert.equal(sanitizeSvg(svg), svg, d);
    }
  });
});
