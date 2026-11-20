import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { newId } from "@/lib/utils";
import {
  cleanCustomLabel,
  extractSvg,
  sanitizeSvg,
  type CustomEmoji,
  type CustomEmojiSource,
} from "@/lib/custom-emoji";
import { llmChat, llmConfig } from "./ai";

/** Per-account ceiling so a runaway client cannot fill the table. */
const MAX_CUSTOM_EMOJIS = 300;

type Row = { id: string; label: string; svg: string; source: CustomEmojiSource; created_at: string | Date };

const mapRow = (r: Row): CustomEmoji => ({
  id: r.id,
  label: r.label,
  svg: r.svg,
  source: r.source,
  createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
});

export const listCustomEmojis = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<CustomEmoji[]> => {
    const sql = await getSql();
    const rows = await sql<Row>`
      select id, label, svg, source, created_at from custom_emojis
      where user_id = ${context.userId}
      order by created_at desc
      limit ${MAX_CUSTOM_EMOJIS}
    `;
    return rows.map(mapRow);
  });

export const createCustomEmoji = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { label: string; svg: string; source: CustomEmojiSource }) => {
    const svg = sanitizeSvg(input?.svg);
    if (!svg) throw new Error("That icon could not be saved (invalid or too large SVG).");
    const source: CustomEmojiSource = input?.source === "drawn" ? "drawn" : "generated";
    return { label: cleanCustomLabel(input?.label), svg, source };
  })
  .handler(async ({ data, context }): Promise<CustomEmoji> => {
    const sql = await getSql();
    const count = await sql<{ n: number }>`select count(*)::int as n from custom_emojis where user_id = ${context.userId}`;
    if (Number(count[0]?.n ?? 0) >= MAX_CUSTOM_EMOJIS) {
      throw new Error(`You already have ${MAX_CUSTOM_EMOJIS} custom emojis. Delete one to make room.`);
    }
    const id = newId();
    const rows = await sql<Row>`
      insert into custom_emojis (id, user_id, label, svg, source)
      values (${id}, ${context.userId}, ${data.label}, ${data.svg}, ${data.source})
      returning id, label, svg, source, created_at
    `;
    return mapRow(rows[0]!);
  });

export const deleteCustomEmoji = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => ({ id: String(input?.id ?? "").slice(0, 64) }))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sql = await getSql();
    await sql`delete from custom_emojis where id = ${data.id} and user_id = ${context.userId}`;
    return { ok: true };
  });

const ICON_RULES =
  "Return ONLY one SVG element, nothing else. Rules: <svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\">; " +
  "flat emoji style, bold simple shapes, a soft rounded-square or circle background, at most 6 colors as hex values, " +
  "round stroke caps and joins, centered with ~8px padding. Use only svg, g, path, circle, ellipse, rect, line, polyline, polygon, " +
  "defs, linearGradient, radialGradient, stop. No text, no style attributes or <style>, no images, no scripts, no links or external references.";

/**
 * Optional AI path: ask the configured LLM (llmChat, any OpenAI-compatible
 * provider) for an emoji-style SVG, then sanitize it. `sketch` is an existing
 * sanitized SVG to clean up instead of drawing from scratch. Returns ok:false
 * when no model is configured or the reply has no usable SVG; the client then
 * keeps its built-in deterministic icon.
 */
export const aiCustomEmoji = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { description: string; sketch?: string | null }) => ({
    description: cleanCustomLabel(input?.description),
    sketch: input?.sketch ? sanitizeSvg(input.sketch) : null,
  }))
  .handler(async ({ data }): Promise<{ ok: true; svg: string } | { ok: false; error: string }> => {
    if (!llmConfig()) return { ok: false, error: "AI is not configured here, so the built-in generator was used." };
    if (!data.description && !data.sketch) return { ok: false, error: "Describe the icon first." };
    const user = data.sketch
      ? `Clean up this hand-drawn sketch into a polished emoji-style icon${data.description ? ` of "${data.description}"` : ""}. Keep its overall silhouette and composition.\n\n${data.sketch}`
      : `Design a new emoji-style icon for: "${data.description}". Make it clearly read as that idea at 24px.`;
    const res = await llmChat(
      [
        { role: "system", content: `You draw tiny emoji icons as SVG. ${ICON_RULES}` },
        { role: "user", content: user },
      ],
      { maxTokens: 1800, temperature: 0.5 },
    );
    if (!res.ok) return { ok: false, error: "AI could not draw that right now, so the built-in icon was kept." };
    const raw = extractSvg(res.text);
    const svg = raw ? sanitizeSvg(raw) : null;
    if (!svg) return { ok: false, error: "AI returned an unusable drawing, so the built-in icon was kept." };
    return { ok: true, svg };
  });
