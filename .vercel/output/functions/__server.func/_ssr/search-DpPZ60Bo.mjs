import { r as createServerFn } from "./ssr.mjs";
import { r as getSql } from "./db-6VNt2pjY.mjs";
import { t as createServerRpc } from "./createServerRpc-CcvdN_gc.mjs";
import { t as authMiddleware } from "./middleware-CHZF_giW.mjs";
import { i as scoreText, t as grokChat } from "./ai-DwWWELph.mjs";
import { t as ensureUserSettings } from "./seed-CtwgOCeZ.mjs";
import { r as mapMemory } from "./map-BFh8JylK.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/search-DpPZ60Bo.js
var searchMemories_createServerFn_handler = createServerRpc({
	id: "c4d0eff44955d9b5a39b049d939c9b450a625e8156a554b3f0f2d9cbc7aa3394",
	name: "searchMemories",
	filename: "src/lib/server/search.ts"
}, (opts) => searchMemories.__executeServer(opts));
var searchMemories = createServerFn({ method: "POST" }).validator((input) => input).middleware([authMiddleware]).handler(searchMemories_createServerFn_handler, async ({ context, data }) => {
	const sql = await getSql();
	await ensureUserSettings(sql, context.userId);
	const q = data.query.trim();
	if (!q) return {
		results: [],
		interpretation: null
	};
	const rows = await sql`
      select m.*, (
        select string_agg(c.name, ' ')
        from memory_concepts mc
        join concepts c on c.id = mc.concept_id
        where mc.memory_id = m.id
      ) as concept_names
      from memories m
      where m.user_id = ${context.userId}
    `;
	const ranked = rows.map((row) => {
		const memory = mapMemory(row);
		return {
			memory,
			score: scoreText(q, [
				memory.title,
				memory.body,
				memory.aiSummary ?? "",
				memory.transcript ?? "",
				memory.tags.join(" "),
				row.concept_names ?? "",
				memory.emotion ?? "",
				memory.sourceUrl ?? ""
			], [
				5,
				2,
				3,
				2,
				3,
				3,
				1,
				2
			])
		};
	}).filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
	if (!data.semantic || ranked.length === 0) return {
		results: ranked.slice(0, 24).map((r) => r.memory),
		interpretation: null
	};
	const catalog = ranked.slice(0, 30).map((r) => `- ${r.memory.id}: ${r.memory.title} — ${(r.memory.aiSummary ?? r.memory.body).slice(0, 140)}`).join("\n");
	const ai = await grokChat([{
		role: "system",
		content: "You search a personal memory network. Given a natural-language question and a catalog of memories (id: title — snippet), return JSON {ids: string[], interpretation: string}. ids = most relevant memory ids in order, max 10. interpretation = one sentence explaining what you understood. Return ONLY JSON."
	}, {
		role: "user",
		content: `Question: ${q}\n\nCatalog:\n${catalog}`
	}], {
		maxTokens: 400,
		temperature: .2
	});
	if (!ai.ok) return {
		results: ranked.slice(0, 16).map((r) => r.memory),
		interpretation: null
	};
	try {
		const match = ai.text.match(/\{[\s\S]*\}/);
		const parsed = JSON.parse(match?.[0] ?? "{}");
		const byId = new Map(rows.map((r) => [r.id, mapMemory(r)]));
		const ordered = (parsed.ids ?? []).map((id) => byId.get(id)).filter(Boolean);
		const fallback = ranked.map((r) => r.memory).filter((m) => !ordered.some((o) => o?.id === m.id));
		return {
			results: [...ordered, ...fallback].slice(0, 16),
			interpretation: parsed.interpretation ?? null
		};
	} catch {
		return {
			results: ranked.slice(0, 16).map((r) => r.memory),
			interpretation: null
		};
	}
});
//#endregion
export { searchMemories_createServerFn_handler };
