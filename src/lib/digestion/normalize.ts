/**
 * Row normalization: recognized columns become typed canonical fields; every other non-empty
 * column is kept verbatim in custom fields (never dropped), and mapped values that normalization
 * changed are preserved under custom._raw. Pure.
 */
import { parseNumber, toE164, toIsoDate } from "./columns.ts";
import type { DigestArchetype, SchemaJson } from "./detect.ts";
import { DATASET_LIMITS } from "./limits.ts";

export type Canonical = Record<string, unknown>;
export type CustomFields = Record<string, unknown> & { _raw?: Record<string, string> };
export type NormalizedRow = { canonical: Canonical; custom: CustomFields; searchText: string };

const NUMERIC: Record<string, true> = {
  amount: true, qty: true, acreage: true, assessedValue: true, offerValue: true, lat: true, lng: true,
  debit: true, credit: true, balance: true, revenue: true, expense: true,
};
const DATES: Record<string, true> = { date: true, dueDate: true };
const MULTI: Record<string, true> = { phones: true, emails: true };

export function normalizeStatus(v: string): string {
  const s = v.trim().toLowerCase();
  if (/^(paid|complete|completed|settled|closed|yes|true|y)$/.test(s)) return "paid";
  if (/overdue|late|past due/.test(s)) return "overdue";
  if (/^(void|voided|cancel+ed|refunded)$/.test(s)) return "void";
  if (/^(open|unpaid|due|pending|outstanding|sent|draft|no|false|n|partial|partially paid)$/.test(s)) return "open";
  return s;
}

function normalizeDirection(v: string): string {
  const s = v.trim().toLowerCase();
  if (/^(in|inbound|incoming|received|recv)/.test(s)) return "inbound";
  if (/^(out|outbound|outgoing|sent)/.test(s)) return "outbound";
  if (/miss/.test(s)) return "missed";
  return s;
}

function parseDuration(v: string): number | undefined {
  const s = v.trim();
  const hms = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(s);
  if (hms) return Number(hms[1] ?? 0) * 3600 + Number(hms[2]) * 60 + Number(hms[3]);
  return parseNumber(s);
}

export function safeHttpUrl(v: string): string | undefined {
  const s = v.trim();
  if (!s) return undefined;
  const withScheme = /^https?:\/\//i.test(s) ? s : /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(s) ? `https://${s}` : "";
  if (!withScheme) return undefined;
  try {
    const u = new URL(withScheme);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function clipCell(v: string): string {
  return v.length > DATASET_LIMITS.maxCellChars ? v.slice(0, DATASET_LIMITS.maxCellChars) : v;
}

export function buildSearchText(canonical: Canonical, custom: CustomFields): string {
  const parts: string[] = [];
  const add = (v: unknown) => {
    if (v === null || v === undefined || v === "") return;
    if (Array.isArray(v)) v.forEach(add);
    else if (typeof v === "object") Object.values(v as Record<string, unknown>).forEach(add);
    else parts.push(String(v));
  };
  add(canonical);
  for (const [k, v] of Object.entries(custom)) if (k !== "_raw") add(v);
  return parts.join(" ").toLowerCase().replace(/\s+/g, " ").trim().slice(0, DATASET_LIMITS.searchTextChars);
}

function setCanon(archetype: DigestArchetype, canonical: Canonical, raw: Record<string, string>, field: string, key: string, value: string) {
  if (MULTI[field]) {
    const list = (canonical[field] as string[] | undefined) ?? [];
    for (const part of value.split(/\s*[;,]\s*|\s+:::\s+/).filter(Boolean)) {
      if (field === "phones") {
        const e = toE164(part);
        list.push(e ?? part);
        if (e && e !== part) raw[key] = value;
      } else if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(part)) list.push(part.toLowerCase());
    }
    if (list.length) canonical[field] = [...new Set(list)];
    return;
  }
  if (NUMERIC[field]) {
    const n = parseNumber(value);
    if (n !== undefined) {
      canonical[field] = n;
      if (String(n) !== value.trim()) raw[key] = value;
    } else raw[key] = value;
    return;
  }
  if (DATES[field]) {
    const d = toIsoDate(value);
    if (d) {
      canonical[field] = d;
      if (d !== value.trim()) raw[key] = value;
    } else canonical[field] = value;
    return;
  }
  if (field === "status" && archetype === "invoice_ledger") {
    canonical.status = normalizeStatus(value);
    if (canonical.status !== value) raw[key] = value;
    return;
  }
  if (field === "direction") {
    canonical.direction = normalizeDirection(value);
    return;
  }
  if (field === "durationSec") {
    const n = parseDuration(value);
    if (n !== undefined) canonical.durationSec = n;
    raw[key] = value;
    return;
  }
  if (field === "website" || field === "avatarUrl") {
    const u = safeHttpUrl(value);
    if (u) canonical[field] = u;
    else raw[key] = value;
    return;
  }
  if (field === "ownerPhone") {
    canonical.ownerPhone = toE164(value) ?? value;
    return;
  }
  if (field === "date" && archetype === "communication_log") {
    canonical.date = toIsoDate(value) ?? value;
    return;
  }
  canonical[field] = value;
}

export function normalizeRow(values: string[], schema: SchemaJson): NormalizedRow {
  const canonical: Canonical = {};
  const custom: CustomFields = {};
  const raw: Record<string, string> = {};
  schema.columns.forEach((col, i) => {
    const v = clipCell(String(values[i] ?? "").trim());
    if (!v) return;
    const field = schema.canonicalMap[col.key];
    if (field) setCanon(schema.archetype, canonical, raw, field, col.key, v);
    else custom[col.key] = v;
  });
  // Extra cells beyond the header row are kept too.
  for (let i = schema.columns.length; i < values.length; i++) {
    const v = clipCell(String(values[i] ?? "").trim());
    if (v) custom[`Column ${i + 1}`] = v;
  }
  if (schema.archetype === "contacts_crm" && !canonical.name) {
    const full = [canonical.firstName, canonical.lastName].filter(Boolean).join(" ");
    if (full) canonical.name = full;
    else if (canonical.company) canonical.name = canonical.company;
  }
  if (schema.archetype === "real_estate_parcels") {
    const acres = canonical.acreage as number | undefined;
    const value = (canonical.offerValue as number | undefined) ?? (canonical.assessedValue as number | undefined);
    if (acres && acres > 0 && value !== undefined) canonical.pricePerAcre = Math.round((value / acres) * 100) / 100;
  }
  if (Object.keys(raw).length) custom._raw = raw;
  return { canonical, custom, searchText: buildSearchText(canonical, custom) };
}
