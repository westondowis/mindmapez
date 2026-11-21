/**
 * Allowlist HTML sanitizer that works without a DOM (tokenizer-based, pure, tested in node).
 * Keeps only formatting tags and safe attributes; drops script/style/iframe/object/svg/math/form
 * contents, every on* handler, style attributes and non-http(s)/mailto links. Images are kept only
 * as data:image (raster) sources, so remote tracking pixels never load.
 */
const ALLOWED = new Set([
  "a", "abbr", "b", "blockquote", "br", "caption", "code", "dd", "del", "div", "dl", "dt", "em", "figcaption", "figure",
  "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "ins", "kbd", "li", "mark", "ol", "p", "pre", "q", "s", "small",
  "span", "strong", "sub", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul",
]);
const DROP_WITH_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "svg", "math", "noscript", "template", "form", "select", "textarea", "head", "title", "frameset", "frame", "applet", "audio", "video", "canvas"]);
const VOID = new Set(["br", "hr", "img"]);
const ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title"]),
  img: new Set(["src", "alt", "width", "height"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan", "scope"]),
  "*": new Set(["id", "title"]),
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function decodeAttr(v: string): string {
  return v
    .replace(/&#x([0-9a-f]+);?/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16) || 32))
    .replace(/&#(\d+);?/g, (_, d: string) => String.fromCodePoint(Number(d) || 32))
    .replace(/&(amp|lt|gt|quot|apos|colon|tab|newline);?/gi, (_, e: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", colon: ":", tab: "\t", newline: "\n" })[e.toLowerCase()] ?? "");
}

export function safeLink(raw: string): string | null {
  const v = decodeAttr(raw).replace(/[\u0000-\u0020\u007f-\u009f]/g, "");
  if (/^(https?:|mailto:)/i.test(v)) return v;
  if (/^#[\w-]*$/.test(v)) return v;
  return null;
}

function safeImgSrc(raw: string): string | null {
  const v = decodeAttr(raw).trim();
  return /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(v) ? v : null;
}

const TAG_RE = /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<![^>]*>|<\?[^>]*>|<\/?([a-zA-Z][a-zA-Z0-9:-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*\/?>/g;
const ATTR_RE = /([^\s=>/]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

export function sanitizeHtml(html: string, maxChars = 400_000): string {
  const input = html.slice(0, maxChars * 2);
  const out: string[] = [];
  const open: string[] = [];
  let dropping: string | null = null;
  let last = 0;
  for (const m of input.matchAll(TAG_RE)) {
    const idx = m.index!;
    if (!dropping && idx > last) out.push(escapeHtml(decodeAttr(input.slice(last, idx))));
    last = idx + m[0].length;
    const name = m[1]?.toLowerCase();
    if (!name) continue; // comment / doctype / PI / CDATA
    const closing = m[0][1] === "/";
    if (dropping) {
      if (closing && name === dropping) dropping = null;
      continue;
    }
    if (DROP_WITH_CONTENT.has(name)) {
      if (!closing && !m[0].endsWith("/>")) dropping = name;
      continue;
    }
    if (!ALLOWED.has(name)) continue;
    if (closing) {
      const at = open.lastIndexOf(name);
      if (at !== -1) {
        for (let k = open.length - 1; k >= at; k--) out.push(`</${open[k]}>`);
        open.length = at;
      }
      continue;
    }
    const attrs: string[] = [];
    const allowed = ATTRS[name];
    for (const a of (m[2] ?? "").matchAll(ATTR_RE)) {
      const an = a[1]!.toLowerCase();
      if (!(allowed?.has(an) || ATTRS["*"]!.has(an))) continue;
      const val = a[3] ?? a[4] ?? a[5] ?? "";
      if (an === "href") {
        const href = safeLink(val);
        if (href) attrs.push(`href="${escapeHtml(href)}"`, `rel="noopener noreferrer nofollow"`, `target="_blank"`);
        continue;
      }
      if (an === "src") {
        const src = safeImgSrc(val);
        if (src) attrs.push(`src="${escapeHtml(src)}"`);
        continue;
      }
      if (an === "id") {
        if (/^[\w-]{1,64}$/.test(val)) attrs.push(`id="${val}"`);
        continue;
      }
      attrs.push(`${an}="${escapeHtml(decodeAttr(val).slice(0, 200))}"`);
    }
    if (name === "img" && !attrs.some((a) => a.startsWith("src="))) continue;
    out.push(`<${name}${attrs.length ? " " + attrs.join(" ") : ""}>`);
    if (!VOID.has(name)) open.push(name);
  }
  if (!dropping && last < input.length) out.push(escapeHtml(decodeAttr(input.slice(last))));
  for (let k = open.length - 1; k >= 0; k--) out.push(`</${open[k]}>`);
  return out.join("").slice(0, maxChars);
}

/** Readable text from HTML (block tags become line breaks), no DOM required. */
export function htmlToPlainText(html: string): string {
  return decodeAttr(
    html
      .replace(/<(script|style|head|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr|blockquote|section|article|pre|table|ul|ol)>/gi, "\n")
      .replace(/<(td|th)\b[^>]*>/gi, "\t")
      .replace(/<li\b[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
