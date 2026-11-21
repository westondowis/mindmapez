import assert from "node:assert/strict";
import { describe, test } from "node:test";
import JSZip from "jszip";
import { listArchive } from "./archive.ts";
import { scrapeDocText } from "./doc-scrape.ts";
import { docxToDoc, docxXmlToDoc } from "./docx.ts";
import { epubToDoc } from "./epub.ts";
import { parseGeoJson, parseGpx, parseKml, haversineKm } from "./geo.ts";
import { bridgeShim, buildHtmlAppSrcdoc, handleBridgeMessage, HTML_APP_CSP, HTML_APP_SANDBOX, type BridgeContext } from "./html-app.ts";
import { buildIcs, parseIcs } from "./ics.ts";
import { markdownOutline, markdownToHtml } from "./markdown.ts";
import { decodeWords, parseEml, splitMbox } from "./mime.ts";
import { rtfToText } from "./rtf.ts";
import { htmlToPlainText, sanitizeHtml } from "./sanitize-html.ts";
import { jsonToTree, xmlToTree } from "./tree.ts";
import { parseVcards } from "./vcard.ts";
import { parseXml, XmlError } from "./xml-lite.ts";
import { parseYamlSubset, YamlUnsupported } from "./yaml-lite.ts";
import { openZip } from "./zip-guard.ts";

describe("xml-lite", () => {
  test("parses elements, attributes, CDATA and entities", () => {
    const doc = parseXml(`<?xml version="1.0"?><!-- c --><a x="1 &amp; 2"><b>hi &lt;there&gt;</b><c/><![CDATA[<raw>]]></a>`);
    const a = doc.children[0]!;
    assert.equal(a.attrs.x, "1 & 2");
    assert.equal(a.children[0]!.text, "hi <there>");
    assert.equal(a.text, "<raw>");
  });
  test("rejects entity declarations (billion laughs) and enforces node/depth caps", () => {
    assert.throws(() => parseXml(`<!DOCTYPE x [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;">]><x>&b;</x>`), XmlError);
    assert.throws(() => parseXml("<a>" + "<b/>".repeat(50) + "</a>", { maxBytes: 1e6, maxNodes: 20, maxDepth: 64 }), /too many/);
    assert.throws(() => parseXml("<a>".repeat(70) + "</a>".repeat(70)), /nested too deeply/);
    assert.throws(() => parseXml("x".repeat(11 * 1024 * 1024)), /10 MB/);
  });
  test("xml → tree with attributes and text", () => {
    const t = xmlToTree(parseXml(`<cfg env="prod"><port>80</port></cfg>`).children[0]!);
    assert.equal(t.tree.k, "cfg");
    assert.deepEqual(t.tree.c!.map((c) => c.k), ["@env", "port"]);
  });
});

describe("yaml subset", () => {
  test("maps, lists, scalars, comments, block scalars", () => {
    const v = parseYamlSubset(`# config
name: Brain   # trailing
port: 8080
debug: false
ratio: 0.5
empty:
tags:
  - golf
  - "real estate"
people:
  - name: Ann
    age: 30
  - name: Bo
note: |
  line one
  line two
`);
    assert.deepEqual(v, { name: "Brain", port: 8080, debug: false, ratio: 0.5, empty: null, tags: ["golf", "real estate"], people: [{ name: "Ann", age: 30 }, { name: "Bo" }], note: "line one\nline two" });
  });
  test("anchors, flow collections and multi-docs fall back", () => {
    assert.throws(() => parseYamlSubset("a: &x 1\nb: *x"), YamlUnsupported);
    assert.throws(() => parseYamlSubset("a: [1, 2]"), YamlUnsupported);
    assert.throws(() => parseYamlSubset("a: 1\n---\nb: 2"), YamlUnsupported);
  });
  test("json → tree caps nodes", () => {
    const big = Array.from({ length: 20_000 }, (_, i) => i);
    const t = jsonToTree(big);
    assert.equal(t.truncated, true);
    assert.ok(t.nodes <= 12_000);
  });
});

