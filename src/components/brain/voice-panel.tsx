import { Mic, Volume2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
type SpeechRecognition = {
  lang: string;
  start: () => void;
  onresult: ((e: { results: { 0: { 0: { transcript: string } } } }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}
import { askAssistant } from "@/lib/server/assistant";
import { createMemory } from "@/lib/server/memories";

type VoiceChoice = "male" | "female";

function pickVoice(choice: VoiceChoice): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  const male = /daniel|alex|fred|david|james|male/i;
  const female = /samantha|victoria|karen|moira|female|zira/i;
  const match = voices.find((v) => (choice === "male" ? male : female).test(v.name));
  return match ?? voices[choice === "male" ? 0 : 1] ?? voices[0] ?? null;
}

export function VoicePanel({ onSpeaking }: { onSpeaking: (on: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [voice, setVoice] = useState<VoiceChoice>("female");
  const [hearing, setHearing] = useState(false);
  const [line, setLine] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
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
    // Stop talking if the panel goes away mid-sentence.
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  function speak(text: string) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(voice);
    if (v) u.voice = v;
    u.rate = 0.9;
    u.pitch = voice === "male" ? 0.8 : 0.95;
    u.onstart = () => onSpeaking(true);
    u.onend = () => onSpeaking(false);
    u.onerror = () => onSpeaking(false);
    window.speechSynthesis.speak(u);
  }

  async function handle(text: string) {
    const clean = text.trim();
    if (!clean) return;
    setLine(clean);
    setBusy(true);
    try {
      const remember = clean.match(/^(remember|save|add a memory|note that)\s+(.+)/i);
      if (remember?.[2]) {
        const body = remember[2];
        await createMemory({ data: { title: body.slice(0, 80), body, memoryType: "text" } });
        void qc.invalidateQueries({ queryKey: ["graph"] });
        const said = "Saved. I added that as a memory.";
        setReply(said);
        speak(said);
        return;
      }
      const res = await askAssistant({ data: { prompt: clean } });
      const said = res.ok ? res.content : "I could not reach the brain just now.";
      setReply(said);
      speak(said);
    } catch {
      const said = "Something went wrong. Please try again.";
      setReply(said);
      speak(said);
    } finally {
      setBusy(false);
    }
  }

  function listen() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setReply("Voice input is not available in this browser.");
      return;
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.onresult = (e) => {
      const text = e.results[0]?.[0]?.transcript ?? "";
      setHearing(false);
      void handle(text);
    };
    rec.onerror = () => setHearing(false);
    rec.onend = () => setHearing(false);
    recRef.current = rec;
    setHearing(true);
    rec.start();
  }

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
