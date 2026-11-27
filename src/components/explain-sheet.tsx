import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Pause, Play, RotateCcw, RotateCw, Sparkles, Volume2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  closeExplain,
  getExplainAudio,
  getExplainRequest,
  openExplain,
  subscribeExplain,
  type ExplainRequest,
} from "@/lib/explain-bus";
import { formatClock, nextSpeed, type ExplainFailure, type ExplainResult } from "@/lib/explain";
import { explainItem } from "@/lib/server/explain";
import { setAudioSessionType, speakNative, type VoiceChoice } from "@/lib/voice-synth";
import { cn } from "@/lib/utils";

/** Opens the Explain sheet. Stops the click so it never triggers the card or node underneath. */
export function ExplainButton({
  targetType,
  targetId,
  title,
  startMode,
  label = "Explain",
  className,
  iconOnly = false,
}: ExplainRequest & { label?: string; className?: string; iconOnly?: boolean }) {
  return (
    <button
      type="button"
      aria-label={iconOnly ? `${label}: ${title}` : undefined}
      className={cn(
        "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md text-sm text-primary hover:bg-secondary",
        iconOnly ? "size-9" : "px-2.5",
        className,
      )}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        openExplain({ targetType, targetId, title, startMode });
      }}
    >
      <Sparkles className="size-4" aria-hidden />
      {iconOnly ? null : <span>{label}</span>}
    </button>
  );
}

function savedVoice(): VoiceChoice | undefined {
  try {
    const v = localStorage.getItem("mm-voice");
    return v === "male" || v === "female" ? v : undefined;
  } catch {
    return undefined;
  }
}

/** Mounted once at the app root; renders whichever item was last opened. */
export function ExplainHost() {
  const req = useSyncExternalStore(subscribeExplain, getExplainRequest, () => null);
  if (!req) return null;
  return <ExplainSheet key={`${req.targetType}:${req.targetId}`} req={req} />;
}

type Mode = "summary" | "audio";

