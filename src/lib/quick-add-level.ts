/**
 * Where a quick-added memory lands, as text: "Work-Life > Negotiations > Call scripts".
 * @param {{id: string; name: string; parentId: string | null}[]} concepts All branches.
 * @param {string} sectorName Name of the sector being viewed.
 * @param {string | null} branchId The branch being viewed, or null at sector level.
 * @returns {string} The path; the sector alone at sector level (the app files the memory itself).
 */
export function levelLabel(
  concepts: { id: string; name: string; parentId: string | null }[],
  sectorName: string,
  branchId: string | null,
): string {
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const names: string[] = [];
  const seen = new Set<string>();
  let cur = branchId ? byId.get(branchId) : undefined;
  while (cur && !seen.has(cur.id) && names.length < 8) {
    seen.add(cur.id);
    names.unshift(cur.name);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return [sectorName, ...names].join(" > ");
}
