//#region node_modules/.nitro/vite/services/ssr/assets/tags-7fTG6o7M.js
function normalizeTags(tags) {
	const seen = /* @__PURE__ */ new Set();
	const out = [];
	for (const raw of tags) {
		const pieces = String(raw).split(/[,;]+/).map((p) => p.replace(/^#/, "").replace(/\s+/g, " ").trim()).filter(Boolean);
		for (const piece of pieces) {
			const key = piece.toLowerCase();
			if (seen.has(key) || piece.length > 48) continue;
			seen.add(key);
			out.push(piece);
			if (out.length >= 16) return out;
		}
	}
	return out;
}
function mergeTags(user, generated) {
	return normalizeTags([...user ?? [], ...generated]);
}
//#endregion
export { normalizeTags as n, mergeTags as t };
