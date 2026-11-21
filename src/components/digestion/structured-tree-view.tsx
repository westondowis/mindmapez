import { useMemo, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import type { Memory } from "@/lib/types";
import type { TreeNode } from "@/lib/digestion/viewer-types";
import { Notice, ViewerFrame } from "./viewer-kit";

type Props = { memory: Memory; compact?: boolean };
type Meta = { format?: string; nodes?: number; depth?: number; truncated?: boolean; raw?: boolean; tree?: TreeNode | null };

function matches(node: TreeNode, q: string): boolean {
  if (node.k.toLowerCase().includes(q) || (node.v ?? "").toLowerCase().includes(q)) return true;
  return (node.c ?? []).some((c) => matches(c, q));
}

const PAGE = 200;

function Node({ node, depth, q }: { node: TreeNode; depth: number; q: string }) {
  const container = node.t === "object" || node.t === "array";
  const [open, setOpen] = useState(depth < 1);
  const [shown, setShown] = useState(PAGE);
  const isOpen = open || (q !== "" && container);
  const kids = useMemo(() => (node.c ?? []).filter((c) => !q || matches(c, q)), [node.c, q]);
  const valueClass = node.t === "string" ? "text-emerald-700 dark:text-emerald-400" : node.t === "number" ? "text-sky-700 dark:text-sky-400" : "text-violet-700 dark:text-violet-400";
  return (
    <li className="leading-6">
      <div className="flex min-w-0 items-start gap-1" style={{ paddingLeft: depth * 12 }}>
        {container ? (
          <button type="button" aria-expanded={isOpen} onClick={() => setOpen(!open)} className="mt-1 shrink-0 rounded text-muted-foreground hover:text-foreground">
            <ChevronRight className={`size-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`} />
          </button>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <span className="shrink-0 font-medium text-foreground">{node.k}</span>
        {container ? (
          <span className="text-muted-foreground">{node.t === "array" ? `[${node.c?.length ?? 0}]` : `{${node.c?.length ?? 0}}`}</span>
        ) : (
          <span className={`min-w-0 break-words ${valueClass}`}>: {node.t === "string" ? `"${node.v ?? ""}"` : node.v ?? node.t}</span>
        )}
      </div>
      {container && isOpen && kids.length ? (
        <ul>
          {kids.slice(0, shown).map((c, i) => (
            <Node key={`${c.k}-${i}`} node={c} depth={depth + 1} q={q} />
          ))}
          {kids.length > shown ? (
            <li style={{ paddingLeft: (depth + 1) * 12 + 16 }}>
              <button type="button" className="text-xs text-primary hover:underline" onClick={() => setShown(shown + PAGE)}>
                Show {Math.min(PAGE, kids.length - shown)} more of {kids.length - shown}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}

export function StructuredTreeView({ memory, compact }: Props) {
  const meta = memory.extractedMetadata as Meta;
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  if (meta.raw || !meta.tree) {
    return (
      <ViewerFrame compact={compact}>
        <Notice>Shown as raw text ({(meta.format ?? "data").toUpperCase()} features beyond the supported subset).</Notice>
        <pre className="mt-2 max-h-[70dvh] overflow-auto rounded-xl bg-muted p-3 text-xs">{memory.body}</pre>
      </ViewerFrame>
    );
  }
  return (
    <ViewerFrame
      compact={compact}
      toolbar={
        <>
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-background px-2 py-1">
            <Search className="size-3.5 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter keys and values" aria-label="Filter keys and values" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </label>
          <span className="text-xs text-muted-foreground">
            {(meta.format ?? "").toUpperCase()} · {meta.nodes?.toLocaleString()} nodes · depth {meta.depth}
            {meta.truncated ? " · trimmed" : ""}
          </span>
        </>
      }
    >
      <ul className={`overflow-auto rounded-xl border border-border bg-card p-2 font-mono text-xs ${compact ? "max-h-64" : "max-h-[70dvh]"}`}>
        <Node node={meta.tree} depth={0} q={q} />
      </ul>
    </ViewerFrame>
  );
}
