/** XLSX reader on the existing jszip dependency: workbook sheet list + one sheet's rows. */
import { decodeXmlEntities, attr, assertNoEntityDeclarations } from "./xml-scan.ts";
import { openZip, type GuardedZip } from "./zip-guard.ts";
import { DATASET_LIMITS } from "./limits.ts";

export type XlsxBook = { sheets: { name: string; path: string }[]; zip: GuardedZip; shared: string[] };

function colIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0]?.toUpperCase() ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function textOf(fragment: string): string {
  const parts: string[] = [];
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fragment))) parts.push(decodeXmlEntities(m[1]!));
  return parts.join("");
}

export async function openXlsx(data: ArrayBuffer | Uint8Array): Promise<XlsxBook> {
  const zip = await openZip(data);
  const wb = await zip.readText("xl/workbook.xml", 5_000_000);
  assertNoEntityDeclarations(wb);
  const rels = zip.has("xl/_rels/workbook.xml.rels") ? await zip.readText("xl/_rels/workbook.xml.rels", 2_000_000) : "";
  const relTarget = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id");
    const target = attr(m[0], "Target");
    if (id && target) relTarget.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`);
  }
  const sheets: { name: string; path: string }[] = [];
  let i = 0;
  for (const m of wb.matchAll(/<sheet\b[^>]*\/?>/g)) {
    i++;
    const name = attr(m[0], "name") ?? `Sheet${i}`;
    const rid = attr(m[0], "r:id");
    const path = (rid && relTarget.get(rid)) || `xl/worksheets/sheet${i}.xml`;
    if (zip.has(path)) sheets.push({ name, path });
  }
  const shared: string[] = [];
  if (zip.has("xl/sharedStrings.xml")) {
    const ss = await zip.readText("xl/sharedStrings.xml", 60_000_000);
    assertNoEntityDeclarations(ss);
    for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]!));
  }
  return { sheets, zip, shared };
}

/** Rows of one sheet as strings (row cap = dataset limit + header). Sparse cells become "". */
export async function readXlsxSheet(book: XlsxBook, path: string, maxRows: number = DATASET_LIMITS.maxRows + 1): Promise<string[][]> {
  const xml = await book.zip.readText(path, 100_000_000);
  assertNoEntityDeclarations(xml);
  const rows: string[][] = [];
  for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g)) {
    if (rows.length >= maxRows) break;
    const body = rm[1] ?? "";
    const row: string[] = [];
    for (const cm of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = `<c ${cm[1]}>`;
      const inner = cm[2] ?? "";
      const ref = attr(tag, "r");
      const idx = ref ? colIndex(ref) : row.length;
      if (idx >= DATASET_LIMITS.maxColumns) continue;
      const t = attr(tag, "t");
      let value = "";
      if (t === "s") value = book.shared[Number(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? -1)] ?? "";
      else if (t === "inlineStr") value = textOf(inner);
      else if (t === "b") value = /<v>1<\/v>/.test(inner) ? "TRUE" : "FALSE";
      else value = decodeXmlEntities(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "");
      while (row.length < idx) row.push("");
      row[idx] = value;
    }
    if (row.some((v) => v !== "")) rows.push(row);
  }
  return rows;
}
