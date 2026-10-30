import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useId, useSyncExternalStore } from "react";
import { ChevronDown, ChevronRight, SquarePen, X } from "lucide-react";
import { CONCEPT_ICONS } from "@/lib/concept-icons";
import { KIND_COLOR } from "@/lib/kind-styles";
import { nodeColorCss } from "@/lib/node-colors";
import { SYNAPSE_LEAD, SYNAPSE_PITCH, synapseLayout } from "@/lib/synapse";
import type { NodeKind } from "@/lib/types";
import { cn } from "@/lib/utils";

export type MeNodeData = { label: string; selected?: boolean };
export type SectorNodeData = { label: string; kicker: string; selected?: boolean };
export type ConceptNodeData = {
  name: string;
  icon?: string | null;
  emoji?: string | null;
  color?: string | null;
  count: number;
  childCount?: number;
  dimmed?: boolean;
  selected?: boolean;
  isParent?: boolean;
  isDraft?: boolean;
  isEditing?: boolean;
  expanded?: boolean;
  nested?: boolean;
  firstLayer?: boolean;
  isMoveUp?: boolean;
};
export type MemoryNodeData = {
  title: string;
  kind: NodeKind;
  importance: number;
  recent: boolean;
  glow: boolean;
  dimmed?: boolean;
  emoji?: string | null;
  color?: string | null;
  synapse?: boolean;
  contentLength?: number;
  expanded?: boolean;
  onEdit?: () => void;
  onDismiss?: () => void;
};

export function MeNode({ data }: NodeProps) {
  const d = data as MeNodeData;
  const label = d.label.length > 8 ? d.label.slice(0, 8) : d.label;
  return (
    <div className="relative flex flex-col items-center">
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <div className="relative size-[88px]">
        <span className="animate-pulse-ring absolute inset-0 rounded-full bg-highlight/25" />
        <span
          className="animate-pulse-ring absolute inset-2 rounded-full bg-highlight/20"
          style={{ animationDelay: "0.8s" }}
        />
        <div className="animate-me-breathe relative flex size-[88px] items-center justify-center rounded-full border border-highlight/50 bg-secondary px-2 text-center text-sm font-semibold tracking-[0.18em] text-highlight shadow-[0_0_32px_rgb(249_197_75/0.35)]">
          {label}
        </div>
      </div>
    </div>
  );
}

export function SectorHubNode({ data }: NodeProps) {
  const d = data as SectorNodeData;
  return (
    <div className="relative flex flex-col items-center">
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <div
        className={cn(
          "flex size-24 flex-col items-center justify-center rounded-[2rem] border bg-card/90 px-2 text-center shadow-[0_0_28px_rgb(136_187_216/0.25)]",
          d.selected ? "border-highlight" : "border-primary/40",
        )}
      >
        <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{d.kicker}</span>
        <span className="font-display text-sm text-foreground">{d.label}</span>
      </div>
    </div>
  );
}

