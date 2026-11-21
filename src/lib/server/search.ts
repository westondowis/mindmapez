import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { tieredSearch, type TieredResult } from "@/lib/search-tiers";
import type { MemorySummary } from "@/lib/types";
import { mapMemorySummary, memorySummaryColumns, type MemoryRow } from "./map";
import { llmChat } from "./ai";
import { ensureUserSettings } from "./seed";

export type SearchHit = { id: string; tier: 1 | 2 | 3 | 4; via: string };

/**
 * Tag-first tiered search (tags → branch names → title/summary). `deep` also scans body,
 * transcript and dataset rows. `semantic` asks the AI to re-rank the top tiered results.
 * Only lightweight summary rows are returned; open a memory to load its body and media.
 */
export const searchMemories = createServerFn({ method: "POST" })
  .validator((input: { query: string; semantic?: boolean; deep?: boolean }) => ({
    query: String(input.query ?? "").slice(0, 500),
    semantic: !!input.semantic,
    deep: !!input.deep,
  }))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureUserSettings(sql, context.userId);
    const q = data.query.trim();
    const empty = { results: [] as MemorySummary[], hits: [] as SearchHit[], interpretation: null as string | null, deep: data.deep };
    if (!q) return empty;

    const ranked: TieredResult[] = await tieredSearch(sql, context.userId, q, { deep: data.deep, limit: 60 });
    if (!ranked.length) return empty;
    const ids = ranked.map((r) => r.memoryId);
    const rows = await sql.query<MemoryRow>(
      `select ${memorySummaryColumns("m")} from memories m where m.user_id = $1 and m.id = any($2::text[])`,
      [context.userId, ids],
    );
    const byId = new Map(rows.map((r) => [r.id, mapMemorySummary(r)]));
    const ordered = ranked.map((r) => byId.get(r.memoryId)).filter((m): m is MemorySummary => !!m);
    const hitOf = new Map(ranked.map((r) => [r.memoryId, { id: r.memoryId, tier: r.tier, via: r.via } satisfies SearchHit]));
    const finish = (list: MemorySummary[], interpretation: string | null) => {
      const results = list.slice(0, 24);
      return { results, hits: results.map((m) => hitOf.get(m.id)!).filter(Boolean), interpretation, deep: data.deep };
    };

    if (!data.semantic || ordered.length < 2) return finish(ordered, null);

    const catalog = ordered
      .slice(0, 30)
      .map((m) => `- ${m.id}: ${m.title} — ${m.snippet.slice(0, 140).replace(/\s+/g, " ")}${m.tags.length ? ` [${m.tags.slice(0, 6).join(", ")}]` : ""}`)
      .join("\n");
    const ai = await llmChat(
      [
        {
          role: "system",
          content:
            "You search a personal memory network. Given a natural-language question and a catalog of memories (id: title — snippet [tags]), return JSON {ids: string[], interpretation: string}. ids = most relevant memory ids in order, max 10. interpretation = one sentence explaining what you understood. Return ONLY JSON.",
        },
        { role: "user", content: `Question: ${q}\n\nCatalog:\n${catalog}` },
      ],
      { maxTokens: 400, temperature: 0.2 },
    );
    if (!ai.ok) return finish(ordered, null);
    try {
      const match = ai.text.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match?.[0] ?? "{}") as { ids?: unknown; interpretation?: unknown };
      const picked = (Array.isArray(parsed.ids) ? parsed.ids : []).map((id) => byId.get(String(id))).filter((m): m is MemorySummary => !!m);
      const rest = ordered.filter((m) => !picked.some((p) => p.id === m.id));
      return finish([...picked, ...rest], typeof parsed.interpretation === "string" ? parsed.interpretation.slice(0, 400) : null);
    } catch {
      return finish(ordered, null);
    }
  });
