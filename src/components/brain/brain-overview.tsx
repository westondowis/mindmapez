import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Line, OrbitControls, Stars, useGLTF } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { Minus, Plus, RotateCcw } from "lucide-react";
import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import * as THREE from "three";
import { primaryBranches, SECTOR_INSIGHT, sectorTitle, type BrainSector, type BrainSectorId } from "@/lib/brain";
import type { Concept } from "@/lib/types";
import { BRAIN_BUILD, createBrainMaterial } from "./brain-material";

const MIN_DIST = 1.35;
const MAX_DIST = 7.5;
/**
 * Lateral three-quarter view. The model's front is +Z, so a camera on +X sees
 * the side of the brain with the frontal lobe on the left of the screen and all
 * five lobes (frontal, parietal, temporal, occipital, cerebellum) in one view.
 */
const HOME = new THREE.Vector3(3.2, 0.45, 0.95);
/** Which side of the brain faces the home camera (+X). */
const VIEW_SIDE = 1;

/** How far the brain sits above the scene centre, in scene units. */
const BRAIN_LIFT = 0.14;
/** During the first-run tour a card covers the bottom third, so lift and shrink the brain above it. */
const GUIDE_LIFT = 0.76;
const GUIDE_BACKOFF = 1.35;

/** Region names stored in the anatomy model, mapped to the app's sectors. */
const REGION_SECTOR: Record<string, BrainSectorId> = {
  "Frontal lobe": "frontal",
  "Parietal lobe": "parietal",
  "Temporal lobe": "temporal",
  "Occipital lobe": "occipital",
  Cerebellum: "cerebellum",
};

/**
 * Where the (removed) brain stem sat, as a fraction of the fitted brain's size
 * from its centre. Measured from the original model before the stem was cut.
 */
const BRAINSTEM_NORM = new THREE.Vector3(0, -0.37, -0.03);

/**
 * Which way each label floats from its pin, as [up, toward-the-front] in the
 * plane we look at (front is screen-left in the home view), with an optional
 * length multiplier. Spread by hand so
 * the six labels fan out around the brain without touching.
 */
const LABEL_DIR: Record<BrainSectorId, [number, number, number?]> = {
  frontal: [0.8, 0.6],
  parietal: [1, -0.25],
  occipital: [0.15, -1],
  cerebellum: [-0.7, -0.75],
  temporal: [-0.3, 1, 0.52],
  brainstem: [-1, 0, 0.2],
};

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
const STRAY_CATEGORIES = new Set(["cranial_nerves", "arteries", "brainstem"]);

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

/**
 * Pin a marker onto the part of a lobe that is actually visible from the camera
 * side. Rays are fired in along the X axis across the lobe's footprint; only
 * samples whose first hit belongs to that same lobe count (a lobe tucked behind
 * another, like the cerebellum, is skipped where it is hidden). The pin goes on
 * the visible sample nearest the middle of the visible area.
 * @param {THREE.Object3D} model Fitted brain (world matrices already updated).
 * @param {BrainSectorId} id Lobe the pin belongs to.
 * @param {THREE.Box3} box Footprint of the lobe's pieces, in fitted space.
 * @returns {THREE.Vector3 | null} Surface point nudged outward, or null if no part is visible.
 */
function visiblePin(model: THREE.Object3D, id: BrainSectorId, box: THREE.Box3) {
  const dir = new THREE.Vector3(-VIEW_SIDE, 0, 0);
  const ray = new THREE.Raycaster();
  ray.far = 8;
  const hits: THREE.Vector3[] = [];
  const N = 6;
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < N; k++) {
      const y = THREE.MathUtils.lerp(box.min.y, box.max.y, (i + 0.5) / N);
      const z = THREE.MathUtils.lerp(box.min.z, box.max.z, (k + 0.5) / N);
      ray.set(new THREE.Vector3(VIEW_SIDE * 4, y, z), dir);
      const hit = ray.intersectObject(model, true)[0];
      if (hit && REGION_SECTOR[regionOf(hit.object)] === id) hits.push(hit.point.clone());
    }
  }
  if (!hits.length) return null;
  const mid = hits.reduce((a, h) => a.add(h), new THREE.Vector3()).divideScalar(hits.length);
  let best = hits[0];
  for (const h of hits) if (h.distanceToSquared(mid) < best.distanceToSquared(mid)) best = h;
  return best.clone().add(new THREE.Vector3(VIEW_SIDE * 0.045, 0, 0));
}

