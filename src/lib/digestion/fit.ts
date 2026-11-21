/**
 * Shrinks extracted metadata to fit the 1 MB column cap: repeatedly halves the longest array or
 * string (whichever is bigger) until it fits. Deterministic and pure; callers flag `truncated`.
 */
import { EXTRACTED_METADATA_MAX_BYTES, jsonBytes, type JsonValue } from "./viewer-types.ts";

export const METADATA_BUDGET = Math.floor(EXTRACTED_METADATA_MAX_BYTES * 0.95);

type Ref = { parent: JsonValue[] | { [k: string]: JsonValue }; key: string | number; size: number; kind: "array" | "string" };

function largest(root: JsonValue): Ref | null {
  let best: Ref | null = null;
  const visit = (parent: Ref["parent"], key: string | number, v: JsonValue) => {
    if (typeof v === "string") {
      if (v.length > 64 && (!best || v.length > best.size)) best = { parent, key, size: v.length, kind: "string" };
    } else if (Array.isArray(v)) {
      const size = JSON.stringify(v).length;
      if (v.length > 1 && (!best || size > best.size)) best = { parent, key, size, kind: "array" };
      v.forEach((x, i) => visit(v, i, x));
    } else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) visit(v, k, x);
    }
  };
  if (root && typeof root === "object") {
    if (Array.isArray(root)) root.forEach((x, i) => visit(root, i, x));
    else for (const [k, x] of Object.entries(root)) visit(root, k, x);
  }
  return best;
}

export function fitMetadata<T extends { [k: string]: JsonValue }>(meta: T, budget = METADATA_BUDGET): { meta: T; shrunk: boolean } {
  let shrunk = false;
  for (let i = 0; i < 400 && jsonBytes(meta) > budget; i++) {
    const ref = largest(meta);
    if (!ref) break;
    const container = ref.parent as Record<string | number, JsonValue>;
    const v = container[ref.key]!;
    if (ref.kind === "string") container[ref.key] = (v as string).slice(0, Math.floor((v as string).length / 2)) + "…";
    else (v as JsonValue[]).length = Math.ceil((v as JsonValue[]).length / 2);
    shrunk = true;
  }
  return { meta, shrunk };
}

/** Whole createMemory request (original + metadata + text + thumb) must stay under the ~4.5 MB host body limit. */
export const REQUEST_BUDGET_BYTES = 4_200_000;

export function overRequestBudget(parts: { mediaUrl?: string | null; meta: unknown; body: string; thumb?: string | null }): boolean {
  return (parts.mediaUrl?.length ?? 0) + jsonBytes(parts.meta) + jsonBytes(parts.body) + (parts.thumb?.length ?? 0) > REQUEST_BUDGET_BYTES;
}
