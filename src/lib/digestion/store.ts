/**
 * Server-side dataset storage (begin → append batches → finalize → query). Takes a Sql handle so
 * the PGlite tests exercise the exact SQL. Every statement filters on user_id; filter/sort keys are
 * whitelisted and always bound as parameters, never spliced into SQL text.
 */
import type { Sql } from "../sql-template.ts";
import { ARCHETYPE_LABEL, DIGEST_ARCHETYPES, SPECS, type DigestArchetype, type SchemaJson } from "./detect.ts";
import { DATASET_LIMITS } from "./limits.ts";
import { MetricsAccumulator, type SummaryMetrics } from "./metrics.ts";
import { buildSearchText, clipCell, safeHttpUrl, type Canonical, type CustomFields } from "./normalize.ts";

export const SOURCE_FORMATS = ["csv", "tsv", "json", "xlsx", "vcf"] as const;
export type SourceFormat = (typeof SOURCE_FORMATS)[number];

export type BeginDatasetInput = {
  filename: string;
  format: SourceFormat;
  archetype: DigestArchetype;
  schema: SchemaJson;
  conceptId?: string | null;
  title?: string;
  tags?: string[];
  expectedRows: number;
  emoji?: string | null;
  color?: string | null;
};

export type InsertMemoryFn = (input: {
  title: string;
  body: string;
  memoryType: "dataset";
  viewerType: "dataset" | "contacts_crm";
  conceptId?: string | null;
  tags: string[];
  aiSummary: string;
  mediaName: string;
  emoji?: string | null;
  color?: string | null;
}) => Promise<{ ok: true; memoryId: string } | { ok: false; error: string }>;

export type DatasetHeader = {
  datasetId: string;
  memoryId: string;
  archetype: DigestArchetype;
  status: "ingesting" | "ready" | "failed";
  filename: string;
  format: SourceFormat;
  rowCount: number;
  schema: SchemaJson;
  metrics: SummaryMetrics;
  createdAt: string;
};

export class DatasetError extends Error {}

const NUMERIC_FIELDS = new Set(["amount", "qty", "acreage", "assessedValue", "offerValue", "lat", "lng", "debit", "credit", "balance", "revenue", "expense", "pricePerAcre", "durationSec"]);
const LIST_FIELDS = new Set(["phones", "emails"]);
const URL_FIELDS = new Set(["website", "avatarUrl"]);

export function canonicalFields(archetype: DigestArchetype): Set<string> {
  if (archetype === "generic_table") return new Set();
  const keys = new Set(Object.keys(SPECS[archetype].fields));
  if (archetype === "real_estate_parcels") keys.add("pricePerAcre");
  return keys;
}

function validateSchema(schema: unknown, archetype: DigestArchetype): SchemaJson {
  if (!schema || typeof schema !== "object") throw new DatasetError("Missing column schema");
  const s = schema as SchemaJson;
  if (!Array.isArray(s.columns) || s.columns.length === 0) throw new DatasetError("No columns found");
  if (s.columns.length > DATASET_LIMITS.maxColumns) throw new DatasetError(`More than ${DATASET_LIMITS.maxColumns} columns`);
  const allowed = canonicalFields(archetype);
  const canonicalMap: Record<string, string> = {};
  for (const [k, v] of Object.entries(s.canonicalMap ?? {})) if (typeof v === "string" && allowed.has(v)) canonicalMap[String(k).slice(0, 200)] = v;
  const columns = s.columns.map((c) => ({
    key: String(c.key ?? "").slice(0, 200),
    header: String(c.header ?? "").slice(0, 200),
    type: String(c.type ?? "text").slice(0, 20) as SchemaJson["columns"][number]["type"],
    fill: Math.max(0, Math.min(1, Number(c.fill) || 0)),
    ...(canonicalMap[String(c.key)] ? { canonical: canonicalMap[String(c.key)] } : {}),
  }));
  return { version: 1, archetype, confidence: Math.max(0, Math.min(1, Number(s.confidence) || 0)), columns, canonicalMap, customKeys: columns.filter((c) => !canonicalMap[c.key]).map((c) => c.key), scores: {} };
}

