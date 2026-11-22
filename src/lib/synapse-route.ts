/**
 * Geometry for a memory neuron docked on its branch: how many myelin cells it has, where its
 * axon terminal lands on the branch ring, and the Bézier the axon follows from soma to ring.
 * Pure functions only (screen coordinates, y grows downward, angles in degrees).
 */

export type Pt = { x: number; y: number };

/** Axon length per myelin cell, in px. */
export const CELL_PITCH = 18;
/** Room for the soma and hillock at the soma end of the axon. */
export const HEAD_PAD = 30;
/** Room for the terminal fork at the branch end of the axon. */
export const TAIL_PAD = 14;
/** Length of the terminal fork's stem between the axon end and the ring. */
export const FORK_LEN = 18;
/** Radius of the branch node's outer ring. */
export const BRANCH_RADIUS = 34;
/** Soma keeps this far from the left and right viewport edges. */
export const SAFE_MARGIN = 44;
/** Neuron somas may always fan at least this far (flow px) to each side of the branch hub. */
export const MIN_FAN_SIDE = 170;
/** Characters on a standard page. */
export const CHARS_PER_PAGE = 3000;
export const MIN_CELLS = 3;
export const MAX_CELLS = 15;

/**
 * Myelin cells for a memory from its stored text size: 3 up to 1.5 pages, 15 from 100 pages,
 * logarithmic in between.
 * @param {number} charCount Characters of stored text.
 * @returns {number} Integer in [3, 15].
 */
export function getMemoryCellCount(charCount: number): number {
  const pages = (Number.isNaN(charCount) ? 0 : Math.max(0, charCount)) / CHARS_PER_PAGE;
  if (pages <= 1.5) return MIN_CELLS;
  if (pages >= 100) return MAX_CELLS;
  const t = Math.log(pages / 1.5) / Math.log(100 / 1.5);
  return Math.min(MAX_CELLS, Math.max(MIN_CELLS, Math.round(3 + t * 12)));
}

/** Axon arc length the cells need. */
export function targetAxonLength(cellCount: number): number {
  return cellCount * CELL_PITCH + HEAD_PAD + TAIL_PAD;
}

const LEFT_FROM = 130;
const LEFT_TO = 230;
const RIGHT_FROM = -50;
const RIGHT_TO = 50;
/** Terminals that fit on the left arc before the rest overflow to the right arc. */
export const LEFT_SLOTS = 5;

function spread(n: number, from: number, to: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [(from + to) / 2];
  return Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));
}

/**
 * Attachment angles on the branch ring, one per memory. The left arc (130°..230°) fills first,
 * the rest fan across the right arc (-50°..50°). Slots are ordered top to bottom on each arc,
 * and the straight-down / straight-up directions stay free for child and parent connectors.
 * @param {number} count Memories on the branch.
 * @returns {number[]} Angles in degrees; index i belongs to memory i.
 */
export function terminalAngles(count: number): number[] {
  const left = Math.min(count, LEFT_SLOTS);
  // Top-to-bottom on screen: on the left arc that is descending angle (230 -> 130).
  const l = spread(left, LEFT_TO, LEFT_FROM);
  const r = spread(count - left, RIGHT_FROM, RIGHT_TO);
  return [...l, ...r];
}

export function pointOnRing(center: Pt, radius: number, angleDeg: number): Pt {
  const a = (angleDeg * Math.PI) / 180;
  return { x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius };
}

export function cubicPoint(p0: Pt, c1: Pt, c2: Pt, p1: Pt, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return { x: a * p0.x + b * c1.x + c * c2.x + d * p1.x, y: a * p0.y + b * c1.y + c * c2.y + d * p1.y };
}

/** Derivative (unnormalised tangent) of the cubic at t. */
export function cubicTangent(p0: Pt, c1: Pt, c2: Pt, p1: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: 3 * u * u * (c1.x - p0.x) + 6 * u * t * (c2.x - c1.x) + 3 * t * t * (p1.x - c2.x),
    y: 3 * u * u * (c1.y - p0.y) + 6 * u * t * (c2.y - c1.y) + 3 * t * t * (p1.y - c2.y),
  };
}