describe("documents", () => {
  test("RTF control words, unicode and hex escapes; skips font tables", () => {
    const t = rtfToText(String.raw`{\rtf1\ansi{\fonttbl{\f0 Arial;}}{\*\generator Word;}\f0 Hello \b World\b0\par Caf\'e9 \u8364? done\tab x}`);
    assert.equal(t, "Hello World\nCafé € done\tx");
    assert.throws(() => rtfToText("plain"));
  });
  test(".doc best-effort scrape finds UTF-16 text runs", () => {
    const s = "This is a legacy Word document body.";
    const bytes = new Uint8Array(200 + s.length * 2);
    for (let i = 0; i < s.length; i++) bytes[100 + i * 2] = s.charCodeAt(i);
    assert.match(scrapeDocText(bytes), /legacy Word document/);
  });
  test("docx paragraphs, headings, lists and tables", async () => {
    const xml = `<?xml version="1.0"?><w:document xmlns:w="w"><w:body>
      <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Intro</w:t></w:r></w:p>
      <w:p><w:r><w:t xml:space="preserve">Hello </w:t></w:r><w:r><w:t>&amp; welcome</w:t></w:r></w:p>
      <w:p><w:pPr><w:numPr/></w:pPr><w:r><w:t>Item</w:t></w:r></w:p>
      <w:tbl><w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
    </w:body></w:document>`;
    const d = docxXmlToDoc(xml);
    assert.equal(d.text, "Intro\nHello & welcome\nItem\nA\tB");
    assert.deepEqual(d.outline, [{ level: 1, text: "Intro", anchor: "intro" }]);
    assert.match(d.html, /<h1 id="intro">Intro<\/h1>/);
    assert.match(d.html, /<ul><li>Item<\/li>|<ul>\n<li>Item<\/li>/);
    const zip = new JSZip();
    zip.file("word/document.xml", xml);
    zip.file("docProps/core.xml", "<cp><dc:title>My Doc</dc:title></cp>");
    const g = await openZip(await zip.generateAsync({ type: "uint8array" }));
    assert.equal((await docxToDoc(g)).title, "My Doc");
  });
  test("epub spine order, outline and sanitized chapters", async () => {
    const zip = new JSZip();
    zip.file("META-INF/container.xml", `<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>`);
    zip.file("OEBPS/content.opf", `<package><metadata><dc:title>Book</dc:title></metadata><manifest><item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c2"/><itemref idref="c1"/></spine></package>`);
    zip.file("OEBPS/ch1.xhtml", `<html><body><h1>One</h1><p>First</p></body></html>`);
    zip.file("OEBPS/text/ch2.xhtml", `<html><body><h1>Two</h1><p onclick="x()">Second<script>alert(1)</script></p></body></html>`);
    const d = await epubToDoc(await openZip(await zip.generateAsync({ type: "uint8array" })));
    assert.equal(d.title, "Book");
    assert.deepEqual(d.outline.map((o) => o.text), ["Two", "One"]);
    assert.ok(!/script|onclick|alert/.test(d.html));
    assert.match(d.text, /Two\nSecond[\s\S]*One\nFirst/);
  });
  test("markdown subset is escaped; links http(s) only", () => {
    const html = markdownToHtml("# Title\n\nSome **bold** <script>x</script> [ok](https://a.test) [bad](javascript:alert(1))\n\n- [x] done\n- todo\n\n```\n<b>code</b>\n```");
    assert.match(html, /<h1 id="title">Title<\/h1>/);
    assert.match(html, /<strong>bold<\/strong> &lt;script&gt;/);
    assert.match(html, /href="https:\/\/a.test"/);
    assert.ok(!html.includes("javascript:"));
    assert.match(html, /☑ done/);
    assert.match(html, /&lt;b&gt;code&lt;\/b&gt;/);
    assert.deepEqual(markdownOutline("# A\n## B\n```\n# not\n```"), [{ level: 1, text: "A", anchor: "a" }, { level: 2, text: "B", anchor: "b" }]);
  });
});

