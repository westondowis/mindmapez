import { r as createServerFn } from "./ssr.mjs";
import { r as getSql } from "./db-6VNt2pjY.mjs";
import { t as createServerRpc } from "./createServerRpc-CcvdN_gc.mjs";
import { t as authMiddleware } from "./middleware-CHZF_giW.mjs";
import { a as newId } from "./utils-KYK7ILYy.mjs";
import { t as ensureUserSettings } from "./seed-CtwgOCeZ.mjs";
import { t as NODE_COLORS } from "./node-colors-CZ-tbA2V.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/onboarding--iaSpx2y.js
function ring(index, total, radius) {
	const angle = index / Math.max(total, 1) * Math.PI * 2 - Math.PI / 2;
	return {
		x: Math.cos(angle) * radius,
		y: Math.sin(angle) * radius
	};
}
var startWalkthrough_createServerFn_handler = createServerRpc({
	id: "73ccd3627138f8dbcf2f36cddb0685ef638eabe769d3983759fe5dd5457790f3",
	name: "startWalkthrough",
	filename: "src/lib/server/onboarding.ts"
}, (opts) => startWalkthrough.__executeServer(opts));
var startWalkthrough = createServerFn({ method: "POST" }).validator((input) => {
	const name = input.name.trim();
	if (name.length < 1 || name.length > 80) throw new Error("Name is required");
	const age = Number(input.age);
	if (!Number.isFinite(age) || age < 1 || age > 120) throw new Error("Enter a real age");
	const maps = input.maps.map((m) => ({
		name: m.name.trim(),
		emoji: (m.emoji || "🧠").slice(0, 8),
		color: NODE_COLORS.some((c) => c.id === m.color) ? m.color : "cyan"
	})).filter((m) => m.name.length > 0).slice(0, 8);
	if (maps.length < 2) throw new Error("Add at least two mind maps");
	return {
		name,
		age: Math.round(age),
		maps
	};
}).middleware([authMiddleware]).handler(startWalkthrough_createServerFn_handler, async ({ context, data }) => {
	const sql = await getSql();
	await ensureUserSettings(sql, context.userId);
	await sql`
      update user_settings
      set display_name = ${data.name}, age = ${data.age}, onboarded = false
      where user_id = ${context.userId}
    `;
	await sql`delete from connections where user_id = ${context.userId}`;
	await sql`delete from memory_concepts where user_id = ${context.userId}`;
	await sql`delete from memories where user_id = ${context.userId}`;
	await sql`delete from concepts where user_id = ${context.userId}`;
	const created = [];
	for (const [i, map] of data.maps.entries()) {
		const id = newId();
		const p = ring(i, data.maps.length, 300);
		await sql`
        insert into concepts (id, user_id, name, kind, icon, emoji, color, position_x, position_y)
        values (${id}, ${context.userId}, ${map.name}, 'category', 'brain', ${map.emoji}, ${map.color}, ${p.x}, ${p.y})
      `;
		created.push({
			id,
			name: map.name,
			emoji: map.emoji,
			color: map.color
		});
	}
	return {
		ok: true,
		maps: created
	};
});
var finishWalkthrough_createServerFn_handler = createServerRpc({
	id: "1b347c4c9d05656677a38bbdd15f38d88e6f139fe503f09d9186eb6480df3160",
	name: "finishWalkthrough",
	filename: "src/lib/server/onboarding.ts"
}, (opts) => finishWalkthrough.__executeServer(opts));
var finishWalkthrough = createServerFn({ method: "POST" }).middleware([authMiddleware]).handler(finishWalkthrough_createServerFn_handler, async ({ context }) => {
	const sql = await getSql();
	await ensureUserSettings(sql, context.userId);
	await sql`
      update user_settings set onboarded = true where user_id = ${context.userId}
    `;
	return { ok: true };
});
//#endregion
export { finishWalkthrough_createServerFn_handler, startWalkthrough_createServerFn_handler };
