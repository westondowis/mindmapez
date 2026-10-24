import {
  CONCEPT_KINDS,
  EMOTIONS,
  IMPACT_LEVELS,
  NODE_KINDS,
  type ConceptKind,
  type Emotion,
  type ImpactLevel,
  type NodeKind,
  type OrganizeResult,
} from "./types";

const CATEGORIES: { name: string; kind: ConceptKind; words: string[] }[] = [
  { name: "Golf", kind: "category", words: ["golf", "driver", "swing", "slice", "putt", "putting", "fairway", "handicap", "iron", "wedge", "tee", "green", "impact", "shoulder", "fade", "hook", "shot"] },
  { name: "Real Estate", kind: "category", words: ["seller", "buyer", "listing", "property", "acquisition", "duplex", "underwriting", "closing", "offer", "house", "rental", "tenant", "cap rate"] },
  { name: "Seller Financing", kind: "subcategory", words: ["seller financing", "owner finance", "owner-finance", "balloon", "carryback", "carry back"] },
  { name: "Negotiation", kind: "topic", words: ["negotiat", "leverage", "walk away", "ask", "silence", "terms", "concession"] },
  { name: "Business", kind: "category", words: ["business", "sales", "call", "pipeline", "follow-up", "follow up", "pricing", "client"] },
  { name: "Family", kind: "category", words: ["family", "kids", "dad", "mom", "son", "daughter", "home", "pancakes", "saturday"] },
  { name: "Health", kind: "category", words: ["health", "sleep", "energy", "recover", "screen", "doctor"] },
  { name: "Fitness", kind: "category", words: ["workout", "squat", "lift", "gym", "run", "walk", "training"] },
  { name: "Finance", kind: "category", words: ["finance", "debt", "reserve", "cash", "tax", "taxes", "money", "capital"] },
  { name: "Travel", kind: "category", words: ["travel", "flight", "trip", "mountain", "rockies", "hotel"] },
  { name: "Mindset", kind: "category", words: ["mindset", "confidence", "focus", "fear", "patience", "discipline", "belief"] },
  { name: "Learning", kind: "category", words: ["learn", "book", "highlight", "lesson", "journal", "read"] },
  { name: "Relationships", kind: "category", words: ["relationship", "listening", "partner", "trust", "conversation"] },
  { name: "Confidence", kind: "theme", words: ["confidence", "confident", "certainty", "self-belief"] },
  { name: "Taxes", kind: "topic", words: ["tax", "taxes", "irs", "capital gain"] },
  { name: "Motivation", kind: "theme", words: ["motivation", "why", "drive"] },
  { name: "Preparation", kind: "lesson", words: ["prepar", "routine", "practice"] },
];

const EMOTION_WORDS: { emotion: Emotion; words: string[] }[] = [
  { emotion: "Excited", words: ["amazing", "pumped", "thrilled", "fire", "unreal"] },
  { emotion: "Inspired", words: ["inspired", "vision", "possibility"] },
  { emotion: "Confident", words: ["confident", "certain", "locked in", "crushed"] },
  { emotion: "Frustrated", words: ["frustrated", "annoying", "stuck", "messy"] },
  { emotion: "Happy", words: ["happy", "joy", "smile", "love", "delight"] },
  { emotion: "Concerned", words: ["worried", "risk", "concern", "careful"] },
  { emotion: "Motivated", words: ["motivated", "hungry", "let's", "drive"] },
  { emotion: "Curious", words: ["curious", "wonder", "what if", "noticed"] },
  { emotion: "Grateful", words: ["grateful", "thankful", "appreciate"] },
  { emotion: "Calm", words: ["calm", "peace", "steady", "breath"] },
  { emotion: "Proud", words: ["proud", "breakthrough", "won", "nailed"] },
  { emotion: "Anxious", words: ["anxious", "nervous", "uneasy"] },
];

const KIND_WORDS: { kind: NodeKind; words: string[] }[] = [
  { kind: "breakthrough", words: ["breakthrough", "clicked", "unlocked", "discovered", "finally"] },
  { kind: "success", words: ["crushed", "won", "worked", "nailed", "best"] },
  { kind: "problem", words: ["failed", "problem", "stuck", "slice", "mistake", "wrong"] },
  { kind: "idea", words: ["idea", "what if", "maybe", "could"] },
  { kind: "learning", words: ["learned", "lesson", "noticed", "realized", "book"] },
];

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function includesAny(hay: string, words: string[]): boolean {
  return words.some((w) => hay.includes(w));
}

