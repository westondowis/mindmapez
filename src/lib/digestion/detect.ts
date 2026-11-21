/**
 * Archetype detection for tabular uploads. Each archetype has weighted canonical fields with header
 * aliases; value patterns and a filename hint add half weight. The winner must score ≥ 3.0, lead the
 * runner-up by ≥ 1.0 and hold its required anchors, otherwise the table is generic. Pure.
 */
import { inferColumnType, normalizeHeader, uniqueHeaders, type ColumnDef, type ColumnType } from "./columns.ts";

export const DIGEST_ARCHETYPES = [
  "contacts_crm",
  "invoice_ledger",
  "real_estate_parcels",
  "financial_statement",
  "communication_log",
  "generic_table",
] as const;
export type DigestArchetype = (typeof DIGEST_ARCHETYPES)[number];

export const ARCHETYPE_LABEL: Record<DigestArchetype, string> = {
  contacts_crm: "Contacts",
  invoice_ledger: "Invoices",
  real_estate_parcels: "Parcels",
  financial_statement: "Financial statement",
  communication_log: "Communication log",
  generic_table: "Table",
};

type FieldSpec = { w: number; aliases: string[]; pattern?: ColumnType[] };
type ArchetypeSpec = { fields: Record<string, FieldSpec>; filename: RegExp };

