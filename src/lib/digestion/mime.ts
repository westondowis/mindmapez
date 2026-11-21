/**
 * Email parser: RFC 5322 headers, MIME multipart, quoted-printable, base64 and RFC 2047 encoded
 * words; mbox splitting. HTML bodies are sanitized (allowlist) before they're stored and are only
 * ever shown in a no-script sandboxed iframe. Attachments are listed (name, type, size), not kept. Pure.
 */
import { EMAIL_LIMITS } from "./limits.ts";
import type { EmailMessage } from "./viewer-types.ts";
import { htmlToPlainText, sanitizeHtml } from "./sanitize-html.ts";

function decodeBytes(bytes: Uint8Array, charset = "utf-8"): string {
  try {
    return new TextDecoder(charset.toLowerCase().replace(/^us-ascii$/, "utf-8"), { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

function latin1Bytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

export function decodeQuotedPrintable(s: string): Uint8Array {
  const src = s.replace(/=\r?\n/g, "");
  const out: number[] = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (c === "=" && /^[0-9A-Fa-f]{2}$/.test(src.slice(i + 1, i + 3))) {
      out.push(parseInt(src.slice(i + 1, i + 3), 16));
      i += 2;
    } else out.push(src.charCodeAt(i) & 0xff);
  }
  return new Uint8Array(out);
}

export function decodeBase64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/=]/g, "");
  try {
    const bin = atob(clean);
    return latin1Bytes(bin);
  } catch {
    return new Uint8Array();
  }
}

/** Raw 8-bit header bytes (read as binary) are re-read as UTF-8. */
function fixRaw(s: string): string {
  return /[\x80-\xff]/.test(s) ? decodeBytes(latin1Bytes(s)) : s;
}

/** Bytes → one char per byte, so MIME decoding sees the original octets. */
export function binaryString(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return out;
}

/** RFC 2047: =?charset?B|Q?text?= words (adjacent encoded words join without the space). */
export function decodeWords(s: string): string {
  return fixRaw(s)
    .replace(/(=\?[^?]+\?[bqBQ]\?[^?]*\?=)\s+(?==\?)/g, "$1")
    .replace(/=\?([^?]+)\?([bqBQ])\?([^?]*)\?=/g, (_, cs: string, enc: string, text: string) => {
      const bytes = enc.toUpperCase() === "B" ? decodeBase64(text) : decodeQuotedPrintable(text.replace(/_/g, " "));
      return decodeBytes(bytes, cs.split("*")[0]);
    });
}

type Part = { headers: Record<string, string>; body: string };

export function splitHeaders(raw: string): Part {
  const text = raw.replace(/\r\n/g, "\n");
  const sep = text.indexOf("\n\n");
  const head = sep === -1 ? text : text.slice(0, sep);
  const body = sep === -1 ? "" : text.slice(sep + 2);
  const headers: Record<string, string> = {};
  for (const line of head.replace(/\n[ \t]+/g, " ").split("\n")) {
    const c = line.indexOf(":");
    if (c > 0) {
      const k = line.slice(0, c).trim().toLowerCase();
      if (!(k in headers)) headers[k] = line.slice(c + 1).trim();
    }
  }
  return { headers, body };
}

function param(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  const m = new RegExp(`(?:^|;)\\s*${name}\\*?=\\s*("([^"]*)"|([^;\\s]+))`, "i").exec(header);
  const v = m ? (m[2] ?? m[3]) : undefined;
  return v ? decodeWords(v.replace(/^utf-8''/i, "")) : undefined;
}

function decodePartBody(p: Part): Uint8Array {
  const enc = (p.headers["content-transfer-encoding"] ?? "").toLowerCase();
  if (enc === "base64") return decodeBase64(p.body);
  if (enc === "quoted-printable") return decodeQuotedPrintable(p.body);
  return latin1Bytes(p.body);
}

type Collected = { text: string[]; html: string[]; attachments: EmailMessage["attachments"] };