function titleFromBody(body: string): string {
  const clean = body.replace(/\s+/g, " ").trim();
  if (!clean) return "Untitled thought";
  const sentence = clean.split(/(?<=[.!?])\s+/)[0] ?? clean;
  if (sentence.length <= 72) return sentence.replace(/[.]+$/, "");
  return `${sentence.slice(0, 69).trim()}…`;
}

export function organizeLocal(raw: string, existingTitle?: string): OrganizeResult {
  const text = raw.trim();
  const lower = text.toLowerCase();
  const concepts: { name: string; kind: ConceptKind }[] = [];
  const seen = new Set<string>();
  for (const cat of CATEGORIES) {
    if (includesAny(lower, cat.words) && !seen.has(cat.name.toLowerCase())) {
      seen.add(cat.name.toLowerCase());
      concepts.push({ name: cat.name, kind: cat.kind });
    }
  }
  if (concepts.length === 0) {
    concepts.push({ name: "Mindset", kind: "category" });
  }

  let emotion: Emotion = "Curious";
  for (const row of EMOTION_WORDS) {
    if (includesAny(lower, row.words)) {
      emotion = row.emotion;
      break;
    }
  }

  let kind: NodeKind = "learning";
  for (const row of KIND_WORDS) {
    if (includesAny(lower, row.words)) {
      kind = row.kind;
      break;
    }
  }

  const importance =
    kind === "breakthrough" ? 5 : includesAny(lower, ["life", "never forget", "critical"]) ? 5 : kind === "success" ? 4 : 3;
  const impact: ImpactLevel =
    importance >= 5 ? "life_changing" : importance >= 4 ? "high" : importance >= 3 ? "medium" : "low";

  const tags = concepts.map((c) => c.name.toLowerCase()).slice(0, 8);
  const extra = tokenize(text).filter((t) => t.length > 5).slice(0, 4);
  for (const t of extra) {
    if (!tags.includes(t)) tags.push(t);
  }

  const first = text.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
  const summary = first.length > 220 ? `${first.slice(0, 217).trim()}…` : first || text.slice(0, 180);

  return {
    title: existingTitle?.trim() || titleFromBody(text),
    summary,
    tags: tags.slice(0, 10),
    emotion,
    importance,
    impact,
    kind,
    concepts,
  };
}

export function parseOrganizeJson(raw: string, fallback: OrganizeResult): OrganizeResult {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return fallback;
  try {
    const parsed = JSON.parse(match[0]) as Partial<OrganizeResult> & {
      concepts?: { name?: string; kind?: string }[];
    };
    const emotion = EMOTIONS.includes(parsed.emotion as Emotion)
      ? (parsed.emotion as Emotion)
      : fallback.emotion;
    const kind = NODE_KINDS.includes(parsed.kind as NodeKind)
      ? (parsed.kind as NodeKind)
      : fallback.kind;
    const impact = IMPACT_LEVELS.includes(parsed.impact as ImpactLevel)
      ? (parsed.impact as ImpactLevel)
      : fallback.impact;
    const concepts = Array.isArray(parsed.concepts)
      ? parsed.concepts
          .filter((c) => c?.name)
          .map((c) => ({
            name: String(c.name),
            kind: CONCEPT_KINDS.includes(c.kind as ConceptKind)
              ? (c.kind as ConceptKind)
              : ("topic" as ConceptKind),
          }))
      : fallback.concepts;
    return {
      title: parsed.title?.trim() || fallback.title,
      summary: parsed.summary?.trim() || fallback.summary,
      tags: Array.isArray(parsed.tags) ? parsed.tags.map(String).slice(0, 12) : fallback.tags,
      emotion,
      importance: Math.max(1, Math.min(5, Number(parsed.importance) || fallback.importance)),
      impact,
      kind,
      concepts: concepts.length ? concepts : fallback.concepts,
    };
  } catch {
    return fallback;
  }
}

export function scoreText(query: string, fields: string[], weights: number[]): number {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return 0;
  const q = query.toLowerCase();
  let score = 0;
  fields.forEach((field, i) => {
    const hay = field.toLowerCase();
    const w = weights[i] ?? 1;
    if (hay.includes(q)) score += 8 * w;
    for (const t of qTokens) {
      if (hay.includes(t)) score += w;
    }
  });
  return score;
}
