import { useMemo, useState } from "react";
import { Copy, Trash2, X } from "lucide-react";
import { GlyphRow } from "@/components/glyph-controls";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { BRAIN_SECTORS, childrenOf, sectorById, wouldCycle, type BrainSector } from "@/lib/brain";
import type { Concept } from "@/lib/types";
import { cn } from "@/lib/utils";

export function BranchSheet({
  branch,
  concepts,
  sectors,
  onClose,
  onSave,
  onMove,
  onDuplicate,
  onDelete,
  pending,
  error,
}: {
  branch: Concept;
  concepts: Concept[];
  sectors: BrainSector[];
  onClose: () => void;
  onSave: (input: { name: string; description: string; emoji: string | null; color: string | null }) => void;
  onMove: (input: { parentId: string | null; sectorId: string }) => void;
  onDuplicate: (includeChildren: boolean) => void;
  onDelete: (mode: "cascade" | "reparent") => void;
  pending?: boolean;
  error?: string | null;
}) {
  const [name, setName] = useState(branch.name);
  const [description, setDescription] = useState(branch.description || "");
  const [emoji, setEmoji] = useState(branch.emoji || "🧠");
  const [color, setColor] = useState(branch.color || "cyan");
  const [sectorId, setSectorId] = useState(branch.sectorId);
  const [parentId, setParentId] = useState<string | null>(branch.parentId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const kids = childrenOf(concepts, branch.id);
  const moveTargets = useMemo(
    () => concepts.filter((c) => c.id !== branch.id && !wouldCycle(concepts, branch.id, c.id)),
    [concepts, branch.id],
  );
  const dirty =
    name !== branch.name ||
    description !== (branch.description || "") ||
    emoji !== (branch.emoji || "🧠") ||
    color !== (branch.color || "cyan");
  const moveDirty = parentId !== branch.parentId || sectorId !== branch.sectorId;

  return (
    <aside className="absolute inset-y-0 right-0 z-30 flex w-full max-w-md flex-col border-l border-border bg-background/95 shadow-soft backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">Edit branch</p>
        <button
          type="button"
          onClick={onClose}
          className="flex size-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5">
        <GlyphRow emoji={emoji} color={color} onEmoji={setEmoji} onColor={setColor} />
        <label className="mt-4 block text-xs text-muted-foreground" htmlFor="edit-branch-name">
          Name
        </label>
        <Input id="edit-branch-name" value={name} onChange={(e) => setName(e.target.value)} />
        <label className="mt-3 block text-xs text-muted-foreground" htmlFor="edit-branch-notes">
          Description
        </label>
        <Textarea
          id="edit-branch-notes"
          className="min-h-24"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Lives in {sectorById(branch.sectorId, sectors).label}
          {branch.parentId ? " as a nested branch" : " as a primary branch"}.
        </p>
        {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={pending || !dirty || !name.trim()}
            onClick={() => onSave({ name, description, emoji, color })}
          >
            Save changes
          </Button>
        </div>

        <hr className="my-6 border-border" />
        <h3 className="font-display text-lg">Move</h3>
        <label className="mt-3 block text-xs text-muted-foreground" htmlFor="move-sector">
          Brain sector
        </label>
        <select
          id="move-sector"
          className="mt-1 h-11 w-full rounded-md border border-input bg-card px-3 text-sm"
          value={sectorId}
          onChange={(e) => {
            setSectorId(e.target.value);
            setParentId(null);
          }}
        >
          {(sectors.length ? sectors : BRAIN_SECTORS).map((s) => (
            <option key={s.id} value={s.id}>
              {s.emoji} {s.label}
            </option>
          ))}
        </select>
        <label className="mt-3 block text-xs text-muted-foreground" htmlFor="move-parent">
          Parent branch
        </label>
        <select
          id="move-parent"
          className="mt-1 h-11 w-full rounded-md border border-input bg-card px-3 text-sm"
          value={parentId ?? ""}
          onChange={(e) => setParentId(e.target.value || null)}
        >
          <option value="">None — primary in {sectorById(sectorId, sectors).label}</option>
          {moveTargets.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({sectorById(c.sectorId, sectors).label})
            </option>
          ))}
        </select>
        <Button
          type="button"
          className="mt-3"
          variant="secondary"
          disabled={pending || !moveDirty}
          onClick={() => onMove({ parentId, sectorId })}
        >
          Move branch
        </Button>

        <hr className="my-6 border-border" />
        <h3 className="font-display text-lg">Duplicate</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={pending} onClick={() => onDuplicate(false)}>
            <Copy className="size-4" />
            Duplicate this branch
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending || kids.length === 0}
            onClick={() => onDuplicate(true)}
          >
            Duplicate with children
          </Button>
        </div>

        <hr className="my-6 border-border" />
        <h3 className="font-display text-lg text-destructive">Delete</h3>
        {kids.length > 0 && !confirmDelete ? (
          <div className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <p>
              <span className="font-medium">{branch.name}</span> contains {kids.length} nested{" "}
              {kids.length === 1 ? "branch" : "branches"}. Choose how to handle them.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="destructive" disabled={pending} onClick={() => onDelete("cascade")}>
                <Trash2 className="size-4" />
                Delete all nested branches
              </Button>
              <Button type="button" variant="outline" disabled={pending} onClick={() => onDelete("reparent")}>
                Move children up, then delete
              </Button>
            </div>
          </div>
        ) : confirmDelete || kids.length === 0 ? (
          <div className="mt-3">
            <p className="text-sm text-muted-foreground">This cannot be undone. Memories stay in your account.</p>
            <Button
              type="button"
              variant="destructive"
              className={cn("mt-3")}
              disabled={pending}
              onClick={() => {
                if (kids.length === 0) onDelete("cascade");
                else setConfirmDelete(true);
              }}
            >
              <Trash2 className="size-4" />
              Delete {branch.name}
            </Button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
