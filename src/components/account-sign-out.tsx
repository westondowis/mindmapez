import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { flushAccount } from "@/lib/account-persist";
import { authEnabled, signOut } from "@/lib/auth/client";
import { hasGateSessionMarker } from "@/lib/auth/gate-session-marker";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";
import { createMemory } from "@/lib/server/memories";
import { clearAccountDraft, getAccountDraft } from "@/lib/server/persist";
import type { MemoryType } from "@/lib/types";

const subscribeToNothing = () => () => {};
const noGateOnServer = () => false;

export function AccountSignOut() {
  const user = useCurrentUser();
  const [busy, setBusy] = useState(false);
  const gateSession = useSyncExternalStore(subscribeToNothing, hasGateSessionMarker, noGateOnServer);
  if (!user || !authEnabled || gateSession) return null;

  return (
    <Button
      variant="outline"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void (async () => {
          try {
            await flushAccount("logout");
            const draft = await getAccountDraft();
            const c = draft.capture;
            if (
              c &&
              (c.title.trim() || c.body.trim() || c.transcript.trim() || c.mediaUrl || c.sourceUrl.trim())
            ) {
              const text = c.body.trim() || c.transcript.trim();
              await createMemory({
                data: {
                  title: c.title.trim() || undefined,
                  body: text || c.title || c.mediaName || c.sourceUrl || "Captured memory",
                  memoryType: (c.mode === "thought" ? "thought" : c.mode || "text") as MemoryType,
                  transcript: c.transcript.trim() || null,
                  mediaUrl: c.mediaUrl,
                  mediaMime: c.mediaMime,
                  mediaName: c.mediaName,
                  emoji: c.emoji,
                  color: c.color,
                  tags: c.tags,
                  sourceUrl: c.sourceUrl || null,
                  sourceKind: c.sourceKind ?? null,
                },
              });
              await clearAccountDraft();
            }
            toast.success("Mesh and transcripts saved to your account");
            await signOut("/login");
          } catch {
            setBusy(false);
            toast.error("Couldn’t sign out. Your mesh is still saved — try again.");
          }
        })();
      }}
    >
      {busy ? "Saving & signing out…" : "Sign out"}
    </Button>
  );
}
