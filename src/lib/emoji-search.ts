/**
 * Searchable Unicode emoji library: parses the generated rows in emoji-data.ts
 * and ranks matches by CLDR name, subgroup, category and a small synonym map.
 * Pure module (no DOM), shared by the picker and node tests.
 */

export type EmojiCategoryId =
  | "smileys" | "people" | "animals" | "food" | "activities" | "travel" | "objects" | "symbols" | "flags";

export type EmojiEntry = {
  emoji: string;
  name: string;
  group: EmojiCategoryId;
  subgroup: string;
  /** lowercase name words + subgroup words, for prefix matching */
  words: string[];
  order: number;
};

export const EMOJI_CATEGORIES: { id: EmojiCategoryId; label: string; full: string; icon: string }[] = [
  { id: "smileys", label: "Smileys", full: "Smileys & Emotion", icon: "😀" },
  { id: "people", label: "People", full: "People & Body", icon: "🧑" },
  { id: "animals", label: "Nature", full: "Animals & Nature", icon: "🐻" },
  { id: "food", label: "Food", full: "Food & Drink", icon: "🍔" },
  { id: "activities", label: "Activities", full: "Activities", icon: "⚽" },
  { id: "travel", label: "Travel", full: "Travel & Places", icon: "✈️" },
  { id: "objects", label: "Objects", full: "Objects", icon: "💡" },
  { id: "symbols", label: "Symbols", full: "Symbols", icon: "❤️" },
  { id: "flags", label: "Flags", full: "Flags", icon: "🏁" },
];

/** Query word -> CLDR name fragments it should also find. Multi-word keys are matched as phrases. */
export const EMOJI_SYNONYMS: Record<string, string[]> = {
  "real estate": ["house", "key", "office building", "building construction", "derelict house", "houses"],
  property: ["house", "key", "houses", "office building"],
  house: ["house", "home", "hut"],
  home: ["house", "key", "couch", "bed"],
  land: ["national park", "desert", "mountain", "seedling", "tractor", "world map"],
  lot: ["national park", "seedling", "world map"],
  farm: ["tractor", "sheaf of rice", "seedling", "cow", "pig"],
  money: ["money", "dollar", "coin", "bank", "credit card", "gem stone", "chart increasing", "receipt"],
  cash: ["money", "dollar", "coin"],
  finance: ["chart increasing", "chart decreasing", "bank", "money", "receipt"],
  deal: ["handshake", "page facing up", "memo", "writing hand", "pen"],
  contract: ["page facing up", "memo", "writing hand", "scroll", "handshake"],
  golf: ["golf", "flag in hole"],
  putter: ["golf", "flag in hole"],
  work: ["briefcase", "laptop", "office", "chart", "clipboard", "necktie"],
  job: ["briefcase", "office worker", "necktie"],
  business: ["briefcase", "office building", "chart increasing", "handshake"],
  family: ["family", "people hugging", "house with garden", "baby", "couple"],
  kids: ["child", "baby", "boy", "girl"],
  tree: ["tree", "palm", "evergreen", "deciduous", "seedling"],
  health: ["heart", "flexed biceps", "pill", "stethoscope", "red apple", "lotus position"],
  fitness: ["flexed biceps", "person running", "weight lifting", "biking"],
  gym: ["flexed biceps", "weight lifting"],
  idea: ["light bulb", "sparkles", "brain", "star"],
  mind: ["brain", "thinking face", "thought balloon", "light bulb", "crystal ball"],
  think: ["thinking face", "thought balloon", "brain"],
  love: ["heart", "kiss", "love", "couple"],
  travel: ["airplane", "luggage", "map", "beach", "globe", "compass"],
  trip: ["airplane", "luggage", "map", "compass"],
  vacation: ["beach", "island", "airplane", "luggage", "palm"],
  learn: ["books", "book", "graduation cap", "pencil", "school"],
  study: ["books", "open book", "graduation cap", "pencil"],
  school: ["school", "graduation cap", "backpack", "books"],
  music: ["music", "musical", "guitar", "headphone", "microphone"],
  goal: ["direct hit", "trophy", "medal", "chequered flag"],
  win: ["trophy", "medal", "party popper"],
  time: ["clock", "hourglass", "alarm", "calendar", "stopwatch"],
  schedule: ["calendar", "spiral calendar", "alarm clock"],
  car: ["automobile", "car", "taxi", "racing car"],
  drive: ["automobile", "motorway"],
  phone: ["phone", "telephone"],
  call: ["telephone", "phone", "receiver"],
  email: ["e-mail", "envelope", "mailbox", "inbox"],
  mail: ["envelope", "mailbox", "postbox"],
  code: ["laptop", "computer", "keyboard", "robot", "gear"],
  tech: ["laptop", "computer", "robot", "satellite", "gear"],
  ai: ["robot", "brain", "sparkles"],
  happy: ["smiling", "grinning", "joy", "beaming"],
  sad: ["crying", "sad", "frowning", "pensive", "disappointed"],
  angry: ["angry", "pouting", "enraged", "steam from nose"],
  party: ["party", "confetti", "balloon", "birthday cake"],
  celebrate: ["party popper", "confetti", "clinking", "bottle with popping cork"],
  faith: ["folded hands", "church", "place of worship", "dove"],
  pray: ["folded hands", "place of worship"],
  sleep: ["sleeping", "zzz", "bed"],
  food: ["fork and knife", "plate", "pizza", "hamburger"],
  coffee: ["hot beverage", "teacup"],
  drink: ["beer", "wine", "cocktail", "hot beverage", "tumbler"],
  dog: ["dog", "poodle", "guide dog"],
  cat: ["cat"],
  fire: ["fire"],
  warning: ["warning", "no entry", "prohibited", "police car light"],
  check: ["check mark", "ballot box with check"],
  done: ["check mark", "chequered flag"],
  note: ["memo", "spiral notepad", "pencil"],
  security: ["locked", "key", "shield", "police"],
  lock: ["locked", "key"],
};