/** Coerce one client row to the server's rules: whitelisted canonical keys, typed values, capped cells. */
export function sanitizeRow(archetype: DigestArchetype, row: { canonical?: unknown; custom?: unknown }): { canonical: Canonical; custom: CustomFields } {
  const allowed = canonicalFields(archetype);
  const canonical: Canonical = {};
  if (row.canonical && typeof row.canonical === "object" && !Array.isArray(row.canonical)) {
    for (const [k, v] of Object.entries(row.canonical as Record<string, unknown>)) {
      if (!allowed.has(k)) continue;
      if (NUMERIC_FIELDS.has(k)) {
        if (typeof v === "number" && Number.isFinite(v)) canonical[k] = v;
      } else if (LIST_FIELDS.has(k)) {
        if (Array.isArray(v)) {
          const list = v.filter((x): x is string => typeof x === "string" && x.length > 0).map((x) => clipCell(x).slice(0, 320)).slice(0, 20);
          if (list.length) canonical[k] = list;
        }
      } else if (URL_FIELDS.has(k)) {
        const u = typeof v === "string" ? safeHttpUrl(v) : undefined;
        if (u) canonical[k] = u;
      } else if (typeof v === "string" && v) canonical[k] = clipCell(v);
      else if (typeof v === "number" && Number.isFinite(v)) canonical[k] = String(v);
    }
  }
  const custom: CustomFields = {};
  if (row.custom && typeof row.custom === "object" && !Array.isArray(row.custom)) {
    let n = 0;
    for (const [k, v] of Object.entries(row.custom as Record<string, unknown>)) {
      if (n >= DATASET_LIMITS.maxColumns + 1) break;
      if (k === "_raw") {
        if (v && typeof v === "object" && !Array.isArray(v)) {
          const raw: Record<string, string> = {};
          for (const [rk, rv] of Object.entries(v as Record<string, unknown>).slice(0, DATASET_LIMITS.maxColumns)) if (typeof rv === "string") raw[rk.slice(0, 200)] = clipCell(rv);
          if (Object.keys(raw).length) custom._raw = raw;
        }
        continue;
      }
      if (typeof v === "string" && v) custom[k.slice(0, 200)] = clipCell(v);
      else if (typeof v === "number" && Number.isFinite(v)) custom[k.slice(0, 200)] = String(v);
      n++;
    }
  }
  return { canonical, custom };
}

export async function beginDatasetCore(sql: Sql, userId: string, input: BeginDatasetInput, insertMemory: InsertMemoryFn, newId: () => string): Promise<{ datasetId: string; memoryId: string }> {
  if (!SOURCE_FORMATS.includes(input.format)) throw new DatasetError("Unsupported dataset format");
  if (!DIGEST_ARCHETYPES.includes(input.archetype)) throw new DatasetError("Unknown archetype");
  const expected = Math.floor(Number(input.expectedRows) || 0);
  if (expected < 1) throw new DatasetError("The file has no data rows");
  if (expected > DATASET_LIMITS.maxRows) throw new DatasetError(`More than ${DATASET_LIMITS.maxRows.toLocaleString()} rows`);
  const schema = validateSchema(input.schema, input.archetype);
  // Sweep this user's abandoned uploads (older than 1 h) so half-finished datasets never linger.
  await sql`
    delete from memories where user_id = ${userId} and id in (
      select memory_id from digested_datasets
      where user_id = ${userId} and status in ('ingesting', 'failed') and updated_at < now() - interval '1 hour'
    )
  `;
  const filename = String(input.filename ?? "").slice(0, 255);
  const label = ARCHETYPE_LABEL[input.archetype];
  const title = (input.title?.trim() || filename.replace(/\.[^.]+$/, "") || label).slice(0, 200);
  const tags = [...new Set([...(input.tags ?? []), label.toLowerCase()])].slice(0, 12);
  const created = await insertMemory({
    title,
    body: `${label} dataset from ${filename}: importing ${expected.toLocaleString()} rows…`,
    memoryType: "dataset",
    viewerType: input.format === "vcf" ? "contacts_crm" : "dataset",
    conceptId: input.conceptId ?? null,
    tags: tags.length >= 2 ? tags : [...tags, "dataset"],
    aiSummary: `${label} · ${expected.toLocaleString()} rows from ${filename}`,
    mediaName: filename,
    emoji: input.emoji,
    color: input.color,
  });
  if (!created.ok) throw new DatasetError(created.error);
  const datasetId = newId();
  await sql`
    insert into digested_datasets (id, user_id, memory_id, concept_id, archetype, status, source_filename, source_format, expected_rows, schema_json)
    values (${datasetId}, ${userId}, ${created.memoryId}, ${input.conceptId ?? null}, ${input.archetype}, 'ingesting', ${filename}, ${input.format}, ${expected}, ${JSON.stringify(schema)}::jsonb)
  `;
  const meta = input.format === "vcf" ? { v: "contacts_crm", datasetId, count: expected } : { v: "dataset", datasetId };
  await sql`update memories set extracted_metadata_json = ${JSON.stringify(meta)}::jsonb where id = ${created.memoryId} and user_id = ${userId}`;
  return { datasetId, memoryId: created.memoryId };
}

