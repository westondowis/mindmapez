type SectorLike = { id: string; anatomy: string; label: string };

export type MoveConcept = { id: string; name: string; sectorId: string; parentId: string | null };

export type MoveTarget = {
  /** "sector" = top level of a sector (parentId null); "branch" = nested under that branch. */
  kind: "sector" | "branch";
  sectorId: string;
  parentId: string | null;
  /** Breadcrumb segments, sector first (anatomy name is always included for stable search). */
  path: string[];
  haystack: string;
  score: number;
};

/** "Frontal lobe (Work-Life)" keeps the permanent anatomy name visible next to any custom label. */
export function sectorDisplay(s: Pick<SectorLike, "anatomy" | "label">): string {
  return s.label && s.label !== s.anatomy ? `${s.label} (${s.anatomy})` : s.anatomy;
}

function norm(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

function tokens(q: string): string[] {
  return norm(q).split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * Every destination a branch can move to, optionally narrowed by a free-text query.
 * Each query token must match somewhere in sector anatomy/label or the branch chain, so
 * typing more words only narrows. Results are scored: word-start and last-segment hits rank first.
 * Branches in `excluded` (the moving branch and its descendants) are never offered.
 */
export function searchMoveTargets(
  query: string,
  sectors: readonly SectorLike[],
  concepts: MoveConcept[],
  excluded: Set<string>,
  limit = 12,
): MoveTarget[] {
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const sectorMap = new Map(sectors.map((s) => [s.id, s]));
  const q = tokens(query);
  const out: MoveTarget[] = [];

  const consider = (t: Omit<MoveTarget, "haystack" | "score">, own: string) => {
    const hay = norm(t.path.join(" "));
    const ownN = norm(own);
    let score = 0;
    for (const tok of q) {
      if (!hay.includes(tok)) return;
      const wordStart = new RegExp(`(^|[^a-z0-9])${tok.replace(/[^a-z0-9]/g, "")}`).test(hay);
      score += wordStart ? 3 : 1;
      if (ownN.includes(tok)) score += 2;
    }
    out.push({ ...t, haystack: hay, score: score - t.path.length * 0.01 });
  };

  for (const s of sectors) {
    consider({ kind: "sector", sectorId: s.id, parentId: null, path: [sectorDisplay(s)] }, s.label + " " + s.anatomy);
  }
  for (const c of concepts) {
    if (excluded.has(c.id)) continue;
    const chain: string[] = [];
    const seen = new Set<string>();
    let cur: MoveConcept | undefined = c;
    while (cur && !seen.has(cur.id) && chain.length < 12) {
      seen.add(cur.id);
      chain.unshift(cur.name);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    const sector = sectorMap.get(c.sectorId);
    const head = sector ? sectorDisplay(sector) : c.sectorId;
    consider({ kind: "branch", sectorId: c.sectorId, parentId: c.id, path: [head, ...chain] }, c.name);
  }
  out.sort((a, b) => b.score - a.score || a.path.join(">").localeCompare(b.path.join(">")));
  return out.slice(0, limit);
}
