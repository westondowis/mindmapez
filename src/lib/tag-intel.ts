/**
 * Pure tagging rules: which words may become tags, which recur enough across the brain to
 * deserve one, and when a tag is promoted from secondary to primary. No I/O here, so every
 * rule is unit-tested; the server layer only gathers counts and persists the result.
 */

export type TagTier = "primary" | "secondary";

/** Tokens shorter than this never become tags (unless the user pinned them). */
export const MIN_TAG_LENGTH = 3;
/** A new auto tag needs this many distinct items (memories or branches) mentioning it. */
export const MIN_RECURRENCE = 2;
/** Automatic tagging never proposes more than this many tags; the user adds or removes the rest. */
export const MAX_AUTO_TAGS = 4;
/** A new auto keyword must score at least this (see scoreKeywords) to be considered. */
export const MIN_KEYWORD_SCORE = 3.5;
/** New auto keywords are at least this long (3-letter ones only as ALL-CAPS acronyms). */
export const MIN_AUTO_LENGTH = 4;
/** Auto-promotion to primary: this many distinct items ... */
export const PRIMARY_ITEMS = 5;
/** ... or this many different branches / sectors. */
export const PRIMARY_BRANCHES = 2;

const WORDS = (s: string) => new Set(s.split(/\s+/).filter(Boolean));

/** Stopwords, prepositions, conjunctions, auxiliaries, pronouns, fillers and conversational connectors. */
export const TAG_BLOCKLIST: ReadonlySet<string> = WORDS(`
a about above across actually after afterwards again against all almost alone along already also although always am among amongst an and another any anybody anyhow anyone anything anyway anywhere are aren around as at away
back basically be became because become becomes becoming been before beforehand behind being below beside besides between beyond both but by
can cannot cant could couldn
did didn do does doesn doing don done down during
each either else elsewhere enough especially essentially etc even ever every everybody everyone everything everywhere except
few first for former formerly from further
get gets getting give go goes going gonna got gotta
had hadn has hasn have haven having he hence her here hereby herein hers herself hey him himself his how however
i if in indeed inside instead into is isn it its itself
just keep kind kinda
last lately later least less let like liked likely little look looks lot lots
made make makes making many may maybe me meanwhile might mine more moreover most mostly much must my myself
namely near nearly need needs neither never nevertheless next no nobody none nor not nothing now nowhere
of off often oh ok okay on once one ones only onto or other others otherwise our ours ourselves out over own
particularly per perhaps please probably put quite
rather really regarding regards right said same say says see seem seemed seems several shall she should since so some somebody somehow someone something sometime sometimes somewhat somewhere sort sorta still stuff such sure
take taken than thank thanks that thats the their theirs them themselves then thence there thereafter thereby therefore therein these they thing things think thinking thought thoughts this those though through throughout thru thus to together too took toward towards try trying
under unless until up upon us use used using usually
very via want wanted wants was wasn way we well went were weren what whatever when whence whenever where whereas whereby wherever whether which while whither who whoever whole whom whose why will with within without won would wouldn
yeah yes yet you your yours yourself yourselves
also able across add added anyway around bit couple day days end enough etc example fine good great guess hmm know knew known mean means meant new nice note notes okay old part pretty quick real stuff talk talked tell time times today tomorrow tonight way week weeks yesterday year years
`);

