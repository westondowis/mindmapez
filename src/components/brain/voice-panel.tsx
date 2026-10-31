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
import { createMemory } from "@/lib/server/memories";

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
  const pending = useRef<{ raw: string; keyPoints: string[]; tags: string[]; conceptId: string | null; name: string | null } | null>(null);
  const continuousRef = useRef(false);
  const busyRef = useRef(false);
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
    };
  }, []);

  /** End of a turn: clear busy, and in continuous mode go back to Listening. */
  function finishTurn() {
    busyRef.current = false;
    setBusy(false);
    setHearing(false);
    if (continuousRef.current) window.setTimeout(() => restartRef.current(), 300);
  }

  function speak(text: string) {
    if (!window.speechSynthesis || !speechChunks(text).length) {
      finishTurn();
      return;
    }
    window.speechSynthesis.cancel();
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
      if (i === 0) u.onstart = () => onSpeaking(true);
      if (i === chunks.length - 1) u.onend = () => { onSpeaking(false); finishTurn(); };
      u.onerror = () => { onSpeaking(false); finishTurn(); };
      window.speechSynthesis.speak(u);
    });
  }

  async function handle(text: string) {
    const clean = text.trim();
    if (!clean) return;
    setLine(clean);
    busyRef.current = true;
    setBusy(true);
    try {
      if (pending.current && /^(yes|yeah|save it|do it|confirm|i'?m done|im done|store this|that is all|that'?s all|no,? i'?m done|save this)/i.test(clean)) {
        const p = pending.current;
        const body = p.raw + "\n\nKey points:\n" + p.keyPoints.map((k) => "• " + k).join("\n");
        await createMemory({ data: { title: p.raw.slice(0, 80), body, transcript: p.raw, memoryType: "voice", tags: p.tags, conceptId: p.conceptId } });
        void qc.invalidateQueries({ queryKey: ["graph"] });
        pending.current = null;
        const said = p.name ? `Saved under ${p.name}.` : "Saved as a new memory.";
        setReply(said);
        speak(said);
        return;
      }
      if (pending.current && /^(no|cancel|don't|do not)/i.test(clean)) {
        pending.current = null;
        const said = "Okay, I did not save that.";
        setReply(said);
        speak(said);
        return;
      }
      const remember = clean.match(/^(remember|save|add a memory|note that|i want to remember)\s+(.+)/i);
      const note = remember?.[2] ?? (clean.split(/\s+/).length > 18 ? clean : null);
      if (note) {
        const plan = await voiceIngest({ data: { transcript: note } });
        if (!plan.ok) throw new Error(plan.error);
        if (plan.clarify) {
          setReply(plan.clarify);
          speak(plan.clarify);
          return;
        }
        pending.current = { raw: plan.raw, keyPoints: plan.keyPoints, tags: plan.tags, conceptId: plan.suggested?.id ?? null, name: plan.suggested?.name ?? null };
        const where = plan.suggested ? `I would put this under ${plan.suggested.name}.` : "I do not see a matching branch. I can save it unfiled.";
        const said = `${where} Tags: ${plan.tags.slice(0, 3).join(", ") || "none"}. Say yes to save.`;
        setReply(said);
        speak(said);
        return;
      }
      const res = await askAssistant({ data: { prompt: clean } });
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
    rec.continuous = continuousRef.current;
    rec.interimResults = true;
    const buffer = { text: "" };
    const commit = () => {
      if (handled.current || !buffer.text.trim()) return;
      handled.current = true;
      if (silence.current) window.clearTimeout(silence.current);
      setHearing(false);
      try { rec.stop(); } catch { /* already stopped */ }
      void handle(buffer.text.trim());
    };
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i]?.[0]?.transcript ?? "";
      buffer.text = text;
      setLine(text);
      if (silence.current) window.clearTimeout(silence.current);
      const last = e.results[e.results.length - 1];
      silence.current = window.setTimeout(commit, last?.isFinal ? 700 : 1800);
    };
    rec.onerror = () => { setHearing(false); if (!handled.current) { busyRef.current = false; setBusy(false); } };
    rec.onend = () => { if (!handled.current) setHearing(false); };
    recRef.current = rec;
    setHearing(true);
    rec.start();
  }

  restartRef.current = listen;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pointer-events-auto absolute left-3 top-10 z-30 flex items-center gap-1.5 rounded-full border border-white/15 bg-black/60 px-3 py-1.5 text-xs text-white"
      >
        <Mic className="size-3.5" /> Voice
      </button>
    );
  }

  return (
    <div className="pointer-events-auto absolute left-3 top-10 z-30 w-[min(100%-1.5rem,18rem)] rounded-2xl border border-[#6a2ca8]/40 bg-black/80 p-3 text-white backdrop-blur-md">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.14em] text-[#c9b6ff]">Voice</p>
        <button type="button" onClick={() => { setOpen(false); onSpeaking(false); }} className="text-white/60" aria-label="Close">✕</button>
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
      {line ? <p className="mt-2 text-[11px] text-white/60">You: {line}</p> : null}
      {reply ? (
        <p className="mt-1 flex items-start gap-1 text-[12px] leading-snug">
          <Volume2 className="mt-0.5 size-3.5 shrink-0 text-[#c9b6ff]" /> {reply}
        </p>
      ) : null}
    </div>
  );
}
