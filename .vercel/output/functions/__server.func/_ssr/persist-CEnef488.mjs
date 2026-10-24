import { r as createServerFn } from "./ssr.mjs";
import { r as getSql } from "./db-6VNt2pjY.mjs";
import { t as createServerRpc } from "./createServerRpc-CcvdN_gc.mjs";
import { t as authMiddleware } from "./middleware-CHZF_giW.mjs";
import { t as ensureUserSettings } from "./seed-CtwgOCeZ.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/persist-CEnef488.js
var saveAccountDraft_createServerFn_handler = createServerRpc({
	id: "d39aefc7c913812a403e1f6f0e4c19c72b4e77dff3ec3149e77bda57c3c1b6d0",
	name: "saveAccountDraft",
	filename: "src/lib/server/persist.ts"
}, (opts) => saveAccountDraft.__executeServer(opts));
var saveAccountDraft = createServerFn({ method: "POST" }).validator((input) => input).middleware([authMiddleware]).handler(saveAccountDraft_createServerFn_handler, async ({ context, data }) => {
	const sql = await getSql();
	await ensureUserSettings(sql, context.userId);
	const json = data.capture ? JSON.stringify(data.capture) : null;
	await sql`
      insert into account_drafts (user_id, capture_json, updated_at)
      values (${context.userId}, ${json}, now())
      on conflict (user_id) do update set capture_json = ${json}, updated_at = now()
    `;
	await sql`update user_settings set last_saved_at = now() where user_id = ${context.userId}`;
	return { ok: true };
});
var getAccountDraft_createServerFn_handler = createServerRpc({
	id: "2dac4c6affefb0a30820cb9407eb8f310bbca94d9d36dbb24b15417419be0dcf",
	name: "getAccountDraft",
	filename: "src/lib/server/persist.ts"
}, (opts) => getAccountDraft.__executeServer(opts));
var getAccountDraft = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(getAccountDraft_createServerFn_handler, async ({ context }) => {
	const sql = await getSql();
	await ensureUserSettings(sql, context.userId);
	const rows = await sql`
      select capture_json, updated_at from account_drafts where user_id = ${context.userId}
    `;
	const settings = await sql`
      select last_saved_at from user_settings where user_id = ${context.userId}
    `;
	let capture = null;
	if (rows[0]?.capture_json) try {
		capture = JSON.parse(rows[0].capture_json);
	} catch {
		capture = null;
	}
	return {
		capture,
		lastSavedAt: settings[0]?.last_saved_at ?? rows[0]?.updated_at ?? null
	};
});
var clearAccountDraft_createServerFn_handler = createServerRpc({
	id: "4f382e6b44e27ecccb552986d93c512ce59b54673f163fad438870ea995a5f43",
	name: "clearAccountDraft",
	filename: "src/lib/server/persist.ts"
}, (opts) => clearAccountDraft.__executeServer(opts));
var clearAccountDraft = createServerFn({ method: "POST" }).middleware([authMiddleware]).handler(clearAccountDraft_createServerFn_handler, async ({ context }) => {
	await (await getSql())`delete from account_drafts where user_id = ${context.userId}`;
	return { ok: true };
});
//#endregion
export { clearAccountDraft_createServerFn_handler, getAccountDraft_createServerFn_handler, saveAccountDraft_createServerFn_handler };