async function ownedDataset(sql: Sql, userId: string, datasetId: string) {
  const rows = await sql<{ id: string; memory_id: string; archetype: DigestArchetype; status: string; expected_rows: number; source_filename: string; schema_json: SchemaJson | string }>`
    select id, memory_id, archetype, status, expected_rows, source_filename, schema_json from digested_datasets where id = ${datasetId} and user_id = ${userId}
  `;
  return rows[0] ?? null;
}

export async function appendRowsCore(sql: Sql, userId: string, input: { datasetId: string; startIndex: number; rows: { canonical?: unknown; custom?: unknown }[] }): Promise<{ inserted: number }> {
  const ds = await ownedDataset(sql, userId, String(input.datasetId));
  if (!ds) throw new DatasetError("Dataset not found");
  if (ds.status !== "ingesting") throw new DatasetError("Dataset is not accepting rows");
  if (!Array.isArray(input.rows) || input.rows.length === 0) return { inserted: 0 };
  if (input.rows.length > DATASET_LIMITS.batchRows) throw new DatasetError(`At most ${DATASET_LIMITS.batchRows} rows per batch`);
  const start = Math.floor(Number(input.startIndex));
  if (!Number.isFinite(start) || start < 0 || start + input.rows.length > DATASET_LIMITS.maxRows) throw new DatasetError("Row index out of range");
  // A lone very wide row may exceed the batch budget; allow it up to 2× (still far under the 4.5 MB body limit).
  const batchBytes = JSON.stringify(input.rows).length;
  if (batchBytes > DATASET_LIMITS.maxBatchBytes * (input.rows.length === 1 ? 2 : 1)) throw new DatasetError("Batch is larger than 1.5 MB");
  const records = input.rows.map((r, i) => {
    const { canonical, custom } = sanitizeRow(ds.archetype, r);
    return { row_index: start + i, canonical_json: canonical, custom_fields_json: custom, search_text: buildSearchText(canonical, custom) };
  });
  const res = await sql<{ n: number }>`
    with ins as (
      insert into digested_rows (dataset_id, row_index, user_id, canonical_json, custom_fields_json, search_text)
      select ${ds.id}, x.row_index, ${userId}, x.canonical_json, x.custom_fields_json, x.search_text
      from jsonb_to_recordset(${JSON.stringify(records)}::jsonb) as x(row_index int, canonical_json jsonb, custom_fields_json jsonb, search_text text)
      on conflict (dataset_id, row_index) do nothing
      returning 1
    )
    select count(*)::int as n from ins
  `;
  await sql`update digested_datasets set updated_at = now() where id = ${ds.id} and user_id = ${userId}`;
  return { inserted: Number(res[0]?.n ?? 0) };
}

const fmtMoney = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export function metricsLines(archetype: DigestArchetype, m: SummaryMetrics): string[] {
  const lines = [`- Rows: ${m.rows.toLocaleString()}`];
  if (m.contacts) lines.push(`- With phone: ${m.contacts.withPhone.toLocaleString()} · with email: ${m.contacts.withEmail.toLocaleString()} · with photo: ${m.contacts.withAvatar.toLocaleString()} · with website: ${m.contacts.withWebsite.toLocaleString()}`);
  if (m.invoices) {
    lines.push(`- Revenue: ${fmtMoney(m.invoices.total)} (paid ${fmtMoney(m.invoices.paid)}, open ${fmtMoney(m.invoices.open)}, overdue ${fmtMoney(m.invoices.overdue)})`);
    if (m.invoices.byCategory.length) lines.push(`- Top categories: ${m.invoices.byCategory.slice(0, 5).map((c) => `${c.name} ${fmtMoney(c.total)}`).join(", ")}`);
  }
  if (m.parcels) lines.push(`- Total acres: ${m.parcels.totalAcres.toLocaleString()} · median $/acre: ${m.parcels.medianPricePerAcre === null ? "n/a" : fmtMoney(m.parcels.medianPricePerAcre)} · total assessed: ${fmtMoney(m.parcels.totalAssessed)}`);
  if (m.financial) lines.push(`- Debits ${fmtMoney(m.financial.debit)} · credits ${fmtMoney(m.financial.credit)} · net ${fmtMoney(m.financial.net)}`);
  if (m.comms) lines.push(`- Inbound ${m.comms.inbound} · outbound ${m.comms.outbound} · missed ${m.comms.missed}`);
  void archetype;
  return lines;
}