describe("HTML sanitizer", () => {
  test("strips scripts, handlers, javascript: links, styles, iframes and remote images", () => {
    const out = sanitizeHtml(`<p onclick="evil()" style="x">Hi <a href="javascript:alert(1)">x</a> <a href="JaVaScRiPt&colon;alert(1)">y</a> <a href="https://ok.test">ok</a></p><script>alert(1)</script><iframe src="https://x"></iframe><img src="https://track.test/p.gif"><img src="data:image/png;base64,AAAA"><svg onload="x"><a href="x"/></svg><style>body{}</style>`);
    assert.ok(!/script|onclick|style=|javascript|iframe|track\.test|svg|onload/i.test(out), out);
    assert.match(out, /<a href="https:\/\/ok.test" rel="noopener noreferrer nofollow" target="_blank">ok<\/a>/);
    assert.match(out, /<img src="data:image\/png;base64,AAAA">/);
    assert.match(out, /<p>Hi /);
  });
  test("unbalanced and nested tags are closed; text is escaped", () => {
    assert.equal(sanitizeHtml("<b><i>x</b> 1 < 2"), "<b><i>x</i></b> 1 &lt; 2");
    assert.equal(htmlToPlainText("<p>a</p><p>b<br>c</p>"), "a\nb\nc");
  });
});

describe("calendar (ics)", () => {
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VTIMEZONE", "TZID:America/Denver", "BEGIN:STANDARD", "DTSTART:19701101T020000", "END:STANDARD", "END:VTIMEZONE",
    "BEGIN:VEVENT", "UID:abc@x", "DTSTART;TZID=America/Denver:20261124T090000", "DTEND;TZID=America/Denver:20261124T093000",
    "SUMMARY:Seller call\\, Jim", "LOCATION:https://zoom.us/j/123?pwd=x", "DESCRIPTION:Bring the comps\\nand the offer", " continued", "RRULE:FREQ=WEEKLY;BYDAY=TU",
    "ORGANIZER;CN=Weston:mailto:w@x.test", "ATTENDEE;CN=Jim:mailto:j@x.test", "BEGIN:VALARM", "TRIGGER:-PT10M", "DESCRIPTION:alarm", "END:VALARM", "END:VEVENT",
    "BEGIN:VEVENT", "UID:d2", "DTSTART;VALUE=DATE:20261225", "SUMMARY:Holiday", "URL:javascript:alert(1)", "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  test("unfolds, keeps TZID, all-day, https join links only, ignores alarms", () => {
    const [a, b] = parseIcs(ics);
    assert.equal(a!.summary, "Seller call, Jim");
    assert.equal(a!.start, "2026-11-24T09:00:00");
    assert.equal(a!.tz, "America/Denver");
    assert.equal(a!.joinUrl, "https://zoom.us/j/123?pwd=x");
    assert.equal(a!.description, "Bring the comps\nand the offercontinued");
    assert.equal(a!.rrule, "FREQ=WEEKLY;BYDAY=TU");
    assert.equal(a!.organizer, "Weston");
    assert.deepEqual(a!.attendees, ["Jim"]);
    assert.equal(b!.allDay, true);
    assert.equal(b!.start, "2026-12-25");
    assert.equal(b!.joinUrl, undefined);
  });
  test("export round-trips", () => {
    const again = parseIcs(buildIcs(parseIcs(ics)));
    assert.equal(again[0]!.summary, "Seller call, Jim");
    assert.equal(again[0]!.tz, "America/Denver");
    assert.equal(again[1]!.allDay, true);
  });
});

describe("vCard", () => {
  test("3.0 and 4.0 cards, folding, QP, photo cap", () => {
    const big = "A".repeat(400_000);
    const v = parseVcards([
      "BEGIN:VCARD", "VERSION:3.0", "N:Doe;Jane;;;", "FN:Jane Doe", "ORG:Acme;Sales", "TEL;TYPE=CELL:(555) 010-1234", "EMAIL:jane@x.test",
      "PHOTO;ENCODING=b;TYPE=JPEG:" + big, "NOTE:long", " er note", "END:VCARD",
      "BEGIN:VCARD", "VERSION:4.0", "FN:Bob", "TEL;VALUE=uri:tel:+15550100", "PHOTO:https://img.test/b.jpg", "END:VCARD",
      "BEGIN:VCARD", "VERSION:2.1", "N;ENCODING=QUOTED-PRINTABLE;CHARSET=UTF-8:M=C3=BCller;Ann", "END:VCARD",
    ].join("\r\n"));
    assert.equal(v.rows.length, 3);
    assert.equal(v.rows[0]![0], "Jane Doe");
    assert.equal(v.rows[0]![3], "Acme · Sales");
    assert.equal(v.rows[0]![14], "longer note");
    assert.equal(v.photosDropped, 1);
    assert.equal(v.rows[1]![11], "https://img.test/b.jpg");
    assert.equal(v.rows[2]![2], "Müller");
  });
});

