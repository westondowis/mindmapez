import { ChevronUp, FileText, Mic, Paperclip, Pause, Play, Square, Trash2, Check, SquarePen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { formatElapsed, useRecorder } from "@/lib/use-recorder";
import type { Memory } from "@/lib/types";
import { blobToDataUrl, cn } from "@/lib/utils";

export function RecordDock({
  pathLabel,
  onSave,
  onSaveNote,
  onSaveFile,
  onOpenMemory,
  memories = [],
  onBusyChange,
  pending,
}: {
  pathLabel: string;
  onSave: (input: { transcript: string; mediaUrl: string; mediaMime: string; mediaName: string }) => void;
  onSaveNote: (input: { title: string; body: string }) => void;
  onSaveFile: (input: { title: string; body?: string; aiSummary?: string; mediaUrl: string; mediaMime: string; mediaName: string }) => void;
  onOpenMemory?: (id: string) => void;
  memories?: Memory[];
  onBusyChange?: (busy: boolean) => void;
  pending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rec = useRecorder();
  const live = rec.status === "recording" || rec.status === "paused" || rec.status === "requesting";
  const fileRef = useRef<HTMLInputElement>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const saved = [...memories].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const memoryKey = saved.map((m) => m.id).join("|");
  const [tab, setTab] = useState<string>(saved[0]?.id ?? "new");
  const seen = useRef(saved.length);

  useEffect(() => {
    if (live) setTab("new");
  }, [live]);

  useEffect(() => {
    const ids = memoryKey ? memoryKey.split("|") : [];
    if (ids.length > seen.current) setTab(ids[0] ?? "new");
    else if (tab !== "new" && !ids.includes(tab)) setTab(ids[0] ?? "new");
    seen.current = ids.length;
  }, [memoryKey, tab]);

  useEffect(() => {
    onBusyChange?.(live);
    return () => onBusyChange?.(false);
  }, [live, onBusyChange]);

  async function save() {
    if (!rec.blob) return;
    const mediaUrl = await blobToDataUrl(rec.blob);
    onSave({
      transcript: rec.transcript.trim(),
      mediaUrl,
      mediaMime: rec.blob.type || "audio/webm",
      mediaName: "voice-note.webm",
    });
    rec.reset();
  }

  async function extractText(file: File): Promise<string> {
    const name = file.name.toLowerCase();
    if (name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".csv") || file.type.startsWith("text/")) {
      return await file.text();
    }
    if (name.endsWith(".docx")) {
      try {
        const buf = await file.arrayBuffer();
        const zip = await import("jszip").then((m) => m.default.loadAsync(buf));
        const xml = await zip.file("word/document.xml")?.async("string");
        if (!xml) return "";
        return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      } catch {
        return "";
      }
    }
    return "";
  }

  function overviewFrom(text: string): string {
    const sentences = (text.match(/[^.!?]+[.!?]+\s*/g) ?? []).map((s) => s.trim());
    const first = sentences.slice(0, 3).join(" ");
    return first.length > 280 ? first.slice(0, 277).trim() + "…" : first || text.slice(0, 180);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const mediaUrl = await blobToDataUrl(file);
    const extracted = await extractText(file);
    const title = file.name.replace(/\.[^.]+$/, "") || "Document";
    const overview = overviewFrom(extracted);
    onSaveFile({
      title,
      body: extracted || `Document: ${file.name}`,
      aiSummary: overview || undefined,
      mediaUrl,
      mediaMime: file.type || "application/octet-stream",
      mediaName: file.name,
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  const active = saved.find((m) => m.id === tab) ?? null;

  return (
    <div className={cn(
      "absolute bottom-[4.6rem] left-16 right-2 z-20 flex flex-col rounded-xl border border-border bg-background/95 shadow-soft backdrop-blur-md md:inset-x-auto md:left-1/2 md:right-auto md:w-[min(100%-1rem,26rem)] md:-translate-x-1/2 md:bottom-6",
      open ? "max-h-[min(42dvh,20rem)]" : "max-h-12",
    )}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-12 w-full items-center justify-between gap-2 px-3 text-left"
        aria-expanded={open}
      >
        <span className="min-w-0">
          <span className="block text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Memories</span>
          <span className="block truncate text-xs text-foreground">{pathLabel} · {saved.length}</span>
        </span>
        <ChevronUp className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3">
      <p className="sr-only">{pathLabel}</p>

      <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Memories on this branch">
        {saved.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={tab === m.id}
            onClick={() => setTab(m.id)}
            className={cn(
              "max-w-[11rem] shrink-0 truncate rounded-full px-3 py-1.5 text-xs",
              tab === m.id ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground/80",
            )}
          >
            {m.emoji ? `${m.emoji} ` : ""}
            {m.title}
          </button>
        ))}
        <button
          type="button"
          role="tab"
          aria-selected={tab === "new"}
          onClick={() => setTab("new")}
          className={cn(
            "shrink-0 rounded-full px-3 py-1.5 text-xs",
            tab === "new" ? "bg-highlight text-highlight-foreground" : "bg-secondary text-foreground/80",
          )}
        >
          + New
        </button>
      </div>

      {active ? (
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-foreground">{active.title}</p>
            <button
              type="button"
              className="grid size-9 shrink-0 place-items-center rounded-md text-foreground hover:bg-secondary"
              aria-label="Edit memory"
              onClick={() => onOpenMemory?.(active.id)}
            >
              <SquarePen className="size-4" />
            </button>
          </div>
          <p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {active.transcript || active.body}
          </p>
          {active.mediaUrl && active.mediaMime?.startsWith("audio/") ? (
            <audio className="mt-2 w-full" controls src={active.mediaUrl} />
          ) : null}
          {active.mediaUrl && !active.mediaMime?.startsWith("audio/") ? (
            <a href={active.mediaUrl} download={active.mediaName ?? true} className="mt-2 inline-block text-sm text-primary">
              {active.mediaName || "Open file"}
            </a>
          ) : null}
        </div>
      ) : (
        <div className="mt-1 min-h-0 flex-1 overflow-y-auto">
          <p className="text-xs text-muted-foreground">Save a note, a document, or a recording on this branch.</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant={noteOpen ? "secondary" : "outline"} onClick={() => setNoteOpen((v) => !v)}>
          <FileText className="size-4" />
          Note
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={pending}>
          <Paperclip className="size-4" />
          Document
        </Button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,.txt,.md,.csv,.rtf,image/*,application/pdf"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </div>

      {noteOpen ? (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            const title = noteTitle.trim();
            const body = noteBody.trim();
            if (!title && !body) return;
            onSaveNote({ title: title || body.slice(0, 80), body: body || title });
            setNoteTitle("");
            setNoteBody("");
            setNoteOpen(false);
          }}
        >
          <Input value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="Note title" maxLength={120} />
          <Textarea
            className="min-h-20"
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            placeholder="Write the note for this branch"
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={pending || (!noteTitle.trim() && !noteBody.trim())}>
              Save note
            </Button>
          </div>
        </form>
      ) : null}

      {live || rec.blobUrl ? (
      <div className="mt-3 flex h-8 items-end gap-0.5" aria-hidden="true">
        {rec.levels.map((v, i) => (
          <span
            key={i}
            className={cn(
              "flex-1 rounded-sm bg-primary/80 transition-[height,opacity] duration-75",
              rec.status === "recording" ? "opacity-100" : "opacity-40",
            )}
            style={{ height: `${Math.round(v * 100)}%` }}
          />
        ))}
      </div>
      ) : null}

      <div className="mt-2.5 flex items-center justify-between gap-2">
        {live || rec.blobUrl ? (
        <p className="font-mono text-sm tabular-nums text-foreground">
          {formatElapsed(rec.elapsedMs)}
          {rec.status === "paused" ? " · paused" : rec.status === "recording" ? " · live" : ""}
        </p>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap justify-end gap-1.5">
          {rec.status === "idle" || rec.status === "denied" || rec.status === "unavailable" || rec.status === "error" ? (
            <Button type="button" size="sm" onClick={() => void rec.start()} disabled={pending}>
              <Mic className="size-4" />
              Press to record
            </Button>
          ) : null}
          {rec.status === "recording" ? (
            <>
              <Button type="button" size="sm" variant="secondary" onClick={rec.pause}>
                <Pause className="size-4" />
                Pause
              </Button>
              <Button type="button" size="sm" variant="destructive" onClick={rec.stop}>
                <Square className="size-4" />
                Stop
              </Button>
            </>
          ) : null}
          {rec.status === "paused" ? (
            <>
              <Button type="button" size="sm" variant="secondary" onClick={rec.resume}>
                <Play className="size-4" />
                Resume
              </Button>
              <Button type="button" size="sm" variant="destructive" onClick={rec.stop}>
                <Square className="size-4" />
                Stop
              </Button>
            </>
          ) : null}
          {live ? (
            <Button type="button" size="sm" variant="ghost" onClick={rec.cancel}>
              <Trash2 className="size-4" />
              Cancel
            </Button>
          ) : null}
        </div>
      </div>

      {rec.error ? <p className="mt-2 text-sm text-destructive">{rec.error}</p> : null}
      {rec.status === "denied" ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Chrome: lock icon in the address bar → Site settings → Microphone → Allow. Safari: Settings →
          Safari → Microphone.
        </p>
      ) : null}

      {rec.blobUrl ? (
        <div className="mt-3 space-y-2">
          <audio controls src={rec.blobUrl} className="w-full" />
          <Textarea
            className="min-h-20"
            placeholder="Transcript (editable). Saved with this branch."
            value={rec.transcript}
            onChange={(e) => rec.setTranscript(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={rec.reset}>
              Discard
            </Button>
            <Button type="button" disabled={pending} onClick={() => void save()}>
              <Check className="size-4" />
              Save to branch
            </Button>
          </div>
        </div>
      ) : rec.interim || rec.transcript ? (
        <p className="mt-2 text-xs text-muted-foreground">{rec.interim || rec.transcript}</p>
      ) : null}
        </div>
      )}
      </div>
      ) : null}
    </div>
  );
}