export const SPECS: Record<Exclude<DigestArchetype, "generic_table">, ArchetypeSpec> = {
  contacts_crm: {
    filename: /contact|crm|people|leads?|address ?book|vcard/i,
    fields: {
      name: { w: 1.5, aliases: ["name", "full name", "display name", "contact name", "contact"] },
      firstName: { w: 1, aliases: ["first name", "given name", "first", "fname"] },
      lastName: { w: 1, aliases: ["last name", "family name", "surname", "last", "lname"] },
      company: { w: 0.5, aliases: ["company", "organization", "organisation", "organization name", "employer", "business"] },
      title: { w: 0.3, aliases: ["job title", "title", "organization title", "position", "role"] },
      phones: { w: 1.5, aliases: ["phone", "mobile", "cell", "telephone", "phone number", "mobile phone", "phone 1 value", "phone 2 value", "home phone", "business phone", "work phone", "primary phone"], pattern: ["phone"] },
      emails: { w: 1.5, aliases: ["email", "e mail", "email address", "e mail address", "email 1 value", "email 2 value", "e mail 2 address", "work email", "personal email"], pattern: ["email"] },
      website: { w: 0.5, aliases: ["website", "web page", "url", "homepage", "website 1 value", "web site", "linkedin"] },
      avatarUrl: { w: 0.5, aliases: ["photo", "avatar", "picture", "image", "profile photo", "headshot", "photo url"], pattern: ["image_url"] },
      address: { w: 0.3, aliases: ["address", "street", "address 1 formatted", "home address", "business street", "mailing address"] },
      notes: { w: 0.2, aliases: ["notes", "note", "comments"] },
    },
  },
  invoice_ledger: {
    filename: /invoice|billing|receipt|sales|orders?|ledger/i,
    fields: {
      invoiceNo: { w: 1.5, aliases: ["invoice", "invoice no", "invoice number", "invoice id", "invoice #", "inv", "order id", "order number", "receipt", "receipt number", "transaction id"] },
      customer: { w: 1, aliases: ["customer", "client", "bill to", "customer name", "client name", "sold to", "member"] },
      date: { w: 0.7, aliases: ["date", "invoice date", "order date", "issued", "sale date", "transaction date"], pattern: ["date"] },
      dueDate: { w: 0.8, aliases: ["due date", "due", "payment due"] },
      category: { w: 0.6, aliases: ["category", "type", "item type", "product category", "department", "class"] },
      description: { w: 0.4, aliases: ["description", "item", "product", "service", "memo", "line item", "sku"] },
      amount: { w: 1.5, aliases: ["amount", "total", "subtotal", "price", "amount due", "grand total", "balance due", "net amount", "sale amount"], pattern: ["currency"] },
      currency: { w: 0.2, aliases: ["currency"] },
      status: { w: 1, aliases: ["status", "paid", "payment status", "state"] },
      qty: { w: 0.4, aliases: ["qty", "quantity", "units"] },
    },
  },
  real_estate_parcels: {
    filename: /parcel|apn|land|acre|property|lots?|county/i,
    fields: {
      apn: { w: 2, aliases: ["apn", "parcel", "parcel id", "parcel number", "parcel no", "pin", "tax id", "assessor parcel number", "property id"] },
      county: { w: 0.8, aliases: ["county", "county name"] },
      state: { w: 0.3, aliases: ["state", "st"] },
      acreage: { w: 1.5, aliases: ["acreage", "acres", "lot acres", "lot size", "lot size acres", "gross acres", "calc acreage", "acre"] },
      ownerName: { w: 1, aliases: ["owner", "owner name", "owner 1", "owner full name", "property owner"] },
      mailingAddress: { w: 0.6, aliases: ["mailing address", "owner address", "mail address", "mailing street"] },
      situsAddress: { w: 0.6, aliases: ["situs", "situs address", "property address", "site address", "location"] },
      assessedValue: { w: 0.8, aliases: ["assessed value", "market value", "total value", "assessed", "land value", "tax value", "appraised value"], pattern: ["currency"] },
      offerValue: { w: 0.8, aliases: ["offer", "offer price", "offer value", "offer amount"] },
      lat: { w: 0.4, aliases: ["lat", "latitude"] },
      lng: { w: 0.4, aliases: ["lng", "lon", "long", "longitude"] },
      ownerPhone: { w: 0.3, aliases: ["owner phone", "phone"] },
      ownerEmail: { w: 0.3, aliases: ["owner email", "email"] },
      zoning: { w: 0.4, aliases: ["zoning", "zone", "land use"] },
    },
  },
  financial_statement: {
    filename: /statement|balance|trial|p ?& ?l|profit|gl|general ledger|financ/i,
    fields: {
      account: { w: 1.5, aliases: ["account", "account name", "gl account", "account number", "gl code", "line item"] },
      debit: { w: 1.5, aliases: ["debit", "debits", "dr"], pattern: ["currency", "number"] },
      credit: { w: 1.5, aliases: ["credit", "credits", "cr"], pattern: ["currency", "number"] },
      balance: { w: 1, aliases: ["balance", "ending balance", "net", "net income"] },
      period: { w: 0.8, aliases: ["period", "month", "fiscal period", "quarter", "year"] },
      revenue: { w: 0.8, aliases: ["revenue", "income", "sales"] },
      expense: { w: 0.8, aliases: ["expense", "expenses", "cost", "cogs"] },
    },
  },
  communication_log: {
    filename: /call|sms|messages?|log|inbox|chat|history/i,
    fields: {
      from: { w: 1.2, aliases: ["from", "sender", "caller", "from number"] },
      to: { w: 1.2, aliases: ["to", "recipient", "callee", "to number"] },
      subject: { w: 0.8, aliases: ["subject", "topic"] },
      date: { w: 0.8, aliases: ["sent", "received", "date", "timestamp", "time", "date time", "call date"], pattern: ["date"] },
      direction: { w: 1.2, aliases: ["direction", "type", "incoming outgoing", "in out"] },
      durationSec: { w: 1, aliases: ["duration", "call duration", "length", "seconds"] },
      message: { w: 1, aliases: ["message", "body", "text", "content"] },
      thread: { w: 0.5, aliases: ["thread", "conversation", "thread id"] },
    },
  },
};

const ANCHORS: Record<Exclude<DigestArchetype, "generic_table">, string[][]> = {
  // Every inner list is an "any of" group; all groups must be satisfied.
  contacts_crm: [["name", "firstName", "lastName", "company"], ["phones", "emails"]],
  invoice_ledger: [["amount"], ["invoiceNo", "customer", "date"]],
  real_estate_parcels: [["apn", "acreage"], ["apn", "county", "ownerName"]],
  financial_statement: [["account"], ["debit", "credit", "balance"]],
  communication_log: [["from", "to"], ["date", "direction", "message", "durationSec"]],
};

const TIE_ORDER: DigestArchetype[] = ["real_estate_parcels", "invoice_ledger", "contacts_crm", "financial_statement", "communication_log"];

