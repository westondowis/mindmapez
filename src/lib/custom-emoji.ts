/**
 * Custom emoji tokens and the SVG whitelist sanitizer.
 *
 * A branch / sector / memory keeps using its plain `emoji` text field. A custom
 * icon is stored there as `custom:<id>`, where <id> is a row in custom_emojis.
 * Every SVG is rebuilt from a strict whitelist on the server before it is
 * saved and again on the client before it renders (always as an <img> data
 * URI, which never runs script). Pure module: no DOM, safe on server and in
 * node tests.
 */

export const CUSTOM_EMOJI_PREFIX = "custom:";
export const CUSTOM_EMOJI_VIEWBOX = "0 0 64 64";
export const MAX_SVG_INPUT = 60_000;
export const MAX_SVG_OUTPUT = 24_000;
export const MAX_CUSTOM_LABEL = 60;
export type CustomEmojiSource = "generated" | "drawn";
export type CustomEmoji = { id: string; label: string; svg: string; source: CustomEmojiSource; createdAt: string };

const ID_RE = /^[A-Za-z0-9-]{8,64}$/;

export function customEmojiToken(id: string): string {
  if (!ID_RE.test(id)) throw new Error("invalid custom emoji id");
  return `${CUSTOM_EMOJI_PREFIX}${id}`;
}

/** The custom emoji id inside a `custom:<id>` value, or null for a normal emoji / malformed token. */
export function parseCustomEmojiToken(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v.startsWith(CUSTOM_EMOJI_PREFIX)) return null;
  const id = v.slice(CUSTOM_EMOJI_PREFIX.length);
  return ID_RE.test(id) ? id : null;
}

export function isCustomEmojiValue(value: string | null | undefined): boolean {
  return parseCustomEmojiToken(value) !== null;
}

/**
 * Clamp a value bound for an emoji column: keeps a valid custom token whole,
 * keeps up to 16 code points of a normal emoji (long ZWJ families survive),
 * and maps a malformed `custom:` token or empty value to `fallback`.
 */
export function normalizeEmojiValue(value: string | null | undefined, fallback: string): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) return fallback;
  if (v.startsWith(CUSTOM_EMOJI_PREFIX)) return parseCustomEmojiToken(v) ? v : fallback;
  return Array.from(v).slice(0, 16).join("");
}

export function cleanCustomLabel(label: unknown): string {
  return typeof label === "string" ? label.replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_CUSTOM_LABEL) : "";
}

const ELEMENTS = new Set([
  "svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon",
  "defs", "linearGradient", "radialGradient", "stop",
]);