export function ConceptNode({ data }: NodeProps) {
  const d = data as ConceptNodeData;
  const Icon = (d.icon && CONCEPT_ICONS[d.icon]) || CONCEPT_ICONS.brain;
  const ring = nodeColorCss(d.color);
  return (
    <div
      className={cn(
        "relative flex w-28 flex-col items-center",
        d.dimmed && "opacity-25",
        d.isDraft && "opacity-80",
      )}
    >
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <div
        className={cn(
          "flex size-16 shrink-0 items-center justify-center rounded-full border bg-card text-primary shadow-[0_0_18px_rgb(136_187_216/0.2)] origin-center transition-transform duration-150",
          d.selected && "scale-110",
          d.isDraft && "border-dashed",
          d.firstLayer && "bg-[#004250]/40",
          d.isMoveUp && "border-dashed border-white/40 bg-black/40",
        )}
        style={{
          borderColor: ring,
          boxShadow: d.selected
            ? `0 0 22px ${ring}`
            : d.firstLayer
              ? "0 0 28px rgb(136 187 216 / 0.55)"
              : undefined,
          outline: d.firstLayer ? "2px solid rgb(136 187 216 / 0.7)" : d.isParent ? "2px solid rgb(249 197 75 / 0.7)" : undefined,
          outlineOffset: "2px",
        }}
      >
        {d.emoji ? <span className="text-2xl leading-none">{d.emoji}</span> : Icon ? <Icon className="size-6" /> : null}
      </div>
      <div className="mt-2 h-9 w-28 text-center">
        <div className="truncate text-xs font-medium text-foreground">{d.name}</div>
        <div className="text-[10px] tabular-nums text-muted-foreground">
          {typeof d.childCount === "number" && d.childCount > 0 ? (
            <span className="inline-flex items-center gap-0.5">
              {d.expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
              {d.childCount} {d.childCount === 1 ? "branch" : "branches"}
            </span>
          ) : (
            <>
              {d.count} {d.count === 1 ? "memory" : "memories"}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeMotion(cb: () => void) {
  const mq = window.matchMedia(MOTION_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
/** True when the viewer asked for less motion; SMIL animations ignore the CSS media query. */
function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(MOTION_QUERY).matches,
    () => false,
  );
}

/** One full current pulse, in seconds. The soma ring and ambient glow run slower. */
const PULSE_SECONDS = 2.8;

/**
 * A memory drawn as a neuron: blue dendrites around a glowing soma, a purple
 * myelinated axon whose length follows the memory's content, and branching
 * terminals. A current travels from the terminals (parent side) toward the soma,
 * lighting each myelin segment as it passes.
 */
function SynapseMark({ glow, chars }: { glow?: boolean; chars?: number }) {
  const uid = useId().replace(/:/g, "");
  const reduced = usePrefersReducedMotion();
  const { beads, axonEnd, width } = synapseLayout(chars);
  const start = SYNAPSE_LEAD - 6;
  const currentPath = `M${axonEnd + 4} 30 H${start - 4}`;
  const e = axonEnd;
  return (
    <svg viewBox={`0 0 ${width} 60`} width={width * 0.78} height="47" aria-hidden className={glow ? "synapse-svg" : ""}>
      <defs>
        <radialGradient id={`soma-${uid}`} cx="45%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#5b8dff" />
          <stop offset="70%" stopColor="#1b2f9a" />
          <stop offset="100%" stopColor="#0f1a5e" />
        </radialGradient>
        <radialGradient id={`core-${uid}`}>
          <stop offset="0%" stopColor="#ffd9ff" />
          <stop offset="60%" stopColor="#d46bff" />
          <stop offset="100%" stopColor="#8a2be2" />
        </radialGradient>
        <linearGradient id={`sheath-${uid}`} x1="0" x2="1">
          <stop offset="0%" stopColor="#b44cff" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#d9a0ff" stopOpacity="0.3" />
        </linearGradient>
      </defs>

      {/* dendrites */}
      <g fill="none" stroke="#4aa3ff" strokeWidth="1.3" strokeLinecap="round" opacity="0.9">
        <path d="M20 24 C12 18 8 12 5 5" />
        <path d="M10 14 C6 14 4 12 2 11" strokeWidth="0.9" />
        <path d="M19 28 C10 26 5 24 1 21" />
        <path d="M18 32 C9 33 4 35 1 39" />
        <path d="M20 37 C13 42 10 48 7 55" />
        <path d="M12 46 C8 45 5 46 3 44" strokeWidth="0.9" />
        <path d="M26 19 C23 13 22 8 18 3" />
        <path d="M26 41 C24 47 23 51 20 57" />
        <path d="M34 20 C36 14 38 10 42 6" strokeWidth="1" />
        <path d="M34 40 C36 46 38 50 42 54" strokeWidth="1" />
      </g>

      {/* soma: ambient ring + body + nucleus */}
      <circle className="synapse-ring" cx="30" cy="30" r="12" fill="none" stroke="#9a7bff" strokeWidth="1.2" />
      <g className="synapse-soma">
        <circle cx="30" cy="30" r="12" fill={`url(#soma-${uid})`} stroke="#7fbfff" strokeWidth="1.4" />
        <circle cx="30" cy="30" r="8" fill="none" stroke="#a98bff" strokeWidth="0.6" opacity="0.7" />
        <circle cx="30" cy="30" r="5" fill={`url(#core-${uid})`} />
      </g>

      {/* axon hillock tapering into the first segment */}
      <path d={`M40 23 C45 26 47 28 ${SYNAPSE_LEAD} 28.6 V31.4 C47 32 45 34 40 37 Z`} fill="#b44cff" fillOpacity="0.4" stroke="#d9a0ff" strokeWidth="0.6" />
      <path d={`M${SYNAPSE_LEAD} 30 H${e}`} stroke="#cf8cff" strokeWidth="1.2" />

      {/* myelin segments, tapering toward the terminals; each flares as the current passes */}
      {Array.from({ length: beads }, (_, i) => {
        const h = 13 - 3.5 * (i / Math.max(1, beads - 1));
        const x = SYNAPSE_LEAD + 1 + i * SYNAPSE_PITCH;
        // Seconds into the pulse when the current reaches this segment (it travels end -> soma).
        const reach = (0.1 + (0.75 * (e - (x + 5))) / Math.max(1, e - start)) * PULSE_SECONDS;
        return (
          <g key={i} className="synapse-myelin" style={{ animationDelay: reduced ? undefined : `${reach.toFixed(2)}s` }}>
            <rect x={x} y={30 - h / 2} width={SYNAPSE_PITCH - 3} height={h} rx="4" fill={`url(#sheath-${uid})`} stroke="#e2b8ff" strokeWidth="0.8" />
            <path d={`M${x + 2} ${30 - h / 2 + 2.6} H${x + SYNAPSE_PITCH - 5}`} stroke="#fff" strokeOpacity="0.55" strokeWidth="0.7" strokeLinecap="round" />
          </g>
        );
      })}

      {/* terminal branches with bulbs */}
      <g fill="none" stroke="#c58bff" strokeWidth="1.2" strokeLinecap="round">
        <path d={`M${e} 30 C${e + 5} 26 ${e + 8} 18 ${e + 14} 12`} />
        <path d={`M${e} 30 C${e + 6} 28 ${e + 10} 24 ${e + 16} 22`} />
        <path d={`M${e} 30 C${e + 6} 32 ${e + 10} 36 ${e + 16} 38`} />
        <path d={`M${e} 30 C${e + 5} 34 ${e + 8} 42 ${e + 14} 48`} />
      </g>
      <g fill="#e2b8ff">
        <circle cx={e + 14} cy="12" r="1.8" />
        <circle cx={e + 16} cy="22" r="1.8" />
        <circle cx={e + 16} cy="38" r="1.8" />
        <circle cx={e + 14} cy="48" r="1.8" />
      </g>

      {/* current: a comet that runs from the parent end of the strand to the soma */}
      {reduced
        ? null
        : [0, 0.14, 0.28].map((lag, i) => (
            <circle key={i} r={3.6 - i * 1.1} fill={i === 0 ? "#ffffff" : "#e2b8ff"} opacity="0">
              <animateMotion dur={`${PULSE_SECONDS}s`} begin={`${lag}s`} repeatCount="indefinite" path={currentPath} keyTimes="0;1" calcMode="linear" />
              <animate attributeName="opacity" dur={`${PULSE_SECONDS}s`} begin={`${lag}s`} repeatCount="indefinite" values={`0;${(0.95 - i * 0.28).toFixed(2)};${(0.95 - i * 0.28).toFixed(2)};0`} keyTimes="0;0.1;0.85;1" />
            </circle>
          ))}
    </svg>
  );
}

export function MemoryNode({ data }: NodeProps) {
  const d = data as MemoryNodeData;
  const color = d.color ? nodeColorCss(d.color) : KIND_COLOR[d.kind];
  const stop = (event: React.SyntheticEvent) => {
    event.stopPropagation();
  };
  return (
    <div className={cn("relative flex flex-col items-center", d.dimmed && "opacity-20", d.synapse && "synapse-node")}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className={cn("relative", d.recent && "animate-node-pulse")}>
        <SynapseMark glow={d.glow || d.recent || true} chars={d.contentLength} />
        {d.emoji ? (
          <span className="absolute left-[18px] top-[16px] text-[11px] leading-none" style={{ color }}>
            {d.emoji}
          </span>
        ) : null}
      </div>
      {d.expanded ? (
        <div className="nodrag nopan mt-2 w-[min(72vw,240px)] rounded-xl border border-border bg-background/95 p-2.5 text-left shadow-soft">
          <div className="flex items-start gap-1">
            <p className="min-w-0 flex-1 text-sm leading-snug text-foreground">{d.title}</p>
            <button
              type="button"
              className="grid size-9 shrink-0 place-items-center rounded-md text-foreground hover:bg-secondary"
              aria-label="Edit memory"
              onPointerDown={stop}
              onClick={(event) => {
                stop(event);
                d.onEdit?.();
              }}
            >
              <SquarePen className="size-4" />
            </button>
            <button
              type="button"
              className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Hide memory"
              onPointerDown={stop}
              onClick={(event) => {
                stop(event);
                d.onDismiss?.();
              }}
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-1 max-w-[7.5rem] truncate text-center text-xs text-foreground/80">{d.title}</p>
      )}
    </div>
  );
}

export const nodeTypes = {
  me: MeNode,
  sector: SectorHubNode,
  concept: ConceptNode,
  memory: MemoryNode,
};
