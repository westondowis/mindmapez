import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardPaste, FileText, FolderOpen, ImageIcon, Link2, Mic, Pause, Play, Square, Type, Video, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { GlyphRow } from "@/components/glyph-controls";
import { TagEditor } from "@/components/tag-editor";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { markAccountDirty, registerAccountFlusher } from "@/lib/account-persist";
import { subscribeImport } from "@/lib/import-bus";
import {
  canDropImport,
  formatBytes,
  formatTextStat,
  ingestClipboardEvent,
  ingestDataTransfer,
  ingestFiles,
  ingestTextBlock,
  pickFilesFromDevice,
  readSystemClipboard,
  type IngestItem,
} from "@/lib/ingest";
import { extractLink } from "@/lib/server/extract";
import { createMemory, type CreateMemoryInput, suggestMemoryTags } from "@/lib/server/memories";
import { clearAccountDraft, getAccountDraft, saveAccountDraft, type CaptureDraft } from "@/lib/server/persist";
import type { MemoryType } from "@/lib/types";
import { blobToDataUrl, cn } from "@/lib/utils";
import { formatElapsed, useRecorder } from "@/lib/use-recorder";

type Mode = "voice" | "text" | "photo" | "video" | "document" | "thought" | "link";

const MODES: { id: Mode; label: string; icon: typeof Mic }[] = [
  { id: "voice", label: "Voice", icon: Mic },
  { id: "text", label: "Text", icon: Type },
  { id: "link", label: "Link", icon: Link2 },
  { id: "thought", label: "Thought", icon: Type },
  { id: "photo", label: "Photo", icon: ImageIcon },
  { id: "video", label: "Video", icon: Video },
  { id: "document", label: "File", icon: FileText },
];

export type CaptureGuide = {
  mapName: string;
  conceptId: string;
  exampleTitle: string;
  exampleBody: string;
};

export type CaptureSeed = {
  title?: string;
  body?: string;
  sourceUrl?: string;
};

function isBareUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

function kindToMode(kind: IngestItem["kind"]): Mode {
  if (kind === "link") return "link";
  if (kind === "photo") return "photo";
  if (kind === "video") return "video";
  if (kind === "voice") return "voice";
  if (kind === "document") return "document";
  return "text";
}

