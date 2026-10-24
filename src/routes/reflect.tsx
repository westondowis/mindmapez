import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { createMemory } from "@/lib/server/memories";
import { REFLECTION_PROMPTS } from "@/lib/types";

export const Route = createFileRoute("/reflect")({ component: ReflectRoute });

function ReflectRoute() {
  return (
    <RequireAuth>
      <ReflectPage />
    </RequireAuth>
  );
}

function ReflectPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const prompt = useMemo(() => {
    const day = Math.floor(Date.now() / 86_400_000);
    return REFLECTION_PROMPTS[day % REFLECTION_PROMPTS.length] ?? REFLECTION_PROMPTS[0];
  }, []);
  const [choice, setChoice] = useState(prompt);
  const [body, setBody] = useState("");
  const save = useMutation({
    mutationFn: createMemory,
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ["graph"] });
      if (res.ok) navigate({ to: "/memory/$id", params: { id: res.memory.id } });
    },
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-xl">
        <PageHeader
          kicker="Daily reflection"
          title="A question for today"
          description="Your answer becomes a node. Future-you will thank you."
        />
        <div className="flex flex-wrap gap-2">
          {REFLECTION_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setChoice(p)}
              className={`rounded-full px-3 py-1.5 text-xs ${choice === p ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
            >
              {p}
            </button>
          ))}
        </div>
        <h2 className="mt-8 font-display text-2xl">{choice}</h2>
        <Textarea
          className="mt-4 min-h-40"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write it while it is still true."
        />
        <Button
          className="mt-4 w-full"
          size="lg"
          disabled={!body.trim() || save.isPending}
          onClick={() =>
            save.mutate({
              data: { title: choice, body: body.trim(), memoryType: "reflection" },
            })
          }
        >
          {save.isPending ? "Saving…" : "Save as a memory"}
        </Button>
      </div>
    </AppShell>
  );
}
