import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { MemoryCard } from "@/components/memory-card";
import { PageHeader } from "@/components/page-header";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchMemories } from "@/lib/server/search";

export const Route = createFileRoute("/search")({ component: SearchRoute });

const EXAMPLES = [
  "What golf thought helped me stop slicing?",
  "What were my best seller financing lessons?",
  "What have I learned about negotiation?",
  "Show me all memories connected to confidence.",
];

function SearchRoute() {
  return (
    <RequireAuth>
      <SearchPage />
    </RequireAuth>
  );
}

function SearchPage() {
  const [query, setQuery] = useState("");
  const [semantic, setSemantic] = useState(true);
  const search = useMutation({ mutationFn: searchMemories });

  function run(q: string) {
    setQuery(q);
    search.mutate({ data: { query: q, semantic } });
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <PageHeader
          kicker="Retrieval"
          title="Ask your mind"
          description="Search by intent, not just keywords. The mesh understands what you meant."
        />
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            run(query);
          }}
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What should future-you remember about seller calls?"
            className="flex-1"
          />
          <Button type="submit" disabled={search.isPending}>
            {search.isPending ? "Searching…" : "Search"}
          </Button>
        </form>
        <label className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={semantic} onChange={(e) => setSemantic(e.target.checked)} />
          Advanced semantic search
        </label>
        <div className="mt-4 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => run(ex)}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
            >
              {ex}
            </button>
          ))}
        </div>
        {search.data?.interpretation ? (
          <p className="mt-6 rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground/90">
            {search.data.interpretation}
          </p>
        ) : null}
        <div className="mt-6 grid gap-3">
          {search.data?.results.length === 0 ? (
            <p className="text-sm text-muted-foreground">No matching memories yet.</p>
          ) : (
            search.data?.results.map((m) => (m ? <MemoryCard key={m.id} memory={m} /> : null))
          )}
        </div>
      </div>
    </AppShell>
  );
}
