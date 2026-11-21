import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Captions, Loader2, Search } from "lucide-react";
import type { Memory } from "@/lib/types";
import type { TranscriptSegment } from "@/lib/digestion/viewer-types";
import { formatClock } from "@/lib/digestion/media-core";
import { useMemoryMedia } from "./use-memory-media";
import { isPreviewMemory, Notice, useArtifactState, ViewerFrame } from "./viewer-kit";

type Props = { memory: Memory; compact?: boolean };
type Meta = { kind?: "audio" | "video"; durationSec?: number; segments?: TranscriptSegment[]; originalStored?: boolean; transcriptSource?: "segments" | "text" | "none"; previewUnsupported?: boolean; sessionKey?: string };

/** Player (stored original or this tab's local file) + timed transcript with click-to-seek and resume. */
export function MediaDigestView({ memory, compact }: Props) {
  const meta = memory.extractedMetadata as Meta;
  const media = useMemoryMedia(memory.id, memory.hasMedia);
  const { state, update } = useArtifactState<{ lastSec?: number }>(memory);
  const [sessionUrl, setSessionUrl] = useState<string | null>(null);
  const player = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [now, setNow] = useState(0);
  const [query, setQuery] = useState("");
  const [tx, setTx] = useState<{ busy: boolean; progress?: string; error?: string }>({ busy: false });
  const lastSaved = useRef(state.lastSec ?? 0);
  const qc = useQueryClient();
  const segments = meta.segments ?? [];
  const isVideo = (meta.kind ?? ((memory.mediaMime ?? "").startsWith("video/") ? "video" : "audio")) === "video";

  useEffect(() => {
    if (memory.hasMedia || !meta.sessionKey) return;
    void import("@/lib/digestion/media").then((m) => setSessionUrl(m.sessionMediaUrl(meta.sessionKey)));
  }, [memory.hasMedia, meta.sessionKey]);

  const url = media.data?.mediaUrl ?? sessionUrl;
  const q = query.trim().toLowerCase();
  const active = useMemo(() => segments.findIndex((s) => now >= s.startSec && now < Math.max(s.endSec, s.startSec + 0.5)), [segments, now]);

  const seek = (sec: number) => {
    const el = player.current;
    if (!el) return;
    el.currentTime = sec;
    void el.play().catch(() => undefined);
  };

  const onTime = () => {
    const t = player.current?.currentTime ?? 0;
    setNow(t);
    if (Math.abs(t - lastSaved.current) >= 5) {
      lastSaved.current = t;
      update({ lastSec: Math.round(t) });
    }
  };

  const transcribe = async () => {
    if (!url) return;
    setTx({ busy: true, progress: "Decoding…" });
    try {
      const blob = await (await fetch(url)).blob();
      const { transcribeMediaFile } = await import("@/lib/digestion/media");
      const res = await transcribeMediaFile(blob, (d, t) => setTx({ busy: true, progress: `Transcribing ${Math.min(d + 1, t)}/${t}` }));
      if (!res.ok) return setTx({ busy: false, error: res.error });
      const { saveMediaTranscript } = await import("@/lib/server/vision");
      const saved = await saveMediaTranscript({ data: { id: memory.id, segments: res.segments, text: res.text, source: res.source } });
      if (!saved.ok) return setTx({ busy: false, error: saved.error });
      setTx({ busy: false, progress: res.truncated ? "Transcribed the first 30 minutes." : undefined });
      await qc.invalidateQueries({ queryKey: ["memory", memory.id] });
    } catch {
      setTx({ busy: false, error: "Transcription failed; try again" });
    }
  };

  return (
    <ViewerFrame
      compact={compact}
      toolbar={
        <span className="text-xs text-muted-foreground">
          {isVideo ? "Video" : "Audio"}
          {meta.durationSec ? ` · ${formatClock(meta.durationSec)}` : ""}
          {segments.length ? ` · ${segments.length} segments` : ""}
        </span>
      }
    >
      {url && !meta.previewUnsupported ? (
        isVideo ? (
          <video
            ref={player}
            className="w-full rounded-xl bg-black"
            controls
            playsInline
            preload="metadata"
            src={url}
            poster={memory.thumbUrl ?? undefined}
            onTimeUpdate={onTime}
            onLoadedMetadata={() => {
              if (state.lastSec && player.current) player.current.currentTime = state.lastSec;
            }}
          />
        ) : (
          <audio
            ref={player}
            className="w-full"
            controls
            preload="metadata"
            src={url}
            onTimeUpdate={onTime}
            onLoadedMetadata={() => {
              if (state.lastSec && player.current) player.current.currentTime = state.lastSec;
            }}
          />
        )
      ) : (
        <>
          {memory.thumbUrl ? <img src={memory.thumbUrl} alt={memory.title} className="w-full rounded-xl bg-muted object-contain" /> : null}
          <Notice>
            {media.isPending && memory.hasMedia
              ? "Loading…"
              : meta.previewUnsupported
                ? "This browser can't play this format; the poster and transcript are kept."
                : "Original not stored (over 3 MB). It plays only in the tab it was added from."}
          </Notice>
        </>
      )}
      {segments.length ? (
        <>
          <label className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1">
            <Search className="size-3.5 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the transcript" aria-label="Search the transcript" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </label>
          <ol className={`mt-2 space-y-0.5 overflow-y-auto ${compact ? "max-h-48" : "max-h-[50dvh]"}`}>
            {segments.map((s, i) => {
              const hit = q && s.text.toLowerCase().includes(q);
              return (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => seek(s.startSec)}
                    disabled={!url}
                    className={`flex w-full gap-3 rounded-md px-2 py-1 text-left text-sm ${i === active ? "bg-primary/15" : hit ? "bg-amber-200/40 dark:bg-amber-500/20" : "hover:bg-muted"} ${q && !hit ? "opacity-50" : ""}`}
                  >
                    <span className="w-12 shrink-0 font-mono text-xs text-primary">{formatClock(s.startSec)}</span>
                    <span className="min-w-0 flex-1">{s.speaker ? <b className="mr-1">{s.speaker}:</b> : null}{s.text}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </>
      ) : memory.transcript ? (
        <blockquote className="mt-3 border-l-2 border-primary/40 pl-4 text-sm italic text-muted-foreground">{memory.transcript}</blockquote>
      ) : null}
      {!segments.length && url && !isPreviewMemory(memory) ? (
        <button type="button" disabled={tx.busy} onClick={() => void transcribe()} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60">
          {tx.busy ? <Loader2 className="size-4 animate-spin" /> : <Captions className="size-4" />} {tx.busy ? tx.progress : memory.transcript ? "Get timed transcript" : "Transcribe"}
        </button>
      ) : null}
      {!tx.busy && tx.progress ? <p className="mt-1 text-xs text-muted-foreground">{tx.progress}</p> : null}
      {tx.error ? <p role="alert" className="mt-1 text-xs text-destructive">{tx.error}</p> : null}
      {meta.transcriptSource === "text" && !segments.length ? <p className="mt-1 text-[11px] text-muted-foreground">Timed segments need LLM_API_KEY (OpenAI whisper); this transcript is text only.</p> : null}
    </ViewerFrame>
  );
}
