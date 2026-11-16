/** Pointer drag-and-drop helpers for the tag tiers. Pure, so they run under node:test. */
import type { TagTier } from "./tag-intel.ts";

export type Rect = { left: number; top: number; right: number; bottom: number };
export type Zone = { tier: TagTier; rect: Rect };

/** Movement (px) before a press on a tag becomes a drag instead of a tap. */
export const DRAG_THRESHOLD = 6;

/** The tier whose drop zone contains the point, or null. */
export function tierAtPoint(x: number, y: number, zones: Zone[]): TagTier | null {
  for (const z of zones) {
    if (x >= z.rect.left && x <= z.rect.right && y >= z.rect.top && y <= z.rect.bottom) return z.tier;
  }
  return null;
}

export function isDrag(dx: number, dy: number, threshold = DRAG_THRESHOLD): boolean {
  return Math.hypot(dx, dy) >= threshold;
}

/** Tier to persist when a tag from `from` is released over `over`; null when nothing should change. */
export function dropResult(from: TagTier, over: TagTier | null): TagTier | null {
  return over && over !== from ? over : null;
}

export const otherTier = (t: TagTier): TagTier => (t === "primary" ? "secondary" : "primary");

/** Case-insensitive match of a query against a tag name, or against what the tag is attached to. */
export function matchesTag(query: string, t: { name: string; labels: string[] }): { match: boolean; via: string | null } {
  const q = query.trim().toLowerCase();
  if (!q) return { match: true, via: null };
  if (t.name.includes(q)) return { match: true, via: null };
  const hit = t.labels.find((l) => l.toLowerCase().includes(q));
  return hit ? { match: true, via: hit } : { match: false, via: null };
}
