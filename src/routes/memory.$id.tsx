import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { RequireAuth } from "@/components/require-auth";
import { Stars } from "@/components/stars";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KIND_LABEL, KIND_TONE } from "@/lib/kind-styles";
import { deleteMemory, getMemory, suggestMemoryTags, updateMemory } from "@/lib/server/memories";
import { EMOTIONS } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { TagEditor } from "@/components/tag-editor";

export const Route = createFileRoute("/memory/$id")({ component: MemoryRoute });

function MemoryRoute() {
  return (
    <RequireAuth>
      <MemoryPage />
    </RequireAuth>
  );
}

function MemoryPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["memory", id], queryFn: () => getMemory({ data: id }) });
  const m = q.data;
  const save = useMutation({
    mutationFn: updateMemory,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["memory", id] }),
  });
  const suggest = useMutation({
    mutationFn: suggestMemoryTags,
    onSuccess: (res) => {
      if (!m) return;
      save.mutate({ data: { id: m.id, tags: res.tags } });
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteMemory({ data: id }),
    onSuccess: () => navigate({ to: "/" }),
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl pb-10">
        <Link to="/" className="text-sm text-primary">
          Back to mesh
        </Link>
        {q.isPending || !m ? (
          <div className="mt-6 h-64 animate-pulse rounded-xl bg-muted" />
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge tone={KIND_TONE[m.nodeKind]}>{KIND_LABEL[m.nodeKind]}</Badge>
              <span className="text-xs text-muted-foreground">{m.memoryType}</span>
              <span className="text-xs text-muted-foreground">{formatDate(m.createdAt)}</span>
            </div>
            <h1 className="mt-3 font-display text-4xl font-medium tracking-tight">{m.title}</h1>
            <div className="mt-4 flex items-center justify-between">
              <Stars value={m.importance} size="md" onChange={(n) => save.mutate({ data: { id: m.id, importance: n } })} />
              <span className="text-sm text-muted-foreground">{m.aiImpact.replace("_", " ")} impact</span>
            </div>
            {m.aiSummary ? (
              <p className="mt-6 rounded-xl border border-border bg-card px-4 py-4 text-sm leading-relaxed">
                {m.aiSummary}
              </p>
            ) : null}
            {m.sourceUrl ? (
              <a
                href={m.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-block text-sm text-primary hover:underline"
              >
                Open original{m.sourceKind ? ` · ${m.sourceKind}` : ""}
              </a>
            ) : null}
            <p className="mt-6 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/90">{m.body}</p>
            {m.transcript ? (
              <blockquote className="mt-6 border-l-2 border-primary/40 pl-4 text-sm italic text-muted-foreground">
                {m.transcript}
              </blockquote>
            ) : null}
            {m.mediaUrl && m.mediaMime?.startsWith("audio/") ? (
              <audio className="mt-6 w-full" controls src={m.mediaUrl} />
            ) : null}
            {m.mediaUrl && m.mediaMime?.startsWith("image/") ? (
              <img src={m.mediaUrl} alt="" className="mt-6 w-full rounded-xl object-cover" />
            ) : null}
            {m.mediaUrl && m.mediaMime?.startsWith("video/") ? (
              <video className="mt-6 w-full rounded-xl" controls src={m.mediaUrl} />
            ) : null}
            <div className="mt-6">
              <TagEditor
                tags={m.tags}
                onChange={(tags) => save.mutate({ data: { id: m.id, tags } })}
                onSuggest={() => suggest.mutate({ data: { memoryId: m.id, existing: m.tags } })}
                suggesting={suggest.isPending}
              />
            </div>
            <section className="mt-8">
              <h2 className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Emotion</h2>
              <div className="mt-2 flex flex-wrap gap-1">
                {EMOTIONS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => save.mutate({ data: { id: m.id, emotion: e } })}
                    className={`rounded-full px-2.5 py-1 text-xs ${m.emotion === e ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </section>
            {m.concepts.length ? (
              <section className="mt-8">
                <h2 className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Connected concepts</h2>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.concepts.map((c) => (
                    <Badge key={c.id}>{c.name}</Badge>
                  ))}
                </div>
              </section>
            ) : null}
            {m.related.length ? (
              <section className="mt-8">
                <h2 className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Related memories</h2>
                <ul className="mt-2 space-y-2">
                  {m.related.map((r) => (
                    <li key={r.id}>
                      <Link to="/memory/$id" params={{ id: r.id }} className="text-sm text-primary hover:underline">
                        {r.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <div className="mt-10">
              <Button variant="ghost" onClick={() => remove.mutate()}>
                Remove this memory
              </Button>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