describe("email", () => {
  const eml = [
    "From: =?UTF-8?B?SsO8cmdlbg==?= <j@x.test>", "To: a@x.test, \"B, C\" <b@x.test>", "Subject: =?utf-8?Q?Caf=C3=A9_offer?=", "Date: Tue, 24 Nov 2026 09:00:00 -0700",
    "MIME-Version: 1.0", 'Content-Type: multipart/mixed; boundary="mix"', "", "--mix", 'Content-Type: multipart/alternative; boundary="alt"', "", "--alt",
    "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: quoted-printable", "", "Price is =E2=82=AC10=", "0k", "--alt", "Content-Type: text/html", "",
    '<p onclick="x">Hi<img src="https://track.test/p.gif"></p><script>alert(1)</script>', "--alt--", "--mix",
    'Content-Type: application/pdf; name="offer.pdf"', "Content-Disposition: attachment; filename=\"offer.pdf\"", "Content-Transfer-Encoding: base64", "", "JVBERi0xLjQK", "--mix--", "",
  ].join("\r\n");
  test("multipart, QP, RFC 2047, attachments listed, HTML sanitized", () => {
    const m = parseEml(eml);
    assert.equal(m.from, "Jürgen <j@x.test>");
    assert.deepEqual(m.to, ["a@x.test", '"B, C" <b@x.test>']);
    assert.equal(m.subject, "Café offer");
    assert.equal(m.date, "2026-11-24T16:00:00.000Z");
    assert.equal(m.text.trim(), "Price is €100k");
    assert.deepEqual(m.attachments, [{ name: "offer.pdf", mime: "application/pdf", bytes: 9 }]);
    assert.ok(m.html && !/script|onclick|track\.test/.test(m.html));
    assert.equal(decodeWords("=?ISO-8859-1?Q?a?= =?ISO-8859-1?Q?b?="), "ab");
  });
  test("mbox split with >From unescaping and message cap", () => {
    const box = "From a@x Mon Jan 1 00:00:00 2026\nSubject: one\n\n>From the start\n\nFrom b@x Mon Jan 1 00:00:00 2026\nSubject: two\n\nbody\n";
    const r = splitMbox(box);
    assert.equal(r.messages.length, 2);
    assert.match(r.messages[0]!, /^Subject: one\n\nFrom the start/);
    assert.equal(splitMbox(box, 1).truncated, true);
  });
});

describe("geo", () => {
  test("KML points/lines, GPX tracks, GeoJSON, bbox and length", () => {
    const kml = parseKml(`<kml><Document><Placemark><name>Lot 54</name><Point><coordinates>-104.9,38.8,0</coordinates></Point></Placemark><Placemark><name>Road</name><LineString><coordinates>-105,39 -105,39.01</coordinates></LineString></Placemark></Document></kml>`);
    assert.equal(kml.features.length, 2);
    assert.deepEqual(kml.features[0]!.coords, [[38.8, -104.9]]);
    assert.ok(Math.abs(kml.features[1]!.lengthKm! - 1.112) < 0.01);
    assert.deepEqual(kml.bbox, [38.8, -105, 39.01, -104.9]);
    const gpx = parseGpx(`<gpx><wpt lat="40" lon="-105"><name>Start</name></wpt><trk><name>Run</name><trkseg><trkpt lat="40" lon="-105"/><trkpt lat="40.01" lon="-105"/><trkpt lat="999" lon="0"/></trkseg></trk></gpx>`);
    assert.equal(gpx.features[1]!.coords.length, 2, "invalid points are skipped");
    const gj = parseGeoJson({ type: "FeatureCollection", features: [{ type: "Feature", properties: { name: "P" }, geometry: { type: "Point", coordinates: [-105, 40] } }] });
    assert.equal(gj.features[0]!.name, "P");
    assert.ok(Math.abs(haversineKm([0, 0], [0, 1]) - 111.2) < 0.2);
  });
});