/**
 * Region tag for a mesh. The loader puts a node's metadata on the node itself,
 * so for a multi-part piece it sits on the parent group, not the mesh.
 * @param {THREE.Object3D} obj Mesh to look up.
 * @returns {string} Region name, or "" when none is tagged.
 */
function regionOf(obj: THREE.Object3D) {
  for (let o: THREE.Object3D | null = obj; o; o = o.parent) {
    const r = o.userData?.bx_region;
    if (typeof r === "string" && r) return r;
  }
  return "";
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

/** Swallows a render error so a failed glow effect never blanks the whole brain. */
class Quiet extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

useGLTF.preload("/brain.glb", "/draco/");

type Pin = { sector: BrainSector; pos: THREE.Vector3; label: THREE.Vector3 };

function BrainModel({
  sectors,
  spotlightId,
  reduced,
  anchors,
  labelEls,
  guide,
  onPick,
  onHover,
}: {
  sectors: BrainSector[];
  spotlightId?: string | null;
  guide: boolean;
  reduced: boolean;
  anchors: MutableRefObject<Record<string, THREE.Vector3>>;
  labelEls: MutableRefObject<Record<string, HTMLButtonElement | null>>;
  onPick: (id: BrainSectorId) => void;
  onHover?: (id: BrainSectorId | null) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const gltf = useGLTF("/brain.glb", "/draco/");
  // Phones get tighter leader lines and smaller labels so nothing leaves the screen.
  const compact = useThree((s) => s.size.width) < 640;

  const { fitted, radii, handle, size, lobeBoxes } = useMemo(() => {
    const root = gltf.scene.clone(true);
    // Safety net: the shipped model already has the stem, nerves and arteries cut
    // out. If an older copy is loaded, drop them so they never skew the fit.
    const stray: THREE.Object3D[] = [];
    root.traverse((obj) => {
      if (STRAY_CATEGORIES.has(String(obj.userData?.bx_cat ?? ""))) stray.push(obj);
    });
    stray.forEach((obj) => obj.removeFromParent());
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const rawSize = box.getSize(new THREE.Vector3());
    const rawCenter = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(rawSize.x, rawSize.y, rawSize.z) || 1;
    const scale = 1.7 / maxDim;

    // One shared dark-veined material for every piece of the brain.
    const handle = createBrainMaterial(rawCenter, 1 / maxDim, reduced);
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.material = handle.material;
    });

    root.scale.setScalar(scale);
    root.position.copy(rawCenter).multiplyScalar(-scale);
    root.updateMatrixWorld(true);

    // Union of each lobe's pieces on the camera-facing side, in fitted space.
    const unions = new Map<BrainSectorId, THREE.Box3>();
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const id = REGION_SECTOR[regionOf(mesh)];
      if (!id) return;
      const b = new THREE.Box3().setFromObject(mesh);
      if (b.getCenter(new THREE.Vector3()).x * VIEW_SIDE < -0.02) return;
      const u = unions.get(id) ?? new THREE.Box3();
      u.union(b);
      unions.set(id, u);
    });
    const fittedSize = rawSize.clone().multiplyScalar(scale);
    const spots = unions;

    return {
      fitted: root,
      radii: fittedSize.clone().multiplyScalar(0.5),
      handle,
      size: fittedSize,
      lobeBoxes: spots,
    };
  }, [gltf.scene, reduced]);

  useEffect(() => () => handle.dispose(), [handle]);

  const projected = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ clock, camera, size: view }) => {
    if (!reduced) handle.tick(clock.elapsedTime);
    // Labels are plain DOM buttons (one shared overlay), positioned from the 3D
    // anchor each frame and clamped on screen, so none can drift off the edge.
    const lift = guide ? GUIDE_LIFT : BRAIN_LIFT;
    for (const { sector, label } of pins) {
      const el = labelEls.current[sector.id];
      if (!el) continue;
      projected.copy(label);
      projected.y += lift;
      projected.project(camera);
      if (projected.z > 1) {
        el.style.opacity = "0";
        continue;
      }
      const halfW = el.offsetWidth / 2 + 6;
      const halfH = el.offsetHeight / 2 + 6;
      const x = THREE.MathUtils.clamp((projected.x * 0.5 + 0.5) * view.width, halfW, view.width - halfW);
      const y = THREE.MathUtils.clamp((-projected.y * 0.5 + 0.5) * view.height, halfH, view.height - halfH);
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      el.style.opacity = "1";
    }
  });

  // Each sector's pin sits on the real lobe it names, on the camera-facing side.
  const pins = useMemo<Pin[]>(() => {
    return sectors.map((sector) => {
      const box = lobeBoxes.get(sector.id);
      // The stem is cut from the model, so its marker hangs where the stem sat.
      const stem = sector.id === "brainstem";
      const pos = stem
        ? new THREE.Vector3(0, -(radii.y + 0.1), BRAINSTEM_NORM.z * size.z)
        : (box ? visiblePin(fitted, sector.id, box) : null) ??
          snapToSurface(fitted, sectorPoint(sector, 1), radii);
      // Label floats outward from the brain's centre, in the plane we look at.
      const [up, front, len = 0.34] = LABEL_DIR[sector.id] ?? [1, 0];
      const out = new THREE.Vector3(0, up, front).normalize().multiplyScalar(len * (compact ? 0.62 : 1));
      const label = pos.clone().add(out).add(new THREE.Vector3(VIEW_SIDE * 0.15, 0, 0));
      return { sector, pos, label };
    });
  }, [sectors, fitted, radii, size, lobeBoxes, compact]);

  useEffect(() => {
    const map: Record<string, THREE.Vector3> = {};
    pins.forEach((p) => {
      map[p.sector.id] = p.pos.clone();
    });
    anchors.current = map;
  }, [pins, anchors]);

  /**
   * Which sector a click/hover on the brain belongs to: the lobe the touched piece
   * is tagged with, or — for connecting pieces like the insula — the closest pin.
   */
  function sectorAt(hit: { object: THREE.Object3D; point: THREE.Vector3 }) {
    const direct = REGION_SECTOR[regionOf(hit.object)];
    if (direct) return direct;
    // Hit points are in scene space; pins live in the lifted group's space.
    const local = hit.point.clone().sub(new THREE.Vector3(0, guide ? GUIDE_LIFT : BRAIN_LIFT, 0));
    let best = pins[0];
    let bestD = Infinity;
    for (const p of pins) {
      const d = p.pos.distanceTo(local);
      if (d < bestD) {
        best = p;
        bestD = d;
      }
    }
    return best?.sector.id as BrainSectorId | undefined;
  }

  return (
    // Lifted a little so the tour card and hover panel don't cover the lower lobes.
    <group position={[0, guide ? GUIDE_LIFT : BRAIN_LIFT, 0]}>
      <primitive
        object={fitted}
        onClick={(e: { stopPropagation: () => void; object: THREE.Object3D; point: THREE.Vector3 }) => {
          e.stopPropagation();
          const id = sectorAt(e);
          if (id) onPick(id);
        }}
        onPointerMove={(e: { object: THREE.Object3D; point: THREE.Vector3 }) => {
          const id = sectorAt(e);
          if (id) {
            setHover(id);
            onHover?.(id);
          }
        }}
        onPointerOut={() => {
          setHover(null);
          onHover?.(null);
        }}
      />
      {pins.map(({ sector, pos, label }) => {
        const hot = hover === sector.id || spotlightId === sector.id;
        return (
          <group key={sector.id}>
            <mesh
              position={pos}
              onClick={(e) => {
                e.stopPropagation();
                onPick(sector.id);
              }}
              onPointerOver={() => {
                setHover(sector.id);
                onHover?.(sector.id);
              }}
              onPointerOut={() => {
                setHover(null);
                onHover?.(null);
              }}
            >
              <sphereGeometry args={[hot ? 0.034 : 0.022, 16, 16]} />
              <meshBasicMaterial color={hot ? "#f9c54b" : "#7df0ff"} toneMapped={false} />
            </mesh>
            <Line
              points={[pos, label]}
              color={hot ? "#f9c54b" : "#b77cff"}
              lineWidth={1}
              transparent
              opacity={0.6}
            />
          </group>
        );
      })}
    </group>
  );
}

