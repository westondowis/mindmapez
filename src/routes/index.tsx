import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { MeshCanvas } from "@/components/mesh/mesh-canvas";
import { MemorySheet } from "@/components/mesh/memory-sheet";
import { Walkthrough } from "@/components/onboarding/walkthrough";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import type { SearchTarget } from "@/lib/graph-search";
import type { BrainSectorId } from "@/lib/brain";
import { getGraph } from "@/lib/server/memories";

export const Route = createFileRoute("/")({
  component: Home,
  validateSearch: (search: Record<string, unknown>): { focus?: string; focusType?: SearchTarget["type"] } => ({
    focus: typeof search.focus === "string" ? search.focus : undefined,
    focusType: search.focusType === "branch" || search.focusType === "memory" ? search.focusType : undefined,
  }),
});

function Home() {
  return (
    <RequireAuth>
      <MeshPage />
    </RequireAuth>
  );
}

function MeshPage() {
  const { focus, focusType } = Route.useSearch();
  const [openId, setOpenId] = useState<string | null>(null);
  const [guidePick, setGuidePick] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["graph"], queryFn: () => getGraph() });
  const touring = Boolean(q.data && !q.data.onboarded);

  return (
    <AppShell bleed locked={touring}>
      <div className={`fixed inset-0 h-dvh overflow-hidden overscroll-none ${touring ? "" : "md:left-16"}`}>
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
            searchTarget={focus && focusType ? { id: focus, type: focusType } : undefined}
            graph={q.data}
            onSelectMemory={setOpenId}
            onDismissMemory={() => setOpenId(null)}
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
