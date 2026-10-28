import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls, Stars, useGLTF } from "@react-three/drei";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { primaryBranches, SECTOR_INSIGHT, type BrainSector, type BrainSectorId } from "@/lib/brain";
import type { Concept } from "@/lib/types";

const MIN_DIST = 1.35;
const MAX_DIST = 4.6;
const HOME = new THREE.Vector3(0, 0.15, 3.4);

function sectorPoint(sector: BrainSector, radius = 1.02) {
  const lon = ((sector.x - 50) / 50) * Math.PI * 0.85;
  const lat = ((42 - sector.y) / 50) * Math.PI * 0.55;
  return new THREE.Vector3(
    Math.sin(lon) * Math.cos(lat) * radius,
    Math.sin(lat) * radius * 0.85,
    Math.cos(lon) * Math.cos(lat) * radius,
  );
}

/** Anatomy-model categories that dangle below the brain and are not part of it. */
const STRAY_CATEGORIES = new Set(["cranial_nerves", "arteries"]);

/**
 * Pin a sector marker to the real brain surface: cast a ray from outside toward
 * the centre along the sector's direction and sit just above the first hit.
 * Falls back to the fitted ellipsoid when the ray misses.
 * @param {THREE.Object3D} model Fitted brain (world matrices already updated).
 * @param {THREE.Vector3} dir Direction from the brain centre (any length).
 * @param {THREE.Vector3} radii Half-extents of the fitted brain.
 * @returns {THREE.Vector3} Marker position in brain space.
 */
function snapToSurface(model: THREE.Object3D, dir: THREE.Vector3, radii: THREE.Vector3) {
  const d = dir.clone().normalize();
  const fallback = d.clone().multiply(radii).multiplyScalar(1.04);
  if (!Number.isFinite(d.x + d.y + d.z)) return fallback;
  const ray = new THREE.Raycaster(d.clone().multiplyScalar(4), d.clone().negate(), 0, 8);
  const hit = ray.intersectObject(model, true)[0];
  if (!hit) return fallback;
  return hit.point.clone().add(d.multiplyScalar(0.04));
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return reduced;
}

function SurfaceMotion({ map, reduced }: { map: THREE.CanvasTexture; reduced: boolean }) {
  const img = useRef<HTMLImageElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 512;
    canvas.current = c;
    const image = new Image();
    image.src = "/brain-mesh.gif";
    img.current = image;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#120018";
      ctx.fillRect(0, 0, 512, 512);
    }
    map.image = c;
    map.needsUpdate = true;
  }, [map]);
  useFrame(() => {
    if (reduced) return;
    const image = img.current;
    const c = canvas.current;
    if (!image || !c || !image.complete) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 512, 512);
    ctx.drawImage(image, 0, 0, 512, 512);
    map.needsUpdate = true;
  });
  return null;
}


/**
 * One lightning arc hugging the brain: a random walk over the unit sphere,
 * stretched onto the brain's own half-axes so the arc rides just above the
 * surface instead of floating around it.
 * @param {THREE.Vector3} radii Half-extents of the fitted brain (x, y, z).
 * @returns {THREE.Vector3[]} Polyline points in brain space.
 */
function boltPoints(radii: THREE.Vector3) {
  const pts: THREE.Vector3[] = [];
  let dir = new THREE.Vector3().randomDirection();
  const steps = 5 + Math.floor(Math.random() * 7);
  for (let i = 0; i < steps; i++) {
    const lift = 1.03 + Math.random() * 0.1;
    pts.push(dir.clone().multiply(radii).multiplyScalar(lift));
    const jitter = new THREE.Vector3().randomDirection().multiplyScalar(0.16);
    dir = dir.clone().add(jitter).normalize();
  }
  return pts;
}

