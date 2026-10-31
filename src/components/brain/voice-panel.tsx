import { Mic, Volume2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
type SpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}
import { askAssistant, voiceIngest } from "@/lib/server/assistant";
import { queueReview, recordVoiceTurn } from "@/lib/server/reviews";
import {
  AUTO_OFF_MS,
  BARGE_HOLD_MS,
  BARGE_RMS_THRESHOLD,
  STATE_DEBOUNCE_MS,
  CANCEL_CUE,
  COMPLETION_CUE,
  GREETING_DELAY_MS,
  SPEECH_HOLD_MS,
  SPEECH_RMS_THRESHOLD,
  VAD_SILENCE_MS,
  extractKeywords,
  rmsOf,
  type ReviewAction,
  preferRecognitionOnly,
} from "@/lib/voice";

type VoiceChoice = "male" | "female";

const MALE_NAMES = /daniel|alex|aaron|arthur|fred|david|james|guy|gordon|oliver|rishi|tom|evan|nathan|google uk english male|male/i;
const FEMALE_NAMES = /samantha|ava|allison|susan|serena|karen|moira|tessa|victoria|zira|jenny|aria|nicky|kate|stephanie|google us english|google uk english female|female/i;

/** Higher = more natural. Prefers the device's premium/enhanced/Siri/Google/neural voices. */
function voiceQuality(v: SpeechSynthesisVoice): number {
  const n = `${v.name} ${v.voiceURI}`;
  let q = 0;
  if (/premium|enhanced|neural|natural|siri|online/i.test(n)) q += 6;
  if (/google/i.test(n)) q += 3;
  if (/^en[-_]us/i.test(v.lang)) q += 2;
  else if (/^en/i.test(v.lang)) q += 1;
  if (v.localService) q += 1;
  if (/compact|eloquence|novelty|bad news|bahh|bells|boing|cellos|good news|jester|organ|superstar|trinoids|whisper|zarvox|albert|bubbles|deranged|hysterical/i.test(n)) q -= 20;
  return q;
}

function pickVoice(choice: VoiceChoice): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const en = window.speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
  if (!en.length) return null;
  const wanted = choice === "male" ? MALE_NAMES : FEMALE_NAMES;
  const other = choice === "male" ? FEMALE_NAMES : MALE_NAMES;
  const score = (v: SpeechSynthesisVoice) =>
    voiceQuality(v) + (wanted.test(v.name) ? 8 : 0) - (other.test(v.name) && !wanted.test(v.name) ? 8 : 0);
  return [...en].sort((a, b) => score(b) - score(a))[0] ?? null;
}

