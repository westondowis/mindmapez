import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";
import { inferColumnType, toE164, toIsoDate, parseNumber } from "./columns.ts";
import { detectDigestArchetype, withArchetype } from "./detect.ts";
import { normalizeRow } from "./normalize.ts";
import { summarize } from "./metrics.ts";
import { jsonToTableOrValue } from "./json.ts";
import { openXlsx, readXlsxSheet } from "./xlsx.ts";
import { openZip, safeArchivePath } from "./zip-guard.ts";
import { parseCsv } from "./csv.ts";
import { assertNoEntityDeclarations } from "./xml-scan.ts";

const rowsOf = (csv: string) => {
  const all = parseCsv(csv);
  return { headers: all[0]!, rows: all.slice(1) };
};

test("column types: email, phone, currency, date, image url, plain ids stay numbers", () => {
  assert.equal(inferColumnType(["a@b.co", "c@d.io", "x@y.com"]).type, "email");
  assert.equal(inferColumnType(["(555) 010-1234", "+1 555 010 9999", "555-010-4444"]).type, "phone");
  assert.equal(inferColumnType(["$1,200.00", "$35", "($20.50)"]).type, "currency");
  assert.equal(inferColumnType(["2024-01-02", "3/4/2024", "12/31/23"]).type, "date");
  assert.equal(inferColumnType(["https://x.com/a.png", "https://lh3.googleusercontent.com/abc"]).type, "image_url");
  assert.equal(inferColumnType(["1001", "1002", "1003"]).type, "number");
  assert.equal(toE164("(555) 010-1234"), "+15550101234");
  assert.equal(toIsoDate("3/4/2024"), "2024-03-04");
  assert.equal(toIsoDate(45292), "2024-01-01");
  assert.equal(parseNumber("($1,250.50)"), -1250.5);
});

test("Google contacts export → contacts_crm with anchors", () => {
  const { headers, rows } = rowsOf(
    "Name,Given Name,Family Name,E-mail 1 - Value,Phone 1 - Value,Photo,Organization 1 - Name,Favorite Club\n" +
      "Jane Doe,Jane,Doe,jane@ex.com,(555) 010-1111,https://lh3.googleusercontent.com/a,Acme,Driver\n" +
      "Bob Roe,Bob,Roe,bob@ex.com,555-010-2222,,Beta,Putter\n",
  );
  const s = detectDigestArchetype(headers, rows, "contacts.csv");
  assert.equal(s.archetype, "contacts_crm");
  assert.equal(s.canonicalMap["E-mail 1 - Value"], "emails");
  assert.equal(s.canonicalMap["Phone 1 - Value"], "phones");
  assert.ok(s.customKeys.includes("Favorite Club"));
});

test("Outlook contacts export → contacts_crm", () => {
  const { headers, rows } = rowsOf("First Name,Last Name,E-mail Address,Mobile Phone,Company,Job Title\nAl,Smith,al@x.com,555-010-3333,Co,CEO\nBea,Lee,bea@y.com,555-010-4444,Co2,CTO\n");
  assert.equal(detectDigestArchetype(headers, rows, "export.csv").archetype, "contacts_crm");
});

test("golf shop invoice export → invoice_ledger (emails present but invoice wins on anchors)", () => {
  const { headers, rows } = rowsOf(
    "Invoice #,Customer,Email,Date,Category,Item,Amount,Status\n" +
      "1001,Jane,jane@ex.com,2024-03-01,Clubs,Driver,$399.00,Paid\n" +
      "1002,Bob,bob@ex.com,2024-03-02,Lessons,30-min lesson,$75.00,Open\n" +
      "1003,Cy,cy@ex.com,2024-03-03,Lessons,60-min lesson,$140.00,Overdue\n",
  );
  const s = detectDigestArchetype(headers, rows, "march.csv");
  assert.equal(s.archetype, "invoice_ledger");
  const canon = rows.map((r) => normalizeRow(r, s).canonical);
  const m = summarize("invoice_ledger", canon);
  assert.equal(m.invoices?.total, 614);
  assert.equal(m.invoices?.paid, 399);
  assert.equal(m.invoices?.open, 75);
  assert.equal(m.invoices?.overdue, 140);
  assert.equal(m.invoices?.byCategory[0]?.name, "Clubs");
});

