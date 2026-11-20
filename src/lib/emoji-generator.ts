/**
 * Type-to-generate (no network): turn a short description into a unique,
 * emoji-style SVG badge. Keywords pick glyphs from a small built-in vector
 * library (first match is the main glyph, a second match becomes a corner
 * badge); a hash of the text picks the palette, badge shape and tilt, so the
 * same words always give the same icon. Pure module (no DOM).
 */

type Glyph = { id: string; words: string[]; draw: (c: Colors) => string };
type Colors = { ink: string; accent: string; light: string };
export type GeneratedEmoji = { svg: string; glyphs: string[]; hue: number };

const S = (c: Colors, w = 3.5) => `stroke="${c.ink}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;

export const GLYPHS: Glyph[] = [
  { id: "house", words: ["house", "home", "property", "real", "estate", "realty", "rental", "listing", "flip", "wholesale", "mortgage", "landlord", "tenant"],
    draw: (c) => `<path d="M12 31L32 14L52 31" fill="none" ${S(c)}/><path d="M17 28V50H47V28" fill="${c.light}" ${S(c)}/><rect x="28" y="36" width="9" height="14" rx="1.5" fill="${c.accent}" ${S(c, 3)}/>` },
  { id: "key", words: ["key", "keys", "access", "closing", "unlock", "lock", "password"],
    draw: (c) => `<circle cx="22" cy="32" r="9" fill="${c.accent}" ${S(c)}/><circle cx="22" cy="32" r="3" fill="${c.light}"/><path d="M31 32H52M45 32V39M51 32V37" fill="none" ${S(c)}/>` },
  { id: "tree", words: ["tree", "trees", "forest", "oak", "growth", "grow", "roots", "lineage", "ancestry", "genealogy"],
    draw: (c) => `<path d="M32 52V36M32 42L25 36M32 39L39 33" fill="none" ${S(c)}/><circle cx="32" cy="24" r="13" fill="${c.accent}" ${S(c)}/><circle cx="27" cy="21" r="3" fill="${c.light}"/>` },
  { id: "golf", words: ["golf", "putter", "putt", "club", "tee", "fairway", "birdie", "caddie", "course"],
    draw: (c) => `<ellipse cx="32" cy="50" rx="18" ry="4.5" fill="${c.light}" ${S(c, 3)}/><path d="M30 49V13" fill="none" ${S(c)}/><path d="M30 14L46 20L30 26Z" fill="${c.accent}" ${S(c, 3)}/><circle cx="41" cy="46" r="3" fill="#ffffff" ${S(c, 2)}/>` },
  { id: "heart", words: ["love", "heart", "care", "romance", "wife", "husband", "kindness", "passion"],
    draw: (c) => `<path d="M32 50C20 41 13 34 13 25C13 19 18 15 23 15C27 15 30 17 32 21C34 17 37 15 41 15C46 15 51 19 51 25C51 34 44 41 32 50Z" fill="${c.accent}" ${S(c)}/><circle cx="22" cy="24" r="3" fill="${c.light}"/>` },
  { id: "star", words: ["star", "favorite", "best", "win", "goal", "goals", "success", "achievement", "dream"],
    draw: (c) => `<path d="M32 12L37.5 25L51 26L40.5 35L44 49L32 41.5L20 49L23.5 35L13 26L26.5 25Z" fill="${c.accent}" ${S(c)}/>` },
  { id: "money", words: ["money", "cash", "dollar", "dollars", "finance", "price", "profit", "invest", "investor", "investing", "deal", "budget", "income", "pay", "equity", "wealth"],
    draw: (c) => `<circle cx="32" cy="32" r="19" fill="${c.accent}" ${S(c)}/><path d="M38 24C36 22 34 21.5 32 21.5C28 21.5 26 23.5 26 26C26 32 38 30 38 37C38 40 35 42 32 42C29 42 27 41 25.5 39.5M32 17.5V21.5M32 42V46.5" fill="none" ${S(c, 3)}/>` },
  { id: "briefcase", words: ["work", "job", "business", "office", "career", "company", "client", "clients", "corporate", "agent", "broker"],
    draw: (c) => `<rect x="12" y="22" width="40" height="27" rx="4" fill="${c.accent}" ${S(c)}/><path d="M25 22V17H39V22M12 33H52" fill="none" ${S(c)}/><rect x="29" y="30" width="6" height="6" rx="1" fill="${c.light}" ${S(c, 2)}/>` },
  { id: "book", words: ["book", "books", "learn", "learning", "study", "read", "reading", "school", "notes", "journal", "lesson", "lessons", "class"],
    draw: (c) => `<path d="M32 20C27 16 19 15 12 16V47C19 46 27 47 32 51C37 47 45 46 52 47V16C45 15 37 16 32 20Z" fill="${c.light}" ${S(c)}/><path d="M32 20V51" fill="none" ${S(c)}/><path d="M17 23C21 23 25 24 27 25M17 30C21 30 25 31 27 32M37 25C39 24 43 23 47 23" fill="none" ${S(c, 2.5)}/>` },
  { id: "bolt", words: ["energy", "power", "fast", "quick", "electric", "charge", "urgent", "hustle"],
    draw: (c) => `<path d="M36 10L16 36H30L26 54L48 27H34Z" fill="${c.accent}" ${S(c)}/>` },
  { id: "bulb", words: ["idea", "ideas", "insight", "think", "thinking", "brain", "mind", "smart", "creative", "invent"],
    draw: (c) => `<path d="M24 40C19 36 17 31 17 27C17 19 24 13 32 13C40 13 47 19 47 27C47 31 45 36 40 40V44H24Z" fill="${c.accent}" ${S(c)}/><path d="M26 49H38M28 54H36" fill="none" ${S(c)}/><path d="M26 25C27 21 29 20 32 19" fill="none" stroke="${c.light}" stroke-width="3" stroke-linecap="round"/>` },
  { id: "leaf", words: ["leaf", "plant", "garden", "green", "eco", "nature", "seed", "organic", "farm", "acre", "acres"],
    draw: (c) => `<path d="M14 50C14 30 26 15 50 14C50 38 36 50 14 50Z" fill="${c.accent}" ${S(c)}/><path d="M14 50C24 40 32 32 42 23" fill="none" ${S(c, 3)}/>` },
  { id: "mountain", words: ["mountain", "mountains", "hike", "hiking", "outdoor", "outdoors", "land", "lot", "lots", "vacant", "parcel", "ranch", "summit"],
    draw: (c) => `<path d="M8 50L25 20L35 36L41 28L56 50Z" fill="${c.accent}" ${S(c)}/><path d="M21 27L25 20L29 27L26 25Z" fill="${c.light}" ${S(c, 2)}/>` },
  { id: "family", words: ["family", "kids", "children", "parents", "mom", "dad", "household", "relatives"],
    draw: (c) => `<circle cx="20" cy="22" r="6" fill="${c.light}" ${S(c, 3)}/><circle cx="44" cy="22" r="6" fill="${c.light}" ${S(c, 3)}/><circle cx="32" cy="33" r="4.5" fill="${c.light}" ${S(c, 3)}/><path d="M10 47C10 37 15 32 20 32C25 32 30 37 30 47M34 47C34 37 39 32 44 32C49 32 54 37 54 47M25 50C25 44 28 41 32 41C36 41 39 44 39 50" fill="${c.accent}" ${S(c, 3)}/>` },
  { id: "person", words: ["person", "people", "me", "myself", "buyer", "seller", "friend", "team", "user", "contact", "lead", "leads", "partner"],
    draw: (c) => `<circle cx="32" cy="23" r="9" fill="${c.light}" ${S(c)}/><path d="M15 51C15 40 22 34 32 34C42 34 49 40 49 51Z" fill="${c.accent}" ${S(c)}/>` },
  { id: "chat", words: ["chat", "talk", "message", "messages", "conversation", "voice", "call", "calls", "feedback", "outreach", "pitch"],
    draw: (c) => `<path d="M12 18C12 15 14 13 17 13H47C50 13 52 15 52 18V38C52 41 50 43 47 43H28L18 51V43H17C14 43 12 41 12 38Z" fill="${c.accent}" ${S(c)}/><circle cx="23" cy="28" r="2.6" fill="${c.ink}"/><circle cx="32" cy="28" r="2.6" fill="${c.ink}"/><circle cx="41" cy="28" r="2.6" fill="${c.ink}"/>` },
  { id: "gear", words: ["settings", "system", "systems", "process", "build", "tool", "tools", "tech", "code", "coding", "automation", "engineering", "repair", "maintenance"],
    draw: (c) => `<path d="M29 10H35L36 16L41 18L46 14L50 18L46 23L48 28L54 29V35L48 36L46 41L50 46L46 50L41 46L36 48L35 54H29L28 48L23 46L18 50L14 46L18 41L16 36L10 35V29L16 28L18 23L14 18L18 14L23 18L28 16Z" fill="${c.accent}" ${S(c, 3)}/><circle cx="32" cy="32" r="7" fill="${c.light}" ${S(c, 3)}/>` },
  { id: "car", words: ["car", "cars", "drive", "driving", "truck", "auto", "commute", "road", "vehicle"],
    draw: (c) => `<path d="M10 40V33L16 30L22 20H42L48 30L54 33V40Z" fill="${c.accent}" ${S(c)}/><path d="M25 24H39L42 30H22Z" fill="${c.light}" ${S(c, 2.5)}/><circle cx="20" cy="42" r="5" fill="${c.light}" ${S(c)}/><circle cx="44" cy="42" r="5" fill="${c.light}" ${S(c)}/>` },
  { id: "plane", words: ["travel", "trip", "flight", "flights", "plane", "fly", "vacation", "airport", "abroad"],
    draw: (c) => `<path d="M30 12C32 10 35 11 35 14V27L52 36V41L35 36V46L41 50V54L32 51L23 54V50L29 46V36L12 41V36L29 27V14C29 13 29.5 12.5 30 12Z" fill="${c.accent}" ${S(c, 3)}/>` },
  { id: "phone", words: ["phone", "mobile", "sms", "text", "texts", "cell", "app", "apps"],
    draw: (c) => `<rect x="20" y="9" width="24" height="46" rx="5" fill="${c.accent}" ${S(c)}/><rect x="24" y="15" width="16" height="28" rx="1.5" fill="${c.light}"/><circle cx="32" cy="49" r="2.4" fill="${c.ink}"/>` },
  { id: "check", words: ["done", "check", "task", "tasks", "todo", "complete", "completed", "approved", "verified", "checklist"],
    draw: (c) => `<circle cx="32" cy="32" r="20" fill="${c.accent}" ${S(c)}/><path d="M22 33L29 40L43 25" fill="none" stroke="${c.light}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>` },
  { id: "calendar", words: ["calendar", "date", "dates", "schedule", "meeting", "meetings", "event", "events", "time", "deadline", "appointment", "weekly", "daily"],
    draw: (c) => `<rect x="12" y="15" width="40" height="37" rx="5" fill="${c.light}" ${S(c)}/><path d="M12 25H52" fill="none" ${S(c)}/><rect x="12" y="15" width="40" height="10" rx="4" fill="${c.accent}" ${S(c, 3)}/><path d="M22 11V19M42 11V19" fill="none" ${S(c)}/><circle cx="24" cy="35" r="2.5" fill="${c.ink}"/><circle cx="32" cy="35" r="2.5" fill="${c.ink}"/><circle cx="40" cy="35" r="2.5" fill="${c.accent}"/><circle cx="24" cy="43" r="2.5" fill="${c.ink}"/>` },
  { id: "globe", words: ["world", "globe", "global", "map", "earth", "international", "country", "city", "local", "market", "markets"],
    draw: (c) => `<circle cx="32" cy="32" r="20" fill="${c.accent}" ${S(c)}/><ellipse cx="32" cy="32" rx="9" ry="20" fill="none" ${S(c, 2.5)}/><path d="M12 32H52M15 22H49M15 42H49" fill="none" ${S(c, 2.5)}/>` },
  { id: "music", words: ["music", "song", "songs", "note", "guitar", "piano", "band", "podcast", "audio", "sound"],
    draw: (c) => `<path d="M25 44V16L47 12V40" fill="none" ${S(c)}/><path d="M25 16L47 12V19L25 23Z" fill="${c.accent}" ${S(c, 3)}/><ellipse cx="20" cy="45" rx="6" ry="5" fill="${c.accent}" ${S(c)}/><ellipse cx="42" cy="41" rx="6" ry="5" fill="${c.accent}" ${S(c)}/>` },
  { id: "camera", words: ["photo", "photos", "camera", "picture", "pictures", "video", "film", "media", "marketing"],
    draw: (c) => `<rect x="10" y="20" width="44" height="30" rx="5" fill="${c.accent}" ${S(c)}/><path d="M23 20L26 14H38L41 20" fill="${c.light}" ${S(c, 3)}/><circle cx="32" cy="35" r="9" fill="${c.light}" ${S(c)}/><circle cx="32" cy="35" r="3.5" fill="${c.ink}"/>` },
  { id: "shield", words: ["security", "safe", "safety", "protect", "protection", "insurance", "guard", "privacy", "legal", "risk"],
    draw: (c) => `<path d="M32 10L50 17V30C50 41 42 49 32 54C22 49 14 41 14 30V17Z" fill="${c.accent}" ${S(c)}/><path d="M24 32L30 38L41 26" fill="none" stroke="${c.light}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>` },
  { id: "ball", words: ["sport", "sports", "ball", "play", "game", "games", "soccer", "basketball", "football", "tennis", "baseball", "fitness", "gym", "workout"],
    draw: (c) => `<circle cx="32" cy="32" r="20" fill="${c.accent}" ${S(c)}/><path d="M12 32H52M32 12V52M18 18C24 24 24 40 18 46M46 18C40 24 40 40 46 46" fill="none" ${S(c, 2.5)}/>` },
  { id: "doc", words: ["contract", "contracts", "document", "documents", "paper", "papers", "file", "files", "addendum", "agreement", "offer", "offers", "report", "form"],
    draw: (c) => `<path d="M16 10H38L48 20V54H16Z" fill="${c.light}" ${S(c)}/><path d="M38 10V20H48" fill="${c.accent}" ${S(c, 3)}/><path d="M22 28H42M22 35H42M22 42H34" fill="none" ${S(c, 3)}/><path d="M36 46L39 49L46 42" fill="none" stroke="${c.accent}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>` },
];

