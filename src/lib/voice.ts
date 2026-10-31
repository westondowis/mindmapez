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
