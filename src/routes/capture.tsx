import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { CapturePanel } from "@/components/capture-panel";
import { PageHeader } from "@/components/page-header";
import { RequireAuth } from "@/components/require-auth";

type CaptureSearch = {
  text?: string;
  url?: string;
  title?: string;
};

export const Route = createFileRoute("/capture")({
  component: CaptureRoute,
  validateSearch: (search: Record<string, unknown>): CaptureSearch => ({
    text: typeof search.text === "string" ? search.text : undefined,
    url: typeof search.url === "string" ? search.url : undefined,
    title: typeof search.title === "string" ? search.title : undefined,
  }),
});

function CaptureRoute() {
  return (
    <RequireAuth>
      <CapturePage />
    </RequireAuth>
  );
}

function CapturePage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <PageHeader
          kicker="Capture"
          title="Don't lose this thought"
          description="Import from Files, drop something from another app, or paste a long note. Voice, photos, links, and documents all weave into the mesh."
        />
        <CapturePanel
          seed={{ title: search.title, body: search.text, sourceUrl: search.url }}
          onCreated={(id) => navigate({ to: "/memory/$id", params: { id } })}
        />
      </div>
    </AppShell>
  );
}
