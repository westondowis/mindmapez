/**
 * Markdown subset → sanitized HTML (headings, lists, block quotes, fenced code, bold/italic/code,
 * links). Everything is escaped first, links are http(s)/mailto only. Pure.
 */
import type { OutlineEntry } from "./viewer-types.ts";
import { escapeHtml, safeLink } from "./sanitize-html.ts";

export function slug(text: string, used: Map<string, number>): string {
  const base = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "section";
  const n = used.get(base) ?? 0;
  used.set(base, n + 1);
  return n ? `${base}-${n}` : base;
}

function inline(s: string): string {
  let t = escapeHtml(s);
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  t = t.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_, a, b) => `<strong>${a ?? b}</strong>`);
  t = t.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, url: string) => {
    const href = safeLink(url.replace(/&amp;/g, "&"));
    return href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer nofollow">${label}</a>` : label;
  });
  return t;
}

export function markdownOutline(md: string): OutlineEntry[] {
  const used = new Map<string, number>();
  const out: OutlineEntry[] = [];
  let fence = false;
  for (const line of md.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) fence = !fence;
    if (fence) continue;
    const h = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) out.push({ level: h[1]!.length, text: h[2]!.slice(0, 200), anchor: slug(h[2]!, used) });
    if (out.length >= 300) break;
  }
  return out;
}

export function markdownToHtml(md: string): string {
  const used = new Map<string, number>();
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const html: string[] = [];
  let list: "ul" | "ol" | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) html.push(`<p>${inline(para.join(" "))}</p>`);
    para = [];
  };
  const closeList = () => {
    if (list) html.push(`</${list}>`);
    list = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^\s*```/.test(line)) {
      flushPara();
      closeList();
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i]!)) code.push(lines[i++]!);
      html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }
    const h = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) {
      flushPara();
      closeList();
      const n = h[1]!.length;
      html.push(`<h${n} id="${slug(h[2]!, used)}">${inline(h[2]!)}</h${n}>`);
      continue;
    }
    const ul = /^\s*[-*+]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      flushPara();
      const want = ul ? "ul" : "ol";
      if (list !== want) {
        closeList();
        html.push(`<${want}>`);
        list = want;
      }
      const item = (ul ?? ol)![1]!;
      const task = /^\[( |x|X)\]\s+(.*)$/.exec(item);
      html.push(task ? `<li>${task[1] === " " ? "☐" : "☑"} ${inline(task[2]!)}</li>` : `<li>${inline(item)}</li>`);
      continue;
    }
    if (/^\s*>/.test(line)) {
      flushPara();
      closeList();
      html.push(`<blockquote>${inline(line.replace(/^\s*>\s?/, ""))}</blockquote>`);
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flushPara();
      closeList();
      html.push("<hr>");
      continue;
    }
    if (!line.trim()) {
      flushPara();
      closeList();
      continue;
    }
    closeList();
    para.push(line.trim());
  }
  flushPara();
  closeList();
  return html.join("\n");
}

/** Plain text gets paragraphs only (escaped), so .txt files read cleanly in the Reader. */
export function textToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}
