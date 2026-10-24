import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { MemoryCard } from "@/components/memory-card";
import { PageHeader } from "@/components/page-header";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { getDashboard } from "@/lib/server/dashboard";
import { setConnectionStatus } from "@/lib/server/memories";
import { FREE_MEMORY_LIMIT } from "@/lib/types";

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
    onSuccess: () => {
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
                    <li key={t.name} className="flex items-center justify-between text-sm">
                      <span>{t.name}</span>
                      <span className="tabular-nums text-muted-foreground">{t.count}</span>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="rounded-xl border border-border bg-card p-5">
                <h2 className="font-display text-xl">Fastest growing</h2>
                <ul className="mt-4 space-y-3">
                  {d.growingConcepts.length ? (
                    d.growingConcepts.map((t) => (
                      <li key={t.name} className="flex items-center justify-between text-sm">
                        <span>{t.name}</span>
                        <span className="tabular-nums text-muted-foreground">+{t.count}</span>
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
                <ul className="mt-4 space-y-4">
                  {d.suggested.length ? (
                    d.suggested.map((s) => (
                      <li key={s.id} className="rounded-lg border border-border bg-background/50 p-3">
                        <p className="text-sm">
                          <span className="text-foreground">{s.a.label}</span>
                          <span className="text-muted-foreground"> → </span>
                          <span className="text-foreground">{s.b.label}</span>
                        </p>
                        {s.reason ? <p className="mt-1 text-xs text-muted-foreground">{s.reason}</p> : null}
                        <div className="mt-2 flex gap-2">
                          <Button size="sm" onClick={() => decide.mutate({ data: { id: s.id, status: "accepted" } })}>
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => decide.mutate({ data: { id: s.id, status: "rejected" } })}
                          >
                            Dismiss
                          </Button>
                        </div>
                      </li>
                    ))
                  ) : (
                    <li className="text-sm text-muted-foreground">No pending suggestions. Keep capturing.</li>
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