function Lightning({ reduced, radii }: { reduced: boolean; radii: THREE.Vector3 }) {
  const group = useRef<THREE.Group>(null);
  const lines = useRef<THREE.Line[]>([]);
  const next = useRef(0);
  useEffect(() => {
    const g = group.current;
    return () => {
      // Free GPU resources when the brain unmounts.
      lines.current.forEach((l) => {
        l.geometry.dispose();
        (l.material as THREE.Material).dispose();
        g?.remove(l);
      });
      lines.current = [];
    };
  }, []);
  useFrame(({ clock }) => {
    if (reduced || !group.current) return;
    if (clock.elapsedTime < next.current && lines.current.length) return;
    next.current = clock.elapsedTime + 0.6 + Math.random() * 0.8;
    lines.current.forEach((l) => {
      l.geometry.dispose();
      (l.material as THREE.Material).dispose();
      group.current?.remove(l);
    });
    const count = 10 + Math.floor(Math.random() * 6);
    const fresh: THREE.Line[] = [];
    for (let i = 0; i < count; i++) {
      const geo = new THREE.BufferGeometry().setFromPoints(boltPoints(radii));
      const mat = new THREE.LineBasicMaterial({
        color: Math.random() > 0.3 ? "#e8a0ff" : "#c9b6ff",
        transparent: false,
      });
      const line = new THREE.Line(geo, mat);
      group.current.add(line);
      fresh.push(line);
    }
    lines.current = fresh;
  });
  return <group ref={group} />;
}

useGLTF.preload("/brain.glb", "/draco/");

function BrainModel({
  sectors,
  concepts,
  spotlightId,
  reduced,
  onPick,
  onHover,
}: {
  sectors: BrainSector[];
  concepts: Concept[];
  spotlightId?: string | null;
  reduced: boolean;
  onPick: (id: BrainSectorId) => void;
  onHover?: (id: BrainSectorId | null) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const gltf = useGLTF("/brain.glb", "/draco/");
  const { fitted, radii } = useMemo(() => {
    const root = gltf.scene.clone(true);
    // The anatomy model also holds cranial nerves and arteries that trail far
    // down the neck (0.56 tall vs 0.18 for the brain). Measuring them shrank the
    // brain ~3x and dragged its centre off, so drop them before fitting.
    const stray: THREE.Object3D[] = [];
    root.traverse((obj) => {
      if (STRAY_CATEGORIES.has(String(obj.userData?.bx_cat ?? ""))) stray.push(obj);
    });
    stray.forEach((obj) => obj.removeFromParent());
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = 1.7 / maxDim;
    root.scale.setScalar(scale);
    root.position.copy(center).multiplyScalar(-scale);
    root.updateMatrixWorld(true);
    const half = size.clone().multiplyScalar(scale / 2);
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      const mat = mesh.material;
      const apply = (m: THREE.Material) => {
        const std = m as THREE.MeshStandardMaterial;
        if ("color" in std && std.color) std.color.set("#3a2458");
        if ("emissive" in std && std.emissive) std.emissive.set("#b44cff");
        if ("emissiveIntensity" in std) std.emissiveIntensity = reduced ? 0.3 : 0.55;
        if ("roughness" in std) std.roughness = 0.55;
        if ("metalness" in std) std.metalness = 0.12;
      };
      if (Array.isArray(mat)) mat.forEach(apply);
      else if (mat) apply(mat);
    });
    return { fitted: root, radii: half };
  }, [gltf.scene, reduced]);
  const points = useMemo(
    () => sectors.map((s) => ({ sector: s, pos: snapToSurface(fitted, sectorPoint(s, 1), radii) })),
    [sectors, fitted, radii],
  );

  function nearest(point: THREE.Vector3) {
    let best = points[0];
    let bestD = Infinity;
    for (const p of points) {
      const d = p.pos.distanceTo(point);
      if (d < bestD) {
        best = p;
        bestD = d;
      }
    }
    return best?.sector.id as BrainSectorId | undefined;
  }

  return (
    <group>
      <Lightning reduced={reduced} radii={radii} />
      <primitive
        object={fitted}
        onClick={(e: { stopPropagation: () => void; point: THREE.Vector3 }) => {
          e.stopPropagation();
          const id = nearest(e.point);
          if (id) onPick(id);
        }}
        onPointerMove={(e: { point: THREE.Vector3 }) => {
          const id = nearest(e.point);
          if (id) { setHover(id); onHover?.(id); }
        }}
        onPointerOut={() => { setHover(null); onHover?.(null); }}
      />
      {points.map(({ sector, pos }) => {
        const hot = hover === sector.id || spotlightId === sector.id;
        return (
          <group key={sector.id} position={pos}>
            <mesh
              onClick={(e) => {
                e.stopPropagation();
                onPick(sector.id);
              }}
              onPointerOver={() => { setHover(sector.id); onHover?.(sector.id); }}
              onPointerOut={() => { setHover(null); onHover?.(null); }}
            >
              <sphereGeometry args={[hot ? 0.075 : 0.05, 16, 16]} />
              <meshBasicMaterial color={hot ? "#f9c54b" : "#6ee7ff"} />
            </mesh>

          </group>
        );
      })}
    </group>
  );
}

