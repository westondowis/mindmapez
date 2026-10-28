import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ChevronDown, ChevronRight, SquarePen, X } from "lucide-react";
import { CONCEPT_ICONS } from "@/lib/concept-icons";
import { KIND_COLOR } from "@/lib/kind-styles";
import { nodeColorCss } from "@/lib/node-colors";
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
  const size = d.nested ? "size-12" : "size-16";
  return (
    <div
      className={cn(
        "relative flex flex-col items-center",
        d.dimmed && "opacity-25",
        d.isDraft && "opacity-80",
      )}
    >
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <div
        className={cn(
          "flex items-center justify-center rounded-full border bg-card text-primary shadow-[0_0_18px_rgb(136_187_216/0.2)]",
          size,
          d.selected && "branch-selected",
          d.isParent && "ring-2 ring-highlight/70",
          d.isEditing && "ring-2 ring-primary",
          d.isDraft && "border-dashed",
        )}
        style={{ borderColor: ring, boxShadow: d.selected ? `0 0 22px ${ring}` : undefined }}
      >
        {d.emoji ? <span className="text-2xl leading-none">{d.emoji}</span> : Icon ? <Icon className="size-6" /> : null}
      </div>
      <div className="mt-2 max-w-28 text-center">
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

const MIN_SYNAPSE = 72;
const MAX_SYNAPSE = 210;
function synapseWidth(chars = 0) {
  const f = Math.log10(Math.max(chars, 12));
  return Math.min(MAX_SYNAPSE, Math.max(MIN_SYNAPSE, MIN_SYNAPSE + (f - 1) * 52));
}

function SynapseMark({ glow, chars }: { glow?: boolean; chars?: number }) {
  const width = synapseWidth(chars);
  const beads = Math.max(3, Math.round((width - 52) / 16));
  const axonEnd = 38 + beads * 14;
  return (
    <svg viewBox={`0 0 ${width} 56`} width={width * 0.78} height="44" aria-hidden className={glow ? "drop-shadow-[0_0_8px_#88bbd8]" : ""}>
      <g fill="none" stroke="#88bbd8" strokeWidth="1.4" strokeLinecap="round">
        <path d="M22 28 C10 12 6 8 4 4" />
        <path d="M22 28 C8 18 4 16 2 14" />
        <path d="M22 28 C6 28 3 30 1 32" />
        <path d="M22 28 C10 38 6 44 4 50" />
        <path d="M22 28 C16 42 14 50 12 54" />
      </g>
      <circle className="synapse-soma" cx="28" cy="28" r="13" fill="#1a3a8a" stroke="#88bbd8" strokeWidth="1.6" />
      <circle cx="28" cy="28" r="5.5" fill="#c9b6ff" opacity="0.9" />
      <path className="synapse-axon" d={`M41 28 H${axonEnd}`} stroke="#d46bff" strokeWidth="2.2" />
      <g fill="#b44cff" stroke="#f0c4ff" strokeWidth="0.6">
        {Array.from({ length: beads }, (_, i) => (
          <rect key={i} x={46 + i * 14} y="22" width="10" height="12" rx="3" />
        ))}
      </g>
      <circle className="synapse-pulse" r="3.5" fill="#fff" opacity="0.9">
        <animateMotion dur="2.4s" repeatCount="indefinite" path={`M41 28 H${axonEnd}`} />
      </circle>
      <g fill="none" stroke="#d46bff" strokeWidth="1.3" strokeLinecap="round">
        <path d={`M${axonEnd} 28 C${axonEnd + 6} 22 ${axonEnd + 8} 16 ${axonEnd + 10} 12`} />
        <path d={`M${axonEnd} 28 C${axonEnd + 6} 28 ${axonEnd + 8} 28 ${axonEnd + 11} 28`} />
        <path d={`M${axonEnd} 28 C${axonEnd + 6} 34 ${axonEnd + 8} 40 ${axonEnd + 10} 44`} />
      </g>
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
          <span className="absolute left-[18px] top-[14px] text-[11px] leading-none" style={{ color }}>
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
