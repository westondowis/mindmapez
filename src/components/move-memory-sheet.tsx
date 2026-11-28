import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderTree, Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { defaultSectors } from "@/lib/brain";
import { checkNewBranchName, flattenSectorTree } from "@/lib/memory-move";
import { searchMoveTargets, sectorDisplay } from "@/lib/move-search";
import { getGraph } from "@/lib/server/memories";
import { moveMemory } from "@/lib/server/memory-move";
import { cn } from "@/lib/utils";

/** "Move to…" button + searchable hierarchy picker: choose any sector, existing branch/sub-branch, or create a new branch. */
export function MoveMemoryButton({ memoryId, currentIds = [], className }: { memoryId: string; currentIds?: string[]; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" size="sm" className={className} onClick={() => setOpen(true)} data-testid="memory-move-open">
        <FolderTree className="size-4" />
        Move to…
      </Button>
      {open ? <MoveMemoryDialog memoryId={memoryId} currentIds={currentIds} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function MoveMemoryDialog({ memoryId, currentIds, onClose }: { memoryId: string; currentIds: string[]; onClose: () => void }) {
  const qc = useQueryClient();
  const graph = useQuery({ queryKey: ["graph"], queryFn: () => getGraph(), staleTime: 30_000 });
  const sectors = graph.data?.sectors?.length ? graph.data.sectors : defaultSectors();
  const concepts = useMemo(() => graph.data?.concepts ?? [], [graph.data]);
  const [query, setQuery] = useState("");
  const [sectorId, setSectorId] = useState<string>(sectors[0]?.id ?? "");
  const [pick, setPick] = useState<{ conceptId: string | null; parentId: string | null; sectorId: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const none = useMemo(() => new Set<string>(), []);
  const results = useMemo(() => (query.trim() ? searchMoveTargets(query, sectors, concepts, none, 8) : []), [query, sectors, concepts, none]);
  const tree = useMemo(() => flattenSectorTree(concepts, sectorId), [concepts, sectorId]);
  const nameOf = (id: string | null) => concepts.find((c) => c.id === id)?.name ?? "";
  const nameCheck = creating ? checkNewBranchName(newName) : null;

  const move = useMutation({
    mutationFn: () =>
      moveMemory({
        data: {
          memoryId,
          conceptId: creating ? null : pick?.conceptId ?? null,
          newBranch: creating && pick ? { name: newName, parentId: pick.parentId, sectorId: pick.sectorId } : undefined,
        },
      }),
    onSuccess: (res) => {
      if (!res.ok) {
        setError(res.error);
        return;
      }
      void qc.invalidateQueries({ queryKey: ["graph"] });
      void qc.invalidateQueries({ queryKey: ["memory", memoryId] });
      onClose();
    },
    onError: () => setError("Could not move that memory."),
  });

  const ready = Boolean(pick) && ack && (!creating || (nameCheck && nameCheck.ok)) && (creating || Boolean(pick?.conceptId));
  const destination = pick
    ? creating
      ? `New branch “${newName.trim() || "…"}” in ${pick.parentId ? nameOf(pick.parentId) : sectorDisplay(sectors.find((s) => s.id === pick.sectorId) ?? sectors[0])}`
      : nameOf(pick.conceptId)
    : "";

  const row = "flex w-full min-h-11 items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-secondary";

  const dialog = (
    <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-label="Move memory" data-testid="memory-move-dialog">
      <div className="flex max-h-[85dvh] min-h-0 w-full max-w-lg flex-col rounded-t-2xl border border-border bg-background pb-[env(safe-area-inset-bottom)] sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="font-display text-lg">Move memory</h3>
          <button type="button" onClick={onClose} className="flex size-11 items-center justify-center text-muted-foreground" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search sectors and branches…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {results.length ? (
            <ul className="rounded-xl border border-border p-1">
              {results.map((t, i) => (
                <li key={`${t.sectorId}-${t.parentId ?? "top"}-${i}`}>
                  <button
                    type="button"
                    className={row}
                    onClick={() => {
                      setSectorId(t.sectorId);
                      setQuery("");
                      setCreating(t.kind === "sector");
                      setPick({ conceptId: t.parentId, parentId: t.parentId, sectorId: t.sectorId });
                      setAck(false);
                    }}
                  >
                    <span className="truncate">{t.path.join(" › ")}</span>
                    <span className="ml-auto text-[10px] uppercase text-muted-foreground">{t.kind === "sector" ? "sector" : "branch"}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <select
            className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
            value={sectorId}
            aria-label="Brain sector"
            onChange={(e) => {
              setSectorId(e.target.value);
              setPick(null);
              setCreating(false);
              setAck(false);
            }}
          >
            {sectors.map((s) => (
              <option key={s.id} value={s.id}>
                {sectorDisplay(s)}
              </option>
            ))}
          </select>

          <div className="max-h-56 overflow-y-auto rounded-xl border border-border p-1">
            <button
              type="button"
              className={cn(row, creating && pick && !pick.parentId && pick.sectorId === sectorId && "bg-primary/15")}
              onClick={() => {
                setCreating(true);
                setPick({ conceptId: null, parentId: null, sectorId });
                setAck(false);
              }}
            >
              <Plus className="size-4" /> New branch at top of this sector
            </button>
            {tree.map(({ concept, depth }) => {
              const here = currentIds.includes(concept.id);
              const picked = pick?.conceptId === concept.id;
              return (
                <div key={concept.id} className="flex items-center" style={{ paddingLeft: Math.min(depth, 6) * 14 }}>
                  <button
                    type="button"
                    disabled={here}
                    className={cn(row, "flex-1", picked && !creating && "bg-primary/15", here && "opacity-50")}
                    onClick={() => {
                      setCreating(false);
                      setPick({ conceptId: concept.id, parentId: concept.id, sectorId });
                      setAck(false);
                    }}
                  >
                    <span className="truncate">{concept.name}</span>
                    {here ? <span className="ml-auto text-[10px] text-muted-foreground">current</span> : null}
                  </button>
                  <button
                    type="button"
                    className="flex size-11 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
                    aria-label={`New sub-branch under ${concept.name}`}
                    onClick={() => {
                      setCreating(true);
                      setPick({ conceptId: null, parentId: concept.id, sectorId });
                      setAck(false);
                    }}
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
              );
            })}
            {!tree.length ? <p className="px-3 py-2 text-xs text-muted-foreground">No branches in this sector yet.</p> : null}
          </div>

          {creating && pick ? (
            <div>
              <Input placeholder="New branch name" value={newName} maxLength={80} onChange={(e) => setNewName(e.target.value)} />
              {nameCheck && !nameCheck.ok && newName ? <p className="mt-1 text-xs text-destructive">{nameCheck.error}</p> : null}
            </div>
          ) : null}

          {pick ? (
            <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-xs">
              <p className="font-medium">Moving to: {destination || "…"}</p>
              <p className="mt-1 text-muted-foreground">
                The memory leaves its current branch. This can change what connected apps and external tools can reach, and it rewires its synapses.
              </p>
              <label className="mt-2 flex cursor-pointer items-start gap-2">
                <input type="checkbox" className="mt-0.5 size-4" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                <span>I understand and want to move this memory.</span>
              </label>
            </div>
          ) : null}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <Button type="button" className="mb-6 w-full" disabled={!ready || move.isPending} onClick={() => { setError(null); move.mutate(); }} data-testid="memory-move-confirm">
            {move.isPending ? "Moving…" : "Move memory"}
          </Button>
          {pick && !ready ? <p className="pb-4 text-center text-xs text-muted-foreground">{!ack ? "Tick the box above to enable the button." : creating ? "Enter a name for the new branch." : "Pick a destination branch."}</p> : null}
        </div>
      </div>
    </div>
  );
  return typeof document === "undefined" ? dialog : createPortal(dialog, document.body);
}
