/** EPUB → text, outline and sanitized HTML via container.xml → OPF spine → XHTML chapters. Pure. */
import type { OutlineEntry } from "./viewer-types.ts";
import { slug } from "./markdown.ts";
import { htmlToPlainText, sanitizeHtml } from "./sanitize-html.ts";
import { findAll, findFirst, parseXml, textOf } from "./xml-lite.ts";
import type { GuardedZip } from "./zip-guard.ts";
import type { DocResult } from "./docx.ts";
import { MAX_EXTRACTED_TEXT_CHARS } from "./limits.ts";

function resolvePath(base: string, rel: string): string {
  const parts = (base.includes("/") ? base.slice(0, base.lastIndexOf("/") + 1) : "").concat(decodeURIComponent(rel.split("#")[0]!)).split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p && p !== ".") out.push(p);
  }
  return out.join("/");
}

export async function epubToDoc(zip: GuardedZip): Promise<DocResult> {
  if (!zip.has("META-INF/container.xml")) throw new Error("This EPUB has no container.xml");
  const container = parseXml(await zip.readText("META-INF/container.xml", 200_000));
  const opfPath = findFirst(container, "rootfile")?.attrs["full-path"];
  if (!opfPath || !zip.has(opfPath)) throw new Error("This EPUB has no package file");
  const opf = parseXml(await zip.readText(opfPath, 5_000_000));
  const title = textOf(findFirst(opf, "title")).trim() || undefined;
  const manifest = new Map<string, { href: string; type: string }>();
  for (const it of findAll(opf, "item")) if (it.attrs.id && it.attrs.href) manifest.set(it.attrs.id, { href: it.attrs.href, type: it.attrs["media-type"] ?? "" });
  const spine = findAll(opf, "itemref").map((r) => manifest.get(r.attrs.idref ?? "")).filter((x): x is { href: string; type: string } => !!x && /html/.test(x.type));
  const texts: string[] = [];
  const html: string[] = [];
  const outline: OutlineEntry[] = [];
  const used = new Map<string, number>();
  let chars = 0;
  for (const item of spine.slice(0, 1000)) {
    const path = resolvePath(opfPath, item.href);
    if (!zip.has(path)) continue;
    const xhtml = await zip.readText(path, 5_000_000);
    const bodyMatch = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(xhtml);
    const body = bodyMatch ? bodyMatch[1]! : xhtml;
    let clean = sanitizeHtml(body, 600_000);
    clean = clean.replace(/<(h[1-3])(?: id="[^"]*")?>([\s\S]*?)<\/\1>/g, (_, tag: string, inner: string) => {
      const t = htmlToPlainText(inner).slice(0, 200);
      const anchor = slug(t, used);
      if (t && outline.length < 300) outline.push({ level: Number(tag[1]), text: t, anchor });
      return `<${tag} id="${anchor}">${inner}</${tag}>`;
    });
    html.push(`<section>${clean}</section>`);
    const t = htmlToPlainText(body);
    texts.push(t);
    chars += t.length;
    if (chars > MAX_EXTRACTED_TEXT_CHARS) break;
  }
  if (!texts.length) throw new Error("This EPUB has no readable chapters");
  return { text: texts.join("\n\n"), outline, html: html.join("\n"), title };
}
