import { useState } from "react";
import { GlyphRow } from "@/components/glyph-controls";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { sectorById, type BrainSector } from "@/lib/brain";
import type { Concept } from "@/lib/types";

export function BranchComposer({
  sectorId,
  sectors,
  parent,
  onCancel,
  onSave,
  pending,
  error,
}: {
  sectorId: string;
  sectors: BrainSector[];
  parent: Concept | null;
  onCancel: () => void;
  onSave: (input: { name: string; description: string; emoji: string; color: string }) => void;
  pending?: boolean;
  error?: string | null;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState(parent ? "🌿" : "🧠");
  const [color, setColor] = useState(parent?.color || "cyan");
  const sector = sectorById(sectorId, sectors);
  const asPrimary = !parent;
  const label = parent ? `Add sub-branch to ${parent.name}` : `Add primary branch in ${sector.label}`;

  return (
    <aside className="absolute inset-x-0 bottom-0 z-30 mx-auto w-full max-w-md rounded-t-2xl border border-border bg-background/95 p-5 shadow-soft backdrop-blur-md md:bottom-6 md:rounded-2xl">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary">{label}</p>
      <p className="mt-2 text-sm text-muted-foreground">
        {asPrimary ? (
          <>
            Creating a <span className="text-foreground">primary branch</span> in{" "}
            <span className="text-foreground">{sector.label}</span>. No parent is selected.
          </>
        ) : (
          <>
            Parent: <span className="text-foreground">{parent.name}</span>
            {" · "}
            Sector: <span className="text-foreground">{sector.label}</span>
            {" · "}
            This will be a sub-branch.
          </>
        )}
      </p>
      <div className="mt-4">
        <GlyphRow emoji={emoji} color={color} onEmoji={setEmoji} onColor={setColor} />
      </div>
      <label className="mt-3 block text-xs text-muted-foreground" htmlFor="branch-name">
        New branch name
      </label>
      <Input
        id="branch-name"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={parent ? `A branch under ${parent.name}` : "e.g. Family"}
        onKeyDown={(e) => {
          if (e.key === "Enter" && name.trim()) onSave({ name, description, emoji, color });
          if (e.key === "Escape") onCancel();
        }}
      />
      <label className="mt-3 block text-xs text-muted-foreground" htmlFor="branch-notes">
        Notes (optional)
      </label>
      <Textarea
        id="branch-notes"
        className="min-h-20"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What lives here?"
      />
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={pending || !name.trim()}
          onClick={() => onSave({ name, description, emoji, color })}
        >
          Save branch
        </Button>
      </div>
    </aside>
  );
}
