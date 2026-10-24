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

export function MemoryNode({ data }: NodeProps) {
  const d = data as MemoryNodeData;
  const size = d.expanded ? 44 : Math.max(40, 32 + d.importance * 4);
  const color = d.color ? nodeColorCss(d.color) : KIND_COLOR[d.kind];
  const stop = (event: React.SyntheticEvent) => {
    event.stopPropagation();
  };
  return (
    <div className={cn("relative flex flex-col items-center", d.dimmed && "opacity-20")}>
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <div
        className={cn("grid place-items-center rounded-full border", d.recent && "animate-node-pulse")}
        style={{
          width: size,
          height: size,
          background: color,
          borderColor: "rgb(0 23 28 / 40%)",
          boxShadow: d.glow
            ? `0 0 ${10 + d.importance * 4}px ${color}`
            : `0 0 10px color-mix(in oklab, ${color} 40%, transparent)`,
        }}
      >
        {d.emoji ? <span className="text-base leading-none">{d.emoji}</span> : null}
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
