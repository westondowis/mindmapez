import { Mic, Volume2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { askAssistant, voiceIngest } from "@/lib/server/assistant";
import { queueReview, recordVoiceTurn } from "@/lib/server/reviews";
import { SILENT_WAV, VAD_SILENCE_MS, preferRecognitionOnly } from "@/lib/voice";
import { createTurnProcessor } from "@/lib/voice-ingest";
import { startEnergyMonitor } from "@/lib/voice-energy";
import { VoiceSession, type Phase, type Recognizer, type RecognizerEvents } from "@/lib/voice-session";
import { primeSynth, speakNative, type VoiceChoice } from "@/lib/voice-synth";

type SpeechResultList = ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onresult: ((e: { results: SpeechResultList }) => void) | null;
  onerror: ((e?: { error?: string }) => void) | null;
  onend: (() => void) | null;
};
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

/** Platform adapter: wraps the browser recognizer behind the session's Recognizer port. */
function browserRecognizer(opts: { continuous: boolean }, ev: RecognizerEvents): Recognizer | null {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const r = new SR();
  r.lang = "en-US";
  r.continuous = opts.continuous; // desktop streams; iOS runs single-utterance sessions
  r.interimResults = true;
  r.onresult = (e) => ev.onResult(Array.from(e.results, (x) => ({ text: x[0]?.transcript ?? "", final: !!x.isFinal })));
  r.onend = () => ev.onEnd();
  r.onerror = (e) => ev.onError(e?.error);
  return {
    start: () => r.start(),
    stop: () => { try { r.stop(); } catch { /* already stopped */ } },
    abort: () => {
      r.onresult = r.onend = r.onerror = null; // a disposed instance can never call back
      try { r.abort?.(); } catch { /* already ended */ }
      try { r.stop(); } catch { /* already ended */ }
    },
  };
}

/** Safari Audio Session API (iOS 16.4+): "playback" ignores the silent switch and follows the active route. */
function setAudioSession(type: "playback" | "play-and-record" | "auto") {
  try {
    const as = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (as && as.type !== type) as.type = type;
  } catch {
    // unsupported: default routing
  }
}

const LABEL: Record<Phase, string> = {
  idle: "Talk to the brain",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
  error: "Try again",
};