const NUM = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?(?:%|px)?$/;
const COLOR = /^(?:none|currentColor|transparent|#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20}|rgba?\(\s*[\d.%\s,]+\)|hsla?\(\s*[\d.%\s,]+\)|url\(#[A-Za-z][\w-]{0,40}\))$/;
const TRANSFORM = /^(?:\s*(?:matrix|translate|scale|rotate|skewX|skewY)\(\s*[-\d.eE+\s,]+\)\s*)+$/;
const PATH_D = /^[MmZzLlHhVvCcSsQqTtAa\d\s.,eE+-]+$/;
const POINTS = /^[\d\s.,eE+-]+$/;
const VIEWBOX = /^\s*-?[\d.]+(?:[\s,]+-?[\d.]+){3}\s*$/;

const ATTRS: Record<string, (v: string) => boolean> = {
  viewBox: (v) => VIEWBOX.test(v),
  width: (v) => NUM.test(v),
  height: (v) => NUM.test(v),
  x: (v) => NUM.test(v), y: (v) => NUM.test(v),
  x1: (v) => NUM.test(v), y1: (v) => NUM.test(v), x2: (v) => NUM.test(v), y2: (v) => NUM.test(v),
  cx: (v) => NUM.test(v), cy: (v) => NUM.test(v), r: (v) => NUM.test(v),
  rx: (v) => NUM.test(v), ry: (v) => NUM.test(v), fx: (v) => NUM.test(v), fy: (v) => NUM.test(v),
  offset: (v) => NUM.test(v),
  d: (v) => v.length <= 12_000 && PATH_D.test(v),
  points: (v) => v.length <= 6_000 && POINTS.test(v),
  fill: (v) => COLOR.test(v),
  stroke: (v) => COLOR.test(v),
  "stop-color": (v) => COLOR.test(v),
  "stroke-width": (v) => NUM.test(v),
  "stroke-linecap": (v) => /^(?:butt|round|square)$/.test(v),
  "stroke-linejoin": (v) => /^(?:miter|round|bevel)$/.test(v),
  "stroke-miterlimit": (v) => NUM.test(v),
  "fill-rule": (v) => /^(?:nonzero|evenodd)$/.test(v),
  "clip-rule": (v) => /^(?:nonzero|evenodd)$/.test(v),
  opacity: (v) => NUM.test(v),
  "fill-opacity": (v) => NUM.test(v),
  "stroke-opacity": (v) => NUM.test(v),
  "stop-opacity": (v) => NUM.test(v),
  transform: (v) => v.length <= 300 && TRANSFORM.test(v),
  gradientTransform: (v) => v.length <= 300 && TRANSFORM.test(v),
  gradientUnits: (v) => /^(?:userSpaceOnUse|objectBoundingBox)$/.test(v),
  id: (v) => /^[A-Za-z][\w-]{0,40}$/.test(v),
};

const TOKEN_RE =
  /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\?[\s\S]*?\?>|<(\/?)([A-Za-z][\w:.-]*)((?:\s+[^\s=>/"']+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>"']+))?)*)\s*(\/?)>/g;
const ATTR_RE = /([^\s=>/"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;

function cleanAttrs(name: string, raw: string): string {
  const out: string[] = [];
  const seen = new Set<string>();
  ATTR_RE.lastIndex = 0;
  for (let m = ATTR_RE.exec(raw); m; m = ATTR_RE.exec(raw)) {
    const attr = m[1]!;
    const value = (m[2] ?? m[3] ?? m[4] ?? "").trim();
    if (seen.has(attr)) continue;
    const check = Object.prototype.hasOwnProperty.call(ATTRS, attr) ? ATTRS[attr] : undefined;
    if (!check || value.length > 12_000 || /["'<>&\\]/.test(value) || !check(value)) continue;
    if (name === "svg" && attr !== "viewBox") continue;
    seen.add(attr);
    out.push(`${attr}="${value}"`);
  }
  if (name === "svg") {
    const vb = out.find((a) => a.startsWith("viewBox="));
    return ` xmlns="http://www.w3.org/2000/svg" ${vb ?? `viewBox="${CUSTOM_EMOJI_VIEWBOX}"`} width="64" height="64"`;
  }
  return out.length ? ` ${out.join(" ")}` : "";
}

/**
 * Rebuild an SVG from whitelisted elements and attributes only. Everything else
 * (script, foreignObject, image, use, style, text, on* handlers, href, external
 * url(), entities, comments) is dropped along with its children. Returns null
 * when no <svg> root or nothing drawable survives, or the result is too large.
 */
export function sanitizeSvg(input: unknown): string | null {
  if (typeof input !== "string" || input.length > MAX_SVG_INPUT) return null;
  const start = input.search(/<svg[\s>/]/);
  if (start < 0) return null;
  const src = input.slice(start);
  const out: string[] = [];
  const stack: string[] = [];
  let skip = 0;
  let drawable = 0;
  let elements = 0;
  let closedRoot = false;
  TOKEN_RE.lastIndex = 0;
  for (let m = TOKEN_RE.exec(src); m && !closedRoot; m = TOKEN_RE.exec(src)) {
    const name = m[2];
    if (!name) continue; // comment / doctype / CDATA / PI
    const closing = m[1] === "/";
    const selfClosing = m[4] === "/";
    if (skip > 0) {
      if (closing) skip -= 1;
      else if (!selfClosing) skip += 1;
      continue;
    }
    if (closing) {
      if (stack.length && stack[stack.length - 1] === name) {
        stack.pop();
        out.push(`</${name}>`);
        if (stack.length === 0) closedRoot = true;
      }
      continue;
    }
    const allowed = ELEMENTS.has(name) && (stack.length > 0 ? name !== "svg" : name === "svg");
    if (!allowed) {
      if (stack.length === 0) return null;
      if (!selfClosing) skip = 1;
      continue;
    }
    if (++elements > 600) return null;
    if (!["svg", "g", "defs", "linearGradient", "radialGradient", "stop"].includes(name)) drawable += 1;
    const attrs = cleanAttrs(name, m[3] ?? "");
    if (selfClosing) {
      out.push(`<${name}${attrs}/>`);
      if (stack.length === 0) closedRoot = true;
    } else {
      out.push(`<${name}${attrs}>`);
      stack.push(name);
    }
  }
  while (stack.length) out.push(`</${stack.pop()}>`);
  const svg = out.join("");
  if (!drawable || svg.length > MAX_SVG_OUTPUT) return null;
  return svg;
}

/** Data URI for rendering a sanitized SVG through <img>. */
export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Pull the first <svg>…</svg> out of a model reply (which may be wrapped in prose or a code fence). */
export function extractSvg(text: string): string | null {
  const m = text.match(/<svg[\s>][\s\S]*?<\/svg>/);
  return m ? m[0] : null;
}

/** Text-only contexts (<option>, title attributes): a custom token shows `fallback`, a normal emoji itself. */
export function emojiText(value: string | null | undefined, fallback = "✨"): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) return "";
  return v.startsWith(CUSTOM_EMOJI_PREFIX) ? fallback : v;
}
