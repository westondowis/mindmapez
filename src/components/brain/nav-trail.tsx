import { ChevronRight, ChevronsUp, CornerUpLeft } from "lucide-react";
import { sectorById, type BrainSector, type Crumb } from "@/lib/brain";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function NavTrail({
  crumbs,
  sectorId,
  sectors,
  branchName,
  onCrumb,
  onBack,
  onOverview,
}: {
  crumbs: Crumb[];
  sectorId: string | null;
  sectors: BrainSector[];
  branchName: string | null;
  onCrumb: (crumb: Crumb) => void;
  onBack: () => void;
  onOverview: () => void;
}) {
  const sector = sectorId ? sectorById(sectorId, sectors) : null;
  return (
    <div className="pointer-events-none relative z-30 flex w-full flex-col items-center gap-1.5 px-2 pt-2 md:px-4 md:pt-3">
      <div className="pointer-events-auto flex w-full max-w-[min(100%,920px)] items-center gap-1 overflow-x-auto rounded-xl border border-border bg-background/75 p-1.5 backdrop-blur-md scrollbar-none">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="min-h-9 shrink-0"
          onClick={onBack}
          disabled={crumbs.length <= 1}
          aria-label="Back"
        >
          <CornerUpLeft className="size-4" />
          Back
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="min-h-9 shrink-0"
          onClick={onOverview}
          disabled={crumbs.length <= 1}
        >
          <ChevronsUp className="size-4" />
          Brain Overview
        </Button>
        <div className="mx-1 h-5 w-px shrink-0 bg-border" />
        <nav aria-label="Location" className="flex min-w-0 items-center gap-0.5">
          {crumbs.map((crumb, i) => (
            <span key={`${crumb.kind}-${crumb.id}`} className="flex items-center gap-0.5">
              {i > 0 ? <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" /> : null}
              <button
                type="button"
                onClick={() => onCrumb(crumb)}
                className={cn(
                  "max-w-[9rem] truncate rounded-md px-2 py-1.5 text-xs",
                  i === crumbs.length - 1
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {crumb.label}
              </button>
            </span>
          ))}
        </nav>
      </div>
      <div className="pointer-events-auto flex max-w-[min(100%,920px)] flex-wrap items-center justify-center gap-2 rounded-lg border border-border/80 bg-background/60 px-3 py-1.5 text-[11px] text-muted-foreground backdrop-blur-md">
        <span>
          Sector{" "}
          <span className="text-foreground">{sector ? sector.label : "—"}</span>
        </span>
        <span aria-hidden="true">·</span>
        <span>
          Branch{" "}
          <span className="text-foreground">{branchName ?? "None selected"}</span>
        </span>
      </div>
    </div>
  );
}
