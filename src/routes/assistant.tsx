import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { askAssistant, listAssistant } from "@/lib/server/assistant";

export const Route = createFileRoute("/assistant")({ component: AssistantRoute });

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

  function send(text: string) {
    const t = text.trim();
    if (!t || ask.isPending) return;
    ask.mutate({ data: { prompt: t } });
  }

  return (
    <AppShell>
      <div className="mx-auto flex max-w-2xl flex-col">
        <PageHeader
          kicker="Companion"
          title="Ask the mesh"
          description="A private assistant that only knows your memories — the lessons, the loops, and the things you keep rediscovering."
        />
        <div className="flex min-h-[48vh] flex-col rounded-2xl border border-border bg-card/70">
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {!q.data?.length && !ask.isPending ? (
              <div className="grid gap-2">
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
            className="border-t border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              send(prompt);
            }}
          >
            <Textarea
              className="min-h-20"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask anything about your memories…"
            />
            <Button type="submit" className="mt-2 w-full" disabled={ask.isPending}>
              Send
            </Button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
