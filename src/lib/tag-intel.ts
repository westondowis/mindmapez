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

export type KnownTag = { name: string; tier: TagTier; manual: boolean };

export type AutoTagInput = {
  /** The memory's text (title, body, summary, transcript). */
  text: string;
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
  const max = input.max ?? 8;
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (n: string) => {
    const k = normalizeTagName(n);
    if (!k || seen.has(k) || out.length >= max) return;
    seen.add(k);
    out.push(k);
  };
  for (const t of input.knownTags) {
    if (!t.manual && isBlockedTag(t.name)) continue; // a stale auto tag that is now filler stays out
    if (mentions(input.text, t.name)) add(t.name);
  }
  for (const name of input.branchNames) {
    if (isBlockedTag(name)) continue;
    if (mentions(input.text, name)) add(name);
  }
  for (const c of input.candidates) {
    const k = normalizeTagName(c);
    if (!k || seen.has(k) || isBlockedTag(k)) continue;
    if (1 + input.recurrence(k) >= MIN_RECURRENCE) add(k);
  }
  return out;
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
