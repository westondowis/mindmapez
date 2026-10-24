import type { Concept } from "@/lib/types";

export const BRAIN_SECTORS = [
  { id: "frontal", anatomy: "Frontal lobe", label: "Frontal lobe", kicker: "Planning & decisions", emoji: "🧠", color: "violet", x: 50, y: 30 },
  { id: "parietal", anatomy: "Parietal lobe", label: "Parietal lobe", kicker: "Attention & space", emoji: "✦", color: "cyan", x: 68, y: 40 },
  { id: "temporal", anatomy: "Temporal lobe", label: "Temporal lobe", kicker: "Memory & language", emoji: "🎧", color: "gold", x: 30, y: 52 },
  { id: "occipital", anatomy: "Occipital lobe", label: "Occipital lobe", kicker: "What you notice", emoji: "👁", color: "sky", x: 74, y: 58 },
  { id: "cerebellum", anatomy: "Cerebellum", label: "Cerebellum", kicker: "Practice & timing", emoji: "🎯", color: "green", x: 48, y: 74 },
  { id: "brainstem", anatomy: "Brain stem", label: "Brain stem", kicker: "The through-line", emoji: "⚡", color: "teal", x: 50, y: 88 },
] as const;

/** What each region actually does, plus a personal starting point. Teaching copy only. */
export const SECTOR_INSIGHT: Record<
  BrainSectorId,
  { handles: string; example: string }
> = {
  frontal: {
    handles: "Planning, decisions, goals, and self-control.",
    example:
      "Work plans, habits you want to keep, and choices you’re weighing — like whether to take a job or how you want the next year to go.",
  },
  parietal: {
    handles: "Attention, space, and how pieces fit together.",
    example:
      "A home project, a trip you’re mapping, or a budget you’re arranging. Use it for where things go and what you’re paying attention to.",
  },
  temporal: {
    handles: "Memory, language, and the people in your stories.",
    example:
      "Family memories, conversations you don’t want to lose, and lessons tied to someone. This is the region most tied to remembering.",
  },
  occipital: {
    handles: "What you see, and the pictures that stick.",
    example:
      "A room you want to redesign, a place that stayed with you, or a visual idea you keep coming back to.",
  },
  cerebellum: {
    handles: "Practice, timing, and skills your body learns by repeating them.",
    example:
      "A golf swing, a workout, or any drill you repeat until it feels automatic.",
  },
  brainstem: {
    handles: "The basics that keep you going: sleep, energy, and alertness.",
    example:
      "How you slept, how your body feels day to day, and the routines that hold everything else up.",
  },
};

export type BrainSectorId = (typeof BRAIN_SECTORS)[number]["id"];

export type BrainSector = {
  id: BrainSectorId;
  anatomy: string;
  label: string;
  kicker: string;
  emoji: string;
  color: string;
  x: number;
  y: number;
  named: boolean;
};

export type BrainSectorOverride = {
  id: string;
  label?: string;
  kicker?: string;
  emoji?: string;
  color?: string;
  named?: boolean;
};

const LEGACY_SECTOR: Record<string, BrainSectorId> = {
  ideas: "frontal",
  goals: "parietal",
  learning: "parietal",
  strategy: "temporal",
  creativity: "temporal",
  growth: "occipital",
  action: "cerebellum",
  insights: "brainstem",
};

const SECTOR_IDS = BRAIN_SECTORS.map((s) => s.id);

const KEYWORDS: { id: BrainSectorId; needles: string[] }[] = [
  { id: "frontal", needles: ["idea", "mindset", "goal", "plan", "strateg", "decid", "work"] },
  { id: "parietal", needles: ["learn", "study", "skill", "focus", "attent"] },
  { id: "temporal", needles: ["famil", "relationship", "people", "memor", "story", "love"] },
  { id: "occipital", needles: ["see", "vision", "design", "notic", "image", "health", "growth"] },
  { id: "cerebellum", needles: ["golf", "habit", "practic", "action", "train", "fitness", "do"] },
  { id: "brainstem", needles: ["money", "financ", "tax", "insight", "body", "sleep", "core"] },
];

