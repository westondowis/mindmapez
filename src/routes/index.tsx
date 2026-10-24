import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { MeshCanvas } from "@/components/mesh/mesh-canvas";
import { MemorySheet } from "@/components/mesh/memory-sheet";
import { Walkthrough } from "@/components/onboarding/walkthrough";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import type { BrainSectorId } from "@/lib/brain";
import { getGraph } from "@/lib/server/memories";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <RequireAuth>
      <MeshPage />
    </RequireAuth>
  );
}

function MeshPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [guidePick, setGuidePick] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["graph"], queryFn: () => getGraph() });
  const touring = Boolean(q.data && !q.data.onboarded);

  return (
    <AppShell bleed locked={touring}>
      <div className="relative h-dvh w-full overflow-hidden">
        {q.isError ? (
          <div className="grid h-full place-items-center px-6 text-center">
            <div>
              <p className="font-display text-2xl">Couldn’t open your mesh</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {q.error instanceof Error ? q.error.message : "The network didn’t load."}
              </p>
              <Button className="mt-4" onClick={() => void q.refetch()}>
                Try again
              </Button>
            </div>
          </div>
        ) : q.isPending || !q.data ? (
          <div className="grid h-full place-items-center">
            <p className="text-sm text-muted-foreground">Growing your network…</p>
          </div>
        ) : (
          <MeshCanvas
            graph={q.data}
            onSelectMemory={setOpenId}
            guide={touring}
            spotlightId={touring ? ((guidePick as BrainSectorId | null) ?? "frontal") : null}
            onGuidePick={(id: BrainSectorId) => setGuidePick(id)}
          />
        )}
        {openId && !touring ? <MemorySheet memoryId={openId} onClose={() => setOpenId(null)} /> : null}
        {q.data && touring ? (
          <Walkthrough graph={q.data} pickedId={guidePick} onDone={() => void q.refetch()} />
        ) : null}
      </div>
    </AppShell>
  );
}
