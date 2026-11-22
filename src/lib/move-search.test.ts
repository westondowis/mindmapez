import assert from "node:assert/strict";
import test from "node:test";
import { searchMoveTargets, sectorDisplay } from "./move-search.ts";

const sectors = [
  { id: "frontal", anatomy: "Frontal lobe", label: "Work-Life" },
  { id: "cerebellum", anatomy: "Cerebellum", label: "Cerebellum" },
];
const concepts = [
  { id: "g", name: "Golf", sectorId: "cerebellum", parentId: null },
  { id: "q", name: "Quarterly goals", sectorId: "cerebellum", parentId: "g" },
  { id: "w", name: "Clients", sectorId: "frontal", parentId: null },
  { id: "x", name: "Moving", sectorId: "frontal", parentId: null },
];

test("sectorDisplay keeps the anatomy name next to a custom label", () => {
  assert.equal(sectorDisplay(sectors[0]!), "Work-Life (Frontal lobe)");
  assert.equal(sectorDisplay(sectors[1]!), "Cerebellum");
});
test("original anatomy name finds a renamed sector", () => {
  const r = searchMoveTargets("frontal", sectors, concepts, new Set());
  assert.ok(r.some((t) => t.kind === "sector" && t.sectorId === "frontal"));
  assert.ok(r.every((t) => t.sectorId === "frontal"));
});
test("more words narrow to one result", () => {
  assert.ok(searchMoveTargets("golf", sectors, concepts, new Set()).length >= 2);
  const r = searchMoveTargets("cerebellum golf quarterly", sectors, concepts, new Set());
  assert.equal(r.length, 1);
  assert.equal(r[0]!.parentId, "q");
});
test("excluded branches are never offered; empty query lists all", () => {
  const r = searchMoveTargets("", sectors, concepts, new Set(["x"]));
  assert.ok(!r.some((t) => t.parentId === "x"));
  assert.ok(r.length >= 5);
});
