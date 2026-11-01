export type ReviewAction = "memory" | "branch" | "sub-branch";

export type ReviewItem = {
  id: string;
  raw: string;
  keyPoints: string[];
  keywords: string[];
  action: ReviewAction;
  conceptId: string | null;
  conceptName: string | null;
  suggestedName: string | null;
  createdAt: string;
};

/** Spoken cues meaning "I'm finished, store what I said". */
export const COMPLETION_CUE =
  /^(?:(?:ok(?:ay)?|yes|yeah|so|alright|all right)[\s,]+)*(?:i'?m done|im done|i am done|i'?m finished|that'?s (?:all|it|everything)|that is (?:all|it)|(?:store|save|file|log|keep|queue|send) (?:this|that|it)|we'?re done|all done|(?:save|store|got it|done|finished|confirm|do it)\s*[.!]*\s*$)/i;

/** Spoken cues meaning "throw the draft away". */
export const CANCEL_CUE = /^(?:cancel|never ?mind|discard|forget it|don'?t save|do not save)\b/i;

const STOP = new Set(
  "about above after again also because before being below between could does doing during each from have having here into just like make more most much only other over really same should some such than that their them then there these they this those through very want what when where which while will with would your remember note save".split(" "),
);

/** Top keywords by frequency (words of 4+ letters, stop words removed). */
export function extractKeywords(text: string, max = 6): string[] {
  const counts = new Map<string, number>();
  for (const w of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (w.length < 4 || STOP.has(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([w]) => w);
}

/** Suggest where a note belongs from its wording. */
export function parseIntent(text: string): ReviewAction {
  if (/\b(sub[- ]?branch|under (?:the )?branch|inside)\b/i.test(text)) return "sub-branch";
  if (/\b(new (?:branch|category|topic|area)|start a (?:branch|category|topic))\b/i.test(text)) return "branch";
  return "memory";
}

/** How the assistant should phrase replies, from how this person has behaved so far. */
export function verbosityHint(t: { turns: number; bargeIns: number; topics: string[] }, prompt: string): string {
  const rate = t.turns >= 4 ? t.bargeIns / t.turns : 0;
  const lower = prompt.toLowerCase();
  const hot = t.topics.find((k) => lower.includes(k));
  if (rate >= 0.4) return "The user interrupts often. Reply in one or two short sentences, no preamble.";
  if (hot) return `The user is highly engaged with "${hot}". Go a little deeper on it, three to five sentences.`;
  return "Keep replies to two or three spoken sentences.";
}

/** Silence after the last recognised speech before a thought is dispatched (never below 2 s). */
export const VAD_SILENCE_MS = 2000;
/** Mic RMS (0..1 time-domain) that counts as the user speaking. */
export const SPEECH_RMS_THRESHOLD = 0.045;
/** Energy must stay above the threshold this long before it counts (filters clicks and pops). */
export const SPEECH_HOLD_MS = 100;

/** Root-mean-square energy of a time-domain sample buffer centred on 128 (AnalyserNode byte data). */
export function rmsOf(samples: ArrayLike<number>): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = ((samples[i] ?? 128) - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / samples.length);
}
/** Elevated RMS required to barge in while the AI is speaking (speaker echo must not trip it). */
export const BARGE_RMS_THRESHOLD = 0.14;
/** Elevated energy must persist this long before it counts as a barge-in. */
export const BARGE_HOLD_MS = 220;
/** Minimum spacing between visible voice phase changes (prevents button flicker). */
export const STATE_DEBOUNCE_MS = 250;

/**
 * iOS / iPadOS WebKit (incl. iPadOS desktop UA and home-screen PWAs).
 * On these, running getUserMedia alongside webkitSpeechRecognition contends for the
 * single hardware audio session, so dictation must own the mic alone.
 */
export function isIOSWebKit(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return /Macintosh/i.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
}

/** True when dictation should rely on SpeechRecognition only (no parallel getUserMedia energy monitor). */
export function preferRecognitionOnly(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { webkitSpeechRecognition?: unknown };
  return isIOSWebKit() && !!w.webkitSpeechRecognition;
}

/** 1-sample silent WAV used to unlock iOS audio playback inside the tap. */
export const SILENT_WAV = "data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAAAA==";

/** If speechSynthesis has not fired onstart by now, treat it as silent and end the turn. */
export const SPEAK_START_TIMEOUT_MS = 1500;