function mdCell(v: unknown): string {
  const s = Array.isArray(v) ? v.join("; ") : v === undefined || v === null ? "" : String(v);
  return s.replace(/\|/g, "\\|").replace(/\s+/g, " ").slice(0, 60);
}

export async function finalizeDatasetCore(sql: Sql, userId: string, datasetId: string): Promise<{ metrics: SummaryMetrics; memoryId: string }> {
  const ds = await ownedDataset(sql, userId, datasetId);
  if (!ds) throw new DatasetError("Dataset not found");
  const schema = (typeof ds.schema_json === "string" ? JSON.parse(ds.schema_json) : ds.schema_json) as SchemaJson;
  const acc = new MetricsAccumulator(ds.archetype);
  let after = -1;
  const first: { canonical_json: Canonical; custom_fields_json: CustomFields }[] = [];
  for (;;) {
    const page = await sql<{ row_index: number; canonical_json: Canonical; custom_fields_json: CustomFields }>`
      select row_index, canonical_json, case when row_index < 10 then custom_fields_json else '{}'::jsonb end as custom_fields_json
      from digested_rows where dataset_id = ${ds.id} and user_id = ${userId} and row_index > ${after}
      order by row_index limit 2000
    `;
    if (!page.length) break;
    for (const r of page) {
      acc.add(r.canonical_json ?? {});
      if (first.length < 10) first.push(r);
    }
    after = page[page.length - 1]!.row_index;
    if (page.length < 2000) break;
  }
  const metrics = acc.result();
  if (metrics.rows === 0) {
    await sql`update digested_datasets set status = 'failed', updated_at = now() where id = ${ds.id} and user_id = ${userId}`;
    throw new DatasetError("No rows were stored");
  }
  const label = ARCHETYPE_LABEL[ds.archetype];
  const cols = schema.columns.slice(0, 8);
  const table = [
    `| ${cols.map((c) => mdCell(c.header)).join(" | ")} |`,
    `| ${cols.map(() => "---").join(" | ")} |`,
    ...first.map((r) => `| ${cols.map((c) => {
      const field = schema.canonicalMap[c.key];
      return mdCell(field ? r.canonical_json?.[field] : r.custom_fields_json?.[c.key]);
    }).join(" | ")} |`),
  ];
  const body = [
    `${label} dataset · ${ds.source_filename}`,
    "",
    ...metricsLines(ds.archetype, metrics),
    "",
    `Columns: ${schema.columns.map((c) => c.header).join(", ").slice(0, 2000)}`,
    "",
    ...table,
  ].join("\n");
  const summary = `${label} · ${metrics.rows.toLocaleString()} rows from ${ds.source_filename}. ${metricsLines(ds.archetype, metrics).slice(1, 2).join(" ").replace(/^- /, "")}`.slice(0, 600);
  await sql`
    update digested_datasets set status = 'ready', row_count = ${metrics.rows}, summary_metrics_json = ${JSON.stringify(metrics)}::jsonb, updated_at = now()
    where id = ${ds.id} and user_id = ${userId}
  `;
  await sql`
    update memories set body = ${body}, ai_summary = ${summary}, updated_at = now()
    where id = ${ds.memory_id} and user_id = ${userId}
  `;
  return { metrics, memoryId: ds.memory_id };
}

export async function failDatasetCore(sql: Sql, userId: string, datasetId: string): Promise<void> {
  const ds = await ownedDataset(sql, userId, datasetId);
  if (!ds || ds.status === "ready") return;
  await sql`delete from memories where id = ${ds.memory_id} and user_id = ${userId}`;
}

