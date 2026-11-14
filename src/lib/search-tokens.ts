const STOP = new Set(
  "the and for are but not you your with that this have from they will what when where which about would could should there their been were was has had how why who does did can just like into than then them also some any our out its his her she him".split(" "),
);

/** Escape LIKE wildcards so user words match literally. */
export function escapeLike(word: string): string {
  return word.replace(/[\\%_]/g, "\\$&");
}

/**
 * Candidate-retrieval tokens from a question: lower-cased words of 3+ characters, stop words
 * removed, de-duplicated, longest first, capped. Returned as ILIKE patterns (`%word%`).
 * @param {string} prompt The user's question.
 * @param {number} [max] Maximum patterns.
 * @returns {string[]} ILIKE patterns; empty when the question has no usable words.
 */
export function likePatterns(prompt: string, max = 8): string[] {
  const words = prompt.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w));
  return [...new Set(words)]
    .sort((a, b) => b.length - a.length)
    .slice(0, max)
    .map((w) => `%${escapeLike(w)}%`);
}
