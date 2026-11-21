import assert from "node:assert/strict";
import { test } from "node:test";
import { CsvParser, detectDelimiter, parseCsv } from "./csv.ts";

test("quotes, escaped quotes, embedded CRLF and BOM", () => {
  const rows = parseCsv('\uFEFFname,note\r\n"Doe, Jane","said ""hi""\r\nthen left"\r\nBob,plain\r\n');
  assert.deepEqual(rows, [["name", "note"], ["Doe, Jane", 'said "hi"\r\nthen left'], ["Bob", "plain"]]);
});

test("delimiter detection: tab, semicolon, pipe", () => {
  assert.equal(detectDelimiter("a\tb\tc\n1\t2\t3"), "\t");
  assert.equal(detectDelimiter("a;b;c\n1;2;3"), ";");
  assert.equal(detectDelimiter("a|b\n1|2"), "|");
  assert.equal(detectDelimiter('"x,y";b\n"1,2";3'), ";");
});

test("ragged rows are kept as-is", () => {
  assert.deepEqual(parseCsv("a,b,c\n1\n1,2,3,4\n"), [["a", "b", "c"], ["1"], ["1", "2", "3", "4"]]);
});

test("chunk boundaries inside quoted fields and between CR/LF", () => {
  const text = 'h1,h2\n"multi\nline, with comma","x""y"\r\nlast,row';
  for (let size = 1; size < text.length; size++) {
    const p = new CsvParser();
    const rows: string[][] = [];
    for (let i = 0; i < text.length; i += size) rows.push(...p.push(text.slice(i, i + size)));
    rows.push(...p.end());
    assert.deepEqual(rows, [["h1", "h2"], ["multi\nline, with comma", 'x"y'], ["last", "row"]], `chunk size ${size}`);
  }
});

test("12k-row file parses in under a second", () => {
  const lines = ["name,email,phone"];
  for (let i = 0; i < 12_000; i++) lines.push(`"Person ${i}",p${i}@ex.com,555-01${String(i).padStart(4, "0")}`);
  const t0 = performance.now();
  const rows = parseCsv(lines.join("\n"));
  assert.equal(rows.length, 12_001);
  assert.ok(performance.now() - t0 < 1000);
});
