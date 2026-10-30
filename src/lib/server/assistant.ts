import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { newId } from "@/lib/utils";
import { scoreText } from "@/lib/organize";
import { grokChat } from "./ai";
import { ensureUserSettings } from "./seed";
import type { AssistantMessage } from "@/lib/types";

export const listAssistant = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<AssistantMessage[]> => {
    const sql = await getSql();
    const rows = await sql<{ id: string; role: string; content: string; created_at: string }>`
      select id, role, content, created_at from assistant_messages
      where user_id = ${context.userId}
      order by created_at asc
      limit 40
    `;
    return rows.map((r) => ({
      id: r.id,
      role: r.role as "user" | "assistant",
      content: r.content,
      createdAt: r.created_at,
    }));
  });

/** Postgres drivers return timestamps as Date or string; normalise to YYYY-MM-DD. */
function dayOf(v: unknown): string {
  const d = new Date(v as string | number | Date);
  return Number.isNaN(d.getTime()) ? "unknown date" : d.toISOString().slice(0, 10);
}

export const askAssistant = createServerFn({ method: "POST" })
  .validator((input: { prompt: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const prompt = data.prompt.trim();
    if (!prompt) return { ok: false as const, error: "Empty prompt" };
    const sql = await getSql();
    await ensureUserSettings(sql, context.userId);

    await sql`
      insert into assistant_messages (id, user_id, role, content)
      values (${newId()}, ${context.userId}, 'user', ${prompt})
    `;

    const memories = await sql<{ id: string; title: string; body: string; ai_summary: string | null; emotion: string | null; tags_json: string; created_at: string }>`
      select id, title, body, ai_summary, emotion, tags_json, created_at
      from memories where user_id = ${context.userId}
    `;
    const ranked = memories
      .map((m) => ({
        m,
        score: scoreText(
          prompt,
          [m.title, m.body, m.ai_summary ?? "", m.tags_json, m.emotion ?? ""],
          [4, 2, 3, 2, 1],
        ),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((r) => r.m);

    const contextBlock = ranked
      .map(
        (m, i) =>
          `${i + 1}. "${m.title}" (${dayOf(m.created_at)}, ${m.emotion ?? "unmarked"}): ${m.ai_summary ?? m.body.slice(0, 240)}`,
      )
      .join("\n");

    const history = await sql<{ role: string; content: string }>`
      select role, content from assistant_messages
      where user_id = ${context.userId}
      order by created_at desc
      limit 8
    `;

    const concepts = await sql<{ id: string; name: string; sector_id: string | null; parent_id: string | null }>`
      select id, name, sector_id, parent_id from concepts where user_id = ${context.userId} order by name
    `;
    const taxonomy = concepts
      .slice(0, 40)
      .map((c) => `${c.parent_id ? "  - " : "- "}${c.name}${c.sector_id ? ` [${c.sector_id}]` : ""}`)
      .join("\n");

    const ai = await grokChat(
      [
        {
          role: "system",
          content:
            "You are the MindMesh assistant. You know this person's memory network and the branch map below. When asked where to put something, name a real branch from the map. If none fits, say so and offer to create one. Be concise. No markdown headings.\n\nBranch map:\n" + (taxonomy || "(no branches yet)"),
        },
        ...history
          .reverse()
          .slice(0, -1)
          .map((h) => ({
            role: h.role as "user" | "assistant",
            content: h.content.slice(0, 1200),
          })),
        {
          role: "user",
          content: `Retrieved memories:\n${contextBlock || "(none)"}\n\nQuestion: ${prompt}`,
        },
      ],
      { maxTokens: 700, temperature: 0.5 },
    );

    const text = ai.ok
      ? ai.text
      : ranked.length
        ? `AI is offline, so here is a direct pull from your mesh:\n\n${ranked
            .slice(0, 5)
            .map((m) => `• ${m.title} — ${m.ai_summary ?? m.body.slice(0, 140)}`)
            .join("\n")}`
        : "AI is unavailable right now, and I could not match that to existing memories.";

    const id = newId();
    await sql`
      insert into assistant_messages (id, user_id, role, content)
      values (${id}, ${context.userId}, 'assistant', ${text})
    `;
    return { ok: true as const, id, content: text };
  });

export const voiceIngest = createServerFn({ method: "POST" })
  .validator((input: { transcript: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const raw = data.transcript.trim();
    if (!raw) return { ok: false as const, error: "Empty note" };
    const sql = await getSql();
    const concepts = await sql<{ id: string; name: string; sector_id: string | null; parent_id: string | null }>`
      select id, name, sector_id, parent_id from concepts where user_id = ${context.userId}
    `;
    const words = raw.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
    const scored = concepts
      .map((c) => ({
        c,
        score: words.filter((w) => c.name.toLowerCase().includes(w) || w.includes(c.name.toLowerCase().slice(0, 5))).length,
      }))
      .sort((a, b) => b.score - a.score);
    const best = scored[0]?.score ? scored[0].c : null;
    const sentences = raw.split(/(?<=[.!?])\s+/).filter(Boolean);
    const keyPoints = sentences.slice(0, 4).map((x) => x.trim());
    const tags = Array.from(new Set(words.filter((w) => w.length > 4))).slice(0, 6);
    const thin = raw.split(/\s+/).length < 8 || !/[.?!]/.test(raw);
    return {
      ok: true as const,
      raw,
      keyPoints,
      tags,
      clarify: thin ? "Can you say a bit more about what you want to keep from that?" : null,
      suggested: best ? { id: best.id, name: best.name, sectorId: best.sector_id } : null,
      branches: concepts.slice(0, 12).map((c) => c.name),
    };
  });
