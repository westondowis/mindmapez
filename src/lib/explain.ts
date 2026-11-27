/** Pure helpers for Explain (summary + spoken overview). No server or DOM imports so they are unit-tested. */

export type ExplainTarget = "memory" | "branch";
export type ExplainMode = "summary" | "audio";
export type ExplainResult = {
  ok: true;
  script: string | null;
  audioUrl: string | null;
  summary: string;
  bullets: string[];
  cached: boolean;
};
export type ExplainFailure = { ok: false; error: string };

export const SCRIPT_MIN_WORDS = 110;
export const SCRIPT_MAX_WORDS = 180;
/** Source text sent to the model is capped so one huge document cannot run up the bill. */
export const EXPLAIN_SOURCE_CHARS = 12_000;

/** Small stable hash (FNV-1a, 32 bit) of the source text; changes whenever the content does. */
export function contentHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0") + text.length.toString(16);
}

function sentences(text: string): string[] {
  return (text.replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? []).map((s) => s.trim()).filter((s) => s.length > 3);
}

/** Offline summary used when no LLM key is configured: first sentences plus the longest later ones as takeaways. */
export function localSummary(text: string): { summary: string; bullets: string[] } {
  const all = sentences(text);
  if (!all.length) return { summary: "", bullets: [] };
  const summary = all.slice(0, 2).join(" ").slice(0, 400);
  const rest = all.slice(2);
  const bullets = [...rest]
    .sort((a, b) => b.length - a.length)
    .slice(0, 4)
    .sort((a, b) => rest.indexOf(a) - rest.indexOf(b))
    .map((s) => s.slice(0, 200));
  return { summary, bullets };
}

/** Parses the model's JSON reply (tolerates code fences / prose around it); null when unusable. */
export function parseSummaryJson(raw: string): { summary: string; bullets: string[] } | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as { summary?: unknown; bullets?: unknown };
    const summary = typeof j.summary === "string" ? j.summary.trim().slice(0, 700) : "";
    const bullets = Array.isArray(j.bullets) ? j.bullets.map((b) => String(b).replace(/^[-•*\s]+/, "").trim()).filter(Boolean).slice(0, 5).map((b) => b.slice(0, 240)) : [];
    return summary ? { summary, bullets } : null;
  } catch {
    return null;
  }
}

/** Strips markdown and graph jargon so the script reads naturally when spoken. */
export function cleanScript(raw: string): string {
  return raw
    .replace(/[*_#`>~]+/g, "")
    .replace(/^\s*(?:[-•]|\d+[.)])\s+/gm, "")
    .replace(/\b(?:mesh|node|nodes|memory graph)\b/gi, "note")
    .replace(/\s+/g, " ")
    .trim();
}

export function wordCountOf(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Offline spoken script built from the summary when the model is unavailable. */
export function localScript(title: string, summary: string, bullets: string[]): string {
  const parts = [`Here's a quick look at ${title}.`, summary, ...bullets.slice(0, 3).map((b, i) => `${["First", "Next", "And last"][i] ?? "Also"}, ${b.charAt(0).toLowerCase()}${b.slice(1)}`)];
  return cleanScript(parts.filter(Boolean).join(" "));
}

/** Trims a script to the spoken length cap on a sentence boundary. */
export function fitScript(script: string, max = SCRIPT_MAX_WORDS + 30): string {
  const clean = cleanScript(script);
  if (wordCountOf(clean) <= max) return clean;
  const out: string[] = [];
  let n = 0;
  for (const s of sentences(clean)) {
    const w = wordCountOf(s);
    if (n + w > max && out.length) break;
    out.push(s);
    n += w;
  }
  return out.join(" ");
}

export const SPEEDS = [1, 1.25, 1.5] as const;
export function nextSpeed(cur: number): (typeof SPEEDS)[number] {
  const i = SPEEDS.findIndex((s) => s === cur);
  return SPEEDS[(i + 1) % SPEEDS.length]!;
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
