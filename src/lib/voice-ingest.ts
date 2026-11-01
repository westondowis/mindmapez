import { COMPLETION_CUE, CANCEL_CUE, extractKeywords, type ReviewAction } from "./voice.ts";

export type ReviewPayload = {
  raw: string;
  keyPoints: string[];
  keywords: string[];
  action: ReviewAction;
  conceptId: string | null;
  conceptName: string | null;
  suggestedName: string | null;
};

export type IngestPlan =
  | {
      ok: true;
      raw: string;
      keyPoints: string[];
      tags: string[];
      action: ReviewAction;
      newName: string;
      suggested: { id: string; name: string } | null;
    }
  | { ok: false; error?: string };

export type TurnDeps = {
  ingest: (raw: string) => Promise<IngestPlan>;
  queue: (payload: ReviewPayload) => Promise<{ ok: boolean; error?: string }>;
  ask: (prompt: string) => Promise<{ ok: boolean; content?: string }>;
  /** Telemetry; failures are ignored. */
  record?: (bargeIn: boolean, keywords: string[]) => Promise<unknown>;
  /** True once if the user interrupted the previous reply (resets itself). */
  consumeBargeIn?: () => boolean;
  onQueued?: () => void;
};

/**
 * Turns one spoken transcript into the reply to speak. Notes accumulate in a draft;
 * a completion cue (or closing the panel) sends the draft to the review queue, never
 * straight to the graph. Raw text is kept as a fallback so nothing recorded is lost.
 */
export function createTurnProcessor(deps: TurnDeps) {
  let draft: string[] = [];

  async function flush(): Promise<string> {
    const raw = draft.join(" ").trim();
    draft = [];
    if (!raw) return "There is nothing to store yet. Tell me what to remember.";
    let payload: ReviewPayload = {
      raw,
      keyPoints: [raw.slice(0, 200)],
      keywords: extractKeywords(raw),
      action: "memory",
      conceptId: null,
      conceptName: null,
      suggestedName: null,
    };
    try {
      const plan = await deps.ingest(raw);
      if (plan.ok) {
        payload = {
          raw: plan.raw,
          keyPoints: plan.keyPoints,
          keywords: plan.tags,
          action: plan.action,
          conceptId: plan.suggested?.id ?? null,
          conceptName: plan.suggested?.name ?? null,
          suggestedName: plan.action === "memory" ? (plan.suggested?.name ?? null) : plan.newName,
        };
      }
    } catch {
      // keep the raw-text payload
    }
    const q = await deps.queue(payload);
    if (!q.ok) {
      draft = [raw];
      throw new Error(q.error ?? "Could not queue that note");
    }
    deps.onQueued?.();
    return payload.conceptName ? `Stored for review under ${payload.conceptName}.` : "Stored for review as a new memory.";
  }

  async function process(text: string): Promise<string> {
    const clean = text.trim();
    if (!clean) throw new Error("Empty transcript");
    const bargeIn = deps.consumeBargeIn?.() ?? false;
    if (COMPLETION_CUE.test(clean)) return flush();
    if (CANCEL_CUE.test(clean)) {
      draft = [];
      return "Okay, I discarded that.";
    }
    const remember = clean.match(/^(remember|save|add a memory|note that|i want to remember)\s+(.+)/i);
    const note = remember?.[2] ?? (clean.split(/\s+/).length > 18 ? clean : null);
    if (note) {
      draft.push(note);
      void deps.record?.(bargeIn, extractKeywords(note))?.catch?.(() => {});
      return "Got it. Keep going, or say I'm done to store it.";
    }
    void deps.record?.(bargeIn, extractKeywords(clean))?.catch?.(() => {});
    const res = await deps.ask(clean);
    return res.ok && res.content ? res.content : "I could not reach the brain just now.";
  }

  return { process, flush, hasDraft: () => draft.length > 0 };
}
