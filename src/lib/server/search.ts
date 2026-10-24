import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { scoreText } from "@/lib/organize";
import { mapMemory, type MemoryRow } from "./map";
import { grokChat } from "./ai";
import { ensureUserSettings } from "./seed";

export const searchMemories = createServerFn({ method: "POST" })
  .validator((input: { query: string; semantic?: boolean }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureUserSettings(sql, context.userId);
    const q = data.query.trim();
    if (!q) return { results: [], interpretation: null as string | null };

    const rows = await sql<MemoryRow & { concept_names: string | null }>`
      select m.*, (
        select string_agg(c.name, ' ')
        from memory_concepts mc
        join concepts c on c.id = mc.concept_id
        where mc.memory_id = m.id
      ) as concept_names
      from memories m
      where m.user_id = ${context.userId}
    `;

    const ranked = rows
      .map((row) => {
        const memory = mapMemory(row);
        const score = scoreText(
          q,
          [
            memory.title,
            memory.body,
            memory.aiSummary ?? "",
            memory.transcript ?? "",
            memory.tags.join(" "),
            row.concept_names ?? "",
            memory.emotion ?? "",
            memory.sourceUrl ?? "",
          ],
          [5, 2, 3, 2, 3, 3, 1, 2],
        );
        return { memory, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);

    if (!data.semantic || ranked.length === 0) {
      return {
        results: ranked.slice(0, 24).map((r) => r.memory),
        interpretation: null as string | null,
      };
    }

    const catalog = ranked
      .slice(0, 30)
      .map((r) => `- ${r.memory.id}: ${r.memory.title} — ${(r.memory.aiSummary ?? r.memory.body).slice(0, 140)}`)
      .join("\n");

    const ai = await grokChat(
      [
        {
          role: "system",
          content:
            "You search a personal memory network. Given a natural-language question and a catalog of memories (id: title — snippet), return JSON {ids: string[], interpretation: string}. ids = most relevant memory ids in order, max 10. interpretation = one sentence explaining what you understood. Return ONLY JSON.",
        },
        { role: "user", content: `Question: ${q}\n\nCatalog:\n${catalog}` },
      ],
      { maxTokens: 400, temperature: 0.2 },
    );

    if (!ai.ok) {
      return { results: ranked.slice(0, 16).map((r) => r.memory), interpretation: null };
    }
    try {
      const match = ai.text.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match?.[0] ?? "{}") as { ids?: string[]; interpretation?: string };
      const byId = new Map(rows.map((r) => [r.id, mapMemory(r)]));
      const ordered = (parsed.ids ?? []).map((id) => byId.get(id)).filter(Boolean);
      const fallback = ranked.map((r) => r.memory).filter((m) => !ordered.some((o) => o?.id === m.id));
      return {
        results: [...ordered, ...fallback].slice(0, 16),
        interpretation: parsed.interpretation ?? null,
      };
    } catch {
      return { results: ranked.slice(0, 16).map((r) => r.memory), interpretation: null };
    }
  });
