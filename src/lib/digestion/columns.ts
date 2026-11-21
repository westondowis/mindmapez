/** Column type inference and value normalization for digested tables. Pure. */

export type ColumnType = "text" | "number" | "currency" | "percent" | "phone" | "email" | "url" | "image_url" | "date" | "boolean";

export type ColumnDef = { key: string; header: string; type: ColumnType; fill: number; canonical?: string };

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const URL_RE = /^https?:\/\/\S+$/i;
const IMAGE_URL = /^https?:\/\/\S+(\.(png|jpe?g|gif|webp|svg)(\?\S*)?$|gravatar\.com|googleusercontent\.com|licdn\.com|fbcdn\.net)/i;
const CURRENCY = /^\(?-?\s*(?:[$€£¥]|usd|eur|gbp)\s*-?[\d,]+(\.\d+)?\)?$|^-?[\d,]+(\.\d+)?\s*(?:usd|eur|gbp)$/i;
const PERCENT = /^-?\d+(\.\d+)?\s*%$/;
const NUMBER = /^-?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/;
const BOOL = /^(true|false|yes|no|y|n)$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}([ t]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(z|[+-]\d{2}:?\d{2})?)?$/i;
const US_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/;

export function isPhone(v: string): boolean {
  if (!/^[+\d()\-.\sx]+$/i.test(v)) return false;
  const digits = v.replace(/x.*$/i, "").replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

export function looksLikeDate(v: string): boolean {
  return ISO_DATE.test(v) || US_DATE.test(v);
}

function matches(type: ColumnType, v: string): boolean {
  switch (type) {
    case "email":
      return EMAIL.test(v);
    case "image_url":
      return IMAGE_URL.test(v);
    case "url":
      return URL_RE.test(v);
    case "currency":
      return CURRENCY.test(v);
    case "percent":
      return PERCENT.test(v);
    case "phone":
      // Bare digit runs are ids/numbers; phones carry separators or a leading +.
      return isPhone(v) && /[()\-.\s+]/.test(v) && !NUMBER.test(v);
    case "date":
      return looksLikeDate(v);
    case "number":
      return NUMBER.test(v);
    case "boolean":
      return BOOL.test(v);
    default:
      return true;
  }
}

const ORDER: ColumnType[] = ["email", "image_url", "url", "date", "currency", "percent", "phone", "number", "boolean"];

/** A column gets a type when ≥80% of up to 200 non-empty samples match it. */
export function inferColumnType(values: string[]): { type: ColumnType; fill: number } {
  const nonEmpty = values.map((v) => (v ?? "").trim()).filter(Boolean);
  const fill = values.length ? nonEmpty.length / values.length : 0;
  const sample = nonEmpty.slice(0, 200);
  if (!sample.length) return { type: "text", fill };
  for (const t of ORDER) {
    const hit = sample.filter((v) => matches(t, v)).length;
    if (hit / sample.length >= 0.8) return { type: t, fill };
  }
  return { type: "text", fill };
}

export function parseNumber(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s) return undefined;
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s.replace(/^[\s$€£¥(]+/, ""));
  const cleaned = s.replace(/usd|eur|gbp/gi, "").replace(/[^\d.]/g, "");
  if (!cleaned || cleaned === ".") return undefined;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return undefined;
  return neg ? -n : n;
}

/** Normalize to E.164 when unambiguous (US 10/11 digits or already +); else undefined. */
export function toE164(v: string): string | undefined {
  const trimmed = v.trim();
  const main = trimmed.replace(/\s*(x|ext\.?)\s*\d+$/i, "");
  const digits = main.replace(/\D/g, "");
  if (main.startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return undefined;
}

/** ISO date (YYYY-MM-DD) from ISO, M/D/YYYY or an Excel serial (1900 system). */
export function toIsoDate(v: unknown): string | undefined {
  if (typeof v === "number" || (typeof v === "string" && /^\d{5}(\.\d+)?$/.test(v.trim()))) {
    const serial = Number(v);
    if (serial > 20000 && serial < 80000) {
      const ms = Math.round((serial - 25569) * 86400 * 1000);
      return new Date(ms).toISOString().slice(0, 10);
    }
    return undefined;
  }
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (ISO_DATE.test(s)) return s.slice(0, 10);
  const m = US_DATE.exec(s);
  if (m) {
    const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const mm = Number(m[1]);
    const dd = Number(m[2]);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) return `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }
  return undefined;
}

export function normalizeHeader(h: string): string {
  return h
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_\-./#:]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Unique, non-empty keys for headers; duplicates get " (2)", " (3)"... */
export function uniqueHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((h, i) => {
    const base = (h ?? "").trim() || `Column ${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}
