import { organizeLocal, parseOrganizeJson } from "@/lib/organize";
import type { OrganizeResult } from "@/lib/types";

export type LlmConfig = { apiKey: string; baseUrl: string; model: string };

/**
 * Provider-agnostic chat config (any OpenAI-compatible endpoint).
 * LLM_API_KEY selects a provider (default OpenAI); otherwise XAI_API_KEY keeps the xAI default.
 * LLM_BASE_URL and LLM_MODEL override either. Returns null when no key is configured.
 */
export function llmConfig(env: Record<string, string | undefined> = process.env): LlmConfig | null {
  const llmKey = env.LLM_API_KEY?.trim();
  const apiKey = llmKey || env.XAI_API_KEY?.trim();
  if (!apiKey) return null;
  const baseUrl = (env.LLM_BASE_URL?.trim() || (llmKey ? "https://api.openai.com/v1" : "https://api.x.ai/v1")).replace(/\/+$/, "");
  const model = env.LLM_MODEL?.trim() || (llmKey ? "gpt-4o-mini" : "grok-4.5");
  return { apiKey, baseUrl, model };
}

export async function llmChat(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const cfg = llmConfig();
  if (!cfg) return { ok: false, error: "AI is not available in this environment" };
  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        max_tokens: opts.maxTokens ?? 700,
        temperature: opts.temperature ?? 0.4,
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) {
      return { ok: false, error: `LLM API error ${res.status}` };
    }
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return { ok: true, text: body.choices?.[0]?.message?.content ?? "" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "AI request failed" };
  }
}

/** @deprecated Use llmChat. Kept so older imports keep working. */
export const grokChat = llmChat;

export async function organizeMemory(
  raw: string,
  existingTitle?: string,
): Promise<OrganizeResult> {
  const fallback = organizeLocal(raw, existingTitle);
  const result = await llmChat(
    [
      {
        role: "system",
        content:
          "You organize a personal memory into structured JSON for a second-brain graph. Return ONLY JSON with keys: title, summary, tags (string[]), emotion (one of Excited, Inspired, Confident, Frustrated, Happy, Concerned, Motivated, Curious, Grateful, Calm, Proud, Anxious), importance (1-5), impact (low|medium|high|life_changing), kind (breakthrough|learning|success|problem|idea|archived), concepts (array of {name, kind} where kind is category|subcategory|topic|theme|person|place|emotion|lesson|pattern). Prefer durable concept names like Golf, Real Estate, Confidence. Keep title under 80 chars. Summary 1-2 sentences.",
      },
      { role: "user", content: raw.length > 12000 ? `${raw.slice(0, 12000)}\n\n[Imported document continues; total ${raw.length.toLocaleString()} characters.]` : raw },
    ],
    { maxTokens: 700, temperature: 0.2 },
  );
  if (!result.ok) return fallback;
  return parseOrganizeJson(result.text, fallback);
}

export async function suggestTags(raw: string, existing: string[] = []): Promise<string[]> {
  const fallback = organizeLocal(raw).tags;
  const result = await llmChat(
    [
      {
        role: "system",
        content:
          'You tag a personal memory for a second-brain graph. Return ONLY JSON {"tags": string[]} with 4-10 short tags. Prefer durable topics (Golf, Seller Financing, Confidence) over filler words. Mix specific nouns with themes. Do not repeat near-duplicates.',
      },
      {
        role: "user",
        content: `${existing.length ? `Existing tags to keep if still relevant: ${existing.join(", ")}\n\n` : ""}${raw.slice(0, 3500)}`,
      },
    ],
    { maxTokens: 300, temperature: 0.2 },
  );
  if (!result.ok) return fallback;
  try {
    const match = result.text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match?.[0] ?? "{}") as { tags?: unknown };
    if (!Array.isArray(parsed.tags)) return fallback;
    const tags = parsed.tags.map(String);
    return tags.length ? tags : fallback;
  } catch {
    return fallback;
  }
}

export async function transcribeAudio(dataUrl: string): Promise<string | null> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return null;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const header = dataUrl.slice(0, comma);
  const b64 = dataUrl.slice(comma + 1);
  const mime = /data:([^;]+)/.exec(header)?.[1] ?? "audio/webm";
  const bytes = Buffer.from(b64, "base64");
  if (bytes.length > 6_000_000) return null;

  const form = new FormData();
  form.append("model", "whisper-1");
  form.append(
    "file",
    new Blob([bytes], { type: mime }),
    mime.includes("mp4") ? "audio.mp4" : "audio.webm",
  );

  try {
    const res = await fetch("https://api.x.ai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { text?: string };
    return json.text?.trim() || null;
  } catch {
    return null;
  }
}

