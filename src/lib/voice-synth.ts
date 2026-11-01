/** Native browser speech output (no external TTS service), hardened for iOS WebKit. */
export type VoiceChoice = "male" | "female";

const MALE = /daniel|alex|aaron|arthur|fred|david|james|guy|gordon|oliver|rishi|tom|evan|nathan|google uk english male|male/i;
const FEMALE = /samantha|ava|allison|susan|serena|karen|moira|tessa|victoria|zira|jenny|aria|nicky|kate|stephanie|google us english|google uk english female|female/i;
const NOVELTY = /compact|eloquence|novelty|bad news|bahh|bells|boing|cellos|good news|jester|organ|superstar|trinoids|whisper|zarvox|albert|bubbles|deranged|hysterical/i;

/** If speechSynthesis has not fired onstart by now, treat it as silent and end the turn. */
export const SPEAK_START_TIMEOUT_MS = 1500;
/** Replies expected to run longer than this get the WebKit keep-alive. */
export const LONG_SPEECH_MS = 10_000;
export const KEEPALIVE_MS = 5_000;

type Voice = Pick<SpeechSynthesisVoice, "name" | "voiceURI" | "lang" | "localService">;

function quality(v: Voice): number {
  const n = `${v.name} ${v.voiceURI}`;
  let q = 0;
  if (/premium|enhanced|neural|natural|siri|online/i.test(n)) q += 6;
  if (/google/i.test(n)) q += 3;
  if (/^en[-_]us/i.test(v.lang)) q += 2;
  else if (/^en/i.test(v.lang)) q += 1;
  if (v.localService) q += 1;
  if (NOVELTY.test(n)) q -= 20;
  return q;
}

/** Best English voice for the choice (premium/Siri/Google first), or null when none are loaded. */
export function pickVoice<T extends Voice>(choice: VoiceChoice, voices: T[]): T | null {
  const en = voices.filter((v) => /^en/i.test(v.lang));
  if (!en.length) return null;
  const wanted = choice === "male" ? MALE : FEMALE;
  const other = choice === "male" ? FEMALE : MALE;
  const score = (v: T) => quality(v) + (wanted.test(v.name) ? 8 : 0) - (other.test(v.name) && !wanted.test(v.name) ? 8 : 0);
  return [...en].sort((a, b) => score(b) - score(a))[0] ?? null;
}

/** Plain, speakable text split into sentence-sized chunks (long utterances get cut off on phones). */
export function speechChunks(text: string): string[] {
  const clean = text
    .replace(/[*_#`>]+/g, "")
    .replace(/^\s*[•\-]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean.match(/[^.!?]+[.!?]*\s*/g)?.map((c) => c.trim()).filter(Boolean) ?? [];
}

/** Rough speaking time at a calm pace (~2.5 words/second). */
export function estimateSpeechMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return (words / 2.5) * 1000;
}

/**
 * Call synchronously inside the tap: speaking a silent utterance unlocks speechSynthesis for
 * later replies, which iOS otherwise drops when speak() runs after a network response.
 */
export function primeSynth(synth: SpeechSynthesis | undefined = globalThis.speechSynthesis): void {
  if (!synth) return;
  try {
    synth.cancel();
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    synth.speak(u);
  } catch {
    // speech output unavailable: replies still show as text
  }
}

/** Resolve voices, waiting for `voiceschanged` (iOS returns an empty list until it fires). */
function withVoices(synth: SpeechSynthesis, cb: (voices: SpeechSynthesisVoice[]) => void) {
  const now = synth.getVoices();
  if (now.length) return cb(now);
  let fired = false;
  const go = () => {
    if (fired) return;
    fired = true;
    synth.removeEventListener?.("voiceschanged", go);
    cb(synth.getVoices());
  };
  synth.addEventListener?.("voiceschanged", go);
  setTimeout(go, 1000);
}

export type SpeakCallbacks = { onStart: () => void; onEnd: () => void; onError: () => void };

/**
 * Speak with the device's own voices. cancel() first (WebKit silence trap), explicit en-US default,
 * volume 1, and a pause/resume keep-alive every 5 s on long replies (WebKit cuts them off otherwise).
 * Returns a function that stops everything (used for barge-in and close).
 */
export function speakNative(
  text: string,
  choice: VoiceChoice,
  cb: SpeakCallbacks,
  synth: SpeechSynthesis | undefined = globalThis.speechSynthesis,
): () => void {
  const chunks = speechChunks(text);
  if (!synth || !chunks.length) {
    cb.onEnd();
    return () => {};
  }
  let settled = false;
  let started = false;
  let keepAlive: ReturnType<typeof setInterval> | null = null;
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  const cleanup = () => {
    if (keepAlive) clearInterval(keepAlive);
    if (watchdog) clearTimeout(watchdog);
    keepAlive = watchdog = null;
  };
  const finish = (fn: () => void) => {
    if (settled) return;
    settled = true;
    cleanup();
    fn();
  };

  synth.cancel();
  if (synth.paused) synth.resume();
  withVoices(synth, (voices) => {
    if (settled) return;
    const v = pickVoice(choice, voices) ?? voices.find((x) => x.lang === "en-US") ?? voices[0] ?? null;
    chunks.forEach((chunk, i) => {
      const u = new SpeechSynthesisUtterance(chunk);
      if (v) u.voice = v;
      u.lang = v?.lang ?? "en-US";
      u.volume = 1;
      u.rate = 1;
      u.pitch = choice === "male" ? 0.92 : 1;
      if (i === 0) {
        u.onstart = () => {
          started = true;
          if (watchdog) clearTimeout(watchdog);
          cb.onStart();
        };
      }
      if (i === chunks.length - 1) u.onend = () => finish(cb.onEnd);
      u.onerror = () => finish(cb.onError);
      try {
        synth.speak(u);
      } catch {
        finish(cb.onError);
      }
    });
    if (estimateSpeechMs(text) > LONG_SPEECH_MS) {
      keepAlive = setInterval(() => {
        try {
          synth.pause();
          synth.resume();
        } catch {
          // ignore: best-effort keep-alive
        }
      }, KEEPALIVE_MS);
    }
    watchdog = setTimeout(() => {
      if (started || settled) return;
      synth.cancel();
      finish(cb.onError);
    }, SPEAK_START_TIMEOUT_MS);
  });
  return () => {
    settled = true;
    cleanup();
    try { synth.cancel(); } catch { /* ignore */ }
  };
}
