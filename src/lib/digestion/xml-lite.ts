/**
 * Safe, dependency-free XML parser used for xml / kml / gpx / svg text / docx / epub. Pure (runs in
 * node tests and browsers). Rejects entity declarations (billion laughs), never resolves external
 * entities, and caps size (10 MB), node count (200k) and depth (64).
 */
import { XML_LIMITS } from "./limits.ts";
import { assertNoEntityDeclarations, decodeXmlEntities } from "./xml-scan.ts";

export type XmlNode = { name: string; attrs: Record<string, string>; children: XmlNode[]; text: string };

export class XmlError extends Error {}

const ATTR_RE = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;

export function parseXml(xml: string, limits: { maxBytes: number; maxNodes: number; maxDepth: number } = XML_LIMITS): XmlNode {
  if (xml.length > limits.maxBytes) throw new XmlError("XML is larger than 10 MB");
  try {
    assertNoEntityDeclarations(xml);
  } catch (e) {
    throw new XmlError((e as Error).message);
  }
  const root: XmlNode = { name: "#document", attrs: {}, children: [], text: "" };
  const stack: XmlNode[] = [root];
  let nodes = 0;
  let i = 0;
  const n = xml.length;
  while (i < n) {
    const lt = xml.indexOf("<", i);
    const textEnd = lt === -1 ? n : lt;
    if (textEnd > i) {
      const raw = xml.slice(i, textEnd);
      if (raw.trim()) stack[stack.length - 1]!.text += decodeXmlEntities(raw);
    }
    if (lt === -1) break;
    if (xml.startsWith("<!--", lt)) {
      const end = xml.indexOf("-->", lt + 4);
      i = end === -1 ? n : end + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", lt)) {
      const end = xml.indexOf("]]>", lt + 9);
      stack[stack.length - 1]!.text += xml.slice(lt + 9, end === -1 ? n : end);
      i = end === -1 ? n : end + 3;
      continue;
    }
    if (xml.startsWith("<?", lt)) {
      const end = xml.indexOf("?>", lt + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (xml.startsWith("<!", lt)) {
      // DOCTYPE without an internal subset (entities were rejected above).
      const end = xml.indexOf(">", lt + 2);
      i = end === -1 ? n : end + 1;
      continue;
    }
    const gt = findTagEnd(xml, lt + 1);
    if (gt === -1) throw new XmlError("Unterminated tag");
    const inner = xml.slice(lt + 1, gt);
    i = gt + 1;
    if (inner.startsWith("/")) {
      const name = inner.slice(1).trim();
      // Tolerate mismatches by unwinding to the nearest matching open element.
      for (let s = stack.length - 1; s > 0; s--) {
        if (stack[s]!.name === name) {
          stack.length = s;
          break;
        }
      }
      continue;
    }
    const selfClosing = inner.endsWith("/");
    const body = selfClosing ? inner.slice(0, -1) : inner;
    const sp = body.search(/[\s]/);
    const name = (sp === -1 ? body : body.slice(0, sp)).trim();
    if (!name) continue;
    const attrs: Record<string, string> = {};
    if (sp !== -1) {
      for (const m of body.slice(sp).matchAll(ATTR_RE)) attrs[m[1]!] = decodeXmlEntities(m[3] ?? m[4] ?? "");
    }
    if (++nodes > limits.maxNodes) throw new XmlError("XML has too many elements (limit 200,000)");
    const node: XmlNode = { name, attrs, children: [], text: "" };
    stack[stack.length - 1]!.children.push(node);
    if (!selfClosing) {
      if (stack.length > limits.maxDepth) throw new XmlError("XML is nested too deeply (limit 64)");
      stack.push(node);
    }
  }
  return root;
}

function findTagEnd(s: string, from: number): number {
  let q: string | null = null;
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === q) q = null;
    } else if (c === '"' || c === "'") q = c;
    else if (c === ">") return i;
  }
  return -1;
}

export const localName = (name: string) => name.slice(name.indexOf(":") + 1);

/** Depth-first search by local name (namespace prefix ignored). */
export function findAll(node: XmlNode, name: string, out: XmlNode[] = []): XmlNode[] {
  for (const c of node.children) {
    if (localName(c.name) === name) out.push(c);
    findAll(c, name, out);
  }
  return out;
}

export function findFirst(node: XmlNode, name: string): XmlNode | undefined {
  for (const c of node.children) {
    if (localName(c.name) === name) return c;
    const d = findFirst(c, name);
    if (d) return d;
  }
  return undefined;
}

export function textOf(node: XmlNode | undefined): string {
  if (!node) return "";
  let s = node.text;
  for (const c of node.children) s += textOf(c);
  return s;
}

export function rootElement(doc: XmlNode): XmlNode | undefined {
  return doc.children[0];
}
