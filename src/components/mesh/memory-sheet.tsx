import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mic, Pencil, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
import { ExplainButton } from "@/components/explain-sheet";
import { MemoryViewer } from "@/components/digestion/memory-viewer";

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
  const [more, setMore] = useState("");
  const [listening, setListening] = useState(false);
  const [confirmExit, setConfirmExit] = useState<null | "close" | "done">(null);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const dirty =
    !!m &&
    editing &&
    ((title !== null && title.trim() !== m.title) ||
      (body !== null && body !== m.body) ||
      (overview !== null && overview !== (m.aiSummary ?? "")) ||
      more.trim().length > 0);

  const stopDictation = () => {
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    recRef.current = null;
    setListening(false);
  };
  const startDictation = () => {
    if (typeof window === "undefined") return;
    const w = window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    try {
      const rec = new Ctor();
      rec.continuous = true;
      rec.interimResults = false;
      rec.lang = "en-US";
      rec.onresult = (ev: any) => {
        let text = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          if (ev.results[i].isFinal) text += ev.results[i][0].transcript;
        }
        if (text.trim()) setMore((prev) => (prev ? `${prev.replace(/\s+$/, "")} ` : "") + text.trim());
      };
      rec.onend = () => setListening(false);
      rec.onerror = () => setListening(false);
      recRef.current = rec;
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };
  const canDictate =
    typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  useEffect(() => {
    setTitle(null);
    setBody(null);
    setOverview(null);
    setEditing(false);
    setMore("");
    setConfirmExit(null);
    stopDictation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoryId]);

  useEffect(() => () => stopDictation(), []);

  // Browser/tab close guard while there are unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const discard = () => {
    setTitle(null);
    setBody(null);
    setOverview(null);
    setMore("");
    stopDictation();
  };
  const requestClose = () => {
    if (dirty) setConfirmExit("close");
    else onClose();
  };
  const requestDone = () => {
    if (!editing) {
      setEditing(true);
      return;
    }
    if (dirty) setConfirmExit("done");
    else setEditing(false);
  };

  const save = useMutation({
    mutationFn: updateMemory,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["memory", memoryId] });
      void qc.invalidateQueries({ queryKey: ["graph"] });
    },
  });
  const saveAll = () => {
    if (!m || !dirty) return;
    stopDictation();
    const nextBody = more.trim()
      ? `${bodyValue.replace(/\s+$/, "")}${bodyValue.trim() ? "\n\n" : ""}${more.trim()}`
      : bodyValue;
    const data: { id: string; title?: string; body?: string; aiSummary?: string } = { id: m.id };
    if (title !== null && title.trim() && title.trim() !== m.title) data.title = title.trim();
    if (nextBody !== m.body) data.body = nextBody;
    if (overview !== null && overview !== (m.aiSummary ?? "")) data.aiSummary = overview;
    save.mutate(
      { data },
      {
        onSuccess: () => {
          discard();
          setConfirmExit(null);
        },
      },
    );
  };
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
    <>
    <div
      aria-hidden
      className="absolute inset-0 z-[29] bg-transparent"
      onPointerDown={(e) => {
        e.stopPropagation();
        requestClose();
      }}
    />
    <aside onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} className="clear-bottom-nav absolute inset-x-0 z-30 flex max-h-[min(72dvh,36rem)] w-full flex-col rounded-t-2xl border border-border bg-background/96 shadow-soft backdrop-blur-md md:inset-y-0 md:bottom-0 md:right-0 md:left-auto md:max-h-none md:max-w-md md:rounded-none md:border-y-0 md:border-r-0">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">{editing ? "Edit memory" : "Memory"}</p>
        <div className="flex items-center gap-1">
          {m ? <ExplainButton targetType="memory" targetId={m.id} title={m.title} label="Explain" className="h-11 min-w-11 px-2" iconOnly /> : null}
          <button type="button" onClick={requestDone} className="flex size-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground" aria-label={editing ? "Done editing" : "Edit memory"}>
            <Pencil className="size-4" />
          </button>
          <button type="button" onClick={requestClose} className="flex size-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground" aria-label="Close">
          <X className="size-5" />
        </button>
        </div>
      </div>
      {editing && m ? (
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2" data-testid="memory-save-top">
          <span className="text-xs text-muted-foreground">{dirty ? "Unsaved changes" : "No changes"}</span>
          <Button size="sm" disabled={!dirty || save.isPending} onClick={saveAll} data-testid="memory-save-top-btn">
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      ) : null}
      {confirmExit ? (
        <div role="alertdialog" aria-label="Unsaved changes" data-testid="memory-exit-confirm" className="border-b border-border bg-secondary px-4 py-3">
          <p className="text-sm text-foreground">You have unsaved changes. Exit without saving?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={saveAll}>Save and exit</Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const target = confirmExit;
                discard();
                setConfirmExit(null);
                if (target === "close") onClose();
                else setEditing(false);
              }}
            >
              Exit without saving
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmExit(null)}>Keep editing</Button>
          </div>
        </div>
      ) : null}
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
                  />
                </label>
                <label className="mt-3 block text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Quick overview
                  <Textarea
                    className="mt-1 max-h-28 min-h-16 overflow-y-auto"
                    value={overviewValue}
                    onChange={(e) => setOverview(e.target.value)}
                    placeholder="A short overview of this memory"
                  />
                </label>
                <label className="mt-3 block text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Note
                  <Textarea
                    className="mt-1 max-h-48 min-h-28 overflow-y-auto"
                    value={bodyValue}
                    onChange={(e) => setBody(e.target.value)}
                  />
                </label>
                <div className="mt-3">
                  <label className="block text-[11px] uppercase tracking-[0.16em] text-muted-foreground" htmlFor="memory-more">
                    Add more to this memory
                  </label>
                  <Textarea
                    id="memory-more"
                    data-testid="memory-more"
                    className="mt-1 max-h-40 min-h-20 overflow-y-auto"
                    value={more}
                    onChange={(e) => setMore(e.target.value)}
                    placeholder="Type or dictate more. It is appended when you save."
                  />
                  {canDictate ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="mt-1 min-h-11 gap-2"
                      data-testid="memory-dictate"
                      aria-pressed={listening}
                      onClick={listening ? stopDictation : startDictation}
                    >
                      {listening ? <Square className="size-4" /> : <Mic className="size-4" />}
                      {listening ? "Stop dictating" : "Dictate more"}
                    </Button>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <h2 className="mt-3 font-display text-xl text-foreground">{m.title}</h2>
                {m.aiSummary ? <p className="mt-2 max-h-28 overflow-y-auto text-sm text-[#c9b6ff]">{m.aiSummary}</p> : null}
                <MemoryViewer memory={m} compact />
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
      {editing && m ? (
        <div className="border-t border-border bg-background/96 px-4 py-3" data-testid="memory-save-bottom">
          <Button className="w-full min-h-11" disabled={!dirty || save.isPending} onClick={saveAll}>
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      ) : null}
    </aside>
    </>
  );
}
