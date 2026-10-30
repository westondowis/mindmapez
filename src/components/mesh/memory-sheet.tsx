import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { GlyphRow } from "@/components/glyph-controls";
import { Stars } from "@/components/stars";
import { KIND_LABEL, KIND_TONE } from "@/lib/kind-styles";
import { deleteMemory, getMemory, suggestMemoryTags, updateMemory } from "@/lib/server/memories";
import { formatDate } from "@/lib/utils";
import { EMOTIONS, NODE_KINDS, type NodeKind } from "@/lib/types";
import { TagEditor } from "@/components/tag-editor";

export function MemorySheet({
  memoryId,
  onClose,
}: {
  memoryId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["memory", memoryId],
    queryFn: () => getMemory({ data: memoryId }),
  });
  const m = q.data;
  const [title, setTitle] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [overview, setOverview] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const titleValue = title ?? m?.title ?? "";
  const bodyValue = body ?? m?.body ?? "";
  const overviewValue = overview ?? m?.aiSummary ?? "";

  useEffect(() => {
    setTitle(null);
    setBody(null);
    setOverview(null);
    setEditing(false);
  }, [memoryId]);

  const save = useMutation({
    mutationFn: updateMemory,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["memory", memoryId] });
      void qc.invalidateQueries({ queryKey: ["graph"] });
    },
  });
  const suggest = useMutation({
    mutationFn: suggestMemoryTags,
    onSuccess: (res) => {
      if (!m) return;
      save.mutate({ data: { id: m.id, tags: res.tags } });
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteMemory({ data: memoryId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["graph"] });
      onClose();
    },
  });

  return (
    <aside className="absolute inset-x-0 bottom-0 z-30 flex max-h-[min(72dvh,36rem)] w-full flex-col rounded-t-2xl border border-border bg-background/96 shadow-soft backdrop-blur-md md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:max-w-md md:rounded-none md:border-y-0 md:border-r-0">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">{editing ? "Edit memory" : "Memory"}</p>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setEditing((v) => !v)} className="flex size-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground" aria-label={editing ? "Done editing" : "Edit memory"}>
            <Pencil className="size-4" />
          </button>
          <button type="button" onClick={onClose} className="flex size-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground" aria-label="Close">
          <X className="size-5" />
        </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {q.isPending || !m ? (
          <div className="space-y-3">
            <div className="h-6 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-24 animate-pulse rounded-lg bg-muted" />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={KIND_TONE[m.nodeKind]}>{KIND_LABEL[m.nodeKind]}</Badge>
              <span className="text-xs text-muted-foreground">{formatDate(m.createdAt)}</span>
            </div>
            {editing ? (
              <>
                <label className="mt-3 block text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Title
                  <Input
                    className="mt-1"
                    value={titleValue}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={() => {
                      const next = titleValue.trim();
                      if (next && next !== m.title) save.mutate({ data: { id: m.id, title: next } });
                    }}
                  />
                </label>
                <label className="mt-3 block text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Quick overview
                  <Textarea
                    className="mt-1 max-h-28 min-h-16 overflow-y-auto"
                    value={overviewValue}
                    onChange={(e) => setOverview(e.target.value)}
                    onBlur={() => {
                      if (overviewValue !== (m.aiSummary ?? "")) save.mutate({ data: { id: m.id, aiSummary: overviewValue } });
                    }}
                    placeholder="A short overview of this memory"
                  />
                </label>
                <label className="mt-3 block text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Note
                  <Textarea
                    className="mt-1 max-h-48 min-h-28 overflow-y-auto"
                    value={bodyValue}
                    onChange={(e) => setBody(e.target.value)}
                    onBlur={() => {
                      if (bodyValue !== m.body) save.mutate({ data: { id: m.id, body: bodyValue } });
                    }}
                  />
                </label>
              </>
            ) : (
              <>
                <h2 className="mt-3 font-display text-xl text-foreground">{m.title}</h2>
                {m.aiSummary ? <p className="mt-2 max-h-28 overflow-y-auto text-sm text-[#c9b6ff]">{m.aiSummary}</p> : null}
                <p className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{m.body}</p>
              </>
            )}
            <div className="mt-4">
              <GlyphRow
                emoji={m.emoji || "✨"}
                color={m.color || "cyan"}
                onEmoji={(emoji) => save.mutate({ data: { id: m.id, emoji } })}
                onColor={(color) => save.mutate({ data: { id: m.id, color } })}
              />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <Stars
                value={m.importance}
                size="md"
                onChange={(n) => save.mutate({ data: { id: m.id, importance: n } })}
              />
              {m.emotion ? <span className="text-sm text-muted-foreground">{m.emotion}</span> : null}
            </div>

            {m.sourceUrl ? (
              <a
                href={m.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-sm text-primary hover:underline"
              >
                Open source{m.sourceKind ? ` · ${m.sourceKind}` : ""}
              </a>
            ) : null}
            {m.transcript ? (
              <div className="mt-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Transcript</p>
                <p className="mt-1 text-sm italic text-foreground/80">{m.transcript}</p>
              </div>
            ) : null}
            {m.mediaUrl && m.mediaMime?.startsWith("audio/") ? (
              <audio className="mt-4 w-full" controls src={m.mediaUrl} />
            ) : null}
            {m.mediaUrl && !m.mediaMime?.startsWith("audio/") && !m.mediaMime?.startsWith("image/") && !m.mediaMime?.startsWith("video/") ? (
              <a href={m.mediaUrl} download={m.mediaName ?? "document"} className="mt-3 inline-block text-sm text-primary hover:underline">
                Download original{m.mediaName ? ` · ${m.mediaName}` : ""}
              </a>
            ) : null}
            {m.mediaUrl && m.mediaMime?.startsWith("image/") ? (
              <img src={m.mediaUrl} alt="" className="mt-4 max-h-56 w-full rounded-lg object-cover" />
            ) : null}
            {m.mediaUrl && m.mediaMime?.startsWith("video/") ? (
              <video className="mt-4 w-full rounded-lg" controls src={m.mediaUrl} />
            ) : null}
            <div className="mt-5">
              <TagEditor
                tags={m.tags}
                onChange={(tags) => save.mutate({ data: { id: m.id, tags } })}
                onSuggest={() => suggest.mutate({ data: { memoryId: m.id, existing: m.tags } })}
                suggesting={suggest.isPending}
              />
            </div>
            {m.concepts.length ? (
              <div className="mt-5">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Connected concepts</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.concepts.map((c) => (
                    <Badge key={c.id}>{c.name}</Badge>
                  ))}
                </div>
              </div>
            ) : null}
            {m.related.length ? (
              <div className="mt-5">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Related memories</p>
                <ul className="mt-2 space-y-1">
                  {m.related.map((r) => (
                    <li key={r.id}>
                      <Link
                        to="/memory/$id"
                        params={{ id: r.id }}
                        className="text-sm text-primary hover:underline"
                      >
                        {r.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="mt-6 grid gap-2">
              <label className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Emotion</label>
              <div className="flex flex-wrap gap-1">
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
              <label className="mt-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Kind</label>
              <div className="flex flex-wrap gap-1">
                {NODE_KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => save.mutate({ data: { id: m.id, nodeKind: k as NodeKind } })}
                    className={`rounded-full px-2.5 py-1 text-xs ${m.nodeKind === k ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground"}`}
                  >
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-8 flex items-center justify-between">
              <Link to="/memory/$id" params={{ id: m.id }} className="text-sm text-primary">
                Open full page
              </Link>
              <Button variant="ghost" size="sm" onClick={() => remove.mutate()}>
                Remove
              </Button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