const SPARK: Glyph = {
  id: "spark",
  words: [],
  draw: (c) => `<path d="M32 10C34 24 40 30 54 32C40 34 34 40 32 54C30 40 24 34 10 32C24 30 30 24 32 10Z" fill="${c.accent}" ${S(c)}/><circle cx="46" cy="18" r="3.5" fill="${c.light}" ${S(c, 2)}/>`,
};

/** FNV-1a 32-bit. */
export function hashText(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function descriptionWords(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/[\s-]+/).filter(Boolean);
}

/**
 * Glyph ids matched by the description (max 2). English compounds put the head
 * noun last ("family tree", "real estate key"), so words are read right to left:
 * the last matching word is the main glyph, the one before it the badge.
 */
export function matchGlyphs(text: string): string[] {
  const out: string[] = [];
  for (const w of descriptionWords(text).reverse()) {
    const singular = w.endsWith("s") ? w.slice(0, -1) : w;
    const g = GLYPHS.find((x) => x.words.includes(w) || x.words.includes(singular));
    if (g && !out.includes(g.id)) out.push(g.id);
    if (out.length === 2) break;
  }
  return out;
}

/** Deterministic emoji-style SVG for a description. Same text -> same SVG. */
export function generateEmojiSvg(description: string): GeneratedEmoji {
  const text = description.trim().toLowerCase().replace(/\s+/g, " ");
  const h = hashText(text || "emoji");
  const hue = h % 360;
  const ids = matchGlyphs(text);
  const primary = GLYPHS.find((g) => g.id === ids[0]) ?? SPARK;
  const secondary = ids[1] ? GLYPHS.find((g) => g.id === ids[1]) : undefined;
  const colors: Colors = {
    ink: `hsl(${(hue + 200) % 360}, 45%, 18%)`,
    accent: `hsl(${(hue + 150) % 360}, 78%, 58%)`,
    light: "#ffffff",
  };
  const bg1 = `hsl(${hue}, 85%, 90%)`;
  const bg2 = `hsl(${(hue + 25) % 360}, 80%, 76%)`;
  const round = (h >>> 9) % 2 === 0;
  const tilt = ((h >>> 11) % 13) - 6;
  const backdrop = round
    ? `<circle cx="32" cy="32" r="30" fill="url(#g)"/>`
    : `<rect x="2" y="2" width="60" height="60" rx="16" fill="url(#g)"/>`;
  const main = secondary
    ? `<g transform="translate(2 2) scale(0.88) rotate(${tilt} 32 32)">${primary.draw(colors)}</g>`
    : `<g transform="rotate(${tilt} 32 32)">${primary.draw(colors)}</g>`;
  const badge = secondary
    ? `<circle cx="48" cy="48" r="13" fill="#ffffff" stroke="${colors.ink}" stroke-width="2.5"/><g transform="translate(36.5 36.5) scale(0.36)">${secondary.draw(colors)}</g>`
    : "";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient></defs>` +
    backdrop + main + badge +
    `</svg>`;
  return { svg, glyphs: secondary ? [primary.id, secondary.id] : [primary.id], hue };
}