function ExplainSheet({ req }: { req: ExplainRequest }) {
  const [mode, setMode] = useState<Mode>(req.startMode ?? "summary");
  const voice = useMemo(() => savedVoice(), []);
  const [copied, setCopied] = useState(false);
  const wantAuto = useRef(req.startMode === "audio");

  const summaryQ = useQuery({
    queryKey: ["explain", req.targetType, req.targetId, "summary"],
    queryFn: () => explainItem({ data: { targetType: req.targetType, targetId: req.targetId, mode: "summary" } }),
    staleTime: Infinity,
    retry: false,
  });
  const audioQ = useQuery({
    queryKey: ["explain", req.targetType, req.targetId, "audio", voice ?? "saved"],
    queryFn: () => explainItem({ data: { targetType: req.targetType, targetId: req.targetId, mode: "audio", voice } }),
    enabled: mode === "audio",
    staleTime: Infinity,
    retry: false,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeExplain();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sum = summaryQ.data;
  const summary: ExplainResult | null = sum && sum.ok ? sum : null;
  const summaryError = summaryQ.isError ? "Could not load the summary." : sum && !sum.ok ? (sum as ExplainFailure).error : null;
  const copy = async () => {
    if (!summary) return;
    const text = `${summary.summary}\n\n${summary.bullets.map((b) => `• ${b}`).join("\n")}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard blocked: nothing to do
    }
  };

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={`Explain ${req.title}`} onPointerDown={(e) => e.stopPropagation()}>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/55" onClick={closeExplain} />
      <div className="clear-bottom-nav absolute inset-x-0 flex max-h-[min(85dvh,44rem)] flex-col rounded-t-2xl border border-border bg-background/97 shadow-soft backdrop-blur-md md:inset-y-0 md:bottom-0 md:left-auto md:right-0 md:max-h-none md:w-[26rem] md:rounded-none md:border-y-0 md:border-r-0">
        <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] uppercase tracking-wide text-primary">{req.targetType === "branch" ? "Branch" : "Memory"}</span>
            <h2 className="mt-1 line-clamp-2 font-display text-lg leading-snug">{req.title}</h2>
          </div>
          <button type="button" onClick={closeExplain} aria-label="Close" className="grid size-11 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>
        <div role="tablist" className="flex gap-1 px-4 pt-3">
          {([["summary", "Summarize", Sparkles], ["audio", "Audio Overview", Volume2]] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={mode === id}
              onClick={() => setMode(id)}
              className={cn("inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full text-sm", mode === id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}
            >
              <Icon className="size-4" aria-hidden /> {label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {mode === "summary" ? (
            summaryQ.isPending ? (
              <Loading label="Summarizing…" />
            ) : summary ? (
              <>
                <p className="text-sm leading-relaxed text-foreground">{summary.summary}</p>
                {summary.bullets.length ? (
                  <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-foreground/90">
                    {summary.bullets.map((b, i) => <li key={i}>{b}</li>)}
                  </ul>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" className="min-h-10" onClick={() => void copy()}>
                    {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy summary"}
                  </Button>
                  <Button type="button" size="sm" className="min-h-10" onClick={() => setMode("audio")}>
                    <Volume2 className="size-4" /> Play audio overview
                  </Button>
                </div>
              </>
            ) : (
              <p role="alert" className="text-sm text-muted-foreground">{summaryError ?? "Nothing to summarize yet."}</p>
            )
          ) : (
            <AudioPane
              loading={audioQ.isPending}
              data={audioQ.data && audioQ.data.ok ? audioQ.data : null}
              error={audioQ.isError ? "Could not load the audio overview." : audioQ.data && !audioQ.data.ok ? (audioQ.data as ExplainFailure).error : null}
              voice={voice ?? "female"}
              autoplay={wantAuto}
              onRetry={() => void audioQ.refetch()}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div role="status" className="space-y-2" aria-label={label}>
      <div className="h-4 w-11/12 animate-pulse rounded bg-muted" />
      <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
      <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
      <p className="pt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function AudioPane({
  loading,
  data,
  error,
  voice,
  autoplay,
  onRetry,
}: {
  loading: boolean;
  data: ExplainResult | null;
  error: string | null;
  voice: VoiceChoice;
  autoplay: { current: boolean };
  onRetry: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState<number>(1);
  const stopNative = useRef<() => void>(() => {});
  const script = data?.script ?? "";
  const url = data?.audioUrl ?? null;
  const el = getExplainAudio();

  // Mirror the shared audio element into state; always leave it paused on close.
  useEffect(() => {
    const a = getExplainAudio();
    if (!a || !url) return;
    const sync = () => {
      setTime(a.currentTime || 0);
      setDuration(Number.isFinite(a.duration) ? a.duration : 0);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    a.addEventListener("timeupdate", sync);
    a.addEventListener("loadedmetadata", sync);
    a.addEventListener("durationchange", sync);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onPause);
    return () => {
      a.removeEventListener("timeupdate", sync);
      a.removeEventListener("loadedmetadata", sync);
      a.removeEventListener("durationchange", sync);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onPause);
    };
  }, [url]);

  useEffect(() => () => {
    stopNative.current();
    try { getExplainAudio()?.pause(); } catch { /* ignore */ }
  }, []);

  const playNative = () => {
    if (!script) return;
    setPlaying(true);
    stopNative.current = speakNative(script, voice, { onStart: () => {}, onEnd: () => setPlaying(false), onError: () => setPlaying(false) });
  };
  const toggle = () => {
    if (!data) return;
    if (!url || !el) {
      if (playing) {
        stopNative.current();
        setPlaying(false);
      } else playNative();
      return;
    }
    if (playing) return el.pause();
    setAudioSessionType("playback"); // plays through the speaker/Bluetooth even with the silent switch on
    if (el.src !== url) el.src = url;
    el.playbackRate = rate;
    const p = el.play();
    if (p) void p.catch(() => playNative());
  };

  // Started from the audio shortcut: play as soon as the audio arrives (the element was unlocked by that tap).
  useEffect(() => {
    if (!data || !autoplay.current) return;
    autoplay.current = false;
    toggle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const skip = (s: number) => {
    if (el && url) el.currentTime = Math.max(0, Math.min(duration || Infinity, el.currentTime + s));
  };
  const cycle = () => {
    const r = nextSpeed(rate);
    setRate(r);
    if (el) el.playbackRate = r;
  };

  // Approximate sync: highlight the sentence whose word range contains the playback position.
  const sentences = useMemo(() => script.match(/[^.!?]+[.!?]*\s*/g)?.map((s) => s.trim()).filter(Boolean) ?? [], [script]);
  const active = useMemo(() => {
    if (!url || !duration || !sentences.length) return -1;
    const total = sentences.reduce((n, s) => n + s.split(/\s+/).length, 0) || 1;
    let acc = 0;
    for (let i = 0; i < sentences.length; i++) {
      acc += sentences[i]!.split(/\s+/).length;
      if (time / duration <= acc / total) return i;
    }
    return sentences.length - 1;
  }, [url, duration, time, sentences]);

  if (loading) return <Loading label="Writing your overview…" />;
  if (error || !data) {
    return (
      <div role="alert" className="space-y-2 text-sm text-muted-foreground">
        <p>{error ?? "No overview available."}</p>
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>Try again</Button>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center justify-center gap-3">
        <button type="button" aria-label="Back 10 seconds" onClick={() => skip(-10)} disabled={!url} className="grid size-11 place-items-center rounded-full text-muted-foreground hover:text-foreground disabled:opacity-40"><RotateCcw className="size-5" /></button>
        <button type="button" aria-label={playing ? "Pause" : "Play"} onClick={toggle} className="grid size-14 place-items-center rounded-full bg-primary text-primary-foreground">
          {playing ? <Pause className="size-6" /> : <Play className="size-6" />}
        </button>
        <button type="button" aria-label="Forward 10 seconds" onClick={() => skip(10)} disabled={!url} className="grid size-11 place-items-center rounded-full text-muted-foreground hover:text-foreground disabled:opacity-40"><RotateCw className="size-5" /></button>
        <button type="button" aria-label={`Speed ${rate}x`} onClick={cycle} disabled={!url} className="min-h-11 min-w-12 rounded-full bg-muted px-3 text-sm tabular-nums disabled:opacity-40">{rate}x</button>
      </div>
      {url ? (
        <div className="mt-3 flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
          <span>{formatClock(time)}</span>
          <input
            type="range"
            aria-label="Seek"
            className="h-6 flex-1 accent-[var(--color-primary)]"
            min={0}
            max={Math.max(1, Math.floor(duration))}
            value={Math.min(Math.floor(time), Math.max(1, Math.floor(duration)))}
            onChange={(e) => { if (el) el.currentTime = Number(e.target.value); }}
          />
          <span>{formatClock(duration)}</span>
        </div>
      ) : (
        <p className="mt-3 text-center text-xs text-muted-foreground">Playing with your device's voice (no server audio available).</p>
      )}
      <div className="mt-4 space-y-1.5 text-sm leading-relaxed">
        {sentences.map((s, i) => (
          <span key={i} className={cn("mr-1", i === active ? "rounded bg-primary/20 text-foreground" : "text-foreground/80")}>{s}</span>
        ))}
      </div>
    </div>
  );
}
