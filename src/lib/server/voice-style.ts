import { getSql } from "@/lib/db";
import { shouldDistillStyle } from "@/lib/voice";
import { llmChat } from "./ai";

type Sql = Awaited<ReturnType<typeof getSql>>;

/** Add one voice turn to the account counter and return the new total (0 if the account has no settings row). */
export async function bumpVoiceTurn(sql: Sql, userId: string): Promise<number> {
  const rows = await sql<{ voice_turn_count: number }>`
    update user_settings set voice_turn_count = voice_turn_count + 1
    where user_id = ${userId}
    returning voice_turn_count
  `;
  return Number(rows[0]?.voice_turn_count ?? 0);
}

/** Rewrite voice_style_profile (~50 words) from the user's recent questions and voice notes. Never throws. */
export async function distillStyleProfile(userId: string): Promise<void> {
  try {
    const sql = await getSql();
    const said = await sql<{ content: string }>`
      select content from assistant_messages
      where user_id = ${userId} and role = 'user'
      order by created_at desc limit 20
    `;
    const notes = await sql<{ body: string }>`
      select body from memories
      where user_id = ${userId} and memory_type = 'voice'
      order by created_at desc limit 10
    `;
    const samples = [...said.map((r) => r.content), ...notes.map((r) => r.body)]
      .map((t) => t.trim().slice(0, 300))
      .filter(Boolean);
    if (samples.length < 3) return;
    const prior = (
      await sql<{ voice_style_profile: string | null }>`select voice_style_profile from user_settings where user_id = ${userId}`
    )[0]?.voice_style_profile;
    const ai = await llmChat(
      [
        {
          role: "system",
          content:
            "Summarize how this person talks in about 50 words, plain text, no lists: their pacing (punchy or exploratory), vocabulary and register, humor, and how they like feedback (quick acknowledgments or back-and-forth). Write it as instructions for a voice assistant that should mirror them. Do not quote private details.",
        },
        {
          role: "user",
          content: `${prior ? `Current profile: ${prior}\n\n` : ""}Recent things they said:\n${samples.map((t) => `- ${t}`).join("\n")}`,
        },
      ],
      { maxTokens: 120, temperature: 0.3 },
    );
    const text = ai.ok ? ai.text.trim().slice(0, 600) : "";
    if (!text) return;
    await sql`update user_settings set voice_style_profile = ${text} where user_id = ${userId}`;
  } catch {
    // best effort: the old profile stays in place
  }
}

/** Count a turn and, every few turns, refresh the profile in the background without delaying the reply. */
export async function noteVoiceTurn(sql: Sql, userId: string): Promise<void> {
  const count = await bumpVoiceTurn(sql, userId);
  if (shouldDistillStyle(count)) void distillStyleProfile(userId);
}
