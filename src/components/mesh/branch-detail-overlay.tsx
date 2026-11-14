import { useEffect, useRef, type ReactNode } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import type { Concept } from "@/lib/types";

/**
 * Branch details live in two parts, neither over the canvas centre:
 *  - collapsed: one small toggle (chevron + branch name) in the canvas's top-right corner;
 *  - expanded: a bottom sheet resting on the nav. The canvas pans so the node stays above it.
 * The wrapper ignores pointer events; only the toggle and the sheet are interactive.
 */
export function BranchDetailOverlay({
  branch,
  expanded,
  onToggle,
  onClose,
  onPanelHeight,
  children,
}: {
  branch: Concept;
  expanded: boolean;
  onToggle: () => void;
  onClose: () => void;
  onPanelHeight?: (px: number) => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!expanded) {
      onPanelHeight?.(0);
      return;
    }
    const el = panel.current;
    if (!el) return;
    const report = () => onPanelHeight?.(el.getBoundingClientRect().height);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => {
      ro.disconnect();
      onPanelHeight?.(0);
    };
  }, [expanded, onPanelHeight]);

  return (
    <div className="pointer-events-none absolute inset-0 z-30" data-testid="branch-detail-overlay">
      {!expanded ? (
        <button
          type="button"
          onClick={onToggle}
          onPointerDown={(event) => event.stopPropagation()}
          aria-expanded={false}
          aria-label={`Show details for ${branch.name}`}
          className="pointer-events-auto absolute right-3 top-[calc(12rem+0.5rem)] flex min-h-11 max-w-[60vw] items-center gap-1.5 rounded-full border border-border bg-background/90 px-3 text-sm shadow-soft backdrop-blur-md md:top-[calc(9rem+0.5rem)]"
        >
          <span className="truncate">{branch.emoji} {branch.name}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      ) : (
        <aside
          ref={panel}
          role="dialog"
          aria-modal={false}
          aria-label={`Branch details: ${branch.name}`}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              onClose();
            }
          }}
          className="clear-bottom-nav pointer-events-auto absolute inset-x-2 bottom-0 max-h-[min(38dvh,20rem)] overflow-y-auto overscroll-contain rounded-t-2xl border border-border bg-background/95 p-4 shadow-soft backdrop-blur-md md:inset-x-auto md:bottom-6 md:right-6 md:w-80 md:rounded-2xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-primary">Branch details</p>
              <h2 className="break-words font-display text-lg">{branch.emoji} {branch.name}</h2>
            </div>
            <div className="flex shrink-0 gap-1">
              <button type="button" onClick={onToggle} aria-expanded aria-label="Collapse branch details" className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground">
                <ChevronUp className="size-4" />
              </button>
              <button type="button" onClick={onClose} aria-label="Close branch details" className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
          </div>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{branch.description || "No description yet."}</p>
          <p className="mt-2 text-xs text-muted-foreground">{branch.memoryCount} {branch.memoryCount === 1 ? "memory" : "memories"} on this branch</p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">{children}</div>
        </aside>
      )}
    </div>
  );
}
