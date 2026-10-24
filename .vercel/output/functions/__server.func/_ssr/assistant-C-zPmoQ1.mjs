import { r as createServerFn } from "./ssr.mjs";
import { r as getSql } from "./db-6VNt2pjY.mjs";
import { t as createServerRpc } from "./createServerRpc-CcvdN_gc.mjs";
import { t as authMiddleware } from "./middleware-CHZF_giW.mjs";
import { a as newId } from "./utils-KYK7ILYy.mjs";
import { i as scoreText, t as grokChat } from "./ai-DwWWELph.mjs";
import { t as ensureUserSettings } from "./seed-CtwgOCeZ.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/assistant-C-zPmoQ1.js
var listAssistant_createServerFn_handler = createServerRpc({
	id: "652676d1a3a74e079d144fe1a538ad00d69cf2c0c8b0850aabc3ab5a6994ca91",
	name: "listAssistant",
	filename: "src/lib/server/assistant.ts"
}, (opts) => listAssistant.__executeServer(opts));
var listAssistant = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(listAssistant_createServerFn_handler, async ({ context }) => {
	return (await (await getSql())`
      select id, role, content, created_at from assistant_messages
      where user_id = ${context.userId}
      order by created_at asc
      limit 40
    `).map((r) => ({
		id: r.id,
		role: r.role,
		content: r.content,
		createdAt: r.created_at
	}));
});
var askAssistant_createServerFn_handler = createServerRpc({
	id: "be6550846e7bbe303697f2b97eca6a1fb7004fbc20c0e31d574840294f8c96d8",
	name: "askAssistant",
	filename: "src/lib/server/assistant.ts"
}, (opts) => askAssistant.__executeServer(opts));
var askAssistant = createServerFn({ method: "POST" }).validator((input) => input).middleware([authMiddleware]).handler(askAssistant_createServerFn_handler, async ({ context, data }) => {
	const prompt = data.prompt.trim();
	if (!prompt) return {
		ok: false,
		error: "Empty prompt"
	};
	const sql = await getSql();
	await ensureUserSettings(sql, context.userId);
	await sql`
      insert into assistant_messages (id, user_id, role, content)
      values (${newId()}, ${context.userId}, 'user', ${prompt})
    `;
	const ranked = (await sql`
      select id, title, body, ai_summary, emotion, tags_json, created_at
      from memories where user_id = ${context.userId}
    `).map((m) => ({
		m,
		score: scoreText(prompt, [
			m.title,
			m.body,
			m.ai_summary ?? "",
			m.tags_json,
			m.emotion ?? ""
		], [
			4,
			2,
			3,
			2,
			1
		])
	})).sort((a, b) => b.score - a.score).slice(0, 10).map((r) => r.m);
	const contextBlock = ranked.map((m, i) => `${i + 1}. "${m.title}" (${m.created_at.slice(0, 10)}, ${m.emotion ?? "unmarked"}): ${m.ai_summary ?? m.body.slice(0, 240)}`).join("\n");
	const history = await sql`
      select role, content from assistant_messages
      where user_id = ${context.userId}
      order by created_at desc
      limit 8
    `;
	const ai = await grokChat([
		{
			role: "system",
			content: "You are the MindMesh assistant, trained only on this person's memory network. Answer from the retrieved memories. Name specific memories by title. Surface patterns across domains (golf, real estate, family, health). If something isn't in the memories, say so. Be concise, warm, and precise. No markdown headings. Use short paragraphs."
		},
		...history.reverse().slice(0, -1).map((h) => ({
			role: h.role,
			content: h.content.slice(0, 1200)
		})),
		{
			role: "user",
			content: `Retrieved memories:\n${contextBlock || "(none)"}\n\nQuestion: ${prompt}`
		}
	], {
		maxTokens: 700,
		temperature: .5
	});
	const text = ai.ok ? ai.text : ranked.length ? `AI is offline, so here is a direct pull from your mesh:\n\n${ranked.slice(0, 5).map((m) => `• ${m.title} — ${m.ai_summary ?? m.body.slice(0, 140)}`).join("\n")}` : "AI is unavailable right now, and I could not match that to existing memories.";
	const id = newId();
	await sql`
      insert into assistant_messages (id, user_id, role, content)
      values (${id}, ${context.userId}, 'assistant', ${text})
    `;
	return {
		ok: true,
		id,
		content: text
	};
});
//#endregion
export { askAssistant_createServerFn_handler, listAssistant_createServerFn_handler };
