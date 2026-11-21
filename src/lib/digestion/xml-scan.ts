/** Tiny regex XML helpers usable without DOMParser (node tests, workers). Not a general parser. */

export function decodeXmlEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const k = e.toLowerCase();
    if (k === "amp") return "&";
    if (k === "lt") return "<";
    if (k === "gt") return ">";
    if (k === "quot") return '"';
    if (k === "apos") return "'";
    const code = k.startsWith("#x") ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
  });
}

export function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(tag);
  return m ? decodeXmlEntities(m[2] ?? m[3] ?? "") : undefined;
}

/** Rejects DOCTYPEs that declare entities (billion laughs). External entities are never fetched. */
export function assertNoEntityDeclarations(xml: string): void {
  if (/<!DOCTYPE[^>]*\[[\s\S]*?<!ENTITY/i.test(xml) || /<!ENTITY/i.test(xml)) {
    throw new Error("XML entity declarations are not allowed");
  }
}
