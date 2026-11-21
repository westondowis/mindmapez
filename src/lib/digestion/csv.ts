/**
 * Streaming RFC 4180 CSV/TSV parser. Feed it string chunks of any size (chunk boundaries may land
 * inside a quoted field); it emits complete rows. Handles quotes, "" escapes, CRLF/LF/CR, embedded
 * newlines, a leading BOM, and auto-detects the delimiter (, \t ; |) from the first chunk.
 */

export type Delimiter = "," | "\t" | ";" | "|";
const CANDIDATES: Delimiter[] = [",", "\t", ";", "|"];

/** Pick the delimiter that splits the first lines most consistently (quotes respected). */
export function detectDelimiter(sample: string): Delimiter {
  const lines: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < sample.length && lines.length < 10; i++) {
    const ch = sample[i];
    if (ch === '"') inQ = !inQ;
    if (!inQ && (ch === "\n" || ch === "\r")) {
      if (cur.trim()) lines.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim() && lines.length < 10) lines.push(cur);
  let best: Delimiter = ",";
  let bestScore = -1;
  for (const d of CANDIDATES) {
    const counts = lines.map((l) => countOutsideQuotes(l, d));
    if (!counts.length || counts[0] === 0) continue;
    const first = counts[0]!;
    const consistent = counts.filter((c) => c === first).length;
    const score = consistent * 1000 + first;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

function countOutsideQuotes(line: string, d: string): number {
  let n = 0;
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && ch === d) n++;
  }
  return n;
}

export class CsvParser {
  private delimiter: Delimiter | null;
  private field = "";
  private row: string[] = [];
  private inQuotes = false;
  private quotePending = false; // saw a quote inside quotes; next char decides escape vs close
  private started = false;
  private lastWasCR = false;

  constructor(delimiter?: Delimiter) {
    this.delimiter = delimiter ?? null;
  }

  get detected(): Delimiter | null {
    return this.delimiter;
  }

  push(chunk: string): string[][] {
    if (!this.started) {
      if (chunk.charCodeAt(0) === 0xfeff) chunk = chunk.slice(1);
      if (!this.delimiter) this.delimiter = detectDelimiter(chunk);
      this.started = true;
    }
    const out: string[][] = [];
    const d = this.delimiter!;
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i]!;
      if (this.lastWasCR) {
        this.lastWasCR = false;
        if (ch === "\n") continue;
      }
      if (this.inQuotes) {
        if (this.quotePending) {
          this.quotePending = false;
          if (ch === '"') {
            this.field += '"';
            continue;
          }
          this.inQuotes = false;
          // fall through: ch is processed as an unquoted char
        } else if (ch === '"') {
          this.quotePending = true;
          continue;
        } else {
          this.field += ch;
          continue;
        }
      }
      if (ch === '"' && this.field === "") {
        this.inQuotes = true;
      } else if (ch === d) {
        this.row.push(this.field);
        this.field = "";
      } else if (ch === "\n" || ch === "\r") {
        this.row.push(this.field);
        this.field = "";
        out.push(this.row);
        this.row = [];
        if (ch === "\r") this.lastWasCR = true;
      } else {
        this.field += ch;
      }
    }
    return out.filter((r) => !(r.length === 1 && r[0] === ""));
  }

  end(): string[][] {
    if (this.quotePending) {
      this.quotePending = false;
      this.inQuotes = false;
    }
    if (this.field !== "" || this.row.length) {
      this.row.push(this.field);
      const r = this.row;
      this.row = [];
      this.field = "";
      return r.length === 1 && r[0] === "" ? [] : [r];
    }
    return [];
  }
}

/** Convenience for small inputs and tests. */
export function parseCsv(text: string, delimiter?: Delimiter): string[][] {
  const p = new CsvParser(delimiter);
  return [...p.push(text), ...p.end()];
}