/** Half the brain's fitted width plus breathing room. */
const FIT_HALF_WIDTH = 0.76;

/**
 * Keep the whole brain in frame on narrow (portrait) screens. The home distance
 * was fixed for a landscape viewport, which cropped the brain on phones. Only
 * ever pushes the camera back, so it never overrides a user's own zoom-in.
 * @param {MutableRefObject<number>} homeDist Receives the aspect-aware home distance.
 */
function FitCamera({ homeDist }: { homeDist: MutableRefObject<number> }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    if (!cam.isPerspectiveCamera || !size.width || !size.height) return;
    const aspect = size.width / size.height;
    const halfFov = THREE.MathUtils.degToRad(cam.fov / 2);
    const needed = FIT_HALF_WIDTH / (Math.tan(halfFov) * aspect);
    const dist = THREE.MathUtils.clamp(Math.max(HOME.length(), needed), MIN_DIST, MAX_DIST);
    homeDist.current = dist;
    if (cam.position.length() < dist) cam.position.setLength(dist);
  }, [camera, size.width, size.height, homeDist]);
  return null;
}

function CameraRig({
  target,
  reduced,
  controls,
  onArrive,
}: {
  target: THREE.Vector3 | null;
  reduced: boolean;
  controls: MutableRefObject<{ enabled: boolean } | null>;
  onArrive: () => void;
}) {
  const { camera } = useThree();
  const start = useRef(new THREE.Vector3());
  const began = useRef(0);
  const arrived = useRef(false);
  useFrame(({ clock }) => {
    if (!target) return;
    if (arrived.current) return;
    if (controls.current) controls.current.enabled = false;
    const dest = target.clone().normalize().multiplyScalar(MIN_DIST + 0.18);
    if (began.current === 0) {
      start.current.copy(camera.position);
      began.current = clock.elapsedTime;
    }
    const dur = reduced ? 0.18 : 0.85;
    const t = Math.min(1, (clock.elapsedTime - began.current) / dur);
    const eased = 1 - Math.pow(1 - t, 3);
    camera.position.lerpVectors(start.current, dest, eased);
    camera.lookAt(0, 0, 0);
    if (t >= 1) {
      arrived.current = true;
      if (controls.current) controls.current.enabled = true;
      onArrive();
    }
  });
  useEffect(() => {
    arrived.current = false;
    began.current = 0;
  }, [target]);
  return null;
}

