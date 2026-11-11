import assert from "node:assert/strict";
import { test } from "node:test";
import { canvasNdc, owningSector, brainIntersections } from "./brain-picking.ts";
test("NDC uses client coordinates relative to an offset canvas, not event target offsets", () => {
  const rect = { left: 130, top: 80, width: 800, height: 400 };
  assert.deepEqual(canvasNdc({ clientX: 530, clientY: 280 }, rect), { x: 0, y: 0 });
  assert.deepEqual(canvasNdc({ clientX: 130, clientY: 80 }, rect), { x: -1, y: 1 });
  assert.deepEqual(canvasNdc({ clientX: 930, clientY: 480 }, rect), { x: 1, y: -1 });
  assert.equal(canvasNdc({ clientX: 0, clientY: 0 }, { ...rect, width: 0 }), null);
});
test("nested mesh hits resolve to metadata on the owning lobe group", () => {
  const group = { userData: { bx_region: "Temporal lobe" }, parent: null };
  assert.equal(owningSector({ userData: {}, parent: { userData: {}, parent: group } }), "temporal");
  assert.equal(owningSector({ userData: { sectorId: "brainstem" }, parent: null }), "brainstem");
  assert.equal(owningSector({ userData: {}, parent: null }), null);
});

test("raycaster reaches nested lobe meshes and chooses the nearest visible lobe", async () => {
  const THREE = await import("three");
  const root = new THREE.Group();
  const lobe = new THREE.Group();
  lobe.userData.bx_region = "Frontal lobe";
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  lobe.add(mesh); root.add(lobe); root.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, 3), new THREE.Vector3(0, 0, -1));
  const hits = brainIntersections(ray, [root]);
  assert.ok(hits.length > 0);
  assert.equal(owningSector(hits[0].object), "frontal");
  mesh.geometry.dispose(); mesh.material.dispose();
});
