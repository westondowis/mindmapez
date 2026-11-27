import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import {
  EXPLAIN_SOURCE_CHARS,
  SCRIPT_MAX_WORDS,
  SCRIPT_MIN_WORDS,
  contentHash,
  fitScript,
  localScript,
  localSummary,
  parseSummaryJson,
  type ExplainFailure,
  type ExplainMode,
  type ExplainResult,
  type ExplainTarget,
} from "@/lib/explain";
import { llmChat, synthesizeSpeechText } from "./ai";

/** Cached audio rows kept per user; older ones are pruned so the table cannot grow without bound. */
const MAX_AUDIO_CACHE_PER_USER = 40;

type Sql = Awaited<ReturnType<typeof getSql>>;
type Source = { title: string; text: string };
type Payload = { summary: string; bullets: string[]; script: string | null; audioUrl: string | null };

/** Everything the model may see about one memory or branch, scoped to this user. */
async function loadSource(sql: Sql, userId: string, type: ExplainTarget, id: string): Promise<Source | null> {
  if (type === "memory") {
    const rows = await sql<{ title: string; body: string | null; ai_summary: string | null; transcript: string | null; tags_json: string | null; extracted_metadata_json: unknown }>`
      select title, body, ai_summary, transcript, tags_json, extracted_metadata_json
      from memories where id = ${id} and user_id = ${userId}
    `;
    const r = rows[0];
    if (!r) return null;
    let tags = "";
    try { tags = (JSON.parse(r.tags_json ?? "[]") as string[]).join(", "); } catch { /* ignore bad tag json */ }
    let dataset = "";
    try {
      const d = await sql<{ archetype: string; row_count: number; summary_metrics_json: unknown }>`
        select archetype, row_count, summary_metrics_json from digested_datasets where memory_id = ${id} and user_id = ${userId}
      `;
      if (d[0]) dataset = `Dataset (${d[0].archetype}, ${d[0].row_count} rows): ${JSON.stringify(d[0].summary_metrics_json).slice(0, 1500)}`;
    } catch { /* datasets table absent: skip */ }
    const meta = r.extracted_metadata_json ? JSON.stringify(r.extracted_metadata_json).slice(0, 800) : "";
    const text = [
      `Title: ${r.title}`,
      tags && `Tags: ${tags}`,
      r.ai_summary && `Existing overview: ${r.ai_summary}`,
      dataset,
      r.body && `Text:\n${r.body}`,
      r.transcript && r.transcript !== r.body && `Transcript:\n${r.transcript}`,
      meta && `Details: ${meta}`,
    ].filter(Boolean).join("\n").slice(0, EXPLAIN_SOURCE_CHARS);
    return { title: r.title, text };
  }
  const c = await sql<{ name: string; description: string | null }>`select name, description from concepts where id = ${id} and user_id = ${userId}`;
  if (!c[0]) return null;
  const mems = await sql<{ title: string; ai_summary: string | null; body: string | null }>`
    select m.title, m.ai_summary, substr(m.body, 1, 400) as body
    from memories m join memory_concepts mc on mc.memory_id = m.id
    where mc.concept_id = ${id} and mc.user_id = ${userId} and m.user_id = ${userId}
    order by m.importance desc, m.created_at desc
    limit 15
  `;
  const text = [
    `Branch: ${c[0].name}`,
    c[0].description && `Description: ${c[0].description}`,
    ...mems.map((m, i) => `Note ${i + 1}: ${m.title}. ${m.ai_summary ?? m.body ?? ""}`.trim()),
  ].filter(Boolean).join("\n").slice(0, EXPLAIN_SOURCE_CHARS);
  return { title: c[0].name, text };
}

async function readCache(sql: Sql, userId: string, type: string, id: string, mode: string, voice: string, hash: string): Promise<Payload | null> {
  try {
    const rows = await sql<{ content_hash: string; payload_json: string }>`
      select content_hash, payload_json from explain_cache
      where user_id = ${userId} and target_type = ${type} and target_id = ${id} and mode = ${mode} and voice = ${voice}
    `;
    if (!rows[0] || rows[0].content_hash !== hash) return null;
    return JSON.parse(rows[0].payload_json) as Payload;
  } catch {
    return null;
  }
}

async function writeCache(sql: Sql, userId: string, type: string, id: string, mode: string, voice: string, hash: string, payload: Payload) {
  try {
    const json = JSON.stringify(payload);
    await sql`
      insert into explain_cache (user_id, target_type, target_id, mode, voice, content_hash, payload_json)
      values (${userId}, ${type}, ${id}, ${mode}, ${voice}, ${hash}, ${json})
      on conflict (user_id, target_type, target_id, mode, voice)
      do update set content_hash = excluded.content_hash, payload_json = excluded.payload_json, created_at = now()
    `;
    if (mode === "audio") {
      await sql`
        delete from explain_cache where user_id = ${userId} and mode = 'audio' and (target_type, target_id, voice) not in (
          select target_type, target_id, voice from explain_cache where user_id = ${userId} and mode = 'audio'
          order by created_at desc limit ${MAX_AUDIO_CACHE_PER_USER}
        )
      `;
    }
  } catch {
    // cache is best-effort; the result is still returned
  }
}