test("county parcel list → parcels with $/acre (zero and empty acreage skipped)", () => {
  const { headers, rows } = rowsOf(
    "APN,County,State,Acres,Owner Name,Assessed Value\n" +
      "123-456-01,Mohave,AZ,10,Ann,$50000\n" +
      "123-456-02,Mohave,AZ,0,Ben,$9000\n" +
      "123-456-03,Mohave,AZ,,Cal,$7000\n" +
      "123-456-04,Mohave,AZ,5,Dee,$40000\n",
  );
  const s = detectDigestArchetype(headers, rows, "parcels.csv");
  assert.equal(s.archetype, "real_estate_parcels");
  const canon = rows.map((r) => normalizeRow(r, s).canonical);
  assert.equal(canon[0]!.pricePerAcre, 5000);
  assert.equal(canon[1]!.pricePerAcre, undefined);
  assert.equal(canon[2]!.pricePerAcre, undefined);
  const m = summarize("real_estate_parcels", canon);
  assert.equal(m.parcels?.totalAcres, 15);
  assert.equal(m.parcels?.medianPricePerAcre, 6500);
});

test("GL trial balance → financial_statement; call log → communication_log; random → generic", () => {
  const tb = rowsOf("Account,Debit,Credit,Period\nCash,1000,,2024-01\nRevenue,,1000,2024-01\n");
  assert.equal(detectDigestArchetype(tb.headers, tb.rows, "trial balance.csv").archetype, "financial_statement");
  const calls = rowsOf("From,To,Direction,Duration,Date\n555-010-1111,555-010-2222,Outgoing,3:05,2024-01-01\n555-010-2222,555-010-1111,Incoming,0:30,2024-01-02\n");
  const cs = detectDigestArchetype(calls.headers, calls.rows, "calls.csv");
  assert.equal(cs.archetype, "communication_log");
  const m = summarize("communication_log", calls.rows.map((r) => normalizeRow(r, cs).canonical));
  assert.equal(m.comms?.outbound, 1);
  assert.equal(m.comms?.totalDurationSec, 215);
  const rnd = rowsOf("alpha,beta,gamma\n1,2,3\n4,5,6\n");
  assert.equal(detectDigestArchetype(rnd.headers, rnd.rows, "data.csv").archetype, "generic_table");
});

test("normalize keeps sparse and custom columns verbatim, duplicate headers, raw phone", () => {
  const { headers, rows } = rowsOf("Name,Email,Phone,Photo,Notes,Notes\nJane,JANE@EX.COM,(555) 010-1111,,first,second\nBob,bob@ex.com,555-010-2222,https://x.com/b.png,,\n");
  const s = detectDigestArchetype(headers, rows);
  const a = normalizeRow(rows[0]!, s);
  assert.deepEqual(a.canonical.emails, ["jane@ex.com"]);
  assert.deepEqual(a.canonical.phones, ["+15550101111"]);
  assert.equal(a.custom._raw?.Phone, "(555) 010-1111");
  const b = normalizeRow(rows[1]!, s);
  assert.equal(b.canonical.avatarUrl, "https://x.com/b.png");
  assert.ok(a.searchText.length <= 4096);
  assert.ok(Object.keys(a.custom).some((k) => k.startsWith("Notes")));
  const over = withArchetype(s, "generic_table");
  assert.equal(Object.keys(over.canonicalMap).length, 0);
  assert.equal(normalizeRow(rows[0]!, over).custom.Name, "Jane");
});

test("search text is capped at 4 KB and javascript: urls are not canonical links", () => {
  const { headers, rows } = rowsOf(`Name,Email,Website,Bio\nA,a@b.co,javascript:alert(1),${"x".repeat(9000)}\nB,b@c.co,example.com,y\n`);
  const s = detectDigestArchetype(headers, rows);
  const r = normalizeRow(rows[0]!, s);
  assert.equal(r.canonical.website, undefined);
  assert.ok(r.searchText.length <= 4096);
  assert.equal(normalizeRow(rows[1]!, s).canonical.website, "https://example.com/");
});