export function VoicePanel({ onSpeaking }: { onSpeaking: (on: boolean) => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [voice, setVoice] = useState<VoiceChoice>("female");
  const [phase, setPhase] = useState<Phase>("idle");
  const [line, setLine] = useState("");
  const [reply, setReply] = useState("");
  const [continuous, setContinuous] = useState(false);
  const live = useRef({ voice, continuous, open, onSpeaking });
  live.current = { voice, continuous, open, onSpeaking };
  const bargedIn = useRef(false);
  const silentAudio = useRef<HTMLAudioElement | null>(null);
  const stopSpeech = useRef<() => void>(() => {});
  const stopEnergy = useRef<(() => void) | null>(null);
  const iosSingle = useMemo(() => (typeof window === "undefined" ? false : preferRecognitionOnly()), []);

  const turns = useMemo(
    () =>
      createTurnProcessor({
        ingest: (raw) => voiceIngest({ data: { transcript: raw } }),
        queue: (payload) => queueReview({ data: payload }),
        ask: (prompt) => askAssistant({ data: { prompt, voice: true } }),
        record: (bargeIn, keywords) => recordVoiceTurn({ data: { bargeIn, keywords } }),
        consumeBargeIn: () => {
          const b = bargedIn.current;
          bargedIn.current = false;
          return b;
        },
        onQueued: () => void qc.invalidateQueries({ queryKey: ["reviews"] }),
      }),
    [qc],
  );

  const session = useMemo(
    () =>
      new VoiceSession(
        {
          createRecognizer: browserRecognizer,
          process: turns.process,
          cancelSpeech: () => {
            stopSpeech.current();
            stopSpeech.current = () => {};
          },
          speak: (text, cb) => {
            // Recognition is already fully stopped here, so iOS can leave the call route.
            setAudioSession("playback");
            stopSpeech.current = speakNative(text, live.current.voice, {
              onStart: cb.onStart,
              onEnd: () => {
                if (live.current.open) setAudioSession("play-and-record");
                cb.onEnd();
              },
              onError: cb.onEnd,
            });
          },
        },
        {
          silenceMs: VAD_SILENCE_MS,
          iosSingle,
          isContinuous: () => live.current.continuous,
          onPhase: setPhase,
          onLine: setLine,
          onReply: setReply,
          onSpeaking: (on) => live.current.onSpeaking(on),
        },
      ),
    [turns, iosSingle],
  );

  // Saved voice, and a clean teardown on unmount / app switch / sleep.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("mm-voice");
      if (saved === "male" || saved === "female") setVoice(saved);
    } catch {
      // private mode: keep the default voice
    }
    const warm = () => void window.speechSynthesis?.getVoices();
    warm();
    window.speechSynthesis?.addEventListener?.("voiceschanged", warm);
    const suspend = () => { if (live.current.open) session.stop(); };
    const onVis = () => { if (document.visibilityState === "hidden") suspend(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", suspend);
    return () => {
      window.speechSynthesis?.removeEventListener?.("voiceschanged", warm);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", suspend);
      session.stop();
      stopEnergy.current?.();
    };
  }, [session]);

  /** Everything iOS needs inside the tap itself: audio session, silent audio, speech unlock. */
  function primeFromGesture() {
    setAudioSession("play-and-record");
    primeSynth();
    try {
      const a = (silentAudio.current ??= new Audio(SILENT_WAV));
      a.muted = true;
      a.setAttribute("playsinline", "");
      const p = a.play();
      if (p) void p.then(() => a.pause()).catch(() => {});
    } catch {
      // no HTMLAudioElement: nothing to unlock
    }
  }

  function talk() {
    primeFromGesture();
    // A tap while the assistant speaks is a barge-in.
    if (session.phase === "speaking") bargedIn.current = true;
    if (session.phase === "speaking") session.bargeIn();
    else session.tap();
  }

  function openVoice() {
    if (live.current.open) return;
    live.current.open = true;
    setOpen(true);
    primeFromGesture();
    session.start(); // microphone opens in the same tap; the assistant never speaks first
    if (!iosSingle) {
      void startEnergyMonitor({
        isSpeaking: () => session.phase === "speaking",
        onBarge: () => {
          bargedIn.current = true;
          session.bargeIn();
        },
      }).then(
        (stop) => (live.current.open ? (stopEnergy.current = stop) : stop()),
        () => {}, // no mic energy: barge-in by tap still works
      );
    }
  }

  function closeVoice() {
    live.current.open = false;
    setOpen(false);
    session.stop();
    stopEnergy.current?.();
    stopEnergy.current = null;
    // Anything recorded is queued for review, never dropped.
    if (turns.hasDraft()) void turns.flush().then(setReply).catch(() => {});
  }

  const toggleContinuous = (on: boolean) => {
    live.current.continuous = on;
    setContinuous(on);
  };

  // Alt+V / Alt+C (never Ctrl+V or Ctrl+R, which the browser owns).
  const keys = useRef({ openVoice, closeVoice, toggleContinuous });
  keys.current = { openVoice, closeVoice, toggleContinuous };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.repeat) return;
      if (e.code === "KeyV") {
        e.preventDefault();
        if (live.current.open) keys.current.closeVoice();
        else keys.current.openVoice();
      } else if (e.code === "KeyC") {
        e.preventDefault();
        keys.current.toggleContinuous(!live.current.continuous);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) {
    return (
      <div className="pointer-events-auto absolute left-3 top-10 z-40">
        <button
          type="button"
          onClick={openVoice}
          className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/60 px-3 py-1.5 text-xs text-white"
        >
          <Mic className="size-3.5" /> Voice
        </button>
        <p className="mt-1 hidden text-[10px] leading-tight text-white/45 sm:block">
          Alt+V to launch voice mode
          <br />
          Alt+C for continuous conversation
        </p>
      </div>
    );
  }

  const busy = phase === "thinking";
  return (
    <div className="pointer-events-auto absolute left-3 top-10 z-40 w-[min(100%-1.5rem,18rem)] rounded-2xl border border-[#6a2ca8]/40 bg-black/80 p-3 text-white backdrop-blur-md">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.14em] text-[#c9b6ff]">Voice</p>
        <button type="button" onClick={closeVoice} className="text-white/60" aria-label="Close">✕</button>
      </div>
      <div className="mt-2 flex gap-1">
        {(["female", "male"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => {
              setVoice(v);
              try {
                localStorage.setItem("mm-voice", v);
              } catch {
                // storage unavailable: the choice just won't persist
              }
            }}
            className={`rounded-full px-2.5 py-1 text-[11px] ${voice === v ? "bg-[#6a2ca8]" : "bg-white/10"}`}
          >
            {v === "female" ? "Calm female" : "Calm male"}
          </button>
        ))}
      </div>
      <label className="mt-2 flex items-center gap-2 text-[11px] text-white/80">
        <input type="checkbox" checked={continuous} onChange={(e) => toggleContinuous(e.target.checked)} />
        Continuous conversation
      </label>
      <button
        type="button"
        onClick={talk}
        disabled={busy}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#6a2ca8] py-2 text-sm"
      >
        <Mic className="size-4" /> {continuous && iosSingle && phase === "idle" ? "Tap to continue" : LABEL[phase]}
      </button>
      <p className="mt-1 hidden text-[10px] leading-tight text-white/45 sm:block">Alt+V to close · Alt+C toggles continuous</p>
      {line ? <p className="mt-2 text-[11px] text-white/60">You: {line}</p> : null}
      {reply ? (
        <p className="mt-1 flex items-start gap-1 text-[12px] leading-snug">
          <Volume2 className="mt-0.5 size-3.5 shrink-0 text-[#c9b6ff]" /> {reply}
        </p>
      ) : null}
    </div>
  );
}
