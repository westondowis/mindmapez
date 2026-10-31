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
  CANCEL_CUE,
  COMPLETION_CUE,
  GREETING_DELAY_MS,
  SPEECH_HOLD_MS,
  SPEECH_RMS_THRESHOLD,
  VAD_SILENCE_MS,
  extractKeywords,
  rmsOf,
  type ReviewAction,
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
  const [hearing, setHearing] = useState(false);
  const [line, setLine] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
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
      stopMic();
      clearIdleTimers();
    };
  }, []);

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

  /** Open the live mic and watch its RMS energy every frame (runs during Listening AND Speaking). */
  async function startMic() {
    if (mic.current || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (!openRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      const loop = () => {
        if (!mic.current) return;
        analyser.getByteTimeDomainData(buf);
        const now = performance.now();
        if (rmsOf(buf) >= SPEECH_RMS_THRESHOLD) {
          loudSince.current ??= now;
          if (now - loudSince.current >= SPEECH_HOLD_MS) {
            onUserSpeech();
            if (speakingRef.current) bargeIn();
          }
        } else {
          loudSince.current = null;
        }
        mic.current.raf = window.requestAnimationFrame(loop);
      };
      mic.current = { stream, ctx, analyser, raf: window.requestAnimationFrame(loop) };
    } catch (err) {
      console.error("[voice] mic energy monitor unavailable", err);
    }
  }

  function stopMic() {
    const m = mic.current;
    mic.current = null;
    loudSince.current = null;
    if (!m) return;
    window.cancelAnimationFrame(m.raf);
    m.stream.getTracks().forEach((t) => t.stop());
    void m.ctx.close().catch(() => {});
  }

  /** User talked over the AI: cut speech instantly, drop the queue, go back to Listening. */
  function bargeIn() {
    speakToken.current++;
    speakingRef.current = false;
    window.speechSynthesis?.pause();
    window.speechSynthesis?.cancel();
    bargedIn.current = true;
    onSpeaking(false);
    busyRef.current = false;
    setBusy(false);
    loudSince.current = null;
    listen();
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
    const done = () => {
      if (token !== speakToken.current) return;
      speakingRef.current = false;
      onSpeaking(false);
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
        speakingRef.current = true;
        onSpeaking(true);
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

  function listen() {
    if (busyRef.current) return;
    try {
      if (window.speechSynthesis) {
        if (window.speechSynthesis.speaking) bargedIn.current = true;
        speakToken.current++;
        speakingRef.current = false;
        window.speechSynthesis.cancel();
        const prime = new SpeechSynthesisUtterance(" ");
        prime.volume = 0;
        window.speechSynthesis.speak(prime);
      }
    } catch {
      // speech output unavailable: replies still show as text
    }
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
    rec.onerror = () => { setHearing(false); if (!handled.current) { busyRef.current = false; setBusy(false); } };
    rec.onend = () => {
      if (!openRef.current || recRef.current !== rec) return;
      if (!handled.current && buffer.text.trim()) {
        // The browser ended the session mid-thought (a brief pause). Don't dispatch yet:
        // keep the pending 2 s silence timer and resume listening with the text carried over.
        buffer.base = buffer.text;
        if (!silence.current) silence.current = window.setTimeout(commit, VAD_SILENCE_MS);
        try {
          rec.start();
        } catch {
          commit();
        }
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
        if (continuousRef.current && !busyRef.current) window.setTimeout(() => restartRef.current(), 300);
      }
    };
    recRef.current = rec;
    setHearing(true);
    rec.start();
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
    stopMic();
    greeted.current = false;
    openRef.current = false;
    setOpen(false);
    onSpeaking(false);
    busyRef.current = false;
    setBusy(false);
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
    listen();
    void startMic();
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
        onClick={listen}
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
