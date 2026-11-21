/** Browser-side tabular parsing into a draft that the capture queue previews and save streams. */
import { CsvParser } from "./csv.ts";
import { detectDigestArchetype, withArchetype, type DigestArchetype, type SchemaJson } from "./detect.ts";
import { jsonToTableOrValue, type Table } from "./json.ts";
import { DATASET_LIMITS } from "./limits.ts";
import type { SourceFormat } from "./store.ts";

export type DatasetDraft = {
  format: SourceFormat;
  filename: string;
  headers: string[];
  rows: string[][];
  schema: SchemaJson;
  truncated: boolean;
  sheets?: { name: string; path: string }[];
  sheetPath?: string;
  /** xlsx only: re-read another sheet. */
  readSheet?: (path: string) => Promise<string[][]>;
};

function yieldToBrowser(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

export async function parseDelimitedFile(file: File): Promise<{ rows: string[][]; truncated: boolean }> {
  const parser = new CsvParser(/\.tsv$|\.tab$/i.test(file.name) ? "\t" : undefined);
  const rows: string[][] = [];
  const cap = DATASET_LIMITS.maxRows + 1;
  const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
  let truncated = false;
  let chunks = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    for (const r of parser.push(value)) {
      if (rows.length >= cap) {
        truncated = true;
        break;
      }
      rows.push(r);
    }
    if (truncated) {
      await reader.cancel();
      break;
    }
    if (++chunks % 8 === 0) await yieldToBrowser();
  }
  if (!truncated) for (const r of parser.end()) if (rows.length < cap) rows.push(r);
  return { rows, truncated };
}

export function draftFromTable(format: SourceFormat, filename: string, table: Table, truncated = false): DatasetDraft | { error: string } {
  const headers = table.headers.slice(0, DATASET_LIMITS.maxColumns);
  if (!headers.length) return { error: `${filename} has no columns` };
  const rows = table.rows.slice(0, DATASET_LIMITS.maxRows).map((r) => r.slice(0, DATASET_LIMITS.maxColumns));
  if (!rows.length) return { error: `${filename} has a header but no data rows` };
  const schema = detectDigestArchetype(headers, rows.slice(0, DATASET_LIMITS.sampleRows), filename);
  return { format, filename, headers, rows, schema, truncated: truncated || table.rows.length > DATASET_LIMITS.maxRows };
}

export function retargetDraft(draft: DatasetDraft, archetype: DigestArchetype): DatasetDraft {
  return { ...draft, schema: withArchetype(draft.schema, archetype) };
}

export async function buildDatasetDraft(file: File, format: "csv" | "tsv" | "xlsx" | "json", text?: string): Promise<DatasetDraft | { error: string } | { notTabular: unknown }> {
  if (file.size > DATASET_LIMITS.maxFileBytes) return { error: `${file.name} is larger than 25 MB` };
  if (format === "csv" || format === "tsv") {
    const { rows, truncated } = await parseDelimitedFile(file);
    if (rows.length < 2) return { error: `${file.name} has no data rows` };
    return draftFromTable(format, file.name, { headers: rows[0]!, rows: rows.slice(1) }, truncated);
  }
  if (format === "json") {
    const parsed = jsonToTableOrValue(text ?? (await file.text()));
    if ("error" in parsed) return { error: parsed.error };
    if ("value" in parsed) return { notTabular: parsed.value };
    return draftFromTable("json", file.name, parsed.table);
  }
  const { openXlsx, readXlsxSheet } = await import("./xlsx.ts");
  let book;
  try {
    book = await openXlsx(await file.arrayBuffer());
  } catch (err) {
    return { error: err instanceof Error ? err.message : "This workbook could not be read" };
  }
  if (!book.sheets.length) return { error: `${file.name} has no worksheets` };
  const readSheet = (path: string) => readXlsxSheet(book, path);
  for (const sheet of book.sheets) {
    const rows = await readSheet(sheet.path);
    if (rows.length >= 2) {
      const d = draftFromTable("xlsx", file.name, { headers: rows[0]!, rows: rows.slice(1) }, rows.length > DATASET_LIMITS.maxRows + 1);
      if ("error" in d) continue;
      return { ...d, sheets: book.sheets, sheetPath: sheet.path, readSheet };
    }
  }
  return { error: `${file.name} has no sheet with a header and data rows` };
}

export async function switchDraftSheet(draft: DatasetDraft, path: string): Promise<DatasetDraft | { error: string }> {
  if (!draft.readSheet) return draft;
  const rows = await draft.readSheet(path);
  if (rows.length < 2) return { error: "That sheet has no data rows" };
  const d = draftFromTable("xlsx", draft.filename, { headers: rows[0]!, rows: rows.slice(1) }, rows.length > DATASET_LIMITS.maxRows + 1);
  if ("error" in d) return d;
  return { ...d, sheets: draft.sheets, sheetPath: path, readSheet: draft.readSheet };
}
