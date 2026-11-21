/** Word .docx → text, outline and sanitized HTML (paragraphs, headings, lists, tables). Pure. */
import type { OutlineEntry } from "./viewer-types.ts";
import { escapeHtml } from "./sanitize-html.ts";
import { slug } from "./markdown.ts";
import { localName, parseXml, type XmlNode } from "./xml-lite.ts";
import type { GuardedZip } from "./zip-guard.ts";

export type DocResult = { text: string; outline: OutlineEntry[]; html: string; title?: string };

function runText(node: XmlNode): string {
  let s = "";
  for (const c of node.children) {
    const n = localName(c.name);
    if (n === "t" || n === "delText") s += n === "t" ? c.text : "";
    else if (n === "tab") s += "\t";
    else if (n === "br" || n === "cr") s += "\n";
    else if (n === "instrText" || n === "fldChar") continue;
    else s += runText(c);
  }
  return s;
}

function headingLevel(p: XmlNode): number {
  const pPr = p.children.find((c) => localName(c.name) === "pPr");
  const style = pPr?.children.find((c) => localName(c.name) === "pStyle");
  const val = style ? Object.entries(style.attrs).find(([k]) => localName(k) === "val")?.[1] ?? "" : "";
  if (/^title$/i.test(val)) return 1;
  const m = /heading\s*([1-6])/i.exec(val);
  if (m) return Number(m[1]);
  const outline = pPr?.children.find((c) => localName(c.name) === "outlineLvl");
  const lvl = outline ? Number(Object.entries(outline.attrs).find(([k]) => localName(k) === "val")?.[1]) : NaN;
  return Number.isFinite(lvl) && lvl >= 0 && lvl < 6 ? lvl + 1 : 0;
}

function isListItem(p: XmlNode): boolean {
  const pPr = p.children.find((c) => localName(c.name) === "pPr");
  return Boolean(pPr?.children.some((c) => localName(c.name) === "numPr"));
}

export function docxXmlToDoc(xml: string): DocResult {
  const doc = parseXml(xml);
  const body = (function find(n: XmlNode): XmlNode | undefined {
    for (const c of n.children) {
      if (localName(c.name) === "body") return c;
      const d = find(c);
      if (d) return d;
    }
    return undefined;
  })(doc);
  if (!body) throw new Error("This Word file has no document body");
  const text: string[] = [];
  const html: string[] = [];
  const outline: OutlineEntry[] = [];
  const used = new Map<string, number>();
  let inList = false;
  const closeList = () => {
    if (inList) html.push("</ul>");
    inList = false;
  };
  const para = (p: XmlNode) => {
    const t = runText(p).replace(/\s+$/g, "");
    const level = headingLevel(p);
    if (!t.trim()) {
      closeList();
      return;
    }
    text.push(t);
    if (level) {
      closeList();
      const anchor = slug(t, used);
      if (outline.length < 300) outline.push({ level, text: t.slice(0, 200), anchor });
      html.push(`<h${level} id="${anchor}">${escapeHtml(t)}</h${level}>`);
    } else if (isListItem(p)) {
      if (!inList) html.push("<ul>");
      inList = true;
      html.push(`<li>${escapeHtml(t)}</li>`);
    } else {
      closeList();
      html.push(`<p>${escapeHtml(t).replace(/\n/g, "<br>")}</p>`);
    }
  };
  const table = (tbl: XmlNode) => {
    closeList();
    html.push("<table>");
    for (const tr of tbl.children.filter((c) => localName(c.name) === "tr")) {
      const cells = tr.children.filter((c) => localName(c.name) === "tc").map((tc) =>
        tc.children.filter((c) => localName(c.name) === "p").map(runText).join("\n").trim(),
      );
      text.push(cells.join("\t"));
      html.push(`<tr>${cells.map((c) => `<td>${escapeHtml(c).replace(/\n/g, "<br>")}</td>`).join("")}</tr>`);
    }
    html.push("</table>");
  };
  for (const c of body.children) {
    const n = localName(c.name);
    if (n === "p") para(c);
    else if (n === "tbl") table(c);
    else if (n === "sdt") {
      for (const p of c.children.flatMap((x) => (localName(x.name) === "sdtContent" ? x.children : []))) {
        if (localName(p.name) === "p") para(p);
        else if (localName(p.name) === "tbl") table(p);
      }
    }
  }
  closeList();
  return { text: text.join("\n"), outline, html: html.join("\n") };
}

export async function docxToDoc(zip: GuardedZip): Promise<DocResult> {
  if (!zip.has("word/document.xml")) throw new Error("This is not a Word document");
  const res = docxXmlToDoc(await zip.readText("word/document.xml", 20_000_000));
  if (zip.has("docProps/core.xml")) {
    const core = await zip.readText("docProps/core.xml", 200_000);
    const m = /<dc:title>([^<]{1,200})<\/dc:title>/.exec(core);
    if (m?.[1]?.trim()) res.title = m[1].trim();
  }
  return res;
}
