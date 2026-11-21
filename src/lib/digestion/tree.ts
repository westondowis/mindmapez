/** Builds the capped TreeNode stored in extracted_metadata_json for structured_tree viewers. Pure. */
import type { JsonValue, TreeNode } from "./viewer-types.ts";
import type { XmlNode } from "./xml-lite.ts";

export const TREE_LIMITS = { maxNodes: 12_000, maxValueChars: 300, maxKeyChars: 120 } as const;

export type TreeResult = { tree: TreeNode; nodes: number; depth: number; truncated: boolean };

export function jsonToTree(value: JsonValue, rootKey = "root"): TreeResult {
  let nodes = 0;
  let depth = 0;
  let truncated = false;
  const walk = (k: string, v: JsonValue, d: number): TreeNode | null => {
    if (nodes >= TREE_LIMITS.maxNodes) {
      truncated = true;
      return null;
    }
    nodes++;
    depth = Math.max(depth, d);
    const key = k.slice(0, TREE_LIMITS.maxKeyChars);
    if (v === null) return { k: key, t: "null" };
    if (Array.isArray(v)) {
      const c: TreeNode[] = [];
      for (let i = 0; i < v.length; i++) {
        const n = walk(String(i), v[i]!, d + 1);
        if (!n) break;
        c.push(n);
      }
      return { k: key, t: "array", v: String(v.length), c };
    }
    if (typeof v === "object") {
      const c: TreeNode[] = [];
      const entries = Object.entries(v);
      for (const [ck, cv] of entries) {
        const n = walk(ck, cv, d + 1);
        if (!n) break;
        c.push(n);
      }
      return { k: key, t: "object", v: String(entries.length), c };
    }
    const s = String(v);
    if (s.length > TREE_LIMITS.maxValueChars) truncated = true;
    return { k: key, t: typeof v === "number" ? "number" : typeof v === "boolean" ? "boolean" : "string", v: s.slice(0, TREE_LIMITS.maxValueChars) };
  };
  const tree = walk(rootKey, value, 0) ?? { k: rootKey, t: "null" };
  return { tree, nodes, depth, truncated };
}

/** XML element → tree: attributes as "@name" strings, text as "#text", children by element name. */
export function xmlToTree(el: XmlNode): TreeResult {
  let nodes = 0;
  let depth = 0;
  let truncated = false;
  const walk = (x: XmlNode, d: number): TreeNode | null => {
    if (nodes >= TREE_LIMITS.maxNodes) {
      truncated = true;
      return null;
    }
    nodes++;
    depth = Math.max(depth, d);
    const c: TreeNode[] = [];
    for (const [k, v] of Object.entries(x.attrs)) {
      if (nodes >= TREE_LIMITS.maxNodes) {
        truncated = true;
        break;
      }
      nodes++;
      c.push({ k: `@${k}`.slice(0, TREE_LIMITS.maxKeyChars), t: "string", v: v.slice(0, TREE_LIMITS.maxValueChars) });
    }
    const text = x.text.trim();
    if (!x.children.length && !Object.keys(x.attrs).length) {
      return { k: x.name.slice(0, TREE_LIMITS.maxKeyChars), t: "string", v: text.slice(0, TREE_LIMITS.maxValueChars) };
    }
    if (text) c.push({ k: "#text", t: "string", v: text.slice(0, TREE_LIMITS.maxValueChars) });
    for (const ch of x.children) {
      const n = walk(ch, d + 1);
      if (!n) break;
      c.push(n);
    }
    return { k: x.name.slice(0, TREE_LIMITS.maxKeyChars), t: "object", v: String(x.children.length), c };
  };
  const tree = walk(el, 0) ?? { k: el.name, t: "null" };
  return { tree, nodes, depth, truncated };
}

/** Flat searchable text for a tree (keys and values), capped. */
export function treeText(node: TreeNode, max = 50_000): string {
  const parts: string[] = [];
  let len = 0;
  const walk = (n: TreeNode) => {
    if (len > max) return;
    const s = n.t === "object" || n.t === "array" ? n.k : `${n.k}: ${n.v ?? n.t}`;
    parts.push(s);
    len += s.length + 1;
    for (const c of n.c ?? []) walk(c);
  };
  walk(node);
  return parts.join("\n").slice(0, max);
}
