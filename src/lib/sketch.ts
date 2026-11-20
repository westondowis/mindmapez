/**
 * Draw-to-refine: turn raw pointer strokes into a clean emoji-style SVG.
 * Pipeline: normalize into the 64x64 box -> Ramer–Douglas–Peucker simplify ->
 * Chaikin smooth -> uniform round strokes, closed shapes filled, on a soft
 * rounded-square badge. Pure module (no DOM).
 */

export type Point = { x: number; y: number };
export type Stroke = Point[];
export type SketchStyle = { ink: string; fill: string; bg: string; bg2: string };

export const SKETCH_SIZE = 64;
export const SKETCH_PADDING = 10;
export const DEFAULT_SKETCH_STYLE: SketchStyle = { ink: "#1f2937", fill: "#fbbf24", bg: "#fef3c7", bg2: "#fde68a" };

function perpDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Ramer–Douglas–Peucker polyline simplification (iterative, keeps endpoints). */
export function simplifyRdp(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = -1;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpDistance(points[i]!, points[s]!, points[e]!);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx > 0 && maxD > epsilon) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

/** Chaikin corner cutting. Open strokes keep their endpoints. */
export function smoothChaikin(points: Point[], iterations = 2, closed = false): Point[] {
  let pts = points.slice();
  for (let k = 0; k < iterations && pts.length >= 3; k++) {
    const next: Point[] = closed ? [] : [pts[0]!];
    const n = pts.length;
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % n]!;
      next.push({ x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y });
      next.push({ x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y });
    }
    if (!closed) next.push(pts[n - 1]!);
    pts = next;
  }
  return pts;
}

export function strokesBounds(strokes: Stroke[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of strokes) for (const p of s) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

/** Uniformly scale and center all strokes into [padding, size - padding], preserving aspect ratio. */
export function normalizeStrokes(strokes: Stroke[], size = SKETCH_SIZE, padding = SKETCH_PADDING): Stroke[] {
  const b = strokesBounds(strokes);
  if (!b) return [];
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  const inner = size - padding * 2;
  const scale = Math.max(w, h) > 0 ? inner / Math.max(w, h) : 1;
  const ox = (size - w * scale) / 2;
  const oy = (size - h * scale) / 2;
  return strokes
    .map((s) => s.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)).map((p) => ({ x: (p.x - b.minX) * scale + ox, y: (p.y - b.minY) * scale + oy })))
    .filter((s) => s.length > 0);
}

function dedupe(points: Point[], min = 0.4): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= min) out.push(p);
  }
  return out;
}

function pathLength(points: Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  return len;
}

/** A stroke whose ends meet (relative to its own length) reads as a closed outline. */
export function isClosedStroke(points: Point[]): boolean {
  if (points.length < 4) return false;
  const len = pathLength(points);
  const gap = Math.hypot(points[0]!.x - points[points.length - 1]!.x, points[0]!.y - points[points.length - 1]!.y);
  return len > 24 && gap <= Math.max(4, len * 0.12);
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export type RefinedStroke = { points: Point[]; closed: boolean; dot: boolean };

/** Normalize, simplify and smooth raw strokes into the 64x64 box. */
export function refineStrokes(strokes: Stroke[], epsilon = 1.1): RefinedStroke[] {
  const norm = normalizeStrokes(strokes.filter((s) => s.length > 0));
  return norm.map((s) => {
    const pts = dedupe(s);
    if (pts.length < 2 || pathLength(pts) < 2) return { points: [pts[0]!], closed: false, dot: true };
    const closed = isClosedStroke(pts);
    const base = closed ? pts.slice(0, -1) : pts;
    const simple = simplifyRdp(closed ? [...base, base[0]!] : base, epsilon);
    const ring = closed ? simple.slice(0, -1) : simple;
    const smooth = smoothChaikin(ring.length >= 3 || !closed ? ring : simple, 2, closed && ring.length >= 3);
    return { points: smooth, closed: closed && ring.length >= 3, dot: false };
  });
}

export function pathData(points: Point[], closed: boolean): string {
  if (!points.length) return "";
  const [first, ...rest] = points;
  return `M${r1(first!.x)} ${r1(first!.y)}${rest.map((p) => `L${r1(p.x)} ${r1(p.y)}`).join("")}${closed ? "Z" : ""}`;
}

/** Full emoji-style SVG for a sketch, or null when there is nothing drawn. */
export function sketchToSvg(strokes: Stroke[], opts: { fillClosed?: boolean; style?: SketchStyle; strokeWidth?: number } = {}): string | null {
  const refined = refineStrokes(strokes);
  if (!refined.length) return null;
  const style = opts.style ?? DEFAULT_SKETCH_STYLE;
  const sw = opts.strokeWidth ?? 3.5;
  const fills = opts.fillClosed === false ? [] : refined.filter((s) => s.closed);
  const body = [
    ...fills.map((s) => `<path d="${pathData(s.points, true)}" fill="${style.fill}" stroke="none"/>`),
    ...refined.map((s) =>
      s.dot
        ? `<circle cx="${r1(s.points[0]!.x)}" cy="${r1(s.points[0]!.y)}" r="${r1(sw * 0.75)}" fill="${style.ink}"/>`
        : `<path d="${pathData(s.points, s.closed)}" fill="none" stroke="${style.ink}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`,
    ),
  ].join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">` +
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${style.bg}"/><stop offset="1" stop-color="${style.bg2}"/></linearGradient></defs>` +
    `<rect x="2" y="2" width="60" height="60" rx="16" fill="url(#bg)"/>` +
    body +
    `</svg>`
  );
}
