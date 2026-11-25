import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { MemoryCard } from "@/components/memory-card";
import { PageHeader } from "@/components/page-header";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { getDashboard } from "@/lib/server/dashboard";
import { setConnectionStatus } from "@/lib/server/memories";
import { toast } from "sonner";
import { FREE_MEMORY_LIMIT, type DashboardStats } from "@/lib/types";

export const Route = createFileRoute("/dashboard")({ component: DashboardRoute });

function DashboardRoute() {
  return (
    <RequireAuth>
      <DashboardPage />
    </RequireAuth>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl tabular-nums">{value}</p>
    </div>
  );
}

function DashboardPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => getDashboard() });
  const decide = useMutation({
    mutationFn: setConnectionStatus,
    // Drop the card right away; restore the list if the server rejects, then refetch either way.
    onMutate: async (vars: { data: { id: string; status: "accepted" | "rejected" } }) => {
      await qc.cancelQueries({ queryKey: ["dashboard"] });
      const prev = qc.getQueryData<DashboardStats>(["dashboard"]);
      if (prev) qc.setQueryData<DashboardStats>(["dashboard"], { ...prev, suggested: prev.suggested.filter((x) => x.id !== vars.data.id) });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["dashboard"], ctx.prev);
      toast.error("Couldn't update that suggestion. Try again.");
    },
    onSuccess: (_res, vars) => {
      if (vars.data.status === "accepted") toast.success("Connection accepted");
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["graph"] });
    },
  });
  const d = q.data;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        <PageHeader
          kicker="Overview"
          title="The mesh at a glance"
          description="What is growing, what is glowing, and which threads the network wants you to confirm."
        />
        {q.isPending || !d ? (
          <div className="grid gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Memories" value={d.memoryCount} />
              <Stat label="Voice notes" value={d.voiceCount} />
              <Stat label="Connections" value={d.connectionCount} />
              <Stat
                label={d.plan === "pro" ? "Plan" : "Free capacity"}
                value={d.plan === "pro" ? "Pro" : `${d.memoryCount}/${FREE_MEMORY_LIMIT}`}
              />
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <section className="rounded-xl border border-border bg-card p-5">
                <h2 className="font-display text-xl">Most active topics</h2>
                <ul className="mt-4 space-y-3">
                  {d.topTopics.map((t) => (
                    <li key={t.id}>
                      <TopicLink id={t.id} name={t.name} value={String(t.count)} />
                    </li>
                  ))}
                </ul>
              </section>
              <section className="rounded-xl border border-border bg-card p-5">
                <h2 className="font-display text-xl">Fastest growing</h2>
                <ul className="mt-4 space-y-3">
                  {d.growingConcepts.length ? (
                    d.growingConcepts.map((t) => (
                      <li key={t.id}>
                        <TopicLink id={t.id} name={t.name} value={`+${t.count}`} />
                      </li>
                    ))
                  ) : (
                    <li className="text-sm text-muted-foreground">Capture more this week to see momentum.</li>
                  )}
                </ul>
              </section>
              <section className="rounded-xl border border-border bg-card p-5">
                <h2 className="font-display text-xl">Top emotions</h2>
                <ul className="mt-4 space-y-3">
                  {d.topEmotions.map((t) => (
                    <li key={t.name} className="flex items-center justify-between text-sm">
                      <span>{t.name}</span>
                      <span className="tabular-nums text-muted-foreground">{t.count}</span>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="rounded-xl border border-border bg-card p-5">
                <h2 className="font-display text-xl">Suggested connections</h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  When two memories share the same branch or tag, they appear here for you to accept or dismiss.
                </p>
                <ul className="mt-4 space-y-3" data-testid="suggested-list">
                  {d.suggested.length ? (
                    d.suggested.map((s) => (
                      <li
                        key={s.id}
                        data-testid="suggestion-card"
                        className="rounded-lg border border-border bg-background/50 p-3"
                      >
                        <div className="flex flex-col gap-1 text-sm">
                          <p className="break-words font-medium leading-snug text-foreground">{s.a.label}</p>
                          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground" aria-hidden>
                            ↕ with
                          </p>
                          <p className="break-words font-medium leading-snug text-foreground">{s.b.label}</p>
                        </div>
                        {s.shared.length ? (
                          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Shared branches">
                            {s.shared.map((name) => (
                              <li
                                key={name}
                                className="max-w-full truncate rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
                              >
                                {name}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {s.reasonLine ? <p className="mt-2 text-xs text-muted-foreground">{s.reasonLine}</p> : null}
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <Button
                            className="min-h-11"
                            aria-label={`Accept connection between ${s.a.label} and ${s.b.label}`}
                            onClick={() => decide.mutate({ data: { id: s.id, status: "accepted" } })}
                          >
                            Accept
                          </Button>
                          <Button
                            variant="outline"
                            className="min-h-11"
                            aria-label={`Dismiss connection between ${s.a.label} and ${s.b.label}`}
                            onClick={() => decide.mutate({ data: { id: s.id, status: "rejected" } })}
                          >
                            Dismiss
                          </Button>
                        </div>
                      </li>
                    ))
                  ) : (
                    <li className="text-sm text-muted-foreground" data-testid="suggested-empty">
                      No pending suggestions. Keep capturing memories.
                    </li>
                  )}
                </ul>
              </section>
            </div>

            <section className="mt-8">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-xl">Favorite insights</h2>
                <Link to="/timeline" className="text-sm text-primary">
                  Timeline
                </Link>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {d.favorites.map((m) => (
                  <MemoryCard key={m.id} memory={m} />
                ))}
              </div>
            </section>
            <section className="mt-8">
              <h2 className="mb-3 font-display text-xl">Recent memories</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {d.recent.map((m) => (
                  <MemoryCard key={m.id} memory={m} />
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}


/** A topic row that opens the mesh on that branch (sector, branch path and its memories). */
function TopicLink({ id, name, value }: { id: string; name: string; value: string }) {
  return (
    <Link
      to="/"
      search={{ focus: id, focusType: "branch" }}
      aria-label={`Open ${name} in the mesh`}
      className="-mx-2 flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 text-sm hover:bg-secondary focus-visible:bg-secondary"
    >
      <span className="min-w-0 truncate underline-offset-4 hover:underline">{name}</span>
      <span className="flex shrink-0 items-center gap-2 tabular-nums text-muted-foreground">
        {value}
        <ChevronRight className="size-4" aria-hidden />
      </span>
    </Link>
  );
}