function walk(p: Part, out: Collected, depth = 0): void {
  if (depth > 12) return;
  const ct = (p.headers["content-type"] ?? "text/plain").toLowerCase();
  const disp = (p.headers["content-disposition"] ?? "").toLowerCase();
  if (ct.startsWith("multipart/")) {
    const boundary = param(p.headers["content-type"], "boundary");
    if (!boundary) return;
    const chunks = p.body.split(new RegExp(`\\r?\\n?--${boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:--)?\\s*\\r?\\n?`));
    for (const chunk of chunks.slice(1, 200)) {
      if (!chunk.trim()) continue;
      walk(splitHeaders(chunk), out, depth + 1);
    }
    return;
  }
  if (ct.startsWith("message/rfc822")) {
    walk(splitHeaders(p.body), out, depth + 1);
    return;
  }
  const filename = param(p.headers["content-disposition"], "filename") ?? param(p.headers["content-type"], "name");
  if (disp.startsWith("attachment") || (filename && !ct.startsWith("text/"))) {
    const enc = (p.headers["content-transfer-encoding"] ?? "").toLowerCase();
    const bytes = enc === "base64" ? Math.floor(p.body.replace(/\s/g, "").length * 0.75) : p.body.length;
    if (out.attachments.length < 100) out.attachments.push({ name: (filename ?? "attachment").slice(0, 200), mime: ct.split(";")[0]!.slice(0, 100), bytes });
    return;
  }
  const charset = param(p.headers["content-type"], "charset") ?? "utf-8";
  const decoded = decodeBytes(decodePartBody(p), charset);
  if (ct.startsWith("text/html")) out.html.push(decoded);
  else if (ct.startsWith("text/")) out.text.push(decoded);
}

function addresses(v: string | undefined): string[] {
  if (!v) return [];
  return decodeWords(v)
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 100)
    .map((s) => s.slice(0, 200));
}

export function parseEml(raw: string, id = "m0"): EmailMessage {
  const top = splitHeaders(raw);
  if (!top.headers.from && !top.headers.subject && !top.headers["content-type"]) throw new Error("This doesn't look like an email");
  const out: Collected = { text: [], html: [], attachments: [] };
  walk(top, out);
  const htmlRaw = out.html.join("\n");
  const text = (out.text.join("\n\n").trim() || htmlToPlainText(htmlRaw)).slice(0, EMAIL_LIMITS.maxBodyChars);
  const date = top.headers.date ? new Date(top.headers.date) : null;
  const msg: EmailMessage = {
    id,
    from: addresses(top.headers.from)[0] ?? "",
    to: addresses(top.headers.to),
    date: date && Number.isFinite(date.getTime()) ? date.toISOString() : "",
    subject: decodeWords(top.headers.subject ?? "(no subject)").slice(0, 500),
    text,
    attachments: out.attachments,
  };
  const cc = addresses(top.headers.cc);
  if (cc.length) msg.cc = cc;
  if (htmlRaw.trim()) msg.html = sanitizeHtml(htmlRaw, EMAIL_LIMITS.maxBodyChars);
  return msg;
}

/** mbox: messages start at lines beginning "From " (with ">From " unescaped). */
export function splitMbox(text: string, max: number = EMAIL_LIMITS.maxMessages): { messages: string[]; truncated: boolean } {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const messages: string[] = [];
  let cur: string[] | null = null;
  let truncated = false;
  for (const line of lines) {
    if (/^From \S/.test(line) && (cur === null || cur.length === 0 || cur[cur.length - 1] === "")) {
      if (cur && cur.join("").trim()) {
        if (messages.length >= max) {
          truncated = true;
          cur = null;
          break;
        }
        messages.push(cur.join("\n"));
      }
      cur = [];
      continue;
    }
    if (cur) cur.push(line.replace(/^>(>*From )/, "$1"));
  }
  if (cur && cur.join("").trim()) {
    if (messages.length >= max) truncated = true;
    else messages.push(cur.join("\n"));
  }
  return { messages, truncated };
}