describe("archives", () => {
  test("lists entries with previewability, never nested zips", async () => {
    const zip = new JSZip();
    zip.file("a/notes.md", "# hi");
    zip.file("a/inner.zip", "PK");
    zip.file("b/photo.png", "x");
    const g = await openZip(await zip.generateAsync({ type: "uint8array" }));
    const l = listArchive(g);
    const by = Object.fromEntries(l.entries.map((e) => [e.path, e.previewable]));
    assert.equal(by["a/notes.md"], true);
    assert.equal(by["a/inner.zip"], false);
    assert.equal(by["b/photo.png"], true);
  });
});

describe("html_app sandbox and bridge", () => {
  test("srcdoc puts CSP + bridge first and strips the page's own CSP/base/refresh", () => {
    const doc = buildHtmlAppSrcdoc(`<html><head><meta http-equiv="Content-Security-Policy" content="default-src *"><base href="https://evil.test/"><meta http-equiv="refresh" content="0;url=https://evil.test"><script>fetch('https://evil.test')</script></head><body>x</body></html>`, "N1");
    const head = doc.slice(doc.indexOf("<head>") + 6);
    assert.ok(head.startsWith(`<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${HTML_APP_CSP}">`));
    assert.ok(!doc.includes("default-src *") && !doc.includes("<base") && !/http-equiv="refresh"/i.test(doc));
    assert.match(HTML_APP_CSP, /connect-src 'none'/);
    assert.equal(HTML_APP_SANDBOX.includes("allow-same-origin"), false);
    assert.equal(HTML_APP_SANDBOX.includes("allow-popups"), false);
    assert.equal(HTML_APP_SANDBOX.includes("allow-top-navigation"), false);
    assert.ok(buildHtmlAppSrcdoc("<p>bare</p>", "N").startsWith("<!doctype html><html><head><meta charset"));
    assert.match(bridgeShim('x"</script>'), /x\\"<\/script>/);
  });
  const frame = { id: "frame" };
  const ctx = (): BridgeContext => ({ nonce: "N1", frameWindow: frame, kv: { a: "1" }, recent: [], now: 1000 });
  const msg = (data: object, over: Partial<{ source: unknown; origin: string }> = {}) => ({ source: frame, origin: "null", data: { ns: "brain", v: 1, nonce: "N1", reqId: 1, ...data }, ...over });
  test("drops wrong source, origin, namespace or nonce silently", () => {
    assert.equal(handleBridgeMessage(msg({ op: "get", key: "a" }, { source: {} }), ctx()), null);
    assert.equal(handleBridgeMessage(msg({ op: "get", key: "a" }, { origin: "https://evil.test" }), ctx()), null);
    assert.equal(handleBridgeMessage(msg({ op: "get", key: "a", nonce: "guess" }), ctx()), null);
    assert.equal(handleBridgeMessage(msg({ op: "get", key: "a", ns: "other" }), ctx()), null);
  });
  test("get/set/remove/keys with size limits and a 50 ops/sec cap", () => {
    const c = ctx();
    assert.equal(handleBridgeMessage(msg({ op: "get", key: "a" }), c)!.reply.value, "1");
    const set = handleBridgeMessage(msg({ op: "set", key: "b", value: "2" }), c)!;
    assert.deepEqual(set.kv, { a: "1", b: "2" });
    assert.equal(handleBridgeMessage(msg({ op: "set", key: "big", value: "x".repeat(33_000) }), c)!.reply.error, "too_large");
    assert.equal(handleBridgeMessage(msg({ op: "set", key: "k".repeat(129), value: "1" }), c)!.reply.error, "bad_request");
    assert.equal(handleBridgeMessage(msg({ op: "eval" }), c)!.reply.error, "bad_request");
    const r = ctx();
    let limited = 0;
    for (let i = 0; i < 60; i++) if (handleBridgeMessage(msg({ op: "keys" }), r)!.reply.error === "rate_limited") limited++;
    assert.equal(limited, 10);
    r.now += 1001;
    assert.equal(handleBridgeMessage(msg({ op: "keys" }), r)!.reply.ok, true);
  });
});