export function normalizeSectorId(value: string | null | undefined): BrainSectorId | null {
  if (!value) return null;
  if (SECTOR_IDS.includes(value as BrainSectorId)) return value as BrainSectorId;
  return LEGACY_SECTOR[value] ?? null;
}

export function isSectorId(value: string | null | undefined): value is BrainSectorId {
  return Boolean(normalizeSectorId(value));
}

export function defaultSectors(): BrainSector[] {
  return BRAIN_SECTORS.map((s) => ({ ...s, named: false }));
}

export function parseSectorOverrides(raw: string | null | undefined): BrainSectorOverride[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    const out: BrainSectorOverride[] = [];
    for (const row of v) {
      if (!row || typeof row !== "object") continue;
      const rawId = String((row as BrainSectorOverride).id ?? "");
      const id = normalizeSectorId(rawId);
      if (!id) continue;
      out.push({
        id,
        label: typeof (row as BrainSectorOverride).label === "string" ? (row as BrainSectorOverride).label : undefined,
        kicker: typeof (row as BrainSectorOverride).kicker === "string" ? (row as BrainSectorOverride).kicker : undefined,
        emoji: typeof (row as BrainSectorOverride).emoji === "string" ? (row as BrainSectorOverride).emoji : undefined,
        color: typeof (row as BrainSectorOverride).color === "string" ? (row as BrainSectorOverride).color : undefined,
        named: (row as BrainSectorOverride).named === true || rawId !== id,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export function mergeSectors(overrides?: BrainSectorOverride[] | null): BrainSector[] {
  const map = new Map((overrides ?? []).map((o) => [o.id, o]));
  return defaultSectors().map((sector) => {
    const o = map.get(sector.id);
    if (!o) return sector;
    const label = o.label?.trim();
    const kicker = o.kicker?.trim();
    const emoji = o.emoji?.trim();
    const color = o.color?.trim();
    return {
      ...sector,
      label: label || sector.label,
      kicker: kicker || sector.kicker,
      emoji: emoji || sector.emoji,
      color: color || sector.color,
      named: Boolean(o.named) || Boolean(label && label !== sector.anatomy),
    };
  });
}

export function overridesFromSectors(sectors: BrainSector[]): BrainSectorOverride[] {
  const defaults = defaultSectors();
  const out: BrainSectorOverride[] = [];
  for (const sector of sectors) {
    const base = defaults.find((d) => d.id === sector.id);
    if (!base) continue;
    if (
      base.label === sector.label &&
      base.kicker === sector.kicker &&
      base.emoji === sector.emoji &&
      base.color === sector.color &&
      base.named === sector.named
    ) {
      continue;
    }
    out.push({
      id: sector.id,
      label: sector.label,
      kicker: sector.kicker,
      emoji: sector.emoji,
      color: sector.color,
      named: sector.named,
    });
  }
  return out;
}

export function sectorById(id: string | null | undefined, sectors?: BrainSector[] | null): BrainSector {
  const list = sectors && sectors.length ? sectors : defaultSectors();
  return list.find((s) => s.id === id) ?? list[0] ?? defaultSectors()[0]!;
}

export function assignSectorFromName(name: string): BrainSectorId {
  const hay = name.toLowerCase();
  for (const row of KEYWORDS) {
    if (row.needles.some((n) => hay.includes(n))) return row.id;
  }
  const code = (hay.charCodeAt(0) || 109) % SECTOR_IDS.length;
  return SECTOR_IDS[code] ?? "frontal";
}

export function childrenOf(
  concepts: Concept[],
  parentId: string | null,
  sectorId?: string | null,
): Concept[] {
  return concepts
    .filter((c) => {
      const sameParent = (c.parentId ?? null) === parentId;
      if (!sameParent) return false;
      if (parentId === null && sectorId) return c.sectorId === sectorId;
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function descendantsOf(concepts: Concept[], id: string): Set<string> {
  const byParent = new Map<string | null, Concept[]>();
  for (const c of concepts) {
    const key = c.parentId ?? null;
    const list = byParent.get(key) ?? [];
    list.push(c);
    byParent.set(key, list);
  }
  const out = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const child of byParent.get(cur) ?? []) {
      if (out.has(child.id)) continue;
      out.add(child.id);
      stack.push(child.id);
    }
  }
  return out;
}

export function ancestorsOf(concepts: Concept[], id: string): Concept[] {
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const chain: Concept[] = [];
  const seen = new Set<string>();
  let cur = byId.get(id);
  while (cur) {
    if (seen.has(cur.id)) break;
    seen.add(cur.id);
    chain.push(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return chain;
}

export function rootOf(concepts: Concept[], id: string): Concept | null {
  const chain = ancestorsOf(concepts, id);
  return chain.at(-1) ?? null;
}

export function wouldCycle(concepts: Concept[], branchId: string, newParentId: string | null): boolean {
  if (!newParentId) return false;
  if (newParentId === branchId) return true;
  return descendantsOf(concepts, branchId).has(newParentId);
}

export function primaryBranches(concepts: Concept[], sectorId: string): Concept[] {
  return childrenOf(concepts, null, sectorId);
}

export type Crumb = { kind: "overview" | "sector" | "branch"; id: string; label: string };

export function breadcrumbPath(
  concepts: Concept[],
  sectorId: string | null,
  branchId: string | null,
  sectors?: BrainSector[] | null,
): Crumb[] {
  const crumbs: Crumb[] = [{ kind: "overview", id: "overview", label: "Brain Overview" }];
  if (!sectorId) return crumbs;
  const sector = sectorById(sectorId, sectors);
  crumbs.push({ kind: "sector", id: sector.id, label: sector.label });
  if (!branchId) return crumbs;
  const chain = ancestorsOf(concepts, branchId).slice().reverse();
  for (const node of chain) {
    crumbs.push({ kind: "branch", id: node.id, label: node.name });
  }
  return crumbs;
}

export function depthOf(concepts: Concept[], id: string): number {
  return Math.max(0, ancestorsOf(concepts, id).length - 1);
}

export function branchKindForDepth(depth: number): Concept["kind"] {
  if (depth <= 0) return "category";
  if (depth === 1) return "subcategory";
  if (depth === 2) return "topic";
  return "theme";
}

const NAV_KEY = "mindmesh.brain-nav";

export type BrainNavState = {
  sectorId: string | null;
  branchId: string | null;
  expanded: string[];
};

export function loadBrainNav(): BrainNavState {
  if (typeof window === "undefined") return { sectorId: null, branchId: null, expanded: [] };
  try {
    const raw = window.localStorage.getItem(NAV_KEY);
    if (!raw) return { sectorId: null, branchId: null, expanded: [] };
    const parsed = JSON.parse(raw) as BrainNavState;
    return {
      sectorId: typeof parsed.sectorId === "string" ? parsed.sectorId : null,
      branchId: typeof parsed.branchId === "string" ? parsed.branchId : null,
      expanded: Array.isArray(parsed.expanded) ? parsed.expanded.map(String) : [],
    };
  } catch {
    return { sectorId: null, branchId: null, expanded: [] };
  }
}

export function saveBrainNav(state: BrainNavState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NAV_KEY, JSON.stringify(state));
  } catch {
    /* quota */
  }
}

const VIEW_KEY = "mindmesh.brain-view";

export type BrainViewState = {
  zoom: number;
  x: number;
  y: number;
  rx: number;
  ry: number;
};

export function loadBrainView(): BrainViewState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(VIEW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BrainViewState>;
    if (typeof parsed.zoom !== "number") return null;
    return {
      zoom: parsed.zoom,
      x: typeof parsed.x === "number" ? parsed.x : 0,
      y: typeof parsed.y === "number" ? parsed.y : 0,
      rx: typeof parsed.rx === "number" ? parsed.rx : 12,
      ry: typeof parsed.ry === "number" ? parsed.ry : -18,
    };
  } catch {
    return null;
  }
}

export function saveBrainView(state: BrainViewState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VIEW_KEY, JSON.stringify(state));
  } catch {
    /* quota */
  }
}