/** Word-boundary alias match ("key" must not hit "monkey"). */
function aliasMatches(header: string, alias: string): boolean {
  if (header === alias) return true;
  if (alias.length <= 3) return false;
  return new RegExp(`(^| )${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(header);
}

export type SchemaJson = {
  version: 1;
  archetype: DigestArchetype;
  confidence: number;
  columns: ColumnDef[];
  canonicalMap: Record<string, string>; // column key -> canonical field
  customKeys: string[];
  scores: Partial<Record<DigestArchetype, number>>;
};

export type DetectResult = SchemaJson;

/** Map columns onto one archetype's canonical fields. Exact alias first, then word match. */
export function mapColumns(archetype: DigestArchetype, columns: ColumnDef[]): Record<string, string> {
  if (archetype === "generic_table") return {};
  const spec = SPECS[archetype];
  const map: Record<string, string> = {};
  const taken = new Set<string>();
  const multi = new Set(["phones", "emails"]);
  for (const pass of ["exact", "word"] as const) {
    for (const col of columns) {
      if (map[col.key]) continue;
      const h = normalizeHeader(col.header);
      for (const [field, fs] of Object.entries(spec.fields)) {
        if (taken.has(field) && !multi.has(field)) continue;
        const hit = pass === "exact" ? fs.aliases.includes(h) : fs.aliases.some((a) => aliasMatches(h, a));
        if (hit) {
          map[col.key] = field;
          taken.add(field);
          break;
        }
      }
    }
  }
  return map;
}

export function detectDigestArchetype(headersIn: string[], sampleRows: string[][], filename = ""): DetectResult {
  const keys = uniqueHeaders(headersIn);
  const sample = sampleRows.slice(0, 200);
  const columns: ColumnDef[] = keys.map((key, i) => {
    const { type, fill } = inferColumnType(sample.map((r) => r[i] ?? ""));
    return { key, header: headersIn[i]?.trim() || key, type, fill: Math.round(fill * 1000) / 1000 };
  });
  const scores: Partial<Record<DigestArchetype, number>> = {};
  const maps: Partial<Record<DigestArchetype, Record<string, string>>> = {};
  for (const a of TIE_ORDER) {
    const spec = SPECS[a as Exclude<DigestArchetype, "generic_table">];
    const map = mapColumns(a, columns);
    maps[a] = map;
    const fieldsHit = new Set(Object.values(map));
    let s = 0;
    for (const f of fieldsHit) s += spec.fields[f]?.w ?? 0;
    for (const [f, fs] of Object.entries(spec.fields)) {
      if (!fs.pattern) continue;
      if (columns.some((c) => fs.pattern!.includes(c.type) && c.fill > 0.3 && !fieldsHit.has(f))) s += 0.5 * fs.w;
    }
    if (filename && spec.filename.test(filename)) s += 0.5;
    scores[a] = Math.round(s * 100) / 100;
  }
  const ranked = TIE_ORDER.map((a) => ({ a, s: scores[a] ?? 0 })).sort((x, y) => y.s - x.s || TIE_ORDER.indexOf(x.a) - TIE_ORDER.indexOf(y.a));
  const top = ranked[0]!;
  const second = ranked[1]!;
  const fieldsTop = new Set(Object.values(maps[top.a] ?? {}));
  const anchorsOk = ANCHORS[top.a as Exclude<DigestArchetype, "generic_table">].every((group) => group.some((f) => fieldsTop.has(f)));
  const wins = top.s >= 3 && top.s - second.s >= 1 && anchorsOk;
  const archetype: DigestArchetype = wins ? top.a : "generic_table";
  const canonicalMap = wins ? maps[top.a]! : {};
  const confidence = top.s + second.s > 0 ? Math.round((top.s / (top.s + second.s)) * 100) / 100 : 0;
  for (const c of columns) if (canonicalMap[c.key]) c.canonical = canonicalMap[c.key];
  return {
    version: 1,
    archetype,
    confidence,
    columns,
    canonicalMap,
    customKeys: columns.filter((c) => !canonicalMap[c.key]).map((c) => c.key),
    scores,
  };
}

/** Re-target a detected schema at an archetype the user picked in the preview. */
export function withArchetype(schema: SchemaJson, archetype: DigestArchetype): SchemaJson {
  const columns = schema.columns.map((c) => ({ ...c, canonical: undefined as string | undefined }));
  const canonicalMap = mapColumns(archetype, columns);
  for (const c of columns) if (canonicalMap[c.key]) c.canonical = canonicalMap[c.key];
  return { ...schema, archetype, columns, canonicalMap, customKeys: columns.filter((c) => !canonicalMap[c.key]).map((c) => c.key) };
}
