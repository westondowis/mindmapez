import type { GraphPayload } from "./types.ts";

export type SearchScope = "all" | "branches" | "memories";
export type SearchTarget = { type: "branch" | "memory"; id: string };
export type SearchEntry = SearchTarget & {
  title: string; snippet: string; tags: string[]; branchId: string | null;
  sectorId: string | null; text: string;
};
const normalize = (text: string) => text.normalize("NFKC").toLowerCase().trim();

/** Ownership uses ONLY explicit branch-id links, in either edge direction. */
function ownerIds(graph: GraphPayload): Map<string, string[]> {
  const branches = new Set(graph.concepts.map(c => c.id));
  const owners = new Map<string, string[]>();
  for (const edge of graph.connections) {
    const pair = edge.sourceType === "memory" && edge.targetType === "concept" ? [edge.sourceId, edge.targetId]
      : edge.targetType === "memory" && edge.sourceType === "concept" ? [edge.targetId, edge.sourceId] : null;
    if (!pair || !branches.has(pair[1])) continue;
    const ids = owners.get(pair[0]) ?? [];
    if (!ids.includes(pair[1])) ids.push(pair[1]);
    owners.set(pair[0], ids);
  }
  for (const ids of owners.values()) ids.sort();
  return owners;
}

export function buildSearchIndex(graph: GraphPayload): SearchEntry[] {
  const owners = ownerIds(graph);
  const branches = new Map(graph.concepts.map(c => [c.id, c]));
  const branchTags = new Map<string, Set<string>>();
  for (const memory of graph.memories) for (const id of owners.get(memory.id) ?? []) {
    const tags = branchTags.get(id) ?? new Set<string>();
    memory.tags.forEach(tag => tags.add(normalize(tag)));
    branchTags.set(id, tags);
  }
  return [
    ...graph.concepts.map(c => ({
      type: "branch" as const, id: c.id, title: c.name, snippet: c.description,
      tags: [...(branchTags.get(c.id) ?? [])], branchId: c.id, sectorId: c.sectorId,
      text: normalize([c.name, c.description].join(" ")),
    })),
    ...graph.memories.map(m => {
      const branchId = owners.get(m.id)?.[0] ?? null;
      return {
        type: "memory" as const, id: m.id, title: m.title, snippet: m.aiSummary || m.body,
        tags: [...new Set(m.tags.map(normalize))], branchId,
        sectorId: branchId ? branches.get(branchId)?.sectorId ?? null : null,
        text: normalize([m.title, m.aiSummary, m.body, m.transcript, ...m.tags].join(" ")),
      };
    }),
  ];
}

/** All keyword terms and all selected tags must match; scope applies before display. */
export function filterSearchIndex(index: SearchEntry[], options: { query?: string; scope?: SearchScope; tags?: string[] }): SearchEntry[] {
  const terms = normalize(options.query ?? "").split(/\s+/).filter(Boolean);
  const tags = (options.tags ?? []).map(normalize).filter(Boolean);
  return index.filter(entry =>
    (options.scope === undefined || options.scope === "all" || (options.scope === "branches" ? entry.type === "branch" : entry.type === "memory")) &&
    terms.every(term => entry.text.includes(term)) && tags.every(tag => entry.tags.includes(tag)),
  ).sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}

export function resolveSearchTarget(graph: GraphPayload, target: SearchTarget) {
  const branchId = target.type === "branch" ? target.id
    : graph.memories.some(m => m.id === target.id) ? ownerIds(graph).get(target.id)?.[0] : undefined;
  const branch = graph.concepts.find(c => c.id === branchId);
  return branch ? { sectorId: branch.sectorId, branchId: branch.id, memoryId: target.type === "memory" ? target.id : null } : null;
}
