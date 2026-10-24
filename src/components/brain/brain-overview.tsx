import { Minus, Plus, RotateCcw, RotateCw, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadBrainView, primaryBranches, saveBrainView, SECTOR_INSIGHT, type BrainSector, type BrainSectorId } from "@/lib/brain";
import { nodeColorCss } from "@/lib/node-colors";
import type { Concept } from "@/lib/types";
import { cn } from "@/lib/utils";

const MIN_ZOOM = 0.55;
const MAX_ZOOM = 2.35;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function BrainOverview({
  concepts,
  sectors,
  spotlightId,
  guide = false,
  onOpenSector,
  onEditSector,
  onGuidePick,
  onOpenBranch,
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
  const viewport = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; orx: number; ory: number } | null>(null);
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rot, setRot] = useState({ x: 12, y: -16 });
  const [mode, setMode] = useState<"move" | "turn">("move");
  const [hover, setHover] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = loadBrainView();
    const el = viewport.current;
    if (saved) {
      setZoom(clamp(saved.zoom, MIN_ZOOM, MAX_ZOOM));
      setPan({ x: saved.x, y: saved.y });
      setRot({ x: saved.rx, y: saved.ry });
    } else if (el) {
      const r = el.getBoundingClientRect();
      const fit = Math.min(r.width / 460, (r.height - 24) / 520);
      setZoom(clamp(fit * 0.94, MIN_ZOOM, 1.15));
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveBrainView({ zoom, x: pan.x, y: pan.y, rx: rot.x, ry: rot.y });
  }, [zoom, pan, rot, ready]);

  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      setZoom((z) => clamp(z * factor, MIN_ZOOM, MAX_ZOOM));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function pointerDist() {
    const pts = [...pointers.current.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button, input, a")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      drag.current = { x: e.clientX, y: e.clientY, ox: pan.x, oy: pan.y, orx: rot.x, ory: rot.y };
      pinch.current = null;
    } else if (pointers.current.size >= 2) {
      drag.current = null;
      pinch.current = { dist: pointerDist(), zoom };
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2 && pinch.current) {
      const dist = pointerDist();
      if (pinch.current.dist > 0) {
        setZoom(clamp(pinch.current.zoom * (dist / pinch.current.dist), MIN_ZOOM, MAX_ZOOM));
      }
      return;
    }
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    if (mode === "turn") {
      setRot({
        x: clamp(drag.current.orx - dy * 0.25, -40, 40),
        y: clamp(drag.current.ory + dx * 0.35, -55, 55),
      });
    } else {
      setPan({ x: drag.current.ox + dx, y: drag.current.oy + dy });
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) drag.current = null;
  }

  function resetView() {
    const el = viewport.current;
    const r = el?.getBoundingClientRect();
    const fit = r ? Math.min(r.width / 460, (r.height - 24) / 520) : 1;
    setZoom(clamp(fit * 0.94, MIN_ZOOM, 1.15));
    setPan({ x: 0, y: 0 });
    setRot({ x: 12, y: -16 });
    setMode("move");
  }

  const preview = sectors.find((s) => s.id === previewId) ?? null;
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 1) return [];
    const sectorHits = sectors
      .filter((s) => s.label.toLowerCase().includes(q) || s.anatomy.toLowerCase().includes(q))
      .map((s) => ({ kind: "sector" as const, id: s.id, label: s.label, sectorId: s.id }));
    const branchHits = concepts
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 6)
      .map((c) => ({ kind: "branch" as const, id: c.id, label: c.name, sectorId: c.sectorId }));
    return [...sectorHits, ...branchHits].slice(0, 8);
  }, [query, sectors, concepts]);

  function pick(id: BrainSectorId) {
    if (guide && onGuidePick) {
      onGuidePick(id);
      return;
    }
    setPreviewId(id);
  }

  return (
    <div className="absolute inset-0">
      <div className="pointer-events-auto absolute inset-x-0 top-16 z-20 mx-auto flex w-[min(100%-5.5rem,28rem)] items-center gap-2 md:top-[4.5rem] md:w-[min(100%-8rem,28rem)]">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the brain"
            aria-label="Search the brain"
            className="h-11 w-full rounded-xl border border-border bg-background/80 pr-3 pl-9 text-sm backdrop-blur-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {matches.length > 0 ? (
            <ul className="absolute mt-1 max-h-56 w-full overflow-auto rounded-xl border border-border bg-card p-1 shadow-soft">
              {matches.map((hit) => (
                <li key={`${hit.kind}-${hit.id}`}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-left text-sm hover:bg-primary/10"
                    onClick={() => {
                      setQuery("");
                      if (hit.kind === "sector") pick(hit.sectorId as BrainSectorId);
                      else onOpenBranch?.(hit.sectorId as BrainSectorId, hit.id);
                    }}
                  >
                    <span className="truncate">{hit.label}</span>
                    <span className="ml-2 shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {hit.kind === "sector" ? "Region" : "Node"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <div
        ref={viewport}
        className="brain-stage absolute inset-0 overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="absolute top-1/2 left-1/2 h-[520px] w-[min(92vw,460px)]"
          style={{
            transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
            transformOrigin: "center center",
          }}
        >
          <div className="brain-tilt h-full w-full" style={{ transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg)` }}>
            <BrainFigure sectors={sectors} hover={hover} selected={previewId} spotlightId={spotlightId} />
            {sectors.map((sector) => {
              const count = primaryBranches(concepts, sector.id).length;
              const active = previewId === sector.id || hover === sector.id;
              const spot = spotlightId === sector.id;
              return (
                <button
                  key={sector.id}
                  type="button"
                  onClick={() => pick(sector.id)}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseEnter={() => setHover(sector.id)}
                  onMouseLeave={() => setHover((h) => (h === sector.id ? null : h))}
                  style={{ left: `${sector.x}%`, top: `${sector.y}%`, borderColor: nodeColorCss(sector.color) }}
                  className={cn(
                    "absolute z-10 min-h-11 max-w-[9.5rem] -translate-x-1/2 -translate-y-1/2 rounded-xl border px-2.5 py-1.5 text-left backdrop-blur-md transition-[transform,box-shadow,background-color] duration-200",
                    active || spot
                      ? "scale-105 bg-card text-foreground shadow-[0_0_22px_rgb(136_187_216/0.35)]"
                      : "bg-background/75 text-foreground hover:bg-card",
                    spot && "brain-spotlight",
                  )}
                  aria-pressed={previewId === sector.id}
                  aria-label={
                    guide
                      ? `${sector.anatomy}. ${SECTOR_INSIGHT[sector.id].handles} ${SECTOR_INSIGHT[sector.id].example}`
                      : `${sector.label}. ${sector.anatomy}. ${count} ${count === 1 ? "node" : "nodes"}.`
                  }
                >
                  <span className="block truncate text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {guide ? sector.kicker : sector.named ? sector.anatomy : "Region"}
                  </span>
                  <span className="block truncate font-display text-sm leading-tight">{sector.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="absolute top-16 right-3 z-20 flex flex-col gap-1 md:top-[4.5rem] md:right-4">
        <button type="button" className="brain-ctrl" aria-label="Zoom in" onClick={() => setZoom((z) => clamp(z * 1.12, MIN_ZOOM, MAX_ZOOM))}>
          <Plus className="size-4" />
        </button>
        <button type="button" className="brain-ctrl" aria-label="Zoom out" onClick={() => setZoom((z) => clamp(z / 1.12, MIN_ZOOM, MAX_ZOOM))}>
          <Minus className="size-4" />
        </button>
        <button
          type="button"
          className={cn("brain-ctrl", mode === "turn" && "border-highlight text-highlight")}
          aria-pressed={mode === "turn"}
          aria-label={mode === "turn" ? "Turn mode on. Switch to move." : "Turn the brain"}
          onClick={() => setMode((m) => (m === "move" ? "turn" : "move"))}
        >
          <RotateCw className="size-4" />
        </button>
        <button type="button" className="brain-ctrl" aria-label="Reset view" onClick={resetView}>
          <RotateCcw className="size-4" />
        </button>
      </div>

      <p className="pointer-events-none absolute bottom-28 left-3 z-10 hidden text-[11px] text-muted-foreground md:bottom-6 md:block">
        {mode === "turn" ? "Drag to turn the brain" : "Drag to move · scroll or pinch to zoom"}
      </p>

      {preview && !guide ? (
        <aside className="absolute inset-x-3 bottom-24 z-30 rounded-2xl border border-border bg-background/95 p-4 shadow-soft backdrop-blur-md md:inset-x-auto md:right-4 md:bottom-6 md:w-80">
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{preview.anatomy}</p>
          <h2 className="mt-1 flex items-center gap-2 font-display text-2xl">
            <span aria-hidden="true">{preview.emoji}</span>
            {preview.label}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{preview.kicker}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {primaryBranches(concepts, preview.id).length} nodes in this region.
            {preview.named ? "" : " Name it however you want."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm text-primary-foreground"
              onClick={() => onOpenSector(preview.id)}
            >
              Open network
            </button>
            <button
              type="button"
              className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm"
              onClick={() => onEditSector(preview.id)}
            >
              Name & color
            </button>
          </div>
        </aside>
      ) : null}
    </div>
  );
}

function BrainFigure({
  sectors,
  hover,
  selected,
  spotlightId,
}: {
  sectors: BrainSector[];
  hover: string | null;
  selected: string | null;
  spotlightId?: string | null;
}) {
  const color = (id: string) => nodeColorCss(sectors.find((s) => s.id === id)?.color);
  const hot = (id: string) => hover === id || selected === id || spotlightId === id;
  return (
    <svg viewBox="0 0 460 520" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
      <defs>
        <filter id="lobe-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <ellipse cx="230" cy="470" rx="120" ry="16" fill="var(--color-primary)" opacity="0.12" />
      <path
        d="M230 78c-92-28-168 24-176 112-6 62 22 108 62 136-18 28-22 62-8 96 18 42 62 62 104 58 10 36 28 58 48 70 20-12 38-34 48-70 42 4 86-16 104-58 14-34 10-68-8-96 40-28 68-74 62-136C398 102 322 50 230 78Z"
        fill="none"
        stroke="rgb(136 187 216 / 55%)"
        strokeWidth="2"
        filter="url(#lobe-glow)"
      />
      <path d="M228 96c-70-10-132 28-140 96-6 52 24 92 70 114 8-46 28-92 70-124V96Z" fill={color("temporal")} opacity={hot("temporal") ? 0.85 : 0.38} />
      <path d="M214 118c-48 8-96 48-104 96 22 8 48 6 74-8 18-28 24-62 30-88Z" fill={color("frontal")} opacity={hot("frontal") ? 0.9 : 0.45} />
      <path d="M246 118c48 8 96 48 104 96-22 8-48 6-74-8-18-28-24-62-30-88Z" fill={color("frontal")} opacity={hot("frontal") ? 0.9 : 0.45} />
      <path d="M250 168c36 8 78 36 92 72-28 18-62 16-92-2V168Z" fill={color("parietal")} opacity={hot("parietal") ? 0.88 : 0.4} />
      <path d="M300 250c28 8 48 28 52 52-22 20-52 18-78 2 6-22 16-40 26-54Z" fill={color("occipital")} opacity={hot("occipital") ? 0.9 : 0.42} />
      <path d="M168 330c28 8 70 10 108 2 22 28 24 52 8 74-28 8-70 6-104-6-16-22-18-46-12-70Z" fill={color("cerebellum")} opacity={hot("cerebellum") ? 0.9 : 0.42} />
      <path d="M214 392c8 28 12 52 16 78 8-26 12-50 16-78-8 4-18 6-32 0Z" fill={color("brainstem")} opacity={hot("brainstem") ? 0.95 : 0.5} />
      <path d="M230 110v250" stroke="rgb(237 245 250 / 16%)" strokeDasharray="3 7" />
    </svg>
  );
}