test("json: tabular arrays, wrapped arrays, ndjson, and non-tabular values", () => {
  const t = jsonToTableOrValue(JSON.stringify([{ a: 1, b: { c: 2 } }, { a: 3, b: { c: 4 } }]));
  assert.ok("table" in t && t.table.headers.includes("b.c"));
  const w = jsonToTableOrValue(JSON.stringify({ data: [{ x: 1 }, { x: 2 }] }));
  assert.ok("table" in w);
  const nd = jsonToTableOrValue('{"a":1}\n{"a":2}\n');
  assert.ok("table" in nd);
  const tree = jsonToTableOrValue(JSON.stringify({ name: "cfg", nested: { deep: true } }));
  assert.ok("value" in tree);
  const geo = jsonToTableOrValue(JSON.stringify({ type: "FeatureCollection", features: [{}, {}] }));
  assert.ok("value" in geo);
});

test("xlsx via jszip: shared strings, inline strings, numbers, sparse cells", async () => {
  const zip = new JSZip();
  zip.file("xl/workbook.xml", '<workbook><sheets><sheet name="Leads" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file("xl/_rels/workbook.xml.rels", '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>');
  zip.file("xl/sharedStrings.xml", "<sst><si><t>Name</t></si><si><t>Email</t></si><si><t>Jane &amp; Co</t></si></sst>");
  zip.file(
    "xl/worksheets/sheet1.xml",
    '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="inlineStr"><is><t>Score</t></is></c></row>' +
      '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="inlineStr"><is><t>j@x.co</t></is></c><c r="D2"><v>42</v></c></row></sheetData></worksheet>',
  );
  const buf = await zip.generateAsync({ type: "uint8array" });
  const book = await openXlsx(buf);
  assert.deepEqual(book.sheets.map((s) => s.name), ["Leads"]);
  const rows = await readXlsxSheet(book, book.sheets[0]!.path);
  assert.deepEqual(rows, [["Name", "Email", "", "Score"], ["Jane & Co", "j@x.co", "", "42"]]);
});

test("zip guard: zip-slip paths, entry count, ratio bombs and lying headers are rejected", async () => {
  for (const bad of ["../evil.txt", "/etc/passwd", "C:/x", "a/../../b", "a\0b", "\\root"]) assert.equal(safeArchivePath(bad), null, bad);
  assert.equal(safeArchivePath("docs/./a.txt"), "docs/a.txt");

  const slip = new JSZip();
  slip.file("../../evil.sh", "x");
  await assert.rejects(openZip(await slip.generateAsync({ type: "uint8array" })), /unsafe path/);

  const many = new JSZip();
  for (let i = 0; i < 30; i++) many.file(`f${i}.txt`, "x");
  await assert.rejects(openZip(await many.generateAsync({ type: "uint8array" }), { maxEntries: 20, maxTotalUncompressed: 1e8, maxRatio: 100, maxEntryBytes: 5e7 }), /entries/);

  const bomb = new JSZip();
  bomb.file("zeros.bin", new Uint8Array(4 * 1024 * 1024));
  const bombBuf = await bomb.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  await assert.rejects(openZip(bombBuf), /compression ratio/);

  const big = new JSZip();
  big.file("a.txt", "y".repeat(5000));
  const g = await openZip(await big.generateAsync({ type: "uint8array" }));
  await assert.rejects(g.readText("a.txt", 1000), /size limit/);
  assert.equal((await g.readText("a.txt")).length, 5000);
});

test("xml entity declarations are rejected (billion laughs)", () => {
  assert.throws(() => assertNoEntityDeclarations('<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol">]><a>&lol;</a>'), /entity/);
  assert.doesNotThrow(() => assertNoEntityDeclarations("<a>&amp;</a>"));
});
