import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthGate } from "@/components/require-auth";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";

export const Route = createFileRoute("/login")({ component: Login });

/**
 * Live-preview iframes block the session cookie, so Better Auth also returns
 * the session on `set-auth-token`. Store it where `@/lib/auth/client` already
 * reads the popup bearer from — that is what keeps you signed in after email.
 */
const PREVIEW_BEARER_KEY = "grok-auth.bearer-token";

function persistPreviewBearer(response: Response) {
  const token = response.headers.get("set-auth-token");
  if (!token) return;
  try {
    window.sessionStorage.setItem(PREVIEW_BEARER_KEY, token);
  } catch {
    /* storage unavailable */
  }
}

function Login() {
  const { user, waiting } = useAuthGate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"email" | "oauth" | null>(null);

  if (!waiting && user) {
    return <Navigate to="/" />;
  }

  async function onEmail(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy("email");
    try {
      const fetchOptions = {
        onSuccess(ctx: { response: Response }) {
          persistPreviewBearer(ctx.response);
        },
      };
      if (mode === "up") {
        const { error: err } = await authClient.signUp.email({
          email,
          password,
          name: name || email.split("@")[0],
          fetchOptions,
        });
        if (err) throw new Error(err.message ?? "Could not create account");
      } else {
        const { error: err } = await authClient.signIn.email({
          email,
          password,
          fetchOptions,
        });
        if (err) throw new Error(err.message ?? "Could not sign in");
      }
      await authClient.getSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(null);
    }
  }

  async function onProvider(providerId: string) {
    setError(null);
    setBusy("oauth");
    try {
      await signIn(providerId, { callbackURL: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mesh-field relative grid min-h-dvh place-items-center px-4 py-10">
      <div className="dot-grid pointer-events-none absolute inset-0" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="relative mb-4 flex size-16 items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-highlight/30 animate-pulse-ring" />
            <span className="relative size-5 rounded-full bg-highlight shadow-[0_0_24px_var(--color-highlight)]" />
          </span>
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-primary">MindMesh</p>
          <h1 className="mt-2 font-display text-4xl font-medium tracking-tight">Your second brain, alive</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Capture a thought once. Watch it find every other thought it belongs to.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card/80 p-5 shadow-soft backdrop-blur-md">
          {waiting ? (
            <div className="h-24 animate-pulse rounded-lg bg-muted" />
          ) : authEnabled ? (
            <div className="space-y-2">
              {GROK_PROVIDERS.map((p) => (
                <Button
                  key={p.providerId}
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={busy !== null}
                  onClick={() => void onProvider(p.providerId)}
                >
                  {busy === "oauth" ? "Connecting…" : `Continue with ${p.label}`}
                </Button>
              ))}
              <div className="my-4 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">or email</span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <form onSubmit={onEmail} className="space-y-2">
                {mode === "up" ? (
                  <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                ) : null}
                <Input
                  placeholder="Email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
                <Input
                  placeholder="Password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "up" ? "new-password" : "current-password"}
                />
                {error ? <p className="text-xs text-problem">{error}</p> : null}
                <Button type="submit" className="w-full" disabled={busy !== null}>
                  {busy === "email" ? "Working…" : mode === "up" ? "Create account" : "Sign in"}
                </Button>
              </form>
              <button
                type="button"
                className="w-full pt-2 text-center text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setMode(mode === "up" ? "in" : "up");
                  setError(null);
                }}
              >
                {mode === "up" ? "Already have an account? Sign in" : "Need an account? Create one"}
              </button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sign-in is disabled.</p>
          )}
        </div>
      </div>
    </main>
  );
}
