import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { Concept } from "@/lib/types";

/** Selection details live outside every graph/flex/transform ancestor. No backdrop steals canvas clicks. */
export function BranchDetailOverlay({ branch, onClose, children }: {
  branch: Concept;
  onClose: () => void;
  children: ReactNode;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-40" data-testid="branch-detail-overlay">
      <aside role="dialog" aria-modal={false} aria-label={`Branch details: ${branch.name}`}
        onPointerDown={event => event.stopPropagation()}
        onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}
        className="pointer-events-auto absolute inset-x-2 bottom-36 max-h-[min(40dvh,22rem)] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-background/95 p-4 shadow-soft backdrop-blur-md md:inset-x-auto md:bottom-auto md:right-6 md:top-40 md:w-80">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-primary">Branch details</p>
            <h2 className="break-words font-display text-lg">{branch.emoji} {branch.name}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close branch details" className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="size-4" /></button>
        </div>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{branch.description || "No description yet."}</p>
        <p className="mt-2 text-xs text-muted-foreground">{branch.memoryCount} {branch.memoryCount === 1 ? "memory" : "memories"} on this branch</p>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">{children}</div>
      </aside>
    </div>, document.body,
  );
}
