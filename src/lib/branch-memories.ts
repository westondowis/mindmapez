/**
 * Memory ↔ branch ownership. A memory belongs to the branch(es) it has an explicit
 * memory→concept link to, keyed by stable concept id. Never by name, path, sibling
 * index, or "nearest/last/first child". Branch create/rename/reorder must not touch it.
 */
export type OwnershipEdge = {
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
};

export function memoryOwnedBy(edges: OwnershipEdge[], memoryId: string, branchId: string): boolean {
  return edges.some(
    (e) =>
      (e.sourceType === "memory" && e.sourceId === memoryId && e.targetType === "concept" && e.targetId === branchId) ||
      (e.targetType === "memory" && e.targetId === memoryId && e.sourceType === "concept" && e.sourceId === branchId),
  );
}

export function memoriesForBranch<M extends { id: string }>(
  memories: M[],
  edges: OwnershipEdge[],
  branchId: string,
): M[] {
  return memories.filter((m) => memoryOwnedBy(edges, m.id, branchId));
}

/** Group memory ids by owning branch id (a memory may be pinned to several branches only via explicit links). */
export function groupMemoriesByBranch(
  memoryIds: string[],
  edges: OwnershipEdge[],
  branchIds: string[],
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const b of branchIds) out.set(b, memoryIds.filter((m) => memoryOwnedBy(edges, m, b)));
  return out;
}

/**
 * Default spot for a freshly created branch: a row BELOW its parent (relative to the
 * parent's position), clear of the memory column that hugs the parent's left side.
 */
export function newBranchPosition(
  parent: { positionX: number | null; positionY: number | null } | null,
  siblingCount: number,
): { x: number; y: number } {
  if (!parent) {
    const angle = (siblingCount / Math.max(siblingCount + 1, 1)) * Math.PI * 2 - Math.PI / 2;
    return { x: Math.cos(angle) * 260, y: Math.sin(angle) * 260 };
  }
  const px = parent.positionX ?? 0;
  const py = parent.positionY ?? 0;
  return { x: px + 40 + siblingCount * 210, y: py + 240 };
}

/** Horizontal synapse strand width the memory column clears; injected so this module stays pure. */
export type StrandWidth = (contentLength: number) => number;

export type AnchoredMemory = { id: string; anchorId: string; contentLength: number };

/**
 * Position every memory relative to ITS OWN anchor branch (by stable id). The selected,
 * clicked, or dragged branch has no say: a memory whose anchor isn't in `anchors` is hidden
 * (omitted), never reattached to another node.
 */
export function layoutAnchoredMemories(
  memories: AnchoredMemory[],
  anchors: Map<string, { x: number; y: number }>,
  strandWidth: StrandWidth,
): Map<string, { anchorId: string; x: number; y: number; dx: number; dy: number }> {
  const out = new Map<string, { anchorId: string; x: number; y: number; dx: number; dy: number }>();
  const groups = new Map<string, AnchoredMemory[]>();
  for (const m of memories) {
    if (!anchors.has(m.anchorId)) continue;
    const g = groups.get(m.anchorId) ?? [];
    g.push(m);
    groups.set(m.anchorId, g);
  }
  for (const [anchorId, group] of groups) {
    const a = anchors.get(anchorId)!;
    group.forEach((m, i) => {
      const dx = -(strandWidth(m.contentLength) * 0.78) / 2 - 36;
      const dy = (i - (group.length - 1) / 2) * 110;
      out.set(m.id, { anchorId, x: a.x + dx, y: a.y + dy, dx, dy });
    });
  }
  return out;
}
