import { r as createServerFn } from "./ssr.mjs";
import { r as getSql } from "./db-6VNt2pjY.mjs";
import { t as createServerRpc } from "./createServerRpc-CcvdN_gc.mjs";
import { t as authMiddleware } from "./middleware-CHZF_giW.mjs";
import { n as resetMind, t as ensureUserSettings } from "./seed-CtwgOCeZ.mjs";
import { r as mapMemory } from "./map-BFh8JylK.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/dashboard-C3SuPexd.js
var getDashboard_createServerFn_handler = createServerRpc({
	id: "9db85427a1c24a4946624e0d3df9e6cbf4f6db0a0617124b39eec33b6ee26c12",
	name: "getDashboard",
	filename: "src/lib/server/dashboard.ts"
}, (opts) => getDashboard.__executeServer(opts));
var getDashboard = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(getDashboard_createServerFn_handler, async ({ context }) => {
	const sql = await getSql();
	await ensureUserSettings(sql, context.userId);
	const mapped = (await sql`
      select * from memories where user_id = ${context.userId} order by created_at desc
    `).map(mapMemory);
	const settings = await sql`
      select plan from user_settings where user_id = ${context.userId}
    `;
	const conn = await sql`
      select count(*)::int as n from connections where user_id = ${context.userId} and status = 'accepted'
    `;
	const topics = await sql`
      select c.name, count(*)::int as count
      from memory_concepts mc
      join concepts c on c.id = mc.concept_id
      where mc.user_id = ${context.userId}
      group by c.name
      order by count desc
      limit 6
    `;
	const since = (/* @__PURE__ */ new Date(Date.now() - 18144e5)).toISOString();
	const growing = await sql`
      select c.name, count(*)::int as count
      from memory_concepts mc
      join concepts c on c.id = mc.concept_id
      join memories m on m.id = mc.memory_id
      where mc.user_id = ${context.userId} and m.created_at > ${since}
      group by c.name
      order by count desc
      limit 5
    `;
	const emotions = await sql`
      select emotion as name, count(*)::int as count
      from memories
      where user_id = ${context.userId} and emotion is not null
      group by emotion
      order by count desc
      limit 6
    `;
	const suggestedRows = await sql`
      select id, reason, strength, source_type, source_id, target_type, target_id
      from connections
      where user_id = ${context.userId} and status = 'suggested'
      order by strength desc
      limit 8
    `;
	const labelFor = async (type, id) => {
		if (type === "memory") return (await sql`
          select title from memories where id = ${id} and user_id = ${context.userId}
        `)[0]?.title ?? "Memory";
		return (await sql`
        select name from concepts where id = ${id} and user_id = ${context.userId}
      `)[0]?.name ?? "Concept";
	};
	const suggested = [];
	for (const s of suggestedRows) suggested.push({
		id: s.id,
		reason: s.reason,
		strength: Number(s.strength),
		a: {
			type: s.source_type,
			id: s.source_id,
			label: await labelFor(s.source_type, s.source_id)
		},
		b: {
			type: s.target_type,
			id: s.target_id,
			label: await labelFor(s.target_type, s.target_id)
		}
	});
	return {
		plan: settings[0]?.plan === "pro" ? "pro" : "free",
		memoryCount: mapped.length,
		voiceCount: mapped.filter((m) => m.memoryType === "voice").length,
		photoCount: mapped.filter((m) => m.memoryType === "photo" || m.memoryType === "video").length,
		connectionCount: Number(conn[0]?.n ?? 0),
		topTopics: topics,
		growingConcepts: growing,
		topEmotions: emotions.filter((e) => e.name),
		recent: mapped.slice(0, 8),
		favorites: [...mapped].sort((a, b) => b.importance - a.importance || b.accessCount - a.accessCount).slice(0, 5),
		suggested
	};
});
var setPlan_createServerFn_handler = createServerRpc({
	id: "1e3549b578a09170b0fc35dbdae0c2b53c3114a6da71a19c1fa3cc65a6f876e6",
	name: "setPlan",
	filename: "src/lib/server/dashboard.ts"
}, (opts) => setPlan.__executeServer(opts));
var setPlan = createServerFn({ method: "POST" }).validator((plan) => plan).middleware([authMiddleware]).handler(setPlan_createServerFn_handler, async ({ context, data: plan }) => {
	await (await getSql())`
      insert into user_settings (user_id, plan, seeded)
      values (${context.userId}, ${plan}, true)
      on conflict (user_id) do update set plan = ${plan}
    `;
	return {
		ok: true,
		plan
	};
});
var resetSampleMind_createServerFn_handler = createServerRpc({
	id: "e5d55205c5a98d468670611db23ea4ad9983b199e1c640dfc451ec33420703a3",
	name: "resetSampleMind",
	filename: "src/lib/server/dashboard.ts"
}, (opts) => resetSampleMind.__executeServer(opts));
var resetSampleMind = createServerFn({ method: "POST" }).middleware([authMiddleware]).handler(resetSampleMind_createServerFn_handler, async ({ context }) => {
	const sql = await getSql();
	await resetMind(sql, context.userId);
	return { ok: true };
});
//#endregion
export { getDashboard_createServerFn_handler, resetSampleMind_createServerFn_handler, setPlan_createServerFn_handler };