/** Half the brain's fitted length plus room for the labels. */
const FIT_HALF_WIDTH = 1.25;

/**
 * Keep the whole brain in frame on narrow (portrait) screens. The home distance
 * was fixed for a landscape viewport, which cropped the brain on phones. Only
 * ever pushes the camera back, so it never overrides a user's own zoom-in.
 * @param {MutableRefObject<number>} homeDist Receives the aspect-aware home distance.
 */
function FitCamera({ homeDist, guide }: { homeDist: MutableRefObject<number>; guide: boolean }) {
  const { camera, size } = useThree();
  const guideChanged = useRef(guide);
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    if (!cam.isPerspectiveCamera || !size.width || !size.height) return;
    const aspect = size.width / size.height;
    const halfFov = THREE.MathUtils.degToRad(cam.fov / 2);
    const needed = FIT_HALF_WIDTH / (Math.tan(halfFov) * aspect);
    const base = Math.max(HOME.length(), needed) * (guide ? GUIDE_BACKOFF : 1);
    const dist = THREE.MathUtils.clamp(base, MIN_DIST, MAX_DIST);
    const changed = homeDist.current !== dist;
    homeDist.current = dist;
    // Pull back when too close; also re-frame when the tour starts or ends.
    if (cam.position.length() < dist || (changed && guideChanged.current !== guide)) cam.position.setLength(dist);
    guideChanged.current = guide;
  }, [camera, size.width, size.height, homeDist, guide]);
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
  const anchors = useRef<Record<string, THREE.Vector3>>({});
  const labelEls = useRef<Record<string, HTMLButtonElement | null>>({});
  const [fly, setFly] = useState<BrainSectorId | null>(null);
  const [hovered, setHovered] = useState<BrainSectorId | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const pending = useRef<BrainSectorId | null>(null);
  const flyTarget = useMemo(() => {
    const sector = sectors.find((s) => s.id === fly);
    if (!sector) return null;
    return anchors.current[sector.id]?.clone() ?? sectorPoint(sector, 1);
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
      <Canvas
        camera={{ position: [HOME.x, HOME.y, HOME.z], fov: 42 }}
        dpr={[1, 1.5]}
        gl={{ antialias: false }}
      >
        <color attach="background" args={["#00030a"]} />
        <ambientLight intensity={0.45} />
        <pointLight position={[2.6, 2.0, 2.6]} intensity={46} color="#e6d2ff" />
        <pointLight position={[3.4, 0.2, -1.2]} intensity={14} color="#8f6bff" />
        <pointLight position={[-2.2, -0.6, 1.4]} intensity={8} color="#3aa0ff" />
        <Stars radius={40} depth={20} count={reduced ? 200 : 900} factor={2} fade speed={reduced ? 0 : 0.4} />
        <BrainModel
          sectors={sectors}
          spotlightId={spotlightId}
          reduced={reduced}
          guide={guide}
          anchors={anchors}
          labelEls={labelEls}
          onPick={pick}
          onHover={setHovered}
        />
        <FitCamera homeDist={homeDist} guide={guide} />
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
        <Quiet>
          <EffectComposer multisampling={0}>
            <Bloom mipmapBlur intensity={0.95} luminanceThreshold={0.7} luminanceSmoothing={0.25} radius={0.72} />
          </EffectComposer>
        </Quiet>
      </Canvas>
      <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
        {sectors.map((sector) => {
          const hot = hovered === sector.id || spotlightId === sector.id;
          return (
            <button
              key={sector.id}
              ref={(el) => {
                labelEls.current[sector.id] = el;
              }}
              type="button"
              onClick={() => pick(sector.id)}
              onPointerEnter={() => setHovered(sector.id)}
              onPointerLeave={() => setHovered(null)}
              style={{ opacity: 0 }}
              className={`pointer-events-auto absolute left-0 top-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm transition-colors sm:px-2.5 sm:py-1 sm:text-[11px] ${
                hot
                  ? "border-amber-300/70 bg-black/80 shadow-[0_0_16px_rgba(249,197,75,0.45)]"
                  : "border-violet-400/45 bg-black/65 shadow-[0_0_14px_rgba(168,85,247,0.4)]"
              }`}
            >
              {(() => { const t = sectorTitle(sector); return t.renamed ? `${t.anatomy} ${t.emoji} ${t.short}` : `${t.anatomy} ${t.emoji}`; })()}
            </button>
          );
        })}
      </div>
      <div className="pointer-events-none absolute left-3 top-2 z-10 text-[10px] tracking-wide text-white/35">
        {BRAIN_BUILD}
      <VoicePanel onSpeaking={setSpeaking} />
      {speaking ? <div className="pointer-events-none absolute inset-0 z-10 animate-pulse bg-[#6a2ca8]/15" /> : null}
      </div>
      <div className="pointer-events-auto absolute right-3 top-3 z-20 flex flex-row gap-2 md:right-5 md:top-1/2 md:-translate-y-1/2 md:flex-col">
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
              {(() => { const t = sectorTitle(sector); return t.renamed ? `${t.anatomy} ${t.emoji} ${t.short}` : `${t.anatomy} ${t.emoji}`; })()}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
