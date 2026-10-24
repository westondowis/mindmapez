import { useEffect, useState } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

/** Session fetch can stall behind the preview gate. Don't block the UI forever. */
const SESSION_WAIT_MS = 6000;

export function useAuthGate() {
  const { user, isPending } = useCurrentUserState();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!isPending) {
      setTimedOut(false);
      return;
    }
    const t = window.setTimeout(() => setTimedOut(true), SESSION_WAIT_MS);
    return () => window.clearTimeout(t);
  }, [isPending]);

  return {
    user,
    isPending,
    waiting: isPending && !timedOut,
  };
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, waiting } = useAuthGate();
  if (waiting) {
    return (
      <div className="mesh-field grid min-h-dvh place-items-center">
        <div className="flex flex-col items-center gap-3">
          <span className="relative flex size-16 items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-highlight/30 animate-pulse-ring" />
            <span className="relative size-5 rounded-full bg-highlight" />
          </span>
          <p className="font-display text-2xl tracking-tight">MindMesh AI</p>
          <p className="text-sm text-muted-foreground">Opening your mesh…</p>
        </div>
      </div>
    );
  }
  if (!user) return <RedirectToSignIn />;
  return <>{children}</>;
}
