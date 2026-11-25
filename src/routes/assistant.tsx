import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { askAssistant, listAssistant } from "@/lib/server/assistant";
import { CONTENT_BOTTOM_PADDING } from "@/lib/bottom-chrome";

export const Route = createFileRoute("/assistant")({ component: AssistantRoute });

/**
 * The page fills exactly the space AppShell's <main> leaves: 100dvh minus its top padding (py-5)
 * and its bottom padding (bottom-nav height + safe-area inset + gap). Header and input are
 * shrink-0, the history is the only scroller, so the input always sits just above the nav.
 */
const PAGE_HEIGHT = `calc(100dvh - 1.25rem - ${CONTENT_BOTTOM_PADDING})`;

const STARTERS = [
  "What are my biggest real estate lessons?",
  "What patterns exist in my golf memories?",
  "What caused my best sales results?",
  "What ideas do I repeatedly return to?",
  "What lessons have I forgotten recently?",
  "What themes are growing strongest in my life?",
];

function AssistantRoute() {
  return (
    <RequireAuth>
      <AssistantPage />
    </RequireAuth>
  );
}

function AssistantPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["assistant"], queryFn: () => listAssistant() });
  const [prompt, setPrompt] = useState("");
  const ask = useMutation({
    mutationFn: askAssistant,
    onSuccess: () => {
      setPrompt("");
      void qc.invalidateQueries({ queryKey: ["assistant"] });
    },
  });

  const history = useRef<HTMLDivElement>(null);
  const count = q.data?.length ?? 0;
  useEffect(() => {
    const el = history.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count, ask.isPending]);

  function send(text: string) {
    const t = text.trim();
    if (!t || ask.isPending) return;
    ask.mutate({ data: { prompt: t } });
  }

  return (
    <AppShell>
      <div className="mx-auto flex max-w-2xl flex-col" style={{ height: PAGE_HEIGHT }}>
        <div className="shrink-0">
          <PageHeader
            kicker="Companion"
            title="Ask the mesh"
            description="A private assistant that only knows your memories — the lessons, the loops, and the things you keep rediscovering."
          />
        </div>
        <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-border bg-card/70">
          <div ref={history} data-testid="assistant-history" className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
            {!q.data?.length && !ask.isPending ? (
              <div className="grid gap-2">
                <h2 className="font-display text-lg text-foreground">Ask the brain a question</h2>
                <p className="mb-1 text-sm text-muted-foreground">Type your own question in the box below, or tap a starter to try one.</p>
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-lg border border-border bg-background px-3 py-2.5 text-left text-sm text-muted-foreground hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : (
              q.data?.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[92%] rounded-xl px-3 py-2.5 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "ml-auto bg-secondary text-secondary-foreground"
                      : "bg-background text-foreground"
                  }`}
                >
                  {m.content}
                </div>
              ))
            )}
            {ask.isPending ? (
              <div className="rounded-xl bg-background px-3 py-2.5 text-sm text-muted-foreground">Listening to the mesh…</div>
            ) : null}
          </div>
          <form
            data-testid="assistant-input"
            className="shrink-0 border-t border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              send(prompt);
            }}
          >
            <label htmlFor="assistant-prompt" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Ask the brain a question — answers come only from your memories
            </label>
            <Textarea
              id="assistant-prompt"
              className="min-h-16"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. What did I learn from my last deal?"
            />
            <Button type="submit" className="mt-2 w-full" disabled={ask.isPending}>
              {ask.isPending ? "Thinking…" : "Ask"}
            </Button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