export function CapturePanel({
  onCreated,
  defaultMode = "voice",
  guide,
  seed,
}: {
  onCreated?: (id: string) => void;
  defaultMode?: Mode;
  guide?: CaptureGuide;
  seed?: CaptureSeed;
}) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [transcript, setTranscript] = useState("");
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaMime, setMediaMime] = useState<string | null>(null);
  const [mediaName, setMediaName] = useState<string | null>(null);
  const [emoji, setEmoji] = useState(guide ? "💡" : "✨");
  const [color, setColor] = useState(guide ? "gold" : "cyan");
  const [tags, setTags] = useState<string[]>([]);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceKind, setSourceKind] = useState<string | null>(null);
  const [extractWarning, setExtractWarning] = useState<string | null>(null);
  const [extractedSite, setExtractedSite] = useState<string | null>(null);
  const [transcriptFound, setTranscriptFound] = useState(false);
  const recorder = useRecorder();
  const [restored, setRestored] = useState(false);
  const [queue, setQueue] = useState<IngestItem[]>([]);
  const [dropHover, setDropHover] = useState(false);
  const [batch, setBatch] = useState<{ total: number; done: number } | null>(null);
  const skipDraft = useRef(false);
  const recordingRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const seedUsed = useRef(false);
  const recording = recorder.status === "recording" || recorder.status === "paused" || recorder.status === "requesting";
  recordingRef.current = recording;

  useEffect(() => {
    if (recorder.transcript) setTranscript(recorder.transcript);
  }, [recorder.transcript]);

  useEffect(() => {
    if (!recorder.blob || recorder.status !== "idle") return;
    void (async () => {
      const url = await blobToDataUrl(recorder.blob!);
      setMediaUrl(url);
      setMediaMime(recorder.blob!.type || "audio/webm");
      setMediaName("voice-note.webm");
      markAccountDirty();
    })();
  }, [recorder.blob, recorder.status]);

  const snapshot = (): CaptureDraft => ({
    mode,
    title,
    body,
    transcript,
    mediaUrl,
    mediaMime,
    mediaName,
    tags,
    emoji,
    color,
    sourceUrl,
    sourceKind,
  });
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const hasContent = () =>
    Boolean(title.trim() || body.trim() || transcript.trim() || mediaUrl || sourceUrl.trim());

  const save = useMutation({
    mutationFn: createMemory,
    onSuccess: async (res) => {
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Captured into the mesh");
      skipDraft.current = true;
      setTitle("");
      setBody("");
      setTranscript("");
      setMediaUrl(null);
      setMediaMime(null);
      setMediaName(null);
      setTags([]);
      setSourceUrl("");
      setSourceKind(null);
      setExtractWarning(null);
      setExtractedSite(null);
      setTranscriptFound(false);
      await clearAccountDraft();
      await qc.invalidateQueries({ queryKey: ["graph"] });
      await qc.invalidateQueries({ queryKey: ["dashboard"] });
      await qc.invalidateQueries({ queryKey: ["memories"] });
      onCreated?.(res.memory.id);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Could not save that memory"),
  });

  const pull = useMutation({
    mutationFn: extractLink,
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setTitle(res.organized.title);
      setBody(res.organized.summary || res.extracted.body);
      setTranscript(res.extracted.transcript ?? "");
      setTags(res.organized.tags);
      setSourceUrl(res.extracted.url);
      setSourceKind(res.extracted.sourceKind);
      setExtractWarning(res.extracted.warning);
      setExtractedSite(res.extracted.site);
      setTranscriptFound(res.extracted.transcriptFound);
      toast.success(
        res.extracted.transcriptFound
          ? "Pulled the public transcript into your mesh"
          : "Pulled the page into your mesh",
      );
    },
    onError: () => toast.error("Couldn’t read that link"),
  });

  const suggest = useMutation({
    mutationFn: suggestMemoryTags,
    onSuccess: (res) => setTags(res.tags),
  });

  function applyItemToForm(item: IngestItem) {
    if (item.warning && !item.body && !item.mediaUrl && !item.sourceUrl) {
      toast.error(item.warning);
      return;
    }
    if (item.warning) toast.message(item.warning);
    setMode(kindToMode(item.kind));
    if (item.title) setTitle((prev) => prev.trim() || item.title);
    if (item.body) setBody(item.body);
    if (item.mediaUrl) {
      setMediaUrl(item.mediaUrl);
      setMediaMime(item.mediaMime);
      setMediaName(item.mediaName);
    } else if (item.mediaName) {
      setMediaName(item.mediaName);
      setMediaMime(item.mediaMime);
    }
    if (item.sourceUrl) {
      setSourceUrl(item.sourceUrl);
      setMode("link");
    }
  }

  const applyItemsRef = useRef<(items: IngestItem[]) => void>(() => {});
  applyItemsRef.current = (items: IngestItem[]) => {
    const usable = items.filter((item) => item.body || item.mediaUrl || item.sourceUrl || item.warning);
    if (!usable.length) return;
    for (const item of usable) {
      if (item.warning && !item.body && !item.mediaUrl && !item.sourceUrl) toast.error(item.warning);
    }
    const ready = usable.filter((item) => item.body || item.mediaUrl || item.sourceUrl);
    if (!ready.length) return;

    if (ready.length === 1 && ready[0].kind === "text" && ready[0].body) {
      const item = ready[0];
      if (item.warning) toast.message(item.warning);
      setMode("text");
      setBody((prev) => (prev.trim() ? `${prev.trim()}\n\n${item.body}` : item.body));
      if (item.title) setTitle((prev) => prev.trim() || item.title);
      if (item.mediaName) setMediaName(item.mediaName);
      toast.success(`Ready · ${formatTextStat(item.body)}`);
      return;
    }

    if (ready.length === 1 && ready[0].kind === "link" && ready[0].sourceUrl) {
      setMode("link");
      setSourceUrl(ready[0].sourceUrl);
      pull.mutate({ data: { url: ready[0].sourceUrl, tags } });
      return;
    }

    const occupied = Boolean(
      title.trim() || body.trim() || transcript.trim() || mediaUrl || sourceUrl.trim(),
    );
    if (!occupied) {
      applyItemToForm(ready[0]);
      setQueue((q) => [...q, ...ready.slice(1)]);
    } else {
      setQueue((q) => [...q, ...ready]);
    }
    toast.success(ready.length === 1 ? `Imported ${ready[0].mediaName || ready[0].title}` : `Imported ${ready.length} files`);
  };

  useEffect(() => {
    let cancelled = false;
    void getAccountDraft().then((d) => {
      if (cancelled || restored || !d.capture) {
        setRestored(true);
        return;
      }
      const c = d.capture;
      if (c.title || c.body || c.transcript || c.mediaUrl || c.sourceUrl) {
        setMode((c.mode as Mode) || defaultMode);
        setTitle(c.title);
        setBody(c.body);
        setTranscript(c.transcript);
        setMediaUrl(c.mediaUrl);
        setMediaMime(c.mediaMime);
        setMediaName(c.mediaName);
        setTags(c.tags ?? []);
        setEmoji(c.emoji || "✨");
        setColor(c.color || "cyan");
        setSourceUrl(c.sourceUrl || "");
        toast.message("Restored an unsaved capture from this account");
      }
      setRestored(true);
    });
    return () => {
      cancelled = true;
    };
    // restore once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restored || seedUsed.current) return;
    if (!seed?.title && !seed?.body && !seed?.sourceUrl) return;
    seedUsed.current = true;
    const items: IngestItem[] = [];
    if (seed.sourceUrl) items.push(ingestTextBlock(seed.sourceUrl));
    else if (seed.body) {
      const item = ingestTextBlock(seed.body);
      if (seed.title) item.title = seed.title;
      items.push(item);
    } else if (seed.title) {
      setTitle(seed.title);
    }
    if (items.length) applyItemsRef.current(items);
  }, [restored, seed?.title, seed?.body, seed?.sourceUrl]);

  useEffect(() => {
    return subscribeImport((items) => applyItemsRef.current(items));
  }, []);

  useEffect(() => {
    return () => {
      recorder.stop();
      const draft = snapshotRef.current();
      if (skipDraft.current) return;
      if (draft.title || draft.body || draft.transcript || draft.mediaUrl || draft.sourceUrl) {
        void saveAccountDraft({ data: { capture: draft } });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restored || skipDraft.current) return;
    markAccountDirty();
    const t = window.setTimeout(() => {
      if (!hasContent()) {
        void saveAccountDraft({ data: { capture: null } });
        return;
      }
      void saveAccountDraft({ data: { capture: snapshot() } });
    }, 1400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, title, body, transcript, mediaUrl, mediaMime, mediaName, tags, emoji, color, sourceUrl, restored]);

  useEffect(() => {
    return registerAccountFlusher(async () => {
      if (recordingRef.current) recorder.stop();
      const draft = snapshotRef.current();
      const content = Boolean(
        draft.title.trim() || draft.body.trim() || draft.transcript.trim() || draft.mediaUrl || draft.sourceUrl.trim(),
      );
      if (content) await saveAccountDraft({ data: { capture: draft } });
      else await saveAccountDraft({ data: { capture: null } });
    });
  });

  useEffect(() => {
    function isTypingTarget(el: EventTarget | null) {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
    }

    async function onPaste(e: ClipboardEvent) {
      const typing = isTypingTarget(e.target);
      const dt = e.clipboardData;
      const hasFiles = Boolean(dt && (dt.files.length || Array.from(dt.items ?? []).some((i) => i.kind === "file")));
      if (typing && !hasFiles) return;
      if (!dt) return;
      const items = await ingestClipboardEvent(e);
      if (!items.length) return;
      if (hasFiles || !typing) {
        e.preventDefault();
        applyItemsRef.current(items);
      }
    }

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  async function importFromFiles() {
    const picked = await pickFilesFromDevice();
    if (picked === "cancelled") return;
    if (picked === "fallback") {
      fileRef.current?.click();
      return;
    }
    applyItemsRef.current(await ingestFiles(picked));
  }

  async function pasteFromClipboard() {
    try {
      const items = await readSystemClipboard();
      if (!items.length) {
        toast.message("Clipboard is empty — copy something, then paste.");
        return;
      }
      applyItemsRef.current(items);
    } catch {
      toast.error("Allow clipboard access, or paste with Cmd/Ctrl+V.");
    }
  }

  async function onDropped(dt: DataTransfer) {
    applyItemsRef.current(await ingestDataTransfer(dt));
  }

  function payloadFromForm(): CreateMemoryInput {
    const text = body.trim() || transcript.trim();
    const memoryType = (
      mode === "link" || sourceUrl ? "link" : mode === "thought" ? "thought" : mode
    ) as MemoryType;
    return {
      title: title.trim() || undefined,
      body: text || title || mediaName || sourceUrl || "Captured memory",
      memoryType,
      transcript: transcript.trim() || null,
      mediaUrl,
      mediaMime,
      mediaName,
      emoji,
      color,
      tags,
      sourceUrl: sourceUrl.trim() || (isBareUrl(body) ? body.trim() : null),
      sourceKind,
      conceptId: guide?.conceptId ?? null,
    };
  }

  function payloadFromItem(item: IngestItem): CreateMemoryInput {
    const memoryType = (item.kind === "link" ? "link" : item.kind) as MemoryType;
    return {
      title: item.title || undefined,
      body: item.body || item.title || item.mediaName || item.sourceUrl || "Imported memory",
      memoryType,
      transcript: null,
      mediaUrl: item.mediaUrl,
      mediaMime: item.mediaMime,
      mediaName: item.mediaName,
      emoji,
      color,
      tags,
      sourceUrl: item.sourceUrl,
      sourceKind: item.kind === "link" ? sourceKind : null,
      conceptId: guide?.conceptId ?? null,
    };
  }

  function submit() {
    if (mode === "link" || isBareUrl(body) || isBareUrl(sourceUrl)) {
      const url = sourceUrl.trim() || body.trim();
      if (!title.trim() && url && !pull.data) {
        pull.mutate({ data: { url, tags } });
        return;
      }
    }
    const text = body.trim() || transcript.trim();
    if (!text && !mediaUrl && !sourceUrl.trim()) {
      toast.error("Add a thought, recording, link, or file first.");
      return;
    }
    save.mutate({ data: payloadFromForm() });
  }

  async function saveAll() {
    const payloads = [];
    if (hasContent()) payloads.push(payloadFromForm());
    for (const item of queue) {
      if (item.body || item.mediaUrl || item.sourceUrl) payloads.push(payloadFromItem(item));
    }
    if (!payloads.length) {
      toast.error("Nothing to save yet.");
      return;
    }
    setBatch({ total: payloads.length, done: 0 });
    let lastId: string | null = null;
    let failed = 0;
    for (let i = 0; i < payloads.length; i++) {
      const payload = payloads[i];
      if (!payload) continue;
      try {
        const res = await createMemory({ data: payload });
        if (!res.ok) {
          failed += 1;
          toast.error(res.error);
        } else {
          lastId = res.memory.id;
        }
      } catch (err) {
        failed += 1;
        toast.error(err instanceof Error ? err.message : "Could not save a file");
      }
      setBatch({ total: payloads.length, done: i + 1 });
    }
    skipDraft.current = true;
    setTitle("");
    setBody("");
    setTranscript("");
    setMediaUrl(null);
    setMediaMime(null);
    setMediaName(null);
    setTags([]);
    setSourceUrl("");
    setSourceKind(null);
    setQueue([]);
    setBatch(null);
    await clearAccountDraft();
    await qc.invalidateQueries({ queryKey: ["graph"] });
    await qc.invalidateQueries({ queryKey: ["dashboard"] });
    await qc.invalidateQueries({ queryKey: ["memories"] });
    if (failed && failed === payloads.length) return;
    toast.success(
      failed
        ? `Saved ${payloads.length - failed} of ${payloads.length} into the mesh`
        : `Saved ${payloads.length} into the mesh`,
    );
    if (lastId) onCreated?.(lastId);
  }

  const bodyStat = formatTextStat(body);
  const busy = save.isPending || pull.isPending || Boolean(batch);

  return (
    <div className="mx-auto w-full max-w-xl">
      {guide ? (
        <p className="mb-4 text-sm text-muted-foreground">
          This node will live on <span className="text-foreground">{guide.mapName}</span>. Pick how you
          want to capture it.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-card/70 p-1">
        {MODES.map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-xs",
                mode === m.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {m.label}
            </button>
          );
        })}
      </div>

      <input
        ref={fileRef}
        type="file"
        className="hidden"
        multiple
        onChange={(e) => {
          const files = e.target.files;
          if (files?.length) void ingestFiles(files).then((items) => applyItemsRef.current(items));
          e.target.value = "";
        }}
      />

      <div
        onDragEnter={(e) => {
          if (!canDropImport(e.dataTransfer)) return;
          e.preventDefault();
          setDropHover(true);
        }}
        onDragOver={(e) => {
          if (!canDropImport(e.dataTransfer)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setDropHover(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setDropHover(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDropHover(false);
          void onDropped(e.dataTransfer);
        }}
        className={cn(
          "mt-4 rounded-xl border border-dashed bg-card/50 p-4 transition-colors",
          dropHover ? "border-primary bg-primary/10" : "border-border",
        )}
      >
        <p className="text-sm text-foreground">Bring it in from anywhere</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Files app, another app, a photo, or a long paste. Drop it here or paste with Cmd/Ctrl+V.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" className="min-h-11" onClick={() => void importFromFiles()}>
            <FolderOpen className="size-4" />
            Import from Files
          </Button>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void pasteFromClipboard()}>
            <ClipboardPaste className="size-4" />
            Paste
          </Button>
        </div>
      </div>

      {queue.length ? (
        <div className="mt-3 rounded-xl border border-border bg-card/70 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {queue.length} more file{queue.length === 1 ? "" : "s"} waiting
            </p>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setQueue([])}
            >
              Clear
            </button>
          </div>
          <ul className="mt-2 space-y-1.5">
            {queue.map((item, i) => (
              <li key={`${item.mediaName ?? item.title}-${i}`} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-foreground">
                  {item.mediaName || item.title || "Untitled"}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {item.kind}
                    {item.bytes ? ` · ${formatBytes(item.bytes)}` : ""}
                  </span>
                </span>
                <button
                  type="button"
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                  aria-label="Remove file"
                  onClick={() => setQueue((q) => q.filter((_, idx) => idx !== i))}
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4">
        <p className="mb-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Icon, color, and name — yours to choose
        </p>
        <GlyphRow emoji={emoji} color={color} onEmoji={setEmoji} onColor={setColor} />
      </div>

      {guide ? (
        <button
          type="button"
          className="mt-4 w-full rounded-xl border border-dashed border-border bg-card/50 p-3 text-left"
          onClick={() => {
            setTitle(guide.exampleTitle);
            setBody(guide.exampleBody);
            setMode("text");
          }}
        >
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Try an example</p>
          <p className="mt-1 text-sm text-foreground">{guide.exampleTitle}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{guide.exampleBody}</p>
        </button>
      ) : null}

      <div className="mt-6">
        {mode === "voice" ? (
          <div className="flex flex-col items-center gap-4">
            {guide ? (
              <p className="text-sm text-foreground">
                Recording will be added to: <span className="font-medium">{guide.mapName}</span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Recording saves as a voice memory on your account.</p>
            )}
            <button
              type="button"
              onClick={() => {
                if (recorder.status === "recording") recorder.stop();
                else if (recorder.status === "paused") recorder.resume();
                else void recorder.start();
              }}
              className={cn(
                "relative flex size-28 items-center justify-center rounded-full border border-primary/40 bg-secondary text-primary shadow-soft",
                recording && "bg-problem/20 text-problem",
              )}
              aria-label={recorder.status === "recording" ? "Stop recording" : "Start recording"}
            >
              {recorder.status === "recording" ? (
                <span className="absolute inset-0 animate-pulse-ring rounded-full bg-problem/30" />
              ) : null}
              {recorder.status === "recording" ? (
                <Square className="size-8 fill-current" />
              ) : recorder.status === "paused" ? (
                <Play className="size-10" />
              ) : (
                <Mic className="size-10" />
              )}
            </button>
            <div className="flex h-8 w-full max-w-xs items-end gap-0.5" aria-hidden="true">
              {recorder.levels.map((v, i) => (
                <span
                  key={i}
                  className={cn(
                    "flex-1 rounded-sm bg-primary/80",
                    recorder.status === "recording" ? "opacity-100" : "opacity-35",
                  )}
                  style={{ height: `${Math.round(v * 100)}%` }}
                />
              ))}
            </div>
            <p className="font-mono text-sm tabular-nums text-foreground">{formatElapsed(recorder.elapsedMs)}</p>
            <p className="text-sm text-muted-foreground">
              {recorder.status === "recording"
                ? "Listening — press to stop"
                : recorder.status === "paused"
                  ? "Paused"
                  : recorder.status === "requesting"
                    ? "Asking for the microphone…"
                    : "Press to record. Speak naturally."}
            </p>
            {recorder.status === "recording" || recorder.status === "paused" ? (
              <div className="flex flex-wrap justify-center gap-2">
                {recorder.status === "recording" ? (
                  <Button type="button" size="sm" variant="secondary" onClick={recorder.pause}>
                    <Pause className="size-4" />
                    Pause
                  </Button>
                ) : (
                  <Button type="button" size="sm" variant="secondary" onClick={recorder.resume}>
                    <Play className="size-4" />
                    Resume
                  </Button>
                )}
                <Button type="button" size="sm" variant="destructive" onClick={recorder.stop}>
                  <Square className="size-4" />
                  Stop
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={recorder.cancel}>
                  Cancel
                </Button>
              </div>
            ) : null}
            {recorder.error ? <p className="text-sm text-destructive">{recorder.error}</p> : null}
            {recorder.status === "denied" ? (
              <p className="text-center text-xs text-muted-foreground">
                Allow the microphone in your browser’s site settings, then press record again.
              </p>
            ) : null}
            {recorder.blobUrl ? <audio controls src={recorder.blobUrl} className="w-full" /> : mediaUrl ? <audio controls src={mediaUrl} className="w-full" /> : null}
            <Textarea
              placeholder="Transcript appears here. You can edit it. It is saved to your account."
              value={transcript || body}
              onChange={(e) => {
                setTranscript(e.target.value);
                setBody(e.target.value);
                recorder.setTranscript(e.target.value);
              }}
            />
          </div>
        ) : mode === "link" ? (
          <div className="space-y-3">
            <Input
              name="sourceUrl"
              type="url"
              placeholder="Paste a podcast, article, or YouTube link"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
            />
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              disabled={pull.isPending || !sourceUrl.trim()}
              onClick={() => pull.mutate({ data: { url: sourceUrl.trim(), tags } })}
            >
              {pull.isPending ? "Reading the page…" : "Pull into the mesh"}
            </Button>
            {extractedSite ? (
              <p className="text-xs text-muted-foreground">
                From {extractedSite}
                {transcriptFound ? " · public transcript found" : " · no public transcript"}
              </p>
            ) : null}
            {extractWarning ? <p className="text-xs text-gold">{extractWarning}</p> : null}
            <Input
              name="nodeTitle"
              placeholder="Name this node"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Textarea
              placeholder="What should the mesh remember from this?"
              name="nodeBody"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            {transcript ? (
              <Textarea
                placeholder="Transcript"
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                className="min-h-28"
              />
            ) : null}
          </div>
        ) : mode === "photo" || mode === "video" || mode === "document" ? (
          <div className="space-y-3">
            <label
              className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-4 text-sm text-muted-foreground hover:border-primary/40"
              onDragOver={(e) => {
                if (!canDropImport(e.dataTransfer)) return;
                e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void onDropped(e.dataTransfer);
              }}
            >
              Drop from Files or another app, or tap to choose a {mode}
              <input
                type="file"
                className="hidden"
                multiple
                accept={mode === "photo" ? "image/*" : mode === "video" ? "video/*" : undefined}
                onChange={(e) => {
                  const files = e.target.files;
                  if (files?.length) void ingestFiles(files).then((items) => applyItemsRef.current(items));
                  e.target.value = "";
                }}
              />
            </label>
            {mediaUrl && mediaMime?.startsWith("image/") ? (
              <img src={mediaUrl} alt="" className="max-h-48 w-full rounded-lg object-cover" />
            ) : null}
            {mediaUrl && mediaMime?.startsWith("video/") ? (
              <video src={mediaUrl} controls className="w-full rounded-lg" />
            ) : null}
            {mediaName ? <p className="text-xs text-muted-foreground">{mediaName}</p> : null}
            <Input
              name="nodeTitle"
              placeholder="Name this node"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Textarea placeholder="What should the mesh remember about this?" name="nodeBody" value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
        ) : (
          <div className="space-y-3">
            <Input
              name="nodeTitle"
              placeholder="Name this node"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Textarea
              name="nodeBody"
              placeholder={
                mode === "thought"
                  ? "A quick thought. One sentence is enough."
                  : "Write in your own words, or paste a long note, article, or transcript…"
              }
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className={cn(
                mode === "thought" ? "min-h-24" : "min-h-40",
                body.length > 1200 && "min-h-64",
                body.length > 6000 && "min-h-[50vh] max-h-[70vh]",
              )}
            />
            {body.length > 280 ? (
              <p className="text-xs tabular-nums text-muted-foreground">{bodyStat}</p>
            ) : null}
            {mediaName ? (
              <p className="text-xs text-muted-foreground">From {mediaName}</p>
            ) : null}
            {isBareUrl(body) ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setMode("link");
                  setSourceUrl(body.trim());
                  pull.mutate({ data: { url: body.trim(), tags } });
                }}
                disabled={pull.isPending}
              >
                {pull.isPending ? "Reading the page…" : "This looks like a link — pull it in"}
              </Button>
            ) : null}
          </div>
        )}
      </div>

      {mode !== "text" && mode !== "thought" && body.length > 280 ? (
        <p className="mt-2 text-xs tabular-nums text-muted-foreground">{bodyStat}</p>
      ) : null}

      <div className="mt-5">
        <TagEditor
          tags={tags}
          onChange={setTags}
          onSuggest={() =>
            suggest.mutate({
              data: {
                text: [title, body, transcript].filter(Boolean).join("\n").slice(0, 8000),
                existing: tags,
              },
            })
          }
          suggesting={suggest.isPending}
        />
      </div>

      {queue.length ? (
        <Button className="mt-5 w-full" size="lg" onClick={() => void saveAll()} disabled={busy}>
          {batch ? `Saving ${batch.done} of ${batch.total}…` : `Save ${queue.length + (hasContent() ? 1 : 0)} into the mesh`}
        </Button>
      ) : (
        <Button className="mt-5 w-full" size="lg" onClick={submit} disabled={busy}>
          {save.isPending ? "Weaving into the mesh…" : "Save node"}
        </Button>
      )}
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Saved to this account. Signing out writes any unsaved recording first.
      </p>
    </div>
  );
}
