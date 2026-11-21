/**
 * YAML subset parser (block maps, block lists, scalars, comments, quoted strings, `|`/`>` block
 * scalars). Anchors, aliases, tags, flow collections and multi-document streams throw so the caller
 * falls back to the raw text view. Pure.
 */
import type { JsonValue } from "./viewer-types.ts";

export class YamlUnsupported extends Error {}

type Line = { indent: number; text: string; no: number };

function stripComment(s: string): string {
  let q: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === q && s[i - 1] !== "\\") q = null;
    } else if (c === '"' || c === "'") q = c;
    else if (c === "#" && (i === 0 || /\s/.test(s[i - 1]!))) return s.slice(0, i).trimEnd();
  }
  return s.trimEnd();
}

export function yamlScalar(raw: string): JsonValue {
  const s = raw.trim();
  if (s === "" || s === "~" || s === "null" || s === "Null" || s === "NULL") return null;
  if (/^(true|True|TRUE)$/.test(s)) return true;
  if (/^(false|False|FALSE)$/.test(s)) return false;
  if (/^[-+]?\d+$/.test(s) && Math.abs(Number(s)) <= Number.MAX_SAFE_INTEGER) return Number(s);
  if (/^[-+]?(\d+\.\d*|\.\d+|\d+)([eE][-+]?\d+)?$/.test(s)) return Number(s);
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    try {
      return JSON.parse(s) as string;
    } catch {
      return s.slice(1, -1);
    }
  }
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) return s.slice(1, -1).replace(/''/g, "'");
  if (/^[&*!]/.test(s) || /^[[{]/.test(s)) throw new YamlUnsupported("Anchors, tags and flow collections aren't supported");
  return s;
}

export function parseYamlSubset(text: string, maxLines = 200_000): JsonValue {
  const raw = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (raw.length > maxLines) throw new YamlUnsupported("YAML file is too long");
  const lines: Line[] = [];
  for (let no = 0; no < raw.length; no++) {
    const r = raw[no]!;
    if (/^\s*#/.test(r) || !r.trim()) {
      lines.push({ indent: -1, text: "", no });
      continue;
    }
    if (/^(---|\.\.\.)\s*$/.test(r)) {
      if (lines.some((l) => l.indent >= 0)) throw new YamlUnsupported("Multi-document YAML isn't supported");
      continue;
    }
    if (/\t/.test(r.match(/^\s*/)![0])) throw new YamlUnsupported("Tabs in indentation");
    lines.push({ indent: r.match(/^ */)![0].length, text: r.trim(), no });
  }
  let pos = 0;
  const skipBlank = () => {
    while (pos < lines.length && lines[pos]!.indent < 0) pos++;
  };

  function blockScalar(style: string, parentIndent: number): string {
    const out: string[] = [];
    let ind = -1;
    while (pos < lines.length) {
      const l = lines[pos]!;
      const rawLine = raw[l.no]!;
      if (l.indent >= 0 && l.indent <= parentIndent) break;
      if (l.indent < 0) {
        out.push("");
        pos++;
        continue;
      }
      if (ind < 0) ind = l.indent;
      out.push(rawLine.slice(ind));
      pos++;
    }
    while (out.length && out[out.length - 1] === "") out.pop();
    return style.startsWith(">") ? out.join(" ").replace(/ {2,}/g, " ") : out.join("\n");
  }

  function parseNode(indent: number): JsonValue {
    skipBlank();
    if (pos >= lines.length) return null;
    const first = lines[pos]!;
    if (first.indent < indent) return null;
    if (first.text.startsWith("- ") || first.text === "-") return parseList(first.indent);
    return parseMap(first.indent);
  }

  function valueAfter(rest: string, indent: number): JsonValue {
    const v = stripComment(rest).trim();
    if (v === "") {
      skipBlank();
      if (pos < lines.length && (lines[pos]!.indent > indent || (lines[pos]!.indent === indent && lines[pos]!.text.startsWith("- ")))) {
        return parseNode(lines[pos]!.indent);
      }
      return null;
    }
    if (/^[|>][-+]?$/.test(v)) return blockScalar(v, indent);
    return yamlScalar(v);
  }

  function parseList(indent: number): JsonValue[] {
    const out: JsonValue[] = [];
    for (;;) {
      skipBlank();
      if (pos >= lines.length) break;
      const l = lines[pos]!;
      if (l.indent !== indent || !(l.text.startsWith("- ") || l.text === "-")) break;
      const rest = l.text === "-" ? "" : l.text.slice(2);
      pos++;
      const kv = /^([^'"\s][^:]*?|"[^"]*"|'[^']*'):(\s+|$)(.*)$/.exec(rest);
      if (kv && !/^[|>]/.test(rest)) {
        // "- key: value" starts an inline map; continuation keys sit at indent + 2.
        const obj: { [k: string]: JsonValue } = {};
        obj[String(yamlScalar(kv[1]!))] = valueAfter(kv[3]!, indent + 2);
        skipBlank();
        if (pos < lines.length && lines[pos]!.indent === indent + 2 && !lines[pos]!.text.startsWith("- ")) {
          Object.assign(obj, parseMap(indent + 2));
        }
        out.push(obj);
      } else {
        out.push(valueAfter(rest, indent));
      }
    }
    return out;
  }

  function parseMap(indent: number): { [k: string]: JsonValue } {
    const obj: { [k: string]: JsonValue } = {};
    for (;;) {
      skipBlank();
      if (pos >= lines.length) break;
      const l = lines[pos]!;
      if (l.indent !== indent) {
        if (l.indent > indent) throw new YamlUnsupported(`Unexpected indentation on line ${l.no + 1}`);
        break;
      }
      if (l.text.startsWith("- ")) break;
      const kv = /^([^'"\s][^:]*?|"[^"]*"|'[^']*'):(\s+|$)(.*)$/.exec(l.text);
      if (!kv) throw new YamlUnsupported(`Can't read line ${l.no + 1}`);
      pos++;
      const key = String(yamlScalar(kv[1]!));
      if (key === "<<") throw new YamlUnsupported("Merge keys aren't supported");
      obj[key] = valueAfter(kv[3]!, indent);
    }
    return obj;
  }

  skipBlank();
  if (pos >= lines.length) return null;
  const only = lines.filter((l) => l.indent >= 0);
  if (only.length === 1 && !/:(\s|$)/.test(only[0]!.text) && !only[0]!.text.startsWith("- ")) return yamlScalar(stripComment(only[0]!.text));
  const value = parseNode(0);
  skipBlank();
  if (pos < lines.length) throw new YamlUnsupported(`Can't read line ${lines[pos]!.no + 1}`);
  return value;
}
