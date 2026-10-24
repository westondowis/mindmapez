import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { GlyphRow } from "@/components/glyph-controls";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { sectorById, SECTOR_INSIGHT, type BrainSectorId } from "@/lib/brain";
import { createBranch } from "@/lib/server/branches";
import { saveBrainSectors } from "@/lib/server/branches";
import { finishWalkthrough } from "@/lib/server/onboarding";
import type { GraphPayload } from "@/lib/types";

type Phase = "highlight" | "name" | "node" | "ready";

export function Walkthrough({
  graph,
  pickedId,
  onDone,
}: {
  graph: GraphPayload;
  pickedId: string | null;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>(graph.concepts.length > 0 ? "ready" : "highlight");
  const [sectorId, setSectorId] = useState<BrainSectorId>("frontal");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("🧠");
  const [color, setColor] = useState("violet");
  const [nodeName, setNodeName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pickedId || phase === "name" || phase === "node" || phase === "ready") return;
    const sector = sectorById(pickedId, graph.sectors);
    setSectorId(sector.id);
    setEmoji(sector.emoji);
    setColor(sector.color);
    setName("");
    setDescription("");
  }, [pickedId, phase, graph.sectors]);

  const saveSector = useMutation({
    mutationFn: saveBrainSectors,
    onSuccess: async (res) => {
      if (!res.ok) {
        setError(res.error);
        return;
      }
      await qc.invalidateQueries({ queryKey: ["graph"] });
      setPhase("node");
    },
    onError: () => setError("Could not save that region."),
  });

  const saveNode = useMutation({
    mutationFn: createBranch,
    onSuccess: async (res) => {
      if (!res.ok) {
        setError(res.error);
        return;
      }
      finish.mutate();
    },
    onError: () => setError("Could not save that node."),
  });

  const finish = useMutation({
    mutationFn: () => finishWalkthrough(),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["graph"] });
      onDone();
    },
  });

  const sector = sectorById(sectorId, graph.sectors);

  if (phase === "highlight") {
    const insight = SECTOR_INSIGHT[sector.id];
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-24 z-40 flex justify-center px-3 md:bottom-8">
        <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-highlight/50 bg-background/95 p-4 shadow-soft backdrop-blur-md">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-highlight">{sector.anatomy}</p>
          <h2 className="mt-1 font-display text-xl leading-snug">{insight.handles}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            <span className="text-foreground">In your life: </span>
            {insight.example}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Tap another region to compare. These are only starting points — you name each one yourself.
          </p>
          <Button className="mt-3" type="button" onClick={() => setPhase("name")}>
            Name this region
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "ready") {
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-24 z-40 flex justify-center px-4 md:bottom-8">
        <div className="pointer-events-auto max-w-md rounded-2xl border border-border bg-background/95 p-4 shadow-soft backdrop-blur-md">
          <h2 className="font-display text-2xl">Your brain is ready</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The regions are yours to rename. Open any lobe when you want to keep building.
          </p>
          <Button className="mt-3" onClick={() => finish.mutate()} disabled={finish.isPending}>
            Enter the brain
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-40 grid place-items-end overflow-y-auto bg-background/55 p-4 backdrop-blur-[2px] md:place-items-center">
      <form
        className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-soft"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (phase === "name") {
            const label = name.trim();
            if (!label) {
              setError("Give this region a name.");
              return;
            }
            saveSector.mutate({
              data: {
                sectors: graph.sectors.map((s) =>
                  s.id === sector.id
                    ? { ...s, label, kicker: description.trim() || s.kicker, emoji, color, named: true }
                    : s,
                ),
              },
            });
            return;
          }
          const title = nodeName.trim();
          if (!title) {
            setError("Name your first node.");
            return;
          }
          saveNode.mutate({
            data: {
              name: title,
              description: description.trim(),
              parentId: null,
              sectorId: sector.id,
              emoji,
              color,
            },
          });
        }}
      >
        {phase === "name" ? (
          <>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">{sector.anatomy}</p>
            <h2 className="mt-1 font-display text-3xl">Name this region</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This is only a place in the brain. You decide what it holds.
            </p>
            <div className="mt-4">
              <GlyphRow emoji={emoji} color={color} onEmoji={setEmoji} onColor={setColor} />
            </div>
            <label className="mt-4 block text-xs text-muted-foreground" htmlFor="sector-setup-name">
              Sector name
            </label>
            <Input
              id="sector-setup-name"
              autoFocus
              value={name}
              maxLength={32}
              placeholder="Family, Work, Golf…"
              onChange={(e) => setName(e.target.value)}
            />
            <label className="mt-3 block text-xs text-muted-foreground" htmlFor="sector-setup-desc">
              Description, optional
            </label>
            <Textarea
              id="sector-setup-desc"
              value={description}
              maxLength={160}
              className="min-h-20"
              placeholder="What belongs here?"
              onChange={(e) => setDescription(e.target.value)}
            />
          </>
        ) : (
          <>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">{sector.label}</p>
            <h2 className="mt-1 font-display text-3xl">Add one node</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              One note is enough. After this, the whole brain is yours.
            </p>
            <label className="mt-4 block text-xs text-muted-foreground" htmlFor="first-node">
              Node name
            </label>
            <Input
              id="first-node"
              autoFocus
              value={nodeName}
              maxLength={80}
              placeholder="The first thing worth keeping"
              onChange={(e) => setNodeName(e.target.value)}
            />
          </>
        )}
        {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          {phase === "node" ? (
            <Button type="button" variant="ghost" onClick={() => setPhase("name")}>
              Back
            </Button>
          ) : null}
          <Button type="submit" disabled={saveSector.isPending || saveNode.isPending || finish.isPending}>
            {phase === "name" ? "Save region" : "Save node"}
          </Button>
        </div>
      </form>
    </div>
  );
}