/** Arc length of the cubic by polyline sampling. */
export function cubicLength(p0: Pt, c1: Pt, c2: Pt, p1: Pt, steps = 48): number {
  let len = 0;
  let prev = p0;
  for (let i = 1; i <= steps; i++) {
    const p = cubicPoint(p0, c1, c2, p1, i / steps);
    len += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return len;
}

export type RouteCell = { x: number; y: number; angle: number };

export type MemoryRoute = {
  cellCount: number;
  targetLength: number;
  /** Actual arc length of the axon curve. */
  length: number;
  angleDeg: number;
  /** Where the terminal docks on the branch ring. */
  terminal: Pt;
  /** Where the axon ends and the terminal fork begins (FORK_LEN outside the ring). */
  forkBase: Pt;
  soma: Pt;
  c1: Pt;
  c2: Pt;
  /** Cell centres along the curve with tangent angles (degrees, soma -> ring direction). */
  cells: RouteCell[];
  /** Direction (degrees) of the axon where it meets the fork, pointing into the ring. */
  forkAngle: number;
  /** Direction (degrees) of the axon leaving the soma. */
  somaAngle: number;
};

export type RouteOptions = {
  center: Pt;
  radius?: number;
  angleDeg: number;
  cellCount: number;
  /** Safe horizontal range for the soma; omit for unbounded. */
  minX?: number;
  maxX?: number;
  /** +1 / -1: which side the axon bows toward. */
  bowSide?: 1 | -1;
  /** Pushes the soma further out so neighbouring neurons stagger. */
  tier?: number;
  /** Forces the soma's y (used to keep neighbouring somas apart after clamping). */
  somaY?: number;
};

const TIER_STEP = 44;
const MIN_CHORD = 84;
const MAX_BOW = 700;

/**
 * Route one memory: terminal on the ring at angleDeg, soma out along that direction (clamped
 * into the safe x range), and a cubic Bézier between them. When the straight distance is shorter
 * than the arc the cells need, the control point is pushed sideways until the curve is long enough,
 * so the axon bends instead of overlapping. The curve always meets the ring head-on.
 * @param {RouteOptions} o Placement inputs.
 * @returns {MemoryRoute} Points, cell samples and angles for rendering.
 */
export function routeMemory(o: RouteOptions): MemoryRoute {
  const radius = o.radius ?? BRANCH_RADIUS;
  const targetLength = targetAxonLength(o.cellCount);
  const a = (o.angleDeg * Math.PI) / 180;
  const dir: Pt = { x: Math.cos(a), y: Math.sin(a) };
  const terminal = pointOnRing(o.center, radius, o.angleDeg);
  const forkBase = { x: terminal.x + dir.x * FORK_LEN, y: terminal.y + dir.y * FORK_LEN };

  const reach = Math.max(MIN_CHORD, targetLength * 0.72) + (o.tier ?? 0) * TIER_STEP;
  let soma = { x: forkBase.x + dir.x * reach, y: forkBase.y + dir.y * reach };
  const lo = o.minX ?? -Infinity;
  const hi = o.maxX ?? Infinity;
  soma = { x: Math.min(hi, Math.max(lo, soma.x)), y: o.somaY ?? soma.y };

  const chord = Math.hypot(soma.x - forkBase.x, soma.y - forkBase.y);
  const k1 = Math.max(24, chord * 0.3);
  const c2 = { x: forkBase.x + dir.x * k1, y: forkBase.y + dir.y * k1 };
  // Perpendicular to the soma->ring chord; bowSide picks the side.
  const cx = forkBase.x - soma.x, cy = forkBase.y - soma.y;
  const cl = Math.hypot(cx, cy) || 1;
  const side = o.bowSide ?? 1;
  const perp: Pt = { x: (-cy / cl) * side, y: (cx / cl) * side };
  const along = (t: number): Pt => ({ x: soma.x + cx * t, y: soma.y + cy * t });

  let bow = 0;
  const makeC1 = (b: number): Pt => {
    const base = along(0.33);
    let p = { x: base.x + perp.x * b, y: base.y + perp.y * b };
    p = { x: Math.min(hi, Math.max(lo, p.x)), y: p.y }; // the curve itself stays in the safe band too
    return p;
  };
  let c1 = makeC1(bow);
  let length = cubicLength(soma, c1, c2, forkBase);
  while (length < targetLength && bow < MAX_BOW) {
    bow += 6;
    c1 = makeC1(bow);
    length = cubicLength(soma, c1, c2, forkBase);
  }

  const cells: RouteCell[] = Array.from({ length: o.cellCount }, (_, i) => {
    // Even by arc length would need a lookup; even in t is visually even on these gentle curves.
    const t = (i + 0.5) / o.cellCount;
    const p = cubicPoint(soma, c1, c2, forkBase, t);
    const tg = cubicTangent(soma, c1, c2, forkBase, t);
    return { x: p.x, y: p.y, angle: (Math.atan2(tg.y, tg.x) * 180) / Math.PI };
  });
  const t0 = cubicTangent(soma, c1, c2, forkBase, 0);
  const t1 = cubicTangent(soma, c1, c2, forkBase, 1);
  return {
    cellCount: o.cellCount,
    targetLength,
    length,
    angleDeg: o.angleDeg,
    terminal,
    forkBase,
    soma,
    c1,
    c2,
    cells,
    forkAngle: (Math.atan2(t1.y, t1.x) * 180) / Math.PI,
    somaAngle: (Math.atan2(t0.y, t0.x) * 180) / Math.PI,
  };
}

/** Which way each slot bows: away from the arc's middle so neighbours do not cross. */
export function bowSideFor(angleDeg: number, index: number): 1 | -1 {
  const s = Math.sin((angleDeg * Math.PI) / 180);
  if (Math.abs(s) < 0.05) return index % 2 === 0 ? 1 : -1;
  return s > 0 ? -1 : 1;
}

/** Stagger tier (0 or 1) so adjacent somas do not sit side by side. */
export function tierFor(index: number): number {
  return index % 2;
}

/** Memory node box (flow units) and where the soma sits inside it; the axon draws outside the box. */
export const MEMORY_BOX = { w: 120, h: 67, somaX: 60, somaY: 23 } as const;

/** Move every point of a route by (dx, dy). */
export function translateRoute(r: MemoryRoute, dx: number, dy: number): MemoryRoute {
  const mv = (p: Pt): Pt => ({ x: p.x + dx, y: p.y + dy });
  return { ...r, terminal: mv(r.terminal), forkBase: mv(r.forkBase), soma: mv(r.soma), c1: mv(r.c1), c2: mv(r.c2), cells: r.cells.map((c) => ({ ...c, x: c.x + dx, y: c.y + dy })) };
}

/** Top-left of the node box that puts the soma at `soma`. */
export function memoryNodeOrigin(soma: Pt): Pt {
  return { x: soma.x - MEMORY_BOX.somaX, y: soma.y - MEMORY_BOX.somaY };
}

/**
 * Keep a top-to-bottom list of soma y values at least `gap` apart, moving them as little as
 * possible (they shift together about their centre of mass). Order is preserved.
 * @param {number[]} ys Desired y, already sorted ascending.
 * @param {number} gap Minimum spacing in px.
 * @returns {number[]} Adjusted y values, same length and order.
 */
export function spreadSomaY(ys: number[], gap: number): number[] {
  if (ys.length < 2) return [...ys];
  const out = [...ys];
  for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i]!, out[i - 1]! + gap);
  const shift = ys.reduce((a, y, i) => a + (out[i]! - y), 0) / ys.length;
  return out.map((y) => y - shift);
}
