import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSearchIndex, filterSearchIndex, resolveSearchTarget } from "./graph-search.ts";
import type { GraphPayload, Concept, Memory } from "./types.ts";

const branch = (id: string, parentId: string | null, name = id) => ({ id, parentId, name, sectorId: "frontal", description: id === "deep" ? "Seller financing key points" : "" }) as Concept;
const mem = (id: string, title: string, tags: string[], aiSummary = "") => ({ id, title, tags, body: "", aiSummary, transcript: null }) as Memory;
const graph = {
  concepts: [branch("root", null), branch("deep", "root", "Negotiation"), branch("other", null, "Negotiation")],
  memories: [mem("m", "Call notes", ["Seller", "CRM"], "Follow up on financing"), mem("orphan", "Unlinked", [])],
  connections: [{ sourceType: "memory", sourceId: "m", targetType: "concept", targetId: "deep" }],
} as GraphPayload;
const results = (options = {}) => filterSearchIndex(buildSearchIndex(graph), options);

test("indexes every branch depth and both entity kinds without a result cap", () => {
  assert.equal(results().length, 5);
  assert.equal(results({ scope: "branches" }).length, 3);
  assert.equal(results({ scope: "memories" }).length, 2);
});
test("matches normalized keywords across titles and key points, requiring every term", () => {
  assert.deepEqual(results({ query: "  FINANCING seller ", scope: "branches" }).map(r => r.id), ["deep"]);
  assert.deepEqual(results({ query: "financing follow", scope: "memories" }).map(r => r.id), ["m"]);
  assert.equal(results({ query: "financing unicorn" }).length, 0);
});
test("tag multi-select is case-insensitive AND, combined with scope and keyword", () => {
  assert.deepEqual(results({ scope: "memories", query: "notes", tags: ["seller", " CRM "] }).map(r => r.id), ["m"]);
  assert.equal(results({ tags: ["missing"] }).length, 0);
  assert.deepEqual(results({ scope: "branches", tags: ["crm"] }).map(r => r.id), ["deep"]);
});
test("memory navigation uses explicit owning branch ids, never duplicate branch names", () => {
  assert.deepEqual(resolveSearchTarget(graph, { type: "memory", id: "m" }), { sectorId: "frontal", branchId: "deep", memoryId: "m" });
  assert.deepEqual(resolveSearchTarget(graph, { type: "branch", id: "other" }), { sectorId: "frontal", branchId: "other", memoryId: null });
  assert.equal(resolveSearchTarget(graph, { type: "memory", id: "orphan" }), null);
  assert.equal(resolveSearchTarget(graph, { type: "branch", id: "deleted" }), null);
});
test("reverse ownership edges navigate identically and search never mutates the graph", () => {
  const reversed = structuredClone(graph);
  reversed.connections = [{ sourceType: "concept", sourceId: "deep", targetType: "memory", targetId: "m" }] as GraphPayload["connections"];
  const before = JSON.stringify(reversed);
  assert.equal(resolveSearchTarget(reversed, { type: "memory", id: "m" })?.branchId, "deep");
  buildSearchIndex(reversed);
  assert.equal(JSON.stringify(reversed), before);
});
