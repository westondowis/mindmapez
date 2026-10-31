import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { createBranch } from "@/lib/server/branches";
import { createMemory, getGraph } from "@/lib/server/memories";
import { listReviews, resolveReview } from "@/lib/server/reviews";
import type { ReviewAction, ReviewItem } from "@/lib/voice";

export const Route = createFileRoute("/review")({ component: ReviewRoute });

function ReviewRoute() {
  return (
    <RequireAuth>
      <ReviewPage />
    </RequireAuth>
  );
}

const ACTIONS: { value: ReviewAction; label: string }[] = [
  { value: "memory", label: "Add memory to existing branch" },
  { value: "branch", label: "Create top-level branch" },
  { value: "sub-branch", label: "Create sub-branch" },
];

function ReviewPage() {
  const qc = useQueryClient();
  const reviews = useQuery({ queryKey: ["reviews"], queryFn: () => listReviews() });
  const graph = useQuery({ queryKey: ["graph"], queryFn: () => getGraph() });
  const concepts = ((graph.data as { concepts?: { id: string; name: string }[] } | undefined)?.concepts ?? []).slice();
  const items = reviews.data ?? [];

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <PageHeader
          kicker="Voice"
          title="Review queue"
          description="Voice notes wait here until you approve them. Nothing touches your mesh before then."
        />
        {!items.length ? (
          <p className="rounded-2xl border border-border bg-card/70 p-6 text-sm text-muted-foreground">
            Nothing waiting. Talk to the brain, then say "I'm done" to queue a note.
          </p>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <ReviewCard
                key={item.id}
                item={item}
                concepts={concepts}
                onDone={() => {
                  void qc.invalidateQueries({ queryKey: ["reviews"] });
                  void qc.invalidateQueries({ queryKey: ["graph"] });
                }}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function ReviewCard({
  item,
  concepts,
  onDone,
}: {
  item: ReviewItem;
  concepts: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [action, setAction] = useState<ReviewAction>(item.action);
  const [target, setTarget] = useState<string>(item.conceptId ?? "");
  const [name, setName] = useState(item.suggestedName ?? (item.keywords[0] ? item.keywords[0][0]!.toUpperCase() + item.keywords[0].slice(1) : "New branch"));
  const [title, setTitle] = useState(item.keyPoints[0]?.slice(0, 80) || item.raw.slice(0, 80));
  const [points, setPoints] = useState(item.keyPoints.join("\n"));

  const approve = useMutation({
    mutationFn: async () => {
      let conceptId: string | null = target || null;
      if (action !== "memory") {
        const made = await createBranch({
          data: { name: name.trim(), parentId: action === "sub-branch" ? target || null : null },
        });
        if (!made.ok) throw new Error(made.error);
        conceptId = (made.branch as { id: string }).id;
      }
      const kp = points.split("\n").map((k) => k.trim()).filter(Boolean);
      const body = item.raw + (kp.length ? "\n\nKey points:\n" + kp.map((k) => "• " + k).join("\n") : "");
      const saved = await createMemory({
        data: { title: title.trim() || item.raw.slice(0, 80), body, transcript: item.raw, memoryType: "voice", tags: item.keywords, conceptId },
      });
      if (saved && "ok" in saved && saved.ok === false) throw new Error(saved.error);
      await resolveReview({ data: { id: item.id, status: "approved" } });
    },
    onSuccess: () => {
      toast.success("Added to your mesh");
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not approve that"),
  });

  const reject = useMutation({
    mutationFn: () => resolveReview({ data: { id: item.id, status: "rejected" } }),
    onSuccess: onDone,
  });

  const needsParent = action === "sub-branch" && !target;
  const select = "w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm";

  return (
    <section className="rounded-2xl border border-border bg-card/70 p-4">
      <input className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm font-medium" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" />
      <textarea className="mt-2 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs" rows={Math.min(6, Math.max(2, points.split("\n").length))} value={points} onChange={(e) => setPoints(e.target.value)} aria-label="Key points, one per line" />
      <details className="mt-1 text-xs text-muted-foreground">
        <summary className="cursor-pointer">Full transcript</summary>
        <p className="mt-1 leading-relaxed">{item.raw}</p>
      </details>
      {item.keywords.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.keywords.map((k) => (
            <span key={k} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {k}
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <select className={select} value={action} onChange={(e) => setAction(e.target.value as ReviewAction)} aria-label="Suggested action">
          {ACTIONS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
        <select className={select} value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Branch">
          <option value="">{action === "sub-branch" ? "Choose parent branch…" : action === "branch" ? "Top level" : "Unfiled"}</option>
          {action !== "branch" &&
            concepts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
        {action !== "memory" ? (
          <input className={`${select} sm:col-span-2`} value={name} onChange={(e) => setName(e.target.value)} aria-label="New branch name" />
        ) : null}
      </div>
      <div className="mt-3 flex gap-2">
        <Button type="button" onClick={() => approve.mutate()} disabled={approve.isPending || needsParent || (action !== "memory" && !name.trim())}>
          Approve & Save
        </Button>
        <Button type="button" variant="outline" onClick={() => reject.mutate()} disabled={reject.isPending}>
          Reject
        </Button>
      </div>
    </section>
  );
}
