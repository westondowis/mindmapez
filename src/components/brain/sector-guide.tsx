import { useState } from "react";
import { SECTOR_INSIGHT, sectorTitle, type BrainSector } from "@/lib/brain";

export function SectorGuide({ sector }: { sector: BrainSector }) {
  const [open, setOpen] = useState(false);
  const insight = SECTOR_INSIGHT[sector.id];
  const title = sectorTitle(sector);
  const named = title.renamed;

  if (!named) {
    return (
      <div className="mx-auto w-full max-w-md rounded-2xl border border-[#6a2ca8]/40 bg-black/75 p-3 text-white backdrop-blur-md">
        <p className="text-sm font-medium">{title.anatomy} {title.emoji}</p>
        <p className="mt-0.5 text-[11px] text-[#c9b6ff]">{insight.handles}</p>
        <p className="mt-1.5 text-[11px] text-white/70">Ways you might use it:</p>
        <ul className="mt-1 space-y-0.5 text-[11px] text-white/80">
          {insight.uses.map((u) => (
            <li key={u}>• {u}</li>
          ))}
        </ul>
        <p className="mt-1.5 text-[10px] text-white/50">These are ideas, not rules. Name this sector when it means something to you.</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Sector ideas"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/60 text-sm text-white"
      >
        ℹ️
      </button>
      {open ? (
        <div className="absolute right-0 z-40 mt-1 w-72 rounded-xl border border-[#6a2ca8]/40 bg-black/90 p-3 text-white shadow-lg">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium">{title.anatomy} {title.emoji}</p>
            <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="text-white/60">✕</button>
          </div>
          <p className="mt-0.5 text-[11px] text-[#c9b6ff]">{insight.handles}</p>
          <ul className="mt-1.5 space-y-0.5 text-[11px] text-white/80">
            {insight.uses.map((u) => (
              <li key={u}>• {u}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
