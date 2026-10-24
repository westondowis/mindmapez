import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { MemoryCard } from "@/components/memory-card";
import { PageHeader } from "@/components/page-header";
import { RequireAuth } from "@/components/require-auth";
import { listMemories } from "@/lib/server/memories";
import { EMOTIONS, MEMORY_TYPES, type Emotion, type MemoryType } from "@/lib/types";

export const Route = createFileRoute("/timeline")({ component: TimelineRoute });

function TimelineRoute() {
  return (
    <RequireAuth>
      <TimelinePage />
    </RequireAuth>
  );
}

function TimelinePage() {
  const q = useQuery({ queryKey: ["memories"], queryFn: () => listMemories() });
  const [type, setType] = useState<MemoryType | "all">("all");
  const [emotion, setEmotion] = useState<Emotion | "all">("all");
  const [minStars, setMinStars] = useState(1);

  const items = useMemo(() => {
    return (q.data ?? []).filter((m) => {
      if (type !== "all" && m.memoryType !== type) return false;
      if (emotion !== "all" && m.emotion !== emotion) return false;
      if (m.importance < minStars) return false;
      return true;
    });
  }, [q.data, type, emotion, minStars]);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <PageHeader
          kicker="Chronology"
          title="Replay your life"
          description="Every capture, in the order it happened. Filter by how it felt, how it arrived, and how much it mattered."
        />
        <div className="mb-6 flex flex-wrap gap-2">
          <select
            className="h-10 rounded-md border border-input bg-card px-3 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value as MemoryType | "all")}
          >
            <option value="all">All types</option>
            {MEMORY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border border-input bg-card px-3 text-sm"
            value={emotion}
            onChange={(e) => setEmotion(e.target.value as Emotion | "all")}
          >
            <option value="all">All emotions</option>
            {EMOTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border border-input bg-card px-3 text-sm"
            value={minStars}
            onChange={(e) => setMinStars(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}+ stars
              </option>
            ))}
          </select>
        </div>
        <ol className="relative space-y-4 border-l border-border pl-6">
          {q.isPending ? (
            <li className="h-28 animate-pulse rounded-xl bg-muted" />
          ) : items.length ? (
            items.map((m) => (
              <li key={m.id} className="relative">
                <span className="absolute -left-[29px] top-6 size-2.5 rounded-full bg-primary" />
                <MemoryCard memory={m} />
              </li>
            ))
          ) : (
            <li className="text-sm text-muted-foreground">Nothing matches those filters.</li>
          )}
        </ol>
      </div>
    </AppShell>
  );
}