/** Plain, speakable text split into sentence-sized chunks (long utterances get cut off on some phones). */
function speechChunks(text: string): string[] {
  const clean = text
    .replace(/[*_#`>]+/g, "")
    .replace(/^\s*[•\-]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean.match(/[^.!?]+[.!?]*\s*/g)?.map((c) => c.trim()).filter(Boolean) ?? [];
}

export function VoicePanel({ onSpeaking }: { onSpeaking: (on: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [voice, setVoice] = useState<VoiceChoice>("female");
  type Phase = "idle" | "listening" | "thinking" | "speaking";
  const [phase, setPhaseState] = useState<Phase>("idle");
  const hearing = phase === "listening";
  const busy = phase === "thinking" || phase === "speaking";
  const hearingRef = useRef(false);
  const phaseAt = useRef(0);
  const phaseTimer = useRef<number | null>(null);
  /** Single persistent mic stream for the whole voice session (getUserMedia is called once). */
  const streamRef = useRef<MediaStream | null>(null);
  const micPending = useRef<Promise<void> | null>(null);
  const isStartingRef = useRef(false);
  const bargingRef = useRef(false);
  const restartTimer = useRef<number | null>(null);
  const [line, setLine] = useState("");
  const [reply, setReply] = useState("");
  const [continuous, setContinuous] = useState(false);
  const continuousRef = useRef(false);
  const busyRef = useRef(false);
  const greetTimer = useRef<number | null>(null);
  const offTimer = useRef<number | null>(null);
  const greeted = useRef(false);
  const speakingRef = useRef(false);
  /** Bumped on every speak/cancel so stale utterance callbacks are ignored after a barge-in. */
  const speakToken = useRef(0);
  const mic = useRef<{ stream: MediaStream; ctx: AudioContext; analyser: AnalyserNode; raf: number } | null>(null);
  const loudSince = useRef<number | null>(null);
  const actions = useRef({ toggle: () => {}, toggleContinuous: () => {} });
  const openRef = useRef(false);
  const draft = useRef<string[]>([]);
  const bargedIn = useRef(false);
  const restartRef = useRef<() => void>(() => {});
  const silence = useRef<number | null>(null);
  const recRef = useRef<SpeechRecognition | null>(null);
  const qc = useQueryClient();
  const recognitionOnly = useRef(false);

  useEffect(() => {
    recognitionOnly.current = preferRecognitionOnly();
  }, []);

  /** Must run synchronously inside the tap: wake a suspended AudioContext and clear stale locks. */
  function primeFromGesture() {
    const ctx = mic.current?.ctx;
    if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => {});
    // A user tap always gets a clean start, even if a previous session hung mid-start.
    isStartingRef.current = false;
  }

  // iOS app switch / sleep: tear down recognition and the energy monitor so the next tap starts clean.
  useEffect(() => {
    const suspend = () => {
      if (!openRef.current) return;
      if (restartTimer.current) window.clearTimeout(restartTimer.current);
      restartTimer.current = null;
      if (silence.current) window.clearTimeout(silence.current);
      silence.current = null;
      const rec = recRef.current;
      recRef.current = null; // detaches onend so it cannot schedule a restart
      try { (rec as unknown as { abort?: () => void } | null)?.abort?.() ?? rec?.stop(); } catch { /* already stopped */ }
      isStartingRef.current = false;
      speakToken.current++;
      window.speechSynthesis?.cancel();
      speakingRef.current = false;
      onSpeaking(false);
      busyRef.current = false;
      hearingRef.current = false;
      clearIdleTimers();
      // Mark stream/energy state dirty: the next ensureMic() reacquires from a fresh tap.
      releaseMic();
      syncPhase();
    };
    const onVis = () => { if (document.visibilityState === "hidden") suspend(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", suspend);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", suspend);
    };
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("mm-voice");
      if (saved === "male" || saved === "female") setVoice(saved);
    } catch {
      // storage unavailable (private mode): keep the default voice
    }
    window.speechSynthesis?.getVoices();
    // Voices load asynchronously on most phones; touching them again once ready.
    const warm = () => void window.speechSynthesis?.getVoices();
    window.speechSynthesis?.addEventListener?.("voiceschanged", warm);
    // Stop talking if the panel goes away mid-sentence.
    return () => {
      window.speechSynthesis?.removeEventListener?.("voiceschanged", warm);
      window.speechSynthesis?.cancel();
      releaseMic();
      clearIdleTimers();
      if (phaseTimer.current) window.clearTimeout(phaseTimer.current);
      if (restartTimer.current) window.clearTimeout(restartTimer.current);
    };
  }, []);

  /** Visible phase derived from refs; UI changes are spaced >= STATE_DEBOUNCE_MS apart (logic refs stay immediate). */
  function syncPhase() {
    const apply = () => {
      phaseTimer.current = null;
      phaseAt.current = performance.now();
      const next: Phase = speakingRef.current ? "speaking" : busyRef.current ? "thinking" : hearingRef.current ? "listening" : "idle";
      setPhaseState(next);
    };
    const wait = STATE_DEBOUNCE_MS - (performance.now() - phaseAt.current);
    if (phaseTimer.current) return; // a pending apply will read the latest refs
    if (wait <= 0) apply();
    else phaseTimer.current = window.setTimeout(apply, wait);
  }
  function setHearing(on: boolean) {
    hearingRef.current = on;
    syncPhase();
  }
  function setBusy(_on: boolean) {
    syncPhase();
  }
  function setSpeaking(on: boolean) {
    speakingRef.current = on;
    onSpeaking(on);
    syncPhase();
  }
  function stopRecognition() {
    if (restartTimer.current) window.clearTimeout(restartTimer.current);
    restartTimer.current = null;
    try { recRef.current?.stop(); } catch { /* already stopped */ }
  }

  function clearIdleTimers() {
    if (greetTimer.current) window.clearTimeout(greetTimer.current);
    if (offTimer.current) window.clearTimeout(offTimer.current);
    greetTimer.current = null;
    offTimer.current = null;
  }

  /** Any user speech: cancel the greeting and the auto-off. */
  function onUserSpeech() {
    clearIdleTimers();
    greeted.current = false;
  }

  /** Acquire the mic ONCE per voice session and watch its RMS energy every frame (Listening AND Speaking). */
  function ensureMic(): Promise<void> {
    // iOS WebKit: SpeechRecognition owns the audio session; a parallel getUserMedia steals it.
    if (recognitionOnly.current) return Promise.resolve();
    if (streamRef.current || mic.current) return Promise.resolve();
    if (micPending.current) return micPending.current;
    if (!navigator.mediaDevices?.getUserMedia) return Promise.resolve();
    micPending.current = (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (!openRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        // iOS often starts the context suspended after await; resume from this user-gesture chain.
        void ctx.resume().catch(() => {});
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);
        const loop = () => {
          if (!mic.current) return;
          analyser.getByteTimeDomainData(buf);
          const now = performance.now();
          const rms = rmsOf(buf);
          // Echo shield: while the AI talks, only clearly-louder-than-speaker energy, held longer, barges in.
          const speaking = speakingRef.current;
          const threshold = speaking ? BARGE_RMS_THRESHOLD : SPEECH_RMS_THRESHOLD;
          const hold = speaking ? BARGE_HOLD_MS : SPEECH_HOLD_MS;
          if (rms >= threshold) {
            loudSince.current ??= now;
            if (now - loudSince.current >= hold) {
              if (speaking) bargeIn();
              else onUserSpeech();
            }
          } else {
            loudSince.current = null;
          }
          mic.current.raf = window.requestAnimationFrame(loop);
        };
        mic.current = { stream, ctx, analyser, raf: window.requestAnimationFrame(loop) };
      } catch (err) {
        console.error("[voice] mic energy monitor unavailable", err);
      } finally {
        micPending.current = null;
      }
    })();
    return micPending.current;
  }

  /** The ONLY place tracks are stopped: X close, auto-off close, or unmount. */
  function releaseMic() {
    const m = mic.current;
    const stream = streamRef.current;
    mic.current = null;
    streamRef.current = null;
    loudSince.current = null;
    if (m) {
      window.cancelAnimationFrame(m.raf);
      void m.ctx.close().catch(() => {});
    }
    stream?.getTracks().forEach((t) => t.stop());
  }

  /** User talked over the AI: cut speech instantly, drop the queue, go back to Listening. */
  function bargeIn() {
    if (bargingRef.current) return;
    bargingRef.current = true;
    speakToken.current++;
    window.speechSynthesis?.pause();
    window.speechSynthesis?.cancel();
    bargedIn.current = true;
    onUserSpeech();
    busyRef.current = false;
    setSpeaking(false);
    loudSince.current = null;
    listen({ barge: true });
    bargingRef.current = false;
  }

  /** End of a turn: clear busy, and in continuous mode go back to Listening. */
  function finishTurn() {
    busyRef.current = false;
    setBusy(false);
    setHearing(false);
    if (continuousRef.current || greeted.current) window.setTimeout(() => restartRef.current(), 300);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.code === "KeyV") {
        e.preventDefault();
        actions.current.toggle();
      } else if (e.code === "KeyC") {
        e.preventDefault();
        actions.current.toggleContinuous();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function speak(text: string, onDone?: () => void) {
    if (!window.speechSynthesis || !speechChunks(text).length) {
      finishTurn();
      onDone?.();
      return;
    }
    const token = ++speakToken.current;
    window.speechSynthesis.cancel();
    // Stop recognition while we talk; the mic stream stays open (no track.stop) for barge-in energy.
    stopRecognition();
    hearingRef.current = false;
    setSpeaking(true);
    const done = () => {
      if (token !== speakToken.current) return;
      setSpeaking(false);
      finishTurn();
      onDone?.();
    };
    const v = pickVoice(voice);
    const chunks = speechChunks(text);
    chunks.forEach((chunk, i) => {
      const u = new SpeechSynthesisUtterance(chunk);
      if (v) {
        u.voice = v;
        u.lang = v.lang;
      }
      u.rate = 1;
      u.pitch = voice === "male" ? 0.92 : 1;
      if (i === 0) u.onstart = () => {
        if (token !== speakToken.current) return;
        setSpeaking(true);
      };
      if (i === chunks.length - 1) u.onend = done;
      u.onerror = done;
      window.speechSynthesis.speak(u);
    });
  }

  /** Queue everything gathered so far for review. Falls back to raw text so nothing recorded is lost. */
  async function flushDraft(): Promise<string> {
    const raw = draft.current.join(" ").trim();
    draft.current = [];
    if (!raw) return "There is nothing to store yet. Tell me what to remember.";
    let payload = {
      raw,
      keyPoints: [raw.slice(0, 200)],
      keywords: extractKeywords(raw),
      action: "memory" as ReviewAction,
      conceptId: null as string | null,
      conceptName: null as string | null,
      suggestedName: null as string | null,
    };
    try {
      const plan = await voiceIngest({ data: { transcript: raw } });
      if (plan.ok) {
        payload = {
          raw: plan.raw,
          keyPoints: plan.keyPoints,
          keywords: plan.tags,
          action: plan.action,
          conceptId: plan.suggested?.id ?? null,
          conceptName: plan.suggested?.name ?? null,
          suggestedName: plan.action === "memory" ? (plan.suggested?.name ?? null) : plan.newName,
        };
      }
    } catch (err) {
      console.error("[voice] ingest failed, queueing raw", err);
    }
    const q = await queueReview({ data: payload });
    if (!q.ok) {
      draft.current = [raw];
      throw new Error(q.error);
    }
    void qc.invalidateQueries({ queryKey: ["reviews"] });
    return payload.conceptName ? `Stored for review under ${payload.conceptName}.` : "Stored for review as a new memory.";
  }

  async function handle(text: string) {
    const clean = text.trim();
    if (!clean) {
      finishTurn();
      return;
    }
    setLine(clean);
    busyRef.current = true;
    setBusy(true);
    const bargeIn = bargedIn.current;
    bargedIn.current = false;
    try {
      // Completion cue: queue what we gathered for review right away. No more questions.
      if (COMPLETION_CUE.test(clean)) {
        const said = await flushDraft();
        setReply(said);
        speak(said);
        return;
      }
      if (CANCEL_CUE.test(clean)) {
        draft.current = [];
        const said = "Okay, I discarded that.";
        setReply(said);
        speak(said);
        return;
      }
      const remember = clean.match(/^(remember|save|add a memory|note that|i want to remember)\s+(.+)/i);
      const note = remember?.[2] ?? (clean.split(/\s+/).length > 18 ? clean : null);
      if (note) {
        draft.current.push(note);
        void recordVoiceTurn({ data: { bargeIn, keywords: extractKeywords(note) } }).catch(() => {});
        const said = "Got it. Keep going, or say I'm done to store it.";
        setReply(said);
        speak(said);
        return;
      }
      void recordVoiceTurn({ data: { bargeIn, keywords: extractKeywords(clean) } }).catch(() => {});
      const res = await askAssistant({ data: { prompt: clean, voice: true } });
      const said = res.ok ? res.content : "I could not reach the brain just now.";
      setReply(said);
      speak(said);
    } catch (err) {
      console.error("[voice]", err);
      const detail = err instanceof Error ? err.message : "";
      const said = "Something went wrong. Please try again.";
      setReply(detail ? `${said} (${detail.slice(0, 120)})` : said);
      speak(said);
    }
  }

  const handled = useRef(false);

  function listen(opts: { barge?: boolean } = {}) {
    if (!openRef.current || busyRef.current || isStartingRef.current) return;
    if (speakingRef.current && !opts.barge) return;
    if (restartTimer.current) window.clearTimeout(restartTimer.current);
    restartTimer.current = null;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setReply("Voice input is not available in this browser.");
      return;
    }
    try { recRef.current?.stop(); } catch { /* already stopped */ }
    handled.current = false;
    const rec = new SR();
    rec.lang = "en-US";
    // Always stream continuously: our own 2 s silence timer decides when the thought is over.
    rec.continuous = true;
    rec.interimResults = true;
    // `base` carries text across recognition sessions the browser ends on its own.
    const buffer = { text: "", base: "" };
    const commit = () => {
      if (handled.current || !buffer.text.trim()) return;
      handled.current = true;
      if (silence.current) window.clearTimeout(silence.current);
      silence.current = null;
      setHearing(false);
      try { rec.stop(); } catch { /* already stopped */ }
      void handle(buffer.text.trim());
    };
    rec.onresult = (e) => {
      // Echo shield: never act on transcripts heard while the AI is talking.
      if (speakingRef.current || recRef.current !== rec) return;
      // Any speech at all cancels the greeting and auto-off timers.
      onUserSpeech();
      // Show interim text, but only act on finalised results (partials caused repeat replies).
      let finalText = "";
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        const t = r?.[0]?.transcript ?? "";
        if (r?.isFinal) finalText += t + " ";
        else interim += t;
      }
      buffer.text = `${buffer.base} ${finalText}`.trim();
      setLine(`${buffer.base} ${finalText}${interim}`.trim());
      // Re-arm on every result (interim too): only a full VAD_SILENCE_MS of quiet ends the thought.
      if (silence.current) window.clearTimeout(silence.current);
      if (buffer.text || interim.trim()) silence.current = window.setTimeout(commit, VAD_SILENCE_MS);
    };
    const scheduleRestart = (fn: () => void) => {
      if (restartTimer.current) window.clearTimeout(restartTimer.current);
      restartTimer.current = window.setTimeout(() => {
        restartTimer.current = null;
        if (!openRef.current || speakingRef.current || busyRef.current || isStartingRef.current || recRef.current !== rec) return;
        fn();
      }, STATE_DEBOUNCE_MS);
    };
    rec.onerror = () => { isStartingRef.current = false; setHearing(false); if (!handled.current) { busyRef.current = false; setBusy(false); } };
    rec.onend = () => {
      isStartingRef.current = false;
      if (!openRef.current || recRef.current !== rec || speakingRef.current) return;
      if (!handled.current && buffer.text.trim()) {
        // The browser ended the session mid-thought (a brief pause). Don't dispatch yet:
        // keep the pending 2 s silence timer and resume listening with the text carried over.
        buffer.base = buffer.text;
        if (!silence.current) silence.current = window.setTimeout(commit, VAD_SILENCE_MS);
        // Never restart in a tight loop: wait >= STATE_DEBOUNCE_MS and re-check state.
        scheduleRestart(() => {
          if (handled.current) return;
          isStartingRef.current = true;
          try {
            rec.start();
          } catch {
            isStartingRef.current = false;
            commit();
          }
        });
        return;
      }
      if (silence.current) window.clearTimeout(silence.current);
      if (!handled.current) {
        setHearing(false);
        if (draft.current.length && !busyRef.current) {
          busyRef.current = true;
          setBusy(true);
          void flushDraft()
            .then((said) => { setReply(said); speak(said); })
            .catch(() => finishTurn());
          return;
        }
        if (continuousRef.current && !busyRef.current) scheduleRestart(() => listen());
      }
    };
    recRef.current = rec;
    isStartingRef.current = true;
    try {
      // Synchronous in the caller's stack: from a tap this satisfies iOS's user-gesture rule.
      rec.start();
      setHearing(true);
    } catch (err) {
      console.error("[voice] recognition start failed", err);
      setHearing(false);
    } finally {
      // Release the lock after the start call settles (onend/onerror also clear it).
      queueMicrotask(() => { isStartingRef.current = false; });
    }
    // Desktop only: energy monitor for barge-in/timers starts AFTER recognition, never awaited.
    void ensureMic();
  }

  /** Direct tap on "Talk to the brain": resume audio + start recognition synchronously. */
  function onTalkTap() {
    primeFromGesture();
    listen();
  }

  /** On open: greet only after GREETING_DELAY_MS of silence, then auto-off after AUTO_OFF_MS more. */
  function armGreeting() {
    clearIdleTimers();
    greetTimer.current = window.setTimeout(() => {
      greetTimer.current = null;
      if (!openRef.current || busyRef.current || handled.current) return;
      greeted.current = true;
      const hi = "Hey, what's up?";
      setReply(hi);
      speak(hi, () => {
        if (!openRef.current || !greeted.current) return;
        offTimer.current = window.setTimeout(() => {
          offTimer.current = null;
          if (greeted.current && !busyRef.current) closeVoice();
        }, AUTO_OFF_MS);
      });
    }, GREETING_DELAY_MS);
  }

  function closeVoice() {
    clearIdleTimers();
    if (silence.current) window.clearTimeout(silence.current);
    silence.current = null;
    speakToken.current++;
    speakingRef.current = false;
    stopRecognition();
    releaseMic();
    greeted.current = false;
    openRef.current = false;
    setOpen(false);
    busyRef.current = false;
    setSpeaking(false);
    setHearing(false);
    window.speechSynthesis?.cancel();
    try { recRef.current?.stop(); } catch { /* already stopped */ }
    if (draft.current.length) void flushDraft().catch((e) => console.error("[voice]", e));
  }

  /** One click (or Alt+V): open the panel and start the microphone straight away. */
  function openVoice() {
    openRef.current = true;
    greeted.current = false;
    setOpen(true);
    primeFromGesture();
    // recognition.start() runs synchronously in this tap; ensureMic (desktop only) follows, unawaited.
    listen();
    armGreeting();
  }

  restartRef.current = () => { if (openRef.current) listen(); };
  actions.current = {
    toggle: () => (openRef.current ? closeVoice() : openVoice()),
    toggleContinuous: () => {
      const next = !continuousRef.current;
      continuousRef.current = next;
      setContinuous(next);
    },
  };

  if (!open) {
    return (
      <div className="pointer-events-auto absolute left-3 top-10 z-30">
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

  return (
    <div className="pointer-events-auto absolute left-3 top-10 z-30 w-[min(100%-1.5rem,18rem)] rounded-2xl border border-[#6a2ca8]/40 bg-black/80 p-3 text-white backdrop-blur-md">
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
        <input
          type="checkbox"
          checked={continuous}
          onChange={(e) => { setContinuous(e.target.checked); continuousRef.current = e.target.checked; }}
        />
        Continuous conversation
      </label>
      <button
        type="button"
        onClick={onTalkTap}
        disabled={busy}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#6a2ca8] py-2 text-sm"
      >
        <Mic className="size-4" /> {hearing ? "Listening…" : busy ? "Thinking…" : "Talk to the brain"}
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
