/** Pure helpers for relocating branches and memories. No server or DOM imports. */

export type TreeConcept = { id: string; name: string; parentId: string | null; sectorId: string };
export type TreeRow<C extends TreeConcept> = { concept: C; depth: number };

/** One sector's branches as an indented, alphabetical list (parents before children, cycle-safe). */
export function flattenSectorTree<C extends TreeConcept>(concepts: C[], sectorId: string, excluded: ReadonlySet<string> = new Set()): TreeRow<C>[] {
  const inSector = concepts.filter((c) => c.sectorId === sectorId && !excluded.has(c.id));
  const ids = new Set(inSector.map((c) => c.id));
  const byParent = new Map<string | null, C[]>();
  for (const c of inSector) {
    // A branch whose parent is outside this sector/excluded set is shown at the top.
    const key = c.parentId && ids.has(c.parentId) ? c.parentId : null;
    const list = byParent.get(key) ?? [];
    list.push(c);
    byParent.set(key, list);
  }
  const out: TreeRow<C>[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    const kids = (byParent.get(parent) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
    for (const k of kids) {
      if (seen.has(k.id)) continue;
      seen.add(k.id);
      out.push({ concept: k, depth });
      walk(k.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Branch plus every descendant, with their memory counts, for the relocation warning. */
export function subtreeStats(concepts: { id: string; parentId: string | null; memoryCount?: number }[], rootId: string): { branches: number; memories: number } {
  const byParent = new Map<string, { id: string; memoryCount?: number }[]>();
  for (const c of concepts) {
    if (!c.parentId) continue;
    const list = byParent.get(c.parentId) ?? [];
    list.push(c);
    byParent.set(c.parentId, list);
  }
  const root = concepts.find((c) => c.id === rootId);
  let branches = 0;
  let memories = root?.memoryCount ?? 0;
  const seen = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const k of byParent.get(id) ?? []) {
      if (seen.has(k.id)) continue;
      seen.add(k.id);
      branches++;
      memories += k.memoryCount ?? 0;
      stack.push(k.id);
    }
  }
  return { branches, memories };
}

export type NewBranchInput = { name: string; parentId: string | null; sectorId: string | null };

/** Trimmed name or an error message. */
export function checkNewBranchName(raw: string): { ok: true; name: string } | { ok: false; error: string } {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Give the new branch a name." };
  if (name.length > 80) return { ok: false, error: "Keep the name under 80 characters." };
  return { ok: true, name };
}
