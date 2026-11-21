/**
 * vCard 3.0/4.0 parser → a contacts table (headers + rows) that goes through the normal dataset
 * pipeline (archetype contacts_crm). Embedded PHOTO data over 256 KB is dropped; embedded photos are
 * never stored as avatars (only http(s) photo URLs are). At most 5,000 contacts. Pure.
 */
import { VCARD_LIMITS } from "./limits.ts";
import { unfoldIcs } from "./ics.ts";

export type VcardTable = { headers: string[]; rows: string[][]; photosDropped: number; truncated: boolean };

function unescapeV(v: string): string {
  return v.replace(/\\n/gi, "\n").replace(/\\([,;:\\])/g, "$1");
}

function decodeQP(v: string, charset = "utf-8"): string {
  const bytes: number[] = [];
  const s = v.replace(/=\r?\n/g, "");
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "=" && /^[0-9A-F]{2}$/i.test(s.slice(i + 1, i + 3))) {
      bytes.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(s.charCodeAt(i) & 0xff);
  }
  try {
    return new TextDecoder(charset).decode(new Uint8Array(bytes));
  } catch {
    return new TextDecoder().decode(new Uint8Array(bytes));
  }
}

export function parseVcards(text: string): VcardTable {
  const headers = ["Full name", "First name", "Last name", "Organization", "Title", "Phone 1", "Phone 2", "Phone 3", "Email 1", "Email 2", "Website", "Photo URL", "Address", "Birthday", "Notes"];
  const rows: string[][] = [];
  let card: Record<string, string[]> | null = null;
  let photosDropped = 0;
  let truncated = false;
  // vCard 2.1 quoted-printable soft breaks join the next line too.
  const lines = unfoldIcs(text.replace(/=\r?\n/g, "=\n "));
  for (const raw of lines) {
    const line = raw.replace(/=\n /g, "=\n");
    const up = line.toUpperCase();
    if (up === "BEGIN:VCARD") {
      card = {};
      continue;
    }
    if (up === "END:VCARD") {
      if (card) {
        if (rows.length >= VCARD_LIMITS.maxContacts) {
          truncated = true;
          break;
        }
        rows.push(toRow(card));
      }
      card = null;
      continue;
    }
    if (!card) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const head = line.slice(0, colon);
    let value = line.slice(colon + 1);
    const [nameRaw, ...params] = head.split(";");
    const name = nameRaw!.replace(/^item\d+\./i, "").toUpperCase();
    const p = params.map((x) => x.toUpperCase());
    if (p.some((x) => x.includes("QUOTED-PRINTABLE"))) {
      const cs = p.find((x) => x.startsWith("CHARSET="))?.slice(8).toLowerCase();
      value = decodeQP(value, cs);
    }
    if (name === "PHOTO") {
      if (/^https?:\/\//i.test(value) && value.length <= 2048) (card.PHOTO ??= []).push(value);
      else if (value.length * 0.75 > VCARD_LIMITS.maxPhotoBytes) photosDropped++;
      continue;
    }
    (card[name] ??= []).push(value);
  }
  return { headers, rows, photosDropped, truncated };

  function toRow(c: Record<string, string[]>): string[] {
    const n = (c.N?.[0] ?? "").split(";").map(unescapeV);
    const fn = unescapeV(c.FN?.[0] ?? [n[1], n[2], n[0]].filter(Boolean).join(" "));
    const tel = (c.TEL ?? []).map(unescapeV).slice(0, 3);
    const email = (c.EMAIL ?? []).map(unescapeV).slice(0, 2);
    const adr = (c.ADR?.[0] ?? "").split(";").map(unescapeV).filter(Boolean).join(", ");
    return [
      fn,
      n[1] ?? "",
      n[0] ?? "",
      unescapeV((c.ORG?.[0] ?? "").split(";").filter(Boolean).join(" · ")),
      unescapeV(c.TITLE?.[0] ?? ""),
      tel[0] ?? "",
      tel[1] ?? "",
      tel[2] ?? "",
      email[0] ?? "",
      email[1] ?? "",
      unescapeV(c.URL?.[0] ?? ""),
      c.PHOTO?.[0] ?? "",
      adr,
      c.BDAY?.[0] ?? "",
      unescapeV(c.NOTE?.[0] ?? ""),
    ].map((v) => v.slice(0, 4096));
  }
}