/** Lowercase, trimmed tag key; collapses spacing and leading '#'. */
export function normalizeTagName(raw: string): string {
  return String(raw).trim().replace(/^#+/, "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 48);
}

export function tagSlug(name: string): string {
  return normalizeTagName(name).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "tag";
}

/** True for stopwords, fillers, pure numbers and tokens under MIN_TAG_LENGTH. */
export function isBlockedTag(word: string): boolean {
  const w = normalizeTagName(word);
  if (w.length < MIN_TAG_LENGTH) return true;
  if (/^[0-9\W_]+$/.test(w)) return true;
  // A multi-word tag is blocked only when every word is.
  const parts = w.split(/[\s-]+/).filter(Boolean);
  return parts.every((p) => p.length < MIN_TAG_LENGTH || TAG_BLOCKLIST.has(p) || /^[0-9]+$/.test(p));
}

/**
 * Candidate keywords of one text, most frequent first. Only unigrams that pass the blocklist.
 * @param {string} text Memory text.
 * @param {number} [max] Cap on candidates.
 */
export function extractCandidates(text: string, max = 12): string[] {
  const counts = new Map<string, number>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9']+/)) {
    const w = raw.replace(/^'+|'+$/g, "").replace(/'s$/, "");
    if (!w || isBlockedTag(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, max)
    .map(([w]) => w);
}

/** True when `phrase` occurs in `text` as whole words (case-insensitive). */
export function mentions(text: string, phrase: string): boolean {
  const p = normalizeTagName(phrase);
  if (!p) return false;
  const esc = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?:^|[^a-z0-9])${esc}s?(?:$|[^a-z0-9])`, "i").test(text);
}

export type KeywordScore = { word: string; score: number };

const SENTENCE_SPLIT = /(?<=[.!?])\s+|\n+/;

/**
 * Rank the words of a text by how likely they are to be its topic keywords. A word is only a candidate
 * if it passes the blocklist, is at least MIN_AUTO_LENGTH letters (or an ALL-CAPS acronym), and is
 * not a contraction fragment. Score builds a hierarchy: title > first sentence > repeated > proper
 * noun > long word, with penalties for adverbs and -ing/-ed forms (usually verbs, not topics).
 * Capitalised neighbours ("Seller Financing") are offered as one phrase.
 * @param {string} text Memory text (body, transcript, summary).
 * @param {string} [title] Memory title; words in it get the biggest boost.
 * @returns {KeywordScore[]} Eligible words/phrases scoring >= MIN_KEYWORD_SCORE, best first.
 */
export function scoreKeywords(text: string, title = ""): KeywordScore[] {
  // "John's" -> "John"; any other contraction fragment ("don't", "it's" -> it) is dropped whole.
  const strip = (t: string) => t.replace(/\b[\w-]+['\u2019][\w']+\b/g, (m) => (/['\u2019]s$/i.test(m) ? m.replace(/['\u2019]s$/i, "") : " "));
  const titleWords = new Set((strip(title).match(/[A-Za-z][A-Za-z0-9-]*/g) ?? []).map((w) => w.toLowerCase()));
  type Entry = { count: number; first: number; proper: boolean };
  const entries = new Map<string, Entry>();
  const phrases = new Map<string, { a: string; b: string; first: number }>();
  const sentences = strip(text).split(SENTENCE_SPLIT).filter(Boolean);
  const eligible = (w: string, raw: string) => {
    if (isBlockedTag(w)) return false;
    return w.length >= MIN_AUTO_LENGTH || (raw.length >= 3 && raw === raw.toUpperCase() && /^[A-Z]+$/.test(raw));
  };
  sentences.forEach((sentence, si) => {
    const toks = [...sentence.matchAll(/[A-Za-z][A-Za-z0-9-]*/g)];
    toks.forEach((m, ti) => {
      const raw = m[0];
      const w = raw.toLowerCase();
      if (!eligible(w, raw)) return;
      const acronym = raw.length >= 3 && raw === raw.toUpperCase();
      const proper = acronym || (ti > 0 && /^[A-Z]/.test(raw));
      const e = entries.get(w) ?? { count: 0, first: si, proper: false };
      e.count++;
      e.proper = e.proper || proper;
      entries.set(w, e);
      const next = toks[ti + 1];
      if (next && /^[A-Z]/.test(raw) && /^[A-Z]/.test(next[0]) && next.index === (m.index ?? 0) + raw.length + 1) {
        const nw = next[0].toLowerCase();
        if (eligible(nw, next[0])) phrases.set(`${w} ${nw}`, { a: w, b: nw, first: si });
      }
    });
  });
  const score = (w: string, e: Entry): number => {
    let sc = Math.min(e.count, 4) * 1.5;
    if (titleWords.has(w)) sc += 4;
    if (e.first === 0) sc += 2;
    if (e.proper) sc += 3;
    if (w.length >= 7) sc += 1;
    if (/ly$/.test(w)) sc -= 4;
    if (/(?:ing|ed)$/.test(w) && !titleWords.has(w) && !e.proper) sc -= 2;
    return sc;
  };
  const out: KeywordScore[] = [];
  const single = new Map<string, number>();
  for (const [w, e] of entries) {
    const sc = score(w, e);
    single.set(w, sc);
    if (sc >= MIN_KEYWORD_SCORE) out.push({ word: w, score: sc });
  }
  for (const [phrase, p] of phrases) {
    const a = single.get(p.a) ?? 0;
    const b = single.get(p.b) ?? 0;
    if (a >= MIN_KEYWORD_SCORE - 1 && b >= MIN_KEYWORD_SCORE - 1) out.push({ word: phrase, score: (a + b) / 2 + 2 });
  }
  return out.sort((x, y) => y.score - x.score || y.word.length - x.word.length);
}

/**
 * Clean a tag list produced by an LLM or a heuristic: no filler, stopwords, contraction fragments
 * or tiny tokens; tags that really occur in `text` rank first; at most `max` come back.
 * @param {string[]} tags Proposed tags.
 * @param {number} [max] Cap (default MAX_AUTO_TAGS).
 * @param {string} [text] Source text used to prefer tags the memory actually mentions.
 */
export function sanitizeGeneratedTags(tags: string[], max = MAX_AUTO_TAGS, text = ""): string[] {
  const seen = new Set<string>();
  const kept: { tag: string; hit: boolean }[] = [];
  for (const raw of tags) {
    const tag = String(raw).trim().replace(/^#+/, "").trim();
    const key = normalizeTagName(tag);
    if (!key || seen.has(key) || /['\u2019]/.test(tag)) continue;
    if (isBlockedTag(key)) continue;
    seen.add(key);
    kept.push({ tag, hit: text ? mentions(text, key) : false });
  }
  return [...kept.filter((k) => k.hit), ...kept.filter((k) => !k.hit)].slice(0, max).map((k) => k.tag);
}

export type KnownTag = { name: string; tier: TagTier; manual: boolean };

export type AutoTagInput = {
  /** The memory's text (title, body, summary, transcript). */
  text: string;
  /** The memory's title (its words rank highest). */
  title?: string;
  /** Candidates from any extractor (local counts, an LLM); every one is still gated. */
  candidates: string[];
  /** The user's existing tags, both tiers. */
  knownTags: KnownTag[];
  /** Existing sector / branch names and descriptions (matched first). */
  branchNames: string[];
  /** Distinct OTHER items (memories + branches) that mention a candidate; the current memory is not counted. */
  recurrence: (word: string) => number;
  max?: number;
};

/**
 * Two-stage auto-tagging.
 *  1. Existing tags and branch/sector names that the text mentions are always used. A manually
 *     pinned tag is allowed even if its word is on the blocklist.
 *  2. A new keyword must pass the blocklist and appear in at least MIN_RECURRENCE distinct
 *     items in total (the other items plus this memory), so a single isolated mention never
 *     creates a tag.
 * @returns Lowercase tag names, existing ones first, de-duplicated.
 */
export function selectAutoTags(input: AutoTagInput): string[] {
  const max = Math.min(input.max ?? MAX_AUTO_TAGS, MAX_AUTO_TAGS);
  const scored = new Map<string, number>();
  const put = (name: string, score: number) => {
    const k = normalizeTagName(name);
    if (!k) return;
    if (!scored.has(k) || scored.get(k)! < score) scored.set(k, score);
  };
  for (const t of input.knownTags) {
    if (!t.manual && isBlockedTag(t.name)) continue; // a stale auto tag that is now filler stays out
    if (mentions(input.text, t.name)) put(t.name, 30 + (t.tier === "primary" ? 3 : 0) + (t.manual ? 2 : 0));
  }
  for (const name of input.branchNames) {
    if (isBlockedTag(name)) continue;
    if (mentions(input.text, name)) put(name, 20);
  }
  // New keywords: must really be topical in THIS text (ranked), and recur elsewhere in the brain.
  const topical = new Map(scoreKeywords(input.text, input.title).map((k) => [k.word, k.score]));
  for (const c of input.candidates) {
    const k = normalizeTagName(c);
    if (!k || scored.has(k) || isBlockedTag(k)) continue;
    const base = topical.get(k);
    if (base === undefined) continue;
    const rec = input.recurrence(k);
    if (1 + rec < MIN_RECURRENCE) continue;
    put(k, base + Math.min(rec, 3));
  }
  return [...scored.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([n]) => n);
}

/**
 * Tier after a recount. A manual override never changes. Otherwise a secondary tag is promoted to
 * primary at PRIMARY_ITEMS distinct items or PRIMARY_BRANCHES distinct branches/sectors; a tag is
 * never demoted automatically.
 */
export function computeTier(t: { tier: TagTier; manual: boolean; items: number; branches: number }): TagTier {
  if (t.manual) return t.tier;
  if (t.tier === "primary") return "primary";
  return t.items >= PRIMARY_ITEMS || t.branches >= PRIMARY_BRANCHES ? "primary" : "secondary";
}

/** A non-manual tag nothing references any more is removed by the recount. */
export function shouldAutoDelete(t: { manual: boolean; items: number }): boolean {
  return !t.manual && t.items <= 0;
}
