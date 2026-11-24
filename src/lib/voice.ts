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
  /** Set when an MCP connector queued this item; its text is untrusted input. */
  connectorName?: string | null;
  /** The title the connector proposed. */
  suggestedTitle?: string | null;
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

/** Silence after the last recognised speech before a thought is dispatched (3.5 s so people can pause and finish a long thought); partials re-arm it. */
export const VAD_SILENCE_MS = 3500;
/** Cool-down after aborting a recognizer before the next may start (a start racing an abort fails in Chrome). */
export const RECOGNIZER_GAP_MS = 250;
/** Pause before a recognizer that ended on its own is started again in continuous mode. */
export const RECOGNIZER_RESTART_MS = 120;
/** Distil the voice style profile every this many voice turns. */
export const STYLE_EVERY_TURNS = 8;
/** Style line used until a profile has been distilled. */
export const STYLE_COLD_START =
  "New account with no prior history. Use a relaxed, friendly, low-ego conversational tone in everyday spoken English.";

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s']/g, " ").replace(/\s+/g, " ").trim();

const OPENERS = /^(?:(?:hey|hi|hello|yo|okay|ok|alright|so|well|um|uh|hmm|mm|mhm)\s+)+/;
const SMALL_TALK = [
  /^(?:hey|hi|hello|yo|howdy|sup|good (?:morning|afternoon|evening)|morning|evening)(?: there)?$/,
  /^(?:how'?s it going|how is it going|how are you(?: doing| today)?|how'?s (?:your day|everything|life|your day going)|what'?s up|whats up|what is up|how you doing|how have you been)$/,
  /^(?:yeah|yep|yes|yup|no|nope|okay|ok|alright|sure|cool|nice|great|right|mhm|uh huh|hmm|um|uh|thanks|thank you|got it|go on|continue|so|well)$/,
  /^(?:hold on|hang on|wait|one sec|one second|just a sec|give me a sec|give me a second|let me think)$/,
];

/** True for a greeting, small talk or filler: such a turn must never pull stored memories into the prompt. */
export function isSmallTalk(text: string): boolean {
  let t = norm(text).replace(/\b(?:mister|mr)\.? brain\b|\bbrain\b/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return true;
  if (t.split(" ").length > 8) return false;
  if (SMALL_TALK.some((re) => re.test(t))) return true;
  const rest = t.replace(OPENERS, "").trim();
  return rest !== t && (rest === "" || SMALL_TALK.some((re) => re.test(rest)));
}

/** True when what the mic heard is just the assistant's own voice coming back (substring of the spoken text). */
export function isEchoOf(heard: string, spoken: string): boolean {
  const h = norm(heard);
  if (!h) return true;
  return norm(spoken).includes(h);
}

/** True on every STYLE_EVERY_TURNS-th voice turn. */
export function shouldDistillStyle(turnCount: number, every = STYLE_EVERY_TURNS): boolean {
  return Number.isInteger(turnCount) && turnCount > 0 && turnCount % every === 0;
}

/** The strict spoken-conversation system prompt for voice mode. */
export function voiceSystemPrompt(opts: { styleProfile: string | null; branchMap: string }): string {
  const style = opts.styleProfile?.trim() || STYLE_COLD_START;
  return [
    "You are Mr. Brain, a sharp, grounded conversational partner and personal memory companion. You are being spoken aloud.",
    "RULES:",
    "1. Keep every reply to 1 or 2 short spoken sentences, under 30 words, unless the user explicitly asks for a detailed explanation or to recall something.",
    "2. Treat stored memories as silent background knowledge. Never recite reminders, active topics or system states unprompted. Never say the words Mesh, nodes, cerebellum, temporal spot or memory graph.",
    "3. Answer casual greetings like a relaxed person, for example: Hey, I'm pretty good, no complaints. What about yourself?",
    "4. When the user is dumping thoughts or storing notes, confirm in a few words, like: Got it, locked in. Or: Makes sense, keep going. Do not summarize back what they said.",
    "5. Plain spoken English with contractions only. No markdown, no lists, no robotic assistant clichés.",
    "When asked where something belongs, name a real branch from this list, spoken naturally:",
    opts.branchMap || "(no branches yet)",
    `USER STYLE PROFILE:\n${style}`,
  ].join("\n");
}
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


/** Words of speech heard over the assistant before it counts as an interruption (a stray syllable or echo fragment does not). */
export const BARGE_MIN_WORDS = 2;
export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