export function BrainOverview({
  concepts,
  sectors,
  spotlightId,
  guide = false,
  onOpenSector,
  onGuidePick,
}: {
  concepts: Concept[];
  sectors: BrainSector[];
  spotlightId?: string | null;
  guide?: boolean;
  onOpenSector: (id: BrainSectorId) => void;
  onEditSector: (id: BrainSectorId) => void;
  onGuidePick?: (id: BrainSectorId) => void;
  onOpenBranch?: (sectorId: BrainSectorId, branchId: string) => void;
}) {
  const reduced = useReducedMotion();
  const controls = useRef<any>(null);
  const homeDist = useRef(HOME.length());
  const [fly, setFly] = useState<BrainSectorId | null>(null);
  const [hovered, setHovered] = useState<BrainSectorId | null>(null);
  const pending = useRef<BrainSectorId | null>(null);
  const flyTarget = useMemo(() => {
    const sector = sectors.find((s) => s.id === fly);
    return sector ? sectorPoint(sector, 1) : null;
  }, [fly, sectors]);

  function pick(id: BrainSectorId) {
    if (guide && onGuidePick) {
      onGuidePick(id);
      return;
    }
    pending.current = id;
    setFly(id);
  }

  function arrive() {
    const id = pending.current;
    if (!id) return;
    pending.current = null;
    onOpenSector(id);
  }

  function zoomBy(factor: number) {
    const c = controls.current;
    if (!c) return;
    const dist = c.object.position.length();
    const next = THREE.MathUtils.clamp(dist * factor, MIN_DIST, MAX_DIST);
    c.object.position.normalize().multiplyScalar(next);
    c.update();
  }

  function reset() {
    const c = controls.current;
    if (!c) return;
    c.object.position.copy(HOME).setLength(homeDist.current);
    c.target.set(0, 0, 0);
    c.update();
    setFly(null);
  }

  
  void primaryBranches;

  return (
    <div className="absolute inset-0 bg-black">
      <Canvas camera={{ position: [HOME.x, HOME.y, HOME.z], fov: 42 }} dpr={[1, 1.75]}>
        <color attach="background" args={["#00040c"]} />
        <ambientLight intensity={0.7} />
        <pointLight position={[2.4, 1.6, 2.2]} intensity={40} color="#e8c6ff" />
        <pointLight position={[-2.2, -0.4, 1.4]} intensity={8} color="#3aa0ff" />
        <Stars radius={40} depth={20} count={reduced ? 200 : 900} factor={2} fade speed={reduced ? 0 : 0.4} />
        <BrainModel sectors={sectors} concepts={concepts} spotlightId={spotlightId} reduced={reduced} onPick={pick} onHover={setHovered} />
        <FitCamera homeDist={homeDist} />
        <CameraRig target={flyTarget} reduced={reduced} controls={controls} onArrive={arrive} />
        <OrbitControls
          ref={controls}
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={0.55}
          zoomSpeed={0.7}
          minDistance={MIN_DIST}
          maxDistance={MAX_DIST}
          minPolarAngle={0.35}
          maxPolarAngle={Math.PI - 0.35}
          target={[0, 0, 0]}
        />
      </Canvas>
      <div className="pointer-events-auto absolute right-3 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-2 md:right-5">
        <button type="button" className="brain-ctrl" aria-label="Zoom in" onClick={() => zoomBy(0.82)}>
          <Plus className="size-4" />
        </button>
        <button type="button" className="brain-ctrl" aria-label="Zoom out" onClick={() => zoomBy(1.18)}>
          <Minus className="size-4" />
        </button>
        <button type="button" className="brain-ctrl" aria-label="Reset view" onClick={reset}>
          <RotateCcw className="size-4" />
        </button>
      </div>

      <div className="pointer-events-auto absolute inset-x-2 bottom-3 z-20 md:inset-x-auto md:left-1/2 md:w-[min(100%-2rem,30rem)] md:-translate-x-1/2">
        {hovered ? (
          <div className="mb-1.5 rounded-xl border border-[#6a2ca8]/40 bg-black/75 px-3 py-2 backdrop-blur-md">
            <p className="text-sm font-medium text-white">{sectors.find((x) => x.id === hovered)?.label}</p>
            <p className="truncate text-[11px] text-[#c9b6ff]">
              {primaryBranches(concepts, hovered).slice(0, 3).map((b) => b.name).join(" · ") || sectors.find((x) => x.id === hovered)?.kicker}
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-white/75">{SECTOR_INSIGHT[hovered].handles}</p>
          </div>
        ) : null}
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
          {sectors.map((sector) => (
            <button
              key={sector.id}
              type="button"
              onClick={() => pick(sector.id)}
              onPointerEnter={() => setHovered(sector.id)}
              className={`shrink-0 rounded-full px-2.5 py-1.5 text-[11px] ${hovered === sector.id ? "bg-[#6a2ca8] text-white" : "bg-black/55 text-white/85"}`}
            >
              {sector.label.replace(" lobe", "")}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
