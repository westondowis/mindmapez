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

    const ai = await grokChat(
      [
        {
          role: "system",
          content:
            "You are the MindMesh assistant, trained only on this person's memory network. Answer from the retrieved memories. Name specific memories by title. Surface patterns across domains (golf, real estate, family, health). If something isn't in the memories, say so. Be concise, warm, and precise. No markdown headings. Use short paragraphs.",
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
