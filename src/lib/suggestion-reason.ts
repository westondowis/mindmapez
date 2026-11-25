/**
 * Suggested memory↔memory connections: a readable reason ("Both linked to Golf and Practice") built
 * from the concepts both memories share, and the inverse parse so the dashboard can show chips even
 * when only the reason text is available. Older free-text reasons ("Shared themes with: …") parse to
 * no concepts and still render as written. Pure + one Sql helper so node tests run the exact query.
 */
import type { Sql } from "./sql-template.ts";

export const REASON_PREFIX = "Both linked to ";
export const MAX_REASON_CONCEPTS = 3;

function listText(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function cleanConceptNames(names: readonly string[], max: number = MAX_REASON_CONCEPTS): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    // Commas and " and " are the list separators, so they're folded out of names to keep it parseable.
    const n = raw.replace(/,/g, " ").replace(/\s+/g, " ").replace(/ and /gi, " & ").trim().slice(0, 60);
    const key = n.toLowerCase();
    if (!n || seen.has(key)) continue;
    seen.add(key);
    out.push(n);
    if (out.length >= max) break;
  }
  return out;
}

/** "Both linked to Golf", "Both linked to Golf and Practice", "Both linked to A, B and C". */
export function buildSuggestionReason(names: readonly string[], fallbackTitle?: string): string {
  const clean = cleanConceptNames(names);
  if (clean.length) return REASON_PREFIX + listText(clean);
  return fallbackTitle ? `Shared themes with: ${fallbackTitle}` : "Shared themes";
}

/** Concept names encoded by buildSuggestionReason; [] for older or hand-written reasons. */
export function parseSuggestionReason(reason: string | null | undefined): string[] {
  if (!reason || !reason.startsWith(REASON_PREFIX)) return [];
  const body = reason.slice(REASON_PREFIX.length).trim();
  if (!body) return [];
  const parts = body.split(/, | and /).map((p) => p.trim()).filter(Boolean);
  return parts.slice(0, MAX_REASON_CONCEPTS);
}

/** Text for a card: the generated line from shared concepts, otherwise the stored reason. */
export function suggestionReasonLine(shared: readonly string[], stored: string | null | undefined): string | null {
  if (shared.length) return buildSuggestionReason(shared);
  return stored?.trim() || null;
}

/**
 * Concepts (branches) both memories belong to, most-used first, capped. Used when a suggestion is
 * created and to derive chips for suggestions saved before v5.47.
 */
export async function sharedConceptNames(sql: Sql, userId: string, a: string, b: string, limit: number = MAX_REASON_CONCEPTS): Promise<string[]> {
  const rows = await sql<{ name: string }>`
    select c.name
    from concepts c
    join memory_concepts ma on ma.concept_id = c.id and ma.user_id = ${userId} and ma.memory_id = ${a}
    join memory_concepts mb on mb.concept_id = c.id and mb.user_id = ${userId} and mb.memory_id = ${b}
    where c.user_id = ${userId}
    order by (select count(*) from memory_concepts u where u.concept_id = c.id and u.user_id = ${userId}) desc, c.name
    limit ${limit}
  `;
  return rows.map((r) => r.name);
}
