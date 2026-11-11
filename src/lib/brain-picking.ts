import type { Object3D, Raycaster } from "three";

/** Coordinates must be relative to the actual WebGL canvas, never an overlay/event target. */
export function canvasNdc(
  event: { clientX: number; clientY: number },
  rect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
    y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
  };
}

const REGIONS = {
  "Frontal lobe": "frontal", "Parietal lobe": "parietal", "Temporal lobe": "temporal",
  "Occipital lobe": "occipital", Cerebellum: "cerebellum",
} as const;
export type PickedSector = typeof REGIONS[keyof typeof REGIONS] | "brainstem";
type TaggedObject = { userData: Record<string, unknown>; parent: TaggedObject | null };
/** GLTF region metadata can be several groups above the intersected child mesh. */
export function owningSector(object: TaggedObject): PickedSector | null {
  for (let node: TaggedObject | null = object; node; node = node.parent) {
    const id = node.userData.sectorId;
    if (id === "brainstem" || Object.values(REGIONS).includes(id as typeof REGIONS[keyof typeof REGIONS])) return id as PickedSector;
    const region = node.userData.bx_region;
    if (typeof region === "string" && Object.hasOwn(REGIONS, region)) return REGIONS[region as keyof typeof REGIONS];
  }
  return null;
}

/** Only renderable meshes are pickable; group children are always traversed. */
export function brainIntersections(raycaster: Raycaster, groups: Object3D[]) {
  return raycaster.intersectObjects(groups, true).filter(hit => (hit.object as Object3D & { isMesh?: boolean }).isMesh);
}