const STOP = new Set(["a", "an", "the", "of", "and", "with", "for", "to"]);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
}

export function parseEmojiRows(rows: Record<string, string>): EmojiEntry[] {
  const out: EmojiEntry[] = [];
  let order = 0;
  for (const cat of EMOJI_CATEGORIES) {
    const block = rows[cat.id];
    if (!block) continue;
    for (const line of block.split("\n")) {
      const [emoji, name, subgroup = ""] = line.split("|");
      if (!emoji || !name) continue;
      out.push({ emoji, name, group: cat.id, subgroup, words: [...new Set([...words(name), ...words(subgroup)])], order: order++ });
    }
  }
  return out;
}

function tokenize(query: string): { tokens: string[]; synonyms: string[] } {
  let q = query.toLowerCase().trim();
  const synonyms: string[] = [];
  for (const key of Object.keys(EMOJI_SYNONYMS)) {
    if (!key.includes(" ")) continue;
    if (q.includes(key)) {
      synonyms.push(...EMOJI_SYNONYMS[key]!);
      q = q.replace(key, " ");
    }
  }
  const tokens = words(q).filter((t) => !STOP.has(t));
  for (const t of tokens) {
    const direct = EMOJI_SYNONYMS[t] ?? (t.endsWith("s") ? EMOJI_SYNONYMS[t.slice(0, -1)] : undefined);
    if (direct) synonyms.push(...direct);
  }
  return { tokens, synonyms };
}

function tokenScore(e: EmojiEntry, nameLower: string, t: string): number {
  let best = 0;
  for (const w of e.words) {
    if (w === t) return 10;
    if (w.startsWith(t)) best = Math.max(best, t.length >= 2 ? 6 : 2);
  }
  if (best) return best;
  if (t.length >= 3 && nameLower.includes(t)) return 3;
  const cat = EMOJI_CATEGORIES.find((c) => c.id === e.group)!;
  if (t.length >= 3 && cat.full.toLowerCase().includes(t)) return 1;
  return 0;
}

/**
 * Rank emoji for a free-text query. Every query word must match (name / subgroup
 * prefix, synonym or category); if nothing matches every word, falls back to
 * any word. Pasting an emoji finds that emoji.
 */
export function searchEmojiEntries(entries: EmojiEntry[], query: string, limit = 160): EmojiEntry[] {
  const raw = query.trim();
  if (!raw) return [];
  const exact = entries.filter((e) => e.emoji === raw || e.emoji.replace(/\uFE0F/g, "") === raw.replace(/\uFE0F/g, ""));
  if (exact.length) return exact;
  const { tokens, synonyms } = tokenize(raw);
  if (!tokens.length && !synonyms.length) return [];
  const phrase = raw.toLowerCase();
  const scored: { e: EmojiEntry; all: number; any: number }[] = [];
  for (const e of entries) {
    const nameLower = e.name.toLowerCase();
    const syn = synonyms.some((frag) => nameHas(nameLower, frag)) ? 5 : 0;
    let sum = syn;
    let missed = false;
    for (const t of tokens) {
      const s = tokenScore(e, nameLower, t);
      sum += s;
      if (s === 0 && !synonymOf(t, nameLower)) missed = true;
    }
    if (sum === 0) continue;
    if (nameLower === phrase) sum += 100;
    else if (nameLower.startsWith(phrase)) sum += 20;
    scored.push(missed ? { e, all: 0, any: sum } : { e, all: sum, any: sum });
  }
  const strict = scored.filter((s) => s.all > 0);
  const pool = strict.length ? strict : scored;
  pool.sort((a, b) => (b.all || b.any) - (a.all || a.any) || a.e.order - b.e.order);
  return pool.slice(0, limit).map((s) => s.e);
}

/** Fragment matches whole words in the name ("key" finds "old key", not "monkey" or "keyboard"; plurals ok). */
function nameHas(nameLower: string, frag: string): boolean {
  for (let at = nameLower.indexOf(frag); at >= 0; at = nameLower.indexOf(frag, at + 1)) {
    const before = at === 0 || /[\s:-]/.test(nameLower[at - 1]!);
    const rest = nameLower.slice(at + frag.length);
    if (before && /^(?:e?s)?(?:$|[\s:,-])/.test(rest)) return true;
  }
  return false;
}

function synonymOf(t: string, nameLower: string): boolean {
  const list = EMOJI_SYNONYMS[t] ?? (t.endsWith("s") ? EMOJI_SYNONYMS[t.slice(0, -1)] : undefined);
  return !!list?.some((frag) => nameHas(nameLower, frag));
}

export function entriesInCategory(entries: EmojiEntry[], id: EmojiCategoryId): EmojiEntry[] {
  return entries.filter((e) => e.group === id);
}
