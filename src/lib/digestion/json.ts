/** JSON / NDJSON → table when the shape is tabular; otherwise null (structured tree viewer). */

export type Table = { headers: string[]; rows: string[][] };

function flatten(value: unknown, prefix: string, out: Record<string, string>, depth = 0) {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    out[prefix] = JSON.stringify(value);
    return;
  }
  if (typeof value === "object" && depth < 4) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) flatten(v, prefix ? `${prefix}.${k}` : k, out, depth + 1);
    return;
  }
  out[prefix] = typeof value === "object" ? JSON.stringify(value) : String(value);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Array of ≥2 objects sharing ≥60% of their keys (or wrapped in data/rows/items/records). */
export function tabularArray(value: unknown): Record<string, unknown>[] | null {
  let arr: unknown = value;
  if (isPlainObject(value)) {
    if (value.type === "FeatureCollection") return null;
    for (const k of ["data", "rows", "items", "records", "results", "contacts", "entries"]) {
      if (Array.isArray(value[k])) {
        arr = value[k];
        break;
      }
    }
  }
  if (!Array.isArray(arr) || arr.length < 2) return null;
  const objs = arr.filter(isPlainObject);
  if (objs.length / arr.length < 0.9) return null;
  const sample = objs.slice(0, 200);
  const counts = new Map<string, number>();
  for (const o of sample) for (const k of Object.keys(o)) counts.set(k, (counts.get(k) ?? 0) + 1);
  const keys = [...counts.keys()];
  if (!keys.length) return null;
  const shared = keys.filter((k) => (counts.get(k) ?? 0) / sample.length >= 0.6).length;
  return shared / keys.length >= 0.6 || shared >= 3 ? objs : null;
}

export function objectsToTable(objs: Record<string, unknown>[]): Table {
  const flat = objs.map((o) => {
    const out: Record<string, string> = {};
    flatten(o, "", out);
    return out;
  });
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const f of flat.slice(0, 1000)) for (const k of Object.keys(f)) if (!seen.has(k)) {
    seen.add(k);
    headers.push(k);
  }
  for (const f of flat) for (const k of Object.keys(f)) if (!seen.has(k)) {
    seen.add(k);
    headers.push(k);
  }
  return { headers, rows: flat.map((f) => headers.map((h) => f[h] ?? "")) };
}

export function parseNdjson(text: string): Record<string, unknown>[] | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;
  const out: Record<string, unknown>[] = [];
  for (const l of lines) {
    try {
      const v = JSON.parse(l) as unknown;
      if (!isPlainObject(v)) return null;
      out.push(v);
    } catch {
      return null;
    }
  }
  return out;
}

/** Parse a .json/.ndjson text: tabular → Table, else { value } for the tree viewer. */
export function jsonToTableOrValue(text: string): { table: Table } | { value: unknown } | { error: string } {
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  try {
    const value = JSON.parse(trimmed) as unknown;
    const objs = tabularArray(value);
    return objs ? { table: objectsToTable(objs) } : { value };
  } catch {
    const nd = parseNdjson(trimmed);
    if (nd) return { table: objectsToTable(nd) };
    return { error: "This JSON file could not be parsed" };
  }
}
