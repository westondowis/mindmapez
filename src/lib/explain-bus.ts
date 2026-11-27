/**
 * Tiny open/close bus for the Explain sheet so any button (memory sheet, node popover, card, search
 * result) can open it without prop plumbing. It also owns the ONE persistent <audio> element, which
 * openExplain() unlocks synchronously inside the caller's tap so iOS lets later playback through.
 */
import { SILENT_WAV } from "./voice.ts";

export type ExplainRequest = {
  targetType: "memory" | "branch";
  targetId: string;
  title: string;
  startMode?: "summary" | "audio";
};

type Listener = () => void;
const listeners = new Set<Listener>();
let current: ExplainRequest | null = null;
let audio: HTMLAudioElement | null = null;

export function getExplainAudio(): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  if (!audio) {
    audio = new Audio();
    audio.setAttribute("playsinline", "");
    audio.preload = "auto";
  }
  return audio;
}

/** Call inside a user gesture. Plays the silent clip on the shared element so later replies are allowed. */
export function unlockExplainAudio(): void {
  try {
    const a = getExplainAudio();
    if (!a) return;
    a.muted = false;
    a.volume = 1;
    a.src = SILENT_WAV;
    const p = a.play();
    if (p) void p.then(() => a.pause()).catch(() => {});
  } catch {
    // no audio element: native speech fallback still works
  }
}

export function openExplain(req: ExplainRequest): void {
  unlockExplainAudio();
  current = req;
  listeners.forEach((l) => l());
}

export function closeExplain(): void {
  if (!current) return;
  current = null;
  try {
    audio?.pause();
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}

export function subscribeExplain(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function getExplainRequest(): ExplainRequest | null {
  return current;
}