export type RowQuery = {
  datasetId: string;
  limit?: number;
  offset?: number;
  search?: string;
  filters?: {
    has?: ("phone" | "email" | "avatar" | "website")[];
    eq?: Record<string, string>;
    range?: Record<string, { min?: number | string; max?: number | string }>;
  };
  sortBy?: { key: string; dir: "asc" | "desc" };
};

const HAS_KEY: Record<string, string> = { phone: "phones", email: "emails", avatar: "avatarUrl", website: "website" };

export async function queryRowsCore(sql: Sql, userId: string, q: RowQuery): Promise<{ rows: { rowIndex: number; canonical: Canonical; custom: CustomFields }[]; total: number }> {
  const ds = await ownedDataset(sql, userId, String(q.datasetId));
  if (!ds) return { rows: [], total: 0 };
  const fields = canonicalFields(ds.archetype);
  const params: unknown[] = [ds.id, userId];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const where = ["dataset_id = $1", "user_id = $2"];
  const search = (q.search ?? "").trim().toLowerCase().slice(0, 200);
  if (search) where.push(`search_text like ${p(`%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)}`);
  for (const h of q.filters?.has ?? []) {
    const key = HAS_KEY[h];
    if (!key) throw new DatasetError("Unknown filter");
    where.push(`canonical_json ? ${p(key)}`);
  }
  for (const [k, v] of Object.entries(q.filters?.eq ?? {})) {
    if (!fields.has(k) || NUMERIC_FIELDS.has(k)) throw new DatasetError(`Cannot filter on ${k}`);
    where.push(`canonical_json->>${p(k)} = ${p(String(v).slice(0, 200))}`);
  }
  for (const [k, r] of Object.entries(q.filters?.range ?? {})) {
    if (!fields.has(k)) throw new DatasetError(`Cannot filter on ${k}`);
    if (NUMERIC_FIELDS.has(k)) {
      const kp = p(k);
      if (r.min !== undefined && r.min !== "") where.push(`jsonb_typeof(canonical_json->${kp}) = 'number' and (canonical_json->>${kp})::numeric >= ${p(Number(r.min))}`);
      if (r.max !== undefined && r.max !== "") where.push(`jsonb_typeof(canonical_json->${kp}) = 'number' and (canonical_json->>${kp})::numeric <= ${p(Number(r.max))}`);
    } else {
      const kp = p(k);
      if (r.min !== undefined && r.min !== "") where.push(`canonical_json->>${kp} >= ${p(String(r.min))}`);
      if (r.max !== undefined && r.max !== "") where.push(`canonical_json->>${kp} <= ${p(String(r.max))}`);
    }
  }
  let order = "row_index asc";
  if (q.sortBy && q.sortBy.key !== "row_index") {
    if (!fields.has(q.sortBy.key)) throw new DatasetError(`Cannot sort by ${q.sortBy.key}`);
    const dir = q.sortBy.dir === "desc" ? "desc" : "asc";
    const kp = p(q.sortBy.key);
    order = NUMERIC_FIELDS.has(q.sortBy.key)
      ? `case when jsonb_typeof(canonical_json->${kp}) = 'number' then (canonical_json->>${kp})::numeric end ${dir} nulls last, row_index asc`
      : `lower(canonical_json->>${kp}) ${dir} nulls last, row_index asc`;
  } else if (q.sortBy?.dir === "desc") order = "row_index desc";
  const limit = Math.max(1, Math.min(200, Math.floor(Number(q.limit) || 50)));
  const offset = Math.max(0, Math.min(DATASET_LIMITS.maxRows, Math.floor(Number(q.offset) || 0)));
  const rows = await sql.query<{ row_index: number; canonical_json: Canonical; custom_fields_json: CustomFields; total: number }>(
    `select row_index, canonical_json, custom_fields_json, count(*) over()::int as total
     from digested_rows where ${where.join(" and ")} order by ${order} limit ${p(limit)} offset ${p(offset)}`,
    params,
  );
  let total = Number(rows[0]?.total ?? 0);
  if (!rows.length && offset > 0) {
    const c = await sql.query<{ n: number }>(`select count(*)::int as n from digested_rows where ${where.join(" and ")}`, params.slice(0, params.length - 2));
    total = Number(c[0]?.n ?? 0);
  }
  return { rows: rows.map((r) => ({ rowIndex: r.row_index, canonical: r.canonical_json ?? {}, custom: r.custom_fields_json ?? {} })), total };
}

export async function getDatasetForMemoryCore(sql: Sql, userId: string, memoryId: string): Promise<DatasetHeader | null> {
  const rows = await sql<{ id: string; memory_id: string; archetype: DigestArchetype; status: DatasetHeader["status"]; source_filename: string; source_format: SourceFormat; row_count: number; schema_json: SchemaJson | string; summary_metrics_json: SummaryMetrics | string; created_at: string }>`
    select id, memory_id, archetype, status, source_filename, source_format, row_count, schema_json, summary_metrics_json, created_at
    from digested_datasets where memory_id = ${memoryId} and user_id = ${userId}
  `;
  const r = rows[0];
  if (!r) return null;
  const parse = <T,>(v: T | string): T => (typeof v === "string" ? (JSON.parse(v) as T) : v);
  return {
    datasetId: r.id,
    memoryId: r.memory_id,
    archetype: r.archetype,
    status: r.status,
    filename: r.source_filename,
    format: r.source_format,
    rowCount: Number(r.row_count),
    schema: parse(r.schema_json),
    metrics: parse(r.summary_metrics_json),
    createdAt: String(r.created_at),
  };
}

/** Datasets whose rows match a query: memory id + match count (deep search boost). */
export async function datasetRowMatches(sql: Sql, userId: string, query: string, limit = 20): Promise<{ memoryId: string; matches: number }[]> {
  const q = query.trim().toLowerCase().slice(0, 200);
  if (q.length < 2) return [];
  const rows = await sql<{ memory_id: string; n: number }>`
    select d.memory_id, count(*)::int as n
    from digested_rows r join digested_datasets d on d.id = r.dataset_id
    where r.user_id = ${userId} and d.user_id = ${userId} and d.status = 'ready'
      and r.search_text like ${`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`}
    group by d.memory_id order by n desc limit ${limit}
  `;
  return rows.map((r) => ({ memoryId: r.memory_id, matches: Number(r.n) }));
}

export type RestoreDatasetInput = {
  memoryId: string;
  archetype: DigestArchetype;
  sourceFilename: string;
  sourceFormat: SourceFormat;
  schema: unknown;
  rows: { canonical?: unknown; custom?: unknown }[];
};

/** Backup restore: rebuild a dataset under an already-restored memory, with the same validation as uploads. */
export async function restoreDatasetCore(sql: Sql, userId: string, input: RestoreDatasetInput, newId: () => string): Promise<string> {
  if (!SOURCE_FORMATS.includes(input.sourceFormat)) throw new DatasetError("Unsupported dataset format");
  if (!DIGEST_ARCHETYPES.includes(input.archetype)) throw new DatasetError("Unknown archetype");
  const owned = await sql<{ id: string }>`select id from memories where id = ${input.memoryId} and user_id = ${userId}`;
  if (!owned.length) throw new DatasetError("Memory not found");
  const schema = validateSchema(input.schema, input.archetype);
  const rows = input.rows.slice(0, DATASET_LIMITS.maxRows);
  const datasetId = newId();
  await sql`
    insert into digested_datasets (id, user_id, memory_id, archetype, status, source_filename, source_format, expected_rows, schema_json)
    values (${datasetId}, ${userId}, ${input.memoryId}, ${input.archetype}, 'ingesting', ${String(input.sourceFilename).slice(0, 255) || "dataset"}, ${input.sourceFormat}, ${rows.length}, ${JSON.stringify(schema)}::jsonb)
  `;
  let start = 0;
  let batch: { canonical: Canonical; custom: CustomFields }[] = [];
  let bytes = 2;
  const flush = async () => {
    if (!batch.length) return;
    await appendRowsCore(sql, userId, { datasetId, startIndex: start, rows: batch });
    start += batch.length;
    batch = [];
    bytes = 2;
  };
  for (const raw of rows) {
    const row = sanitizeRow(input.archetype, raw);
    const size = JSON.stringify(row).length + 1;
    if (batch.length >= DATASET_LIMITS.batchRows || bytes + size > DATASET_LIMITS.maxBatchBytes) await flush();
    batch.push(row);
    bytes += size;
  }
  await flush();
  await finalizeDatasetCore(sql, userId, datasetId);
  return datasetId;
}
