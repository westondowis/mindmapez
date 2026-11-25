import { createFileRoute } from "@tanstack/react-router";
import { BRAIN_BUILD } from "@/components/brain/brain-material";

/**
 * GET /api/version -> { build, commit } from the running server, never cached, so after a publish
 * `curl https://<host>/api/version` shows which build is live (and the 404 means a pre-v5.49 build).
 * `commit` is the deploy's git SHA when the platform provides one, otherwise null.
 */
export const Route = createFileRoute("/api/version")({
  server: {
    handlers: {
      GET: () =>
        new Response(
          JSON.stringify({ build: BRAIN_BUILD, commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || null }),
          { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } },
        ),
    },
  },
});
