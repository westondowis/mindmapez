import { a as NODE_KINDS, n as EMOTIONS, r as IMPACT_LEVELS, t as CONCEPT_KINDS } from "./types-DAtvk6Qj.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/ai-DwWWELph.js
var CATEGORIES = [
	{
		name: "Golf",
		kind: "category",
		words: [
			"golf",
			"driver",
			"swing",
			"slice",
			"putt",
			"putting",
			"fairway",
			"handicap",
			"iron",
			"wedge",
			"tee",
			"green",
			"impact",
			"shoulder",
			"fade",
			"hook",
			"shot"
		]
	},
	{
		name: "Real Estate",
		kind: "category",
		words: [
			"seller",
			"buyer",
			"listing",
			"property",
			"acquisition",
			"duplex",
			"underwriting",
			"closing",
			"offer",
			"house",
			"rental",
			"tenant",
			"cap rate"
		]
	},
	{
		name: "Seller Financing",
		kind: "subcategory",
		words: [
			"seller financing",
			"owner finance",
			"owner-finance",
			"balloon",
			"carryback",
			"carry back"
		]
	},
	{
		name: "Negotiation",
		kind: "topic",
		words: [
			"negotiat",
			"leverage",
			"walk away",
			"ask",
			"silence",
			"terms",
			"concession"
		]
	},
	{
		name: "Business",
		kind: "category",
		words: [
			"business",
			"sales",
			"call",
			"pipeline",
			"follow-up",
			"follow up",
			"pricing",
			"client"
		]
	},
	{
		name: "Family",
		kind: "category",
		words: [
			"family",
			"kids",
			"dad",
			"mom",
			"son",
			"daughter",
			"home",
			"pancakes",
			"saturday"
		]
	},
	{
		name: "Health",
		kind: "category",
		words: [
			"health",
			"sleep",
			"energy",
			"recover",
			"screen",
			"doctor"
		]
	},
	{
		name: "Fitness",
		kind: "category",
		words: [
			"workout",
			"squat",
			"lift",
			"gym",
			"run",
			"walk",
			"training"
		]
	},
	{
		name: "Finance",
		kind: "category",
		words: [
			"finance",
			"debt",
			"reserve",
			"cash",
			"tax",
			"taxes",
			"money",
			"capital"
		]
	},
	{
		name: "Travel",
		kind: "category",
		words: [
			"travel",
			"flight",
			"trip",
			"mountain",
			"rockies",
			"hotel"
		]
	},
	{
		name: "Mindset",
		kind: "category",
		words: [
			"mindset",
			"confidence",
			"focus",
			"fear",
			"patience",
			"discipline",
			"belief"
		]
	},
	{
		name: "Learning",
		kind: "category",
		words: [
			"learn",
			"book",
			"highlight",
			"lesson",
			"journal",
			"read"
		]
	},
	{
		name: "Relationships",
		kind: "category",
		words: [
			"relationship",
			"listening",
			"partner",
			"trust",
			"conversation"
		]
	},
	{
		name: "Confidence",
		kind: "theme",
		words: [
			"confidence",
			"confident",
			"certainty",
			"self-belief"
		]
	},
	{
		name: "Taxes",
		kind: "topic",
		words: [
			"tax",
			"taxes",
			"irs",
			"capital gain"
		]
	},
	{
		name: "Motivation",
		kind: "theme",
		words: [
			"motivation",
			"why",
			"drive"
		]
	},
	{
		name: "Preparation",
		kind: "lesson",
		words: [
			"prepar",
			"routine",
			"practice"
		]
	}
];
var EMOTION_WORDS = [
	{
		emotion: "Excited",
		words: [
			"amazing",
			"pumped",
			"thrilled",
			"fire",
			"unreal"
		]
	},
	{
		emotion: "Inspired",
		words: [
			"inspired",
			"vision",
			"possibility"
		]
	},
	{
		emotion: "Confident",
		words: [
			"confident",
			"certain",
			"locked in",
			"crushed"
		]
	},
	{
		emotion: "Frustrated",
		words: [
			"frustrated",
			"annoying",
			"stuck",
			"messy"
		]
	},
	{
		emotion: "Happy",
		words: [
			"happy",
			"joy",
			"smile",
			"love",
			"delight"
		]
	},
	{
		emotion: "Concerned",
		words: [
			"worried",
			"risk",
			"concern",
			"careful"
		]
	},
	{
		emotion: "Motivated",
		words: [
			"motivated",
			"hungry",
			"let's",
			"drive"
		]
	},
	{
		emotion: "Curious",
		words: [
			"curious",
			"wonder",
			"what if",
			"noticed"
		]
	},
	{
		emotion: "Grateful",
		words: [
			"grateful",
			"thankful",
			"appreciate"
		]
	},
	{
		emotion: "Calm",
		words: [
			"calm",
			"peace",
			"steady",
			"breath"
		]
	},
	{
		emotion: "Proud",
		words: [
			"proud",
			"breakthrough",
			"won",
			"nailed"
		]
	},
	{
		emotion: "Anxious",
		words: [
			"anxious",
			"nervous",
			"uneasy"
		]
	}
];
var KIND_WORDS = [
	{
		kind: "breakthrough",
		words: [
			"breakthrough",
			"clicked",
			"unlocked",
			"discovered",
			"finally"
		]
	},
	{
		kind: "success",
		words: [
			"crushed",
			"won",
			"worked",
			"nailed",
			"best"
		]
	},
	{
		kind: "problem",
		words: [
			"failed",
			"problem",
			"stuck",
			"slice",
			"mistake",
			"wrong"
		]
	},
	{
		kind: "idea",
		words: [
			"idea",
			"what if",
			"maybe",
			"could"
		]
	},
	{
		kind: "learning",
		words: [
			"learned",
			"lesson",
			"noticed",
			"realized",
			"book"
		]
	}
];
function tokenize(text) {
	return text.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").split(/\s+/).filter((t) => t.length > 1);
}
function includesAny(hay, words) {
	return words.some((w) => hay.includes(w));
}
function titleFromBody(body) {
	const clean = body.replace(/\s+/g, " ").trim();
	if (!clean) return "Untitled thought";
	const sentence = clean.split(/(?<=[.!?])\s+/)[0] ?? clean;
	if (sentence.length <= 72) return sentence.replace(/[.]+$/, "");
	return `${sentence.slice(0, 69).trim()}…`;
}
function organizeLocal(raw, existingTitle) {
	const text = raw.trim();
	const lower = text.toLowerCase();
	const concepts = [];
	const seen = /* @__PURE__ */ new Set();
	for (const cat of CATEGORIES) if (includesAny(lower, cat.words) && !seen.has(cat.name.toLowerCase())) {
		seen.add(cat.name.toLowerCase());
		concepts.push({
			name: cat.name,
			kind: cat.kind
		});
	}
	if (concepts.length === 0) concepts.push({
		name: "Mindset",
		kind: "category"
	});
	let emotion = "Curious";
	for (const row of EMOTION_WORDS) if (includesAny(lower, row.words)) {
		emotion = row.emotion;
		break;
	}
	let kind = "learning";
	for (const row of KIND_WORDS) if (includesAny(lower, row.words)) {
		kind = row.kind;
		break;
	}
	const importance = kind === "breakthrough" ? 5 : includesAny(lower, [
		"life",
		"never forget",
		"critical"
	]) ? 5 : kind === "success" ? 4 : 3;
	const impact = importance >= 5 ? "life_changing" : importance >= 4 ? "high" : importance >= 3 ? "medium" : "low";
	const tags = concepts.map((c) => c.name.toLowerCase()).slice(0, 8);
	const extra = tokenize(text).filter((t) => t.length > 5).slice(0, 4);
	for (const t of extra) if (!tags.includes(t)) tags.push(t);
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
		concepts
	};
}
function parseOrganizeJson(raw, fallback) {
	const match = raw.match(/\{[\s\S]*\}/);
	if (!match) return fallback;
	try {
		const parsed = JSON.parse(match[0]);
		const emotion = EMOTIONS.includes(parsed.emotion) ? parsed.emotion : fallback.emotion;
		const kind = NODE_KINDS.includes(parsed.kind) ? parsed.kind : fallback.kind;
		const impact = IMPACT_LEVELS.includes(parsed.impact) ? parsed.impact : fallback.impact;
		const concepts = Array.isArray(parsed.concepts) ? parsed.concepts.filter((c) => c?.name).map((c) => ({
			name: String(c.name),
			kind: CONCEPT_KINDS.includes(c.kind) ? c.kind : "topic"
		})) : fallback.concepts;
		return {
			title: parsed.title?.trim() || fallback.title,
			summary: parsed.summary?.trim() || fallback.summary,
			tags: Array.isArray(parsed.tags) ? parsed.tags.map(String).slice(0, 12) : fallback.tags,
			emotion,
			importance: Math.max(1, Math.min(5, Number(parsed.importance) || fallback.importance)),
			impact,
			kind,
			concepts: concepts.length ? concepts : fallback.concepts
		};
	} catch {
		return fallback;
	}
}
function scoreText(query, fields, weights) {
	const qTokens = tokenize(query);
	if (qTokens.length === 0) return 0;
	const q = query.toLowerCase();
	let score = 0;
	fields.forEach((field, i) => {
		const hay = field.toLowerCase();
		const w = weights[i] ?? 1;
		if (hay.includes(q)) score += 8 * w;
		for (const t of qTokens) if (hay.includes(t)) score += w;
	});
	return score;
}
var MODEL = "grok-4.5";
async function grokChat(messages, opts = {}) {
	const apiKey = process.env.XAI_API_KEY;
	if (!apiKey) return {
		ok: false,
		error: "AI is not available in this environment"
	};
	const res = await fetch("https://api.x.ai/v1/chat/completions", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			model: MODEL,
			messages,
			max_tokens: opts.maxTokens ?? 700,
			temperature: opts.temperature ?? .4
		})
	});
	if (!res.ok) return {
		ok: false,
		error: `xAI API error ${res.status}`
	};
	return {
		ok: true,
		text: (await res.json()).choices?.[0]?.message?.content ?? ""
	};
}
async function organizeMemory(raw, existingTitle) {
	const fallback = organizeLocal(raw, existingTitle);
	const result = await grokChat([{
		role: "system",
		content: "You organize a personal memory into structured JSON for a second-brain graph. Return ONLY JSON with keys: title, summary, tags (string[]), emotion (one of Excited, Inspired, Confident, Frustrated, Happy, Concerned, Motivated, Curious, Grateful, Calm, Proud, Anxious), importance (1-5), impact (low|medium|high|life_changing), kind (breakthrough|learning|success|problem|idea|archived), concepts (array of {name, kind} where kind is category|subcategory|topic|theme|person|place|emotion|lesson|pattern). Prefer durable concept names like Golf, Real Estate, Confidence. Keep title under 80 chars. Summary 1-2 sentences."
	}, {
		role: "user",
		content: raw.length > 12e3 ? `${raw.slice(0, 12e3)}\n\n[Imported document continues; total ${raw.length.toLocaleString()} characters.]` : raw
	}], {
		maxTokens: 700,
		temperature: .2
	});
	if (!result.ok) return fallback;
	return parseOrganizeJson(result.text, fallback);
}
async function suggestTags(raw, existing = []) {
	const fallback = organizeLocal(raw).tags;
	const result = await grokChat([{
		role: "system",
		content: "You tag a personal memory for a second-brain graph. Return ONLY JSON {\"tags\": string[]} with 4-10 short tags. Prefer durable topics (Golf, Seller Financing, Confidence) over filler words. Mix specific nouns with themes. Do not repeat near-duplicates."
	}, {
		role: "user",
		content: `${existing.length ? `Existing tags to keep if still relevant: ${existing.join(", ")}\n\n` : ""}${raw.slice(0, 3500)}`
	}], {
		maxTokens: 300,
		temperature: .2
	});
	if (!result.ok) return fallback;
	try {
		const match = result.text.match(/\{[\s\S]*\}/);
		const parsed = JSON.parse(match?.[0] ?? "{}");
		if (!Array.isArray(parsed.tags)) return fallback;
		const tags = parsed.tags.map(String);
		return tags.length ? tags : fallback;
	} catch {
		return fallback;
	}
}
async function transcribeAudio(dataUrl) {
	const apiKey = process.env.XAI_API_KEY;
	if (!apiKey) return null;
	const comma = dataUrl.indexOf(",");
	if (comma < 0) return null;
	const header = dataUrl.slice(0, comma);
	const b64 = dataUrl.slice(comma + 1);
	const mime = /data:([^;]+)/.exec(header)?.[1] ?? "audio/webm";
	const bytes = Buffer.from(b64, "base64");
	if (bytes.length > 6e6) return null;
	const form = new FormData();
	form.append("model", "whisper-1");
	form.append("file", new Blob([bytes], { type: mime }), mime.includes("mp4") ? "audio.mp4" : "audio.webm");
	try {
		const res = await fetch("https://api.x.ai/v1/audio/transcriptions", {
			method: "POST",
			headers: { Authorization: `Bearer ${apiKey}` },
			body: form
		});
		if (!res.ok) return null;
		return (await res.json()).text?.trim() || null;
	} catch {
		return null;
	}
}
//#endregion
export { suggestTags as a, scoreText as i, organizeLocal as n, transcribeAudio as o, organizeMemory as r, grokChat as t };
