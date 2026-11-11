import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { branchUpDestination, lockBranchViewport } from "./branch-viewport.ts";

test("the lobe-level up arrow returns to the 3D overview", () => {
  assert.deepEqual(branchUpDestination(null, null), { overview: true, branchId: null });
});
test("deeper up arrows preserve the existing parent/sector ascent", () => {
  assert.deepEqual(branchUpDestination("primary", null), { overview: false, branchId: null });
  assert.deepEqual(branchUpDestination("child", "parent"), { overview: false, branchId: "parent" });
});
test("the branch viewport locks both page scroll ancestors and restores exact prior styles", () => {
  const html = { style: { overflow: "auto", overscrollBehavior: "contain" } };
  const body = { style: { overflow: "scroll", overscrollBehavior: "" } };
  const unlock = lockBranchViewport({ documentElement: html, body });
  assert.equal(html.style.overflow, "hidden");
  assert.equal(body.style.overflow, "hidden");
  assert.equal(body.style.overscrollBehavior, "none");
  unlock();
  assert.deepEqual(html.style, { overflow: "auto", overscrollBehavior: "contain" });
  assert.deepEqual(body.style, { overflow: "scroll", overscrollBehavior: "" });
});
test("branch detail is portaled with a pass-through wrapper and interactive card", () => {
  const source = readFileSync(new URL("./branch-detail-overlay.tsx", import.meta.url), "utf8");
  assert.match(source, /createPortal/);
  assert.match(source, /document\.body/);
  assert.match(source, /pointer-events-none fixed inset-0 z-40/);
  assert.match(source, /pointer-events-auto/);
  assert.match(source, /aria-label="Close branch details"/);
});
test("selection cannot resize the canvas or queue focus auto-panning", () => {
  const source = readFileSync(new URL("./mesh-canvas.tsx", import.meta.url), "utf8");
  assert.match(source, /data-testid="branch-viewport" className="absolute inset-0[^"\n]*overflow-hidden/);
  assert.match(source, /data-testid="graph-canvas-frame"/);
  assert.match(source, /autoPanOnNodeFocus=\{false\}/);
  assert.match(source, /onPaneClick=\{\(\) => \{\s*setDetailBranchId\(null\)/);
  assert.doesNotMatch(source, /scrollIntoView\(/);
});

test("Level 1 reuses the deeper up-arrow renderer and the overview reset action", () => {
  const source = readFileSync(new URL("./mesh-canvas.tsx", import.meta.url), "utf8");
  assert.match(source, /name: "Brain Overview", emoji: "⬆️", count: 0, isMoveUp: true/);
  assert.match(source, /if \(up\.overview\) \{ goOverview\(\); return; \}/);
  assert.match(source, /function goOverview\(\) \{[\s\S]*?setSectorId\(null\);[\s\S]*?setBranchId\(null\);[\s\S]*?setSelectedId\(null\);/);
});