async function buildSummary(src: Source): Promise<{ summary: string; bullets: string[] }> {
  const res = await llmChat(
    [
      { role: "system", content: 'You summarise the user\'s own notes. Use ONLY the supplied content; never invent facts. Reply with JSON only: {"summary":"2-3 sentences","bullets":["3 to 5 short key takeaways"]}.' },
      { role: "user", content: src.text },
    ],
    { maxTokens: 450, temperature: 0.2, timeoutMs: 20_000 },
  );
  const parsed = res.ok ? parseSummaryJson(res.text) : null;
  return parsed && parsed.bullets.length ? parsed : parsed ? { ...parsed, bullets: localSummary(src.text).bullets.slice(0, 3) } : localSummary(src.text);
}

async function buildScript(src: Source, style: string | null, summary: { summary: string; bullets: string[] }): Promise<string> {
  const res = await llmChat(
    [
      {
        role: "system",
        content: [
          `Write a spoken audio briefing of ${SCRIPT_MIN_WORDS} to ${SCRIPT_MAX_WORDS} words (45 to 90 seconds) about the user's notes.`,
          "Conversational, with contractions, as if talking to a friend. Plain sentences only: no markdown, no bullets, no lists, no headings.",
          'Never say "node", "mesh", "graph" or "memory graph". Use ONLY the supplied content.',
          style ? `Match this speaking style: ${style}` : "",
        ].filter(Boolean).join("\n"),
      },
      { role: "user", content: src.text },
    ],
    { maxTokens: 450, temperature: 0.5, timeoutMs: 25_000 },
  );
  const text = res.ok ? fitScript(res.text) : "";
  return text || localScript(src.title, summary.summary, summary.bullets);
}

export async function explainCore(
  sql: Sql,
  userId: string,
  input: { targetType: ExplainTarget; targetId: string; mode: ExplainMode; voice?: "male" | "female" },
): Promise<ExplainResult | ExplainFailure> {
  const src = await loadSource(sql, userId, input.targetType, input.targetId);
  if (!src || !src.text.trim()) return { ok: false, error: "Nothing to explain yet." };
  const hash = contentHash(src.text);

  let summary = await readCache(sql, userId, input.targetType, input.targetId, "summary", "", hash);
  const summaryCached = Boolean(summary);
  if (!summary) {
    const s = await buildSummary(src);
    summary = { ...s, script: null, audioUrl: null };
    await writeCache(sql, userId, input.targetType, input.targetId, "summary", "", hash, summary);
    if (input.targetType === "memory" && s.summary) {
      await sql`update memories set ai_summary = ${s.summary.slice(0, 600)} where id = ${input.targetId} and user_id = ${userId} and (ai_summary is null or ai_summary = '')`;
    }
  }
  if (input.mode === "summary") return { ok: true, script: null, audioUrl: null, summary: summary.summary, bullets: summary.bullets, cached: summaryCached };

  let voice = input.voice;
  let style: string | null = null;
  const st = await sql<{ voice_choice: string | null; voice_style_profile: string | null }>`select voice_choice, voice_style_profile from user_settings where user_id = ${userId}`;
  if (!voice) voice = st[0]?.voice_choice === "male" ? "male" : "female";
  style = st[0]?.voice_style_profile ?? null;

  const cached = await readCache(sql, userId, input.targetType, input.targetId, "audio", voice, hash);
  if (cached) return { ok: true, script: cached.script, audioUrl: cached.audioUrl, summary: summary.summary, bullets: summary.bullets, cached: true };

  const script = await buildScript(src, style, summary);
  const speech = await synthesizeSpeechText(script, voice);
  const audioUrl = speech.ok ? speech.dataUrl : null;
  // A script without audio is cached too (no key / TTS down), so native fallback is instant; audio is retried after the content changes or the cache is pruned.
  if (audioUrl) await writeCache(sql, userId, input.targetType, input.targetId, "audio", voice, hash, { summary: summary.summary, bullets: summary.bullets, script, audioUrl });
  return { ok: true, script, audioUrl, summary: summary.summary, bullets: summary.bullets, cached: false };
}

export const explainItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((d: { targetType: ExplainTarget; targetId: string; mode: ExplainMode; voice?: "male" | "female" }) => ({
    targetType: d?.targetType === "branch" ? ("branch" as const) : ("memory" as const),
    targetId: String(d?.targetId ?? "").slice(0, 80),
    mode: d?.mode === "audio" ? ("audio" as const) : ("summary" as const),
    voice: d?.voice === "male" ? ("male" as const) : d?.voice === "female" ? ("female" as const) : undefined,
  }))
  .handler(async ({ data, context }): Promise<ExplainResult | ExplainFailure> => {
    if (!data.targetId) return { ok: false, error: "Nothing to explain." };
    try {
      const sql = await getSql();
      return await explainCore(sql, context.userId, data);
    } catch {
      return { ok: false, error: "Explain is unavailable right now. Try again." };
    }
  });
