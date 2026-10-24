//#region node_modules/.nitro/vite/services/ssr/assets/map-BFh8JylK.js
function parseTags(raw) {
	try {
		const v = JSON.parse(raw);
		return Array.isArray(v) ? v.map(String) : [];
	} catch {
		return [];
	}
}
function mapMemory(row) {
	return {
		id: row.id,
		title: row.title,
		body: row.body,
		memoryType: row.memory_type,
		emotion: row.emotion,
		importance: Number(row.importance) || 3,
		aiImpact: row.ai_impact || "medium",
		aiSummary: row.ai_summary,
		transcript: row.transcript,
		mediaUrl: row.media_url,
		mediaMime: row.media_mime,
		mediaName: row.media_name,
		nodeKind: row.node_kind || "learning",
		tags: parseTags(row.tags_json),
		accessCount: Number(row.access_count) || 0,
		positionX: row.position_x,
		positionY: row.position_y,
		emoji: row.emoji ?? null,
		color: row.color ?? null,
		sourceUrl: row.source_url ?? null,
		sourceKind: row.source_kind ?? null,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}
function mapConcept(row) {
	return {
		id: row.id,
		name: row.name,
		kind: row.kind,
		icon: row.icon,
		emoji: row.emoji ?? null,
		color: row.color ?? null,
		memoryCount: Number(row.memory_count) || 0,
		positionX: row.position_x,
		positionY: row.position_y,
		createdAt: row.created_at
	};
}
function mapConnection(row) {
	return {
		id: row.id,
		sourceType: row.source_type,
		sourceId: row.source_id,
		targetType: row.target_type,
		targetId: row.target_id,
		strength: Number(row.strength) || .5,
		reason: row.reason,
		status: row.status
	};
}
//#endregion
export { mapConnection as n, mapMemory as r, mapConcept as t };
