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
  onerror: ((e?: { error?: string }) => void) | null;
  onend: (() => void) | null;
  onstart?: (() => void) | null;
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
  SPEAK_START_TIMEOUT_MS,
  SILENT_WAV,
  BARGE_HOLD_MS,
  BARGE_RMS_THRESHOLD,
  STATE_DEBOUNCE_MS,
  CANCEL_CUE,
  COMPLETION_CUE,
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
  /** True while the user wants the mic open (tap → close/stop). Empty onend restarts only while set. */
  const wantListenRef = useRef(false);
  const manualStopRef = useRef<(() => void) | null>(null);
  const silentAudio = useRef<HTMLAudioElement | null>(null);
  const bargingRef = useRef(false);
  const restartTimer = useRef<number | null>(null);
  const [line, setLine] = useState("");
  const [reply, setReply] = useState("");
  const [continuous, setContinuous] = useState(false);
  const continuousRef = useRef(false);
  const busyRef = useRef(false);
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
  /** Latest voice choice for callbacks created earlier (switching voice never touches the mic). */
  const voiceRef = useRef<VoiceChoice>("female");
  voiceRef.current = voice;

  useEffect(() => {
    recognitionOnly.current = preferRecognitionOnly();
  }, []);

  /**
   * Safari Audio Session API (iOS 16.4+/17): "playback" and "play-and-record" both ignore the ringer/silent
   * switch and follow the active route (speaker or Bluetooth). We use play-and-record while capturing and
   * switch to "playback" for TTS once recognition + mic tracks are released.
   */
  function setAudioSession(type: "playback" | "play-and-record" | "auto") {
    try {
      const as = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
      if (as && as.type !== type) as.type = type;
    } catch (err) {
      console.error("[voice] audioSession.type failed", type, err);
    }
  }

  /** Must run synchronously inside the tap: wake a suspended AudioContext and clear stale locks. */
  function primeFromGesture() {
    setAudioSession("play-and-record");
    const ctx = mic.current?.ctx;
    if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => {});
    // iOS: a play() inside the tap unlocks later programmatic audio. Rejection is harmless.
    try {
      const a = (silentAudio.current ??= new Audio(SILENT_WAV));
      a.muted = true;
      a.setAttribute("playsinline", "");
      const p = a.play();
      if (p) void p.then(() => a.pause()).catch(() => {});
    } catch {
      // no HTMLAudioElement support: nothing to unlock
    }
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
      if (phaseTimer.current) window.clearTimeout(phaseTimer.current);
      if (restartTimer.current) window.clearTimeout(restartTimer.current);
    };
  }, []);

  /** Visible phase derived from refs; UI changes are spaced >= STATE_DEBOUNCE_MS apart (logic refs stay immediate). */
  function syncPhase(immediate = false) {
    if (immediate && phaseTimer.current) {
      window.clearTimeout(phaseTimer.current);
      phaseTimer.current = null;
    }
    const apply = () => {
      phaseTimer.current = null;
      phaseAt.current = performance.now();
      const next: Phase = speakingRef.current ? "speaking" : busyRef.current ? "thinking" : hearingRef.current ? "listening" : "idle";
      setPhaseState(next);
    };
    const wait = STATE_DEBOUNCE_MS - (performance.now() - phaseAt.current);
    if (phaseTimer.current) return; // a pending apply will read the latest refs
    if (immediate || wait <= 0) apply();
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

  /** Fully release SpeechRecognition before TTS so iOS leaves play-and-record (telephony) mode and routes to A2DP/Bluetooth. */
  function releaseRecognitionForPlayback() {
    if (restartTimer.current) window.clearTimeout(restartTimer.current);
    restartTimer.current = null;
    const rec = recRef.current;
    recRef.current = null; // detach so onend cannot schedule a restart mid-speech
    isStartingRef.current = false;
    try { (rec as (SpeechRecognition & { abort?: () => void }) | null)?.abort?.() ?? rec?.stop(); } catch { try { rec?.stop(); } catch { /* already stopped */ } }
    // Recognition-only (iOS) path holds no GUM stream; if any track exists there, mute it (never stop/re-request).
    // Mute (never stop) mic tracks on every platform so the OS leaves telephony mode; restored in finishTurn.
    streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = false; });
    setAudioSession("playback");
  }

  /** Resolve a real voice; on iOS getVoices() is often empty until voiceschanged fires once. */
  function withVoice(cb: (v: SpeechSynthesisVoice | null) => void) {
    const synth = window.speechSynthesis;
    const v = pickVoice(voiceRef.current);
    if (v || synth.getVoices().length) return cb(v ?? synth.getVoices()[0] ?? null);
    let fired = false;
    const go = () => {
      if (fired) return;
      fired = true;
      synth.removeEventListener?.("voiceschanged", go);
      cb(pickVoice(voiceRef.current) ?? synth.getVoices()[0] ?? null);
    };
    synth.addEventListener?.("voiceschanged", go);
    window.setTimeout(go, 1000);
  }

  /** Desktop energy monitor hook for detected user speech (no greeting/auto-off timers exist any more). */
  function onUserSpeech() {
    /* intentionally empty: the assistant never speaks first */
  }

  /** Acquire the mic ONCE per voice session and watch its RMS energy every frame (Listening AND Speaking). */
  function ensureMic(): Promise<void> {
    // iOS WebKit: SpeechRecognition owns the audio session; a parallel getUserMedia steals it.
    // iOS: NEVER call getUserMedia alongside webkitSpeechRecognition (single audio engine).
    if (recognitionOnly.current || preferRecognitionOnly()) {
      recognitionOnly.current = true;
      return Promise.resolve();
    }
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
    streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = true; });
    if (openRef.current) setAudioSession("play-and-record");
    busyRef.current = false;
    setBusy(false);
    setHearing(false);
    if (continuousRef.current && openRef.current) window.setTimeout(() => restartRef.current(), 300);
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

  function speak(text: string, onDone?: () => void, onStart?: () => void) {
    if (!window.speechSynthesis || !speechChunks(text).length) {
      finishTurn();
      onDone?.();
      return;
    }
    const token = ++speakToken.current;
    const synth = window.speechSynthesis;
    synth.cancel();
    if (synth.paused) synth.resume();
    // Release the mic BEFORE playback: SR stopped + recRef cleared. Desktop keeps its single GUM stream for barge-in energy.
    releaseRecognitionForPlayback();
    hearingRef.current = false;
    setSpeaking(true);
    const done = () => {
      if (token !== speakToken.current) return;
      setSpeaking(false);
      finishTurn();
      onDone?.();
    };
    const chunks = speechChunks(text);
    let started = false;
    withVoice((v) => {
      if (token !== speakToken.current) return;
      if (!v) console.error("[voice] no SpeechSynthesis voice available; using default");
      synth.cancel();
      chunks.forEach((chunk, i) => {
        const u = new SpeechSynthesisUtterance(chunk);
        if (v) {
          u.voice = v;
          u.lang = v.lang;
        }
        u.volume = 1;
        u.rate = 1;
        u.pitch = voiceRef.current === "male" ? 0.92 : 1;
        if (i === 0) u.onstart = () => {
          started = true;
          if (token !== speakToken.current) return;
          setSpeaking(true);
          onStart?.();
        };
        if (i === chunks.length - 1) u.onend = done;
        u.onerror = (e) => {
          console.error("[voice] speechSynthesis utterance error", e.error, e);
          done();
        };
        try {
          synth.speak(u);
        } catch (err) {
          console.error("[voice] speechSynthesis.speak failed", err);
          done();
        }
      });
      // Silent-synth watchdog: WebKit sometimes accepts speak() but never plays. Don't hang in Speaking.
      window.setTimeout(() => {
        if (started || token !== speakToken.current) return;
        console.error("[voice] speechSynthesis produced no onstart within 1.5s; ending turn (no server TTS fallback configured)");
        synth.cancel();
        done();
      }, SPEAK_START_TIMEOUT_MS);
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
    const iosSingle = recognitionOnly.current || preferRecognitionOnly();
    recognitionOnly.current = iosSingle;
    // iOS WebKit: single-utterance sessions (continuous=false), chained manually. Desktop streams and
    // uses our own 2 s silence timer to decide when the thought is over.
    rec.continuous = !iosSingle;
    rec.interimResults = true;
    // `base` carries text across recognition sessions the browser ends on its own.
    const buffer = { text: "", base: "", interim: "" };
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
      // User speech detected.
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
      buffer.interim = interim.trim();
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
    rec.onstart = () => {
      isStartingRef.current = false;
      if (recRef.current !== rec || !openRef.current) return;
    };
    manualStopRef.current = () => {
      if (recRef.current !== rec) return;
      if (buffer.text.trim()) { commit(); return; }
      // Stop with nothing said: back to idle, never thinking.
      wantListenRef.current = false;
      if (silence.current) window.clearTimeout(silence.current);
      silence.current = null;
      stopRecognition();
      setHearing(false);
    };
    rec.onerror = (e) => {
      isStartingRef.current = false;
      if (e?.error === "no-speech") {
        // Silence is not a turn: no TTS, no AI. Go quietly idle; the next tap listens again.
        console.log("[SpeechRecognition Error]: no-speech");
        wantListenRef.current = false;
        if (!handled.current && !buffer.text.trim()) {
          setHearing(false);
          return;
        }
      }
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed") {
        wantListenRef.current = false;
        setReply("Microphone access was blocked. Allow it in Settings and tap again.");
      }
      if (!handled.current) {
        busyRef.current = false;
        setHearing(false);
      }
    };
    rec.onend = () => {
      isStartingRef.current = false;
      if (!openRef.current || recRef.current !== rec || speakingRef.current) return;
      // Safari can end a session without finalising the last words: keep them as final text.
      if (!handled.current && buffer.interim) {
        buffer.text = `${buffer.text} ${buffer.interim}`.trim();
        buffer.interim = "";
      }
      if (!handled.current && buffer.text.trim() && iosSingle) {
        // iOS single-utterance session ended after real speech = engine-confirmed silence. Submit once.
        if (silence.current) window.clearTimeout(silence.current);
        silence.current = null;
        commit();
        return;
      }
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
      silence.current = null;
      if (!handled.current) {
        // Empty transcript guard: nothing said → no submit, no Thinking, no audio, no restart loop.
        // Go idle; the user taps again (or speaks after the next continuous reply) to listen.
        wantListenRef.current = false;
        setHearing(false);
      }
    };
    recRef.current = rec;
    isStartingRef.current = true;
    try {
      // Synchronous in the caller's stack: from a tap this satisfies iOS's user-gesture rule.
      rec.start();
      hearingRef.current = true;
      syncPhase(true);
    } catch (err) {
      console.error("[voice] recognition start failed", err);
      setHearing(false);
    } finally {
      // Release the lock after the start call settles (onend/onerror also clear it).
      queueMicrotask(() => { isStartingRef.current = false; });
    }
    // Desktop only: energy monitor for barge-in starts AFTER recognition, never awaited. Skipped on iOS.
    if (!iosSingle) void ensureMic();
  }

  /** Direct tap on "Talk to the brain": resume audio + start recognition synchronously. */
  function onTalkTap() {
    // Tap while listening = stop: commits only a non-empty transcript.
    if (hearingRef.current && recRef.current && manualStopRef.current) {
      manualStopRef.current();
      return;
    }
    beginListening();
  }

  /** Tap → listening, synchronously. Never sets busy/thinking. */
  function beginListening() {
    primeFromGesture();
    wantListenRef.current = true;
    busyRef.current = false;
    hearingRef.current = true;
    syncPhase(true);
    listen();
  }

  function closeVoice() {
    if (silence.current) window.clearTimeout(silence.current);
    silence.current = null;
    speakToken.current++;
    speakingRef.current = false;
    stopRecognition();
    releaseMic();
    wantListenRef.current = false;
    manualStopRef.current = null;
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
    setOpen(true);
    // Sync in this tap: listening phase, audio unlock, recognition.start(). The assistant never speaks first.
    beginListening();
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
        <Mic className="size-4" /> {hearing ? "Listening…" : phase === "speaking" ? "Speaking…" : phase === "thinking" ? "Thinking…" : "Talk to the brain"}
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
