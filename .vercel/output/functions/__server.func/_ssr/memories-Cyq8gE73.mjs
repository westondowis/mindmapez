import { r as createServerFn } from "./ssr.mjs";
import { r as getSql } from "./db-6VNt2pjY.mjs";
import { t as createServerRpc } from "./createServerRpc-CcvdN_gc.mjs";
import { t as authMiddleware } from "./middleware-CHZF_giW.mjs";
import { a as newId } from "./utils-KYK7ILYy.mjs";
import { a as suggestTags, n as organizeLocal, o as transcribeAudio, r as organizeMemory } from "./ai-DwWWELph.mjs";
import { t as ensureUserSettings } from "./seed-CtwgOCeZ.mjs";
import { n as normalizeTags, t as mergeTags } from "./tags-7fTG6o7M.mjs";
import { n as mapConnection, r as mapMemory, t as mapConcept } from "./map-BFh8JylK.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/memories-Cyq8gE73.js
async function getPlan(userId) {
	return (await (await getSql())`
    select plan from user_settings where user_id = ${userId}
  `)[0]?.plan === "pro" ? "pro" : "free";
}
var listMemories_createServerFn_handler = createServerRpc({
	id: "9d81d9bd0ad39b99a3d34c5266f241952535a8c27bc38e0cf03a7e57be7229d7",
	name: "listMemories",
	filename: "src/lib/server/memories.ts"
}, (opts) => listMemories.__executeServer(opts));
var listMemories = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(listMemories_createServerFn_handler, async ({ context }) => {
	const sql = await getSql();
	await ensureUserSettings(sql, context.userId);
	return (await sql`
      select * from memories where user_id = ${context.userId} order by created_at desc
    `).map(mapMemory);
});
var getMemory_createServerFn_handler = createServerRpc({
	id: "eb9ccf3e36cea7b190f445f3c798a8a53c326e5883f16b86bbcdb294ee8da02d",
	name: "getMemory",
	filename: "src/lib/server/memories.ts"
}, (opts) => getMemory.__executeServer(opts));
var getMemory = createServerFn({ method: "GET" }).validator((id) => id).middleware([authMiddleware]).handler(getMemory_createServerFn_handler, async ({ context, data: id }) => {
	const sql = await getSql();
	const row = (await sql`
      select * from memories where id = ${id} and user_id = ${context.userId}
    `)[0];
	if (!row) return null;
	await sql`
      update memories set access_count = access_count + 1
      where id = ${id} and user_id = ${context.userId}
    `;
	const concepts = await sql`
      select c.* from concepts c
      join memory_concepts mc on mc.concept_id = c.id
      where mc.memory_id = ${id} and mc.user_id = ${context.userId}
    `;
	const relatedRows = await sql`
      select m.id, m.title, m.node_kind, c.strength
      from connections c
      join memories m on (
        (c.source_type = 'memory' and c.source_id = ${id} and c.target_type = 'memory' and m.id = c.target_id)
        or
        (c.target_type = 'memory' and c.target_id = ${id} and c.source_type = 'memory' and m.id = c.source_id)
      )
      where c.user_id = ${context.userId} and c.status = 'accepted' and m.user_id = ${context.userId}
      order by c.strength desc
      limit 12
    `;
	return {
		...mapMemory({
			...row,
			access_count: Number(row.access_count) + 1
		}),
		concepts: concepts.map((c) => ({
			id: c.id,
			name: c.name,
			kind: c.kind
		})),
		related: relatedRows.map((r) => ({
			id: r.id,
			title: r.title,
			nodeKind: r.node_kind,
			strength: Number(r.strength)
		})),
		connectedConcepts: concepts.map((c) => ({
			id: c.id,
			name: c.name,
			kind: c.kind
		}))
	};
});
var createMemory_createServerFn_handler = createServerRpc({
	id: "24a5caf39a163d5e0926cb16f4567c9f3542c35b744f8a3fb439c11bcbb68b2f",
	name: "createMemory",
	filename: "src/lib/server/memories.ts"
}, (opts) => createMemory.__executeServer(opts));
var createMemory = createServerFn({ method: "POST" }).validator((input) => input).middleware([authMiddleware]).handler(createMemory_createServerFn_handler, async ({ context, data }) => {
	try {
		const sql = await getSql();
		await ensureUserSettings(sql, context.userId);
		const countRows = await sql`
        select count(*)::int as n from memories where user_id = ${context.userId}
      `;
		const plan = await getPlan(context.userId);
		const count = Number(countRows[0]?.n ?? 0);
		if (plan === "free" && count >= 500) return {
			ok: false,
			error: "Free plan limit reached. Upgrade to Pro for unlimited memories."
		};
		const raw = [
			data.title,
			data.body,
			data.transcript
		].filter(Boolean).join("\n");
		let transcript = data.transcript ?? null;
		if (data.memoryType === "voice" && data.mediaUrl && (!transcript || transcript.trim().length < 24)) {
			const better = await transcribeAudio(data.mediaUrl);
			if (better) transcript = better;
		}
		const organized = data.conceptId || data.tags && data.tags.length >= 2 ? organizeLocal(raw || transcript || "", data.title) : await organizeMemory(raw || transcript || "", data.title);
		const id = newId();
		const title = data.title?.trim() || organized.title;
		const emotion = data.emotion || organized.emotion;
		const importance = data.importance ?? organized.importance;
		const tags = JSON.stringify(data.tags && data.tags.length ? normalizeTags(data.tags) : mergeTags(data.tags, organized.tags));
		const emoji = data.emoji?.trim() || null;
		const color = data.color?.trim() || null;
		const body = data.body?.trim() || transcript || title;
		const sourceUrl = data.sourceUrl?.trim() || null;
		const sourceKind = data.sourceKind?.trim() || null;
		let posX = null;
		let posY = null;
		if (data.conceptId) {
			const hub = await sql`
          select position_x, position_y from concepts
          where id = ${data.conceptId} and user_id = ${context.userId}
        `;
			if (hub[0]) {
				const siblings = await sql`
            select count(*)::int as n from memory_concepts
            where user_id = ${context.userId} and concept_id = ${data.conceptId}
          `;
				const i = Number(siblings[0]?.n ?? 0);
				const angle = i / Math.max(i + 1, 1) * Math.PI * 2 - Math.PI / 2;
				posX = (hub[0].position_x ?? 0) + Math.cos(angle) * 175;
				posY = (hub[0].position_y ?? 0) + Math.sin(angle) * 175;
			}
		}
		await sql`
        insert into memories (
          id, user_id, title, body, memory_type, emotion, importance, ai_impact,
          ai_summary, transcript, media_url, media_mime, media_name, node_kind, tags_json,
          emoji, color, position_x, position_y, source_url, source_kind
        ) values (
          ${id}, ${context.userId}, ${title}, ${body}, ${data.memoryType}, ${emotion},
          ${importance}, ${organized.impact}, ${organized.summary}, ${transcript},
          ${data.mediaUrl ?? null}, ${data.mediaMime ?? null}, ${data.mediaName ?? null},
          ${organized.kind}, ${tags}, ${emoji}, ${color}, ${posX}, ${posY},
          ${sourceUrl}, ${sourceKind}
        )
      `;
		const pinned = data.conceptId ? await sql`
            select id, name, kind from concepts
            where id = ${data.conceptId} and user_id = ${context.userId}
          ` : [];
		const conceptsToLink = pinned[0] ? [{
			name: pinned[0].name,
			kind: pinned[0].kind
		}] : organized.concepts;
		for (const concept of conceptsToLink) {
			let conceptId = (await sql`
          select id from concepts where user_id = ${context.userId} and lower(name) = ${concept.name.toLowerCase()}
        `)[0]?.id;
			if (!conceptId) {
				conceptId = newId();
				await sql`
            insert into concepts (id, user_id, name, kind)
            values (${conceptId}, ${context.userId}, ${concept.name}, ${concept.kind})
          `;
			}
			await sql`
          insert into memory_concepts (user_id, memory_id, concept_id)
          values (${context.userId}, ${id}, ${conceptId})
          on conflict do nothing
        `;
			await sql`
          insert into connections (
            id, user_id, source_type, source_id, target_type, target_id, strength, reason, status
          ) values (
            ${newId()}, ${context.userId}, 'memory', ${id}, 'concept', ${conceptId}, 0.7, ${"auto: " + concept.name}, 'accepted'
          )
        `;
		}
		const siblings = await sql`
        select distinct m.id, m.title
        from memories m
        join memory_concepts mc on mc.memory_id = m.id
        where m.user_id = ${context.userId}
          and m.id <> ${id}
          and mc.concept_id in (select concept_id from memory_concepts where memory_id = ${id})
        limit 6
      `;
		for (const sib of siblings) await sql`
          insert into connections (
            id, user_id, source_type, source_id, target_type, target_id, strength, reason, status
          ) values (
            ${newId()}, ${context.userId}, 'memory', ${id}, 'memory', ${sib.id}, 0.55, ${"Shared themes with: " + sib.title}, 'suggested'
          )
        `;
		const created = await sql`
        select * from memories where id = ${id} and user_id = ${context.userId}
      `;
		await sql`update user_settings set last_saved_at = now() where user_id = ${context.userId}`;
		return {
			ok: true,
			memory: mapMemory(created[0])
		};
	} catch (err) {
		console.error("createMemory failed", err);
		return {
			ok: false,
			error: err instanceof Error ? err.message : "Could not save that memory"
		};
	}
});
var updateMemory_createServerFn_handler = createServerRpc({
	id: "eeb10904534d0fcee5512db4e052eeb18ebfb7c1f992010d8046c3c33b8d3af0",
	name: "updateMemory",
	filename: "src/lib/server/memories.ts"
}, (opts) => updateMemory.__executeServer(opts));
var updateMemory = createServerFn({ method: "POST" }).validator((input) => input).middleware([authMiddleware]).handler(updateMemory_createServerFn_handler, async ({ context, data }) => {
	const sql = await getSql();
	const existing = await sql`
      select * from memories where id = ${data.id} and user_id = ${context.userId}
    `;
	if (!existing[0]) return {
		ok: false,
		error: "Not found"
	};
	await sql`
      update memories
      set title = ${data.title ?? existing[0].title}, body = ${data.body ?? existing[0].body}, emotion = ${data.emotion === void 0 ? existing[0].emotion : data.emotion},
          importance = ${data.importance ?? existing[0].importance}, node_kind = ${data.nodeKind ?? existing[0].node_kind},
          emoji = ${data.emoji === void 0 ? existing[0].emoji : data.emoji}, color = ${data.color === void 0 ? existing[0].color : data.color}, tags_json = ${data.tags === void 0 ? existing[0].tags_json : JSON.stringify(normalizeTags(data.tags))}, updated_at = now()
      where id = ${data.id} and user_id = ${context.userId}
    `;
	await sql`update user_settings set last_saved_at = now() where user_id = ${context.userId}`;
	return { ok: true };
});
var deleteMemory_createServerFn_handler = createServerRpc({
	id: "006d71105145a155a7ffd05e3ad9eadd5865261650335520859d4878843d93e1",
	name: "deleteMemory",
	filename: "src/lib/server/memories.ts"
}, (opts) => deleteMemory.__executeServer(opts));
var deleteMemory = createServerFn({ method: "POST" }).validator((id) => id).middleware([authMiddleware]).handler(deleteMemory_createServerFn_handler, async ({ context, data: id }) => {
	const sql = await getSql();
	await sql`delete from connections where user_id = ${context.userId} and ((source_type = 'memory' and source_id = ${id}) or (target_type = 'memory' and target_id = ${id}))`;
	await sql`delete from memory_concepts where user_id = ${context.userId} and memory_id = ${id}`;
	await sql`delete from memories where id = ${id} and user_id = ${context.userId}`;
	return { ok: true };
});
var savePositions_createServerFn_handler = createServerRpc({
	id: "5af16bfb1430ba7c2ebe9852d128489e913f1b6b1f2696a86be02a5e9e0c5d81",
	name: "savePositions",
	filename: "src/lib/server/memories.ts"
}, (opts) => savePositions.__executeServer(opts));
var savePositions = createServerFn({ method: "POST" }).validator((input) => input).middleware([authMiddleware]).handler(savePositions_createServerFn_handler, async ({ context, data }) => {
	const sql = await getSql();
	for (const n of data.nodes.slice(0, 400)) if (n.type === "memory") await sql`
          update memories set position_x = ${n.x}, position_y = ${n.y}
          where id = ${n.id} and user_id = ${context.userId}
        `;
	else await sql`
          update concepts set position_x = ${n.x}, position_y = ${n.y}
          where id = ${n.id} and user_id = ${context.userId}
        `;
	await sql`update user_settings set last_saved_at = now() where user_id = ${context.userId}`;
	return { ok: true };
});
var setConnectionStatus_createServerFn_handler = createServerRpc({
	id: "b7f8181e42b45ad75479b3853d74165c0468f2d24659b5267af6d5e0d3ac99b4",
	name: "setConnectionStatus",
	filename: "src/lib/server/memories.ts"
}, (opts) => setConnectionStatus.__executeServer(opts));
var setConnectionStatus = createServerFn({ method: "POST" }).validator((input) => input).middleware([authMiddleware]).handler(setConnectionStatus_createServerFn_handler, async ({ context, data }) => {
	await (await getSql())`
      update connections set status = ${data.status}
      where id = ${data.id} and user_id = ${context.userId}
    `;
	return { ok: true };
});
var getGraph_createServerFn_handler = createServerRpc({
	id: "05f45d36d79575950b4c83607f4d66c101b825c38d7f8a9929af66e03680e105",
	name: "getGraph",
	filename: "src/lib/server/memories.ts"
}, (opts) => getGraph.__executeServer(opts));
var getGraph = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(getGraph_createServerFn_handler, async ({ context }) => {
	const sql = await getSql();
	await ensureUserSettings(sql, context.userId);
	const memories = await sql`
      select * from memories where user_id = ${context.userId}
    `;
	const concepts = await sql`
      select c.*, coalesce(cnt.n, 0)::int as memory_count
      from concepts c
      left join (
        select concept_id, count(*) as n from memory_concepts
        where user_id = ${context.userId}
        group by concept_id
      ) cnt on cnt.concept_id = c.id
      where c.user_id = ${context.userId}
    `;
	const connections = await sql`
      select id, source_type, source_id, target_type, target_id, strength, reason, status
      from connections where user_id = ${context.userId}
    `;
	const settings = await sql`
      select plan, display_name, onboarded, last_saved_at from user_settings where user_id = ${context.userId}
    `;
	const voiceCount = memories.filter((m) => m.memory_type === "voice").length;
	const accepted = connections.filter((c) => c.status === "accepted");
	return {
		displayName: settings[0]?.display_name?.trim() || "ME",
		onboarded: Boolean(settings[0]?.onboarded),
		plan: settings[0]?.plan === "pro" ? "pro" : "free",
		memoryCount: memories.length,
		voiceCount,
		connectionCount: accepted.length,
		concepts: concepts.map(mapConcept),
		memories: memories.map(mapMemory),
		connections: accepted.map(mapConnection),
		suggested: connections.filter((c) => c.status === "suggested").map(mapConnection),
		lastSavedAt: settings[0]?.last_saved_at ?? null
	};
});
var suggestMemoryTags_createServerFn_handler = createServerRpc({
	id: "28f4e40a9e9eb1b3fa5b8e5eeeed63af4660dd66a4950a18ea09dd4820c318a2",
	name: "suggestMemoryTags",
	filename: "src/lib/server/memories.ts"
}, (opts) => suggestMemoryTags.__executeServer(opts));
var suggestMemoryTags = createServerFn({ method: "POST" }).validator((input) => input).middleware([authMiddleware]).handler(suggestMemoryTags_createServerFn_handler, async ({ context, data }) => {
	const sql = await getSql();
	let raw = data.text?.trim() || "";
	let existing = data.existing ?? [];
	if (data.memoryId) {
		const row = (await sql`
        select * from memories where id = ${data.memoryId} and user_id = ${context.userId}
      `)[0];
		if (!row) return { tags: [] };
		raw = [
			row.title,
			row.body,
			row.ai_summary,
			row.transcript
		].filter(Boolean).join("\n");
		if (!existing.length) try {
			const parsed = JSON.parse(row.tags_json);
			existing = Array.isArray(parsed) ? parsed.map(String) : [];
		} catch {
			existing = [];
		}
	}
	if (!raw) return { tags: normalizeTags(existing) };
	const tags = await suggestTags(raw, existing);
	return { tags: mergeTags(existing, tags) };
});
//#endregion
export { createMemory_createServerFn_handler, deleteMemory_createServerFn_handler, getGraph_createServerFn_handler, getMemory_createServerFn_handler, listMemories_createServerFn_handler, savePositions_createServerFn_handler, setConnectionStatus_createServerFn_handler, suggestMemoryTags_createServerFn_handler, updateMemory_createServerFn_handler };
