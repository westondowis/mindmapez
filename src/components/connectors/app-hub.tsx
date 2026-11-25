import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { appInitials, FEATURED_APPS, mergeFeatured, otherApps, type FeaturedState } from "@/lib/featured-apps";
import { connectApp, decidePendingAction, disconnectApp, listApps, listPendingActions } from "@/lib/server/apps";

const HUB_APPS = ["hub-apps"] as const;

function useHubApps() {
  return useQuery({ queryKey: HUB_APPS, queryFn: () => listApps(), staleTime: 60_000 });
}

/** Connect Link + disconnect, shared by the featured cards and the full list. */
function useAppActions(onOpened?: (slug: string) => void) {
  const qc = useQueryClient();
  const connect = useMutation({
    mutationFn: (app: string) => connectApp({ data: { app, callbackUrl: window.location.href } }),
    onSuccess: (res, app) => {
      if (!res.ok) return void toast.error(res.error);
      if (!res.redirectUrl) {
        toast.message("Already connected.");
        return void qc.invalidateQueries({ queryKey: HUB_APPS });
      }
      onOpened?.(app);
      // Popup blocked (common on iOS after an async call): continue in this tab; Composio returns here.
      if (!window.open(res.redirectUrl, "_blank", "noopener")) window.location.assign(res.redirectUrl);
    },
    onError: () => toast.error("Couldn't start the connection. Try again."),
  });
  const disconnect = useMutation({
    mutationFn: (accountId: string) => disconnectApp({ data: { accountId } }),
    onSuccess: (res) => {
      if (!res.ok) toast.error(res.error);
      else toast.success("Disconnected");
    },
    onError: () => toast.error("Couldn't disconnect. Try again."),
    onSettled: () => void qc.invalidateQueries({ queryKey: HUB_APPS }),
  });
  return { connect, disconnect };
}

function AppLogo({ name, logo, size = "md" }: { name: string; logo: string | null; size?: "md" | "lg" }) {
  const [broken, setBroken] = useState(false);
  const box = size === "lg" ? "h-10 w-10 text-sm" : "h-7 w-7 text-[11px]";
  if (logo && !broken) {
    return <img src={logo} alt="" loading="lazy" onError={() => setBroken(true)} className={`${box} shrink-0 rounded-md bg-white/90 object-contain p-1`} />;
  }
  return (
    <span aria-hidden className={`${box} flex shrink-0 items-center justify-center rounded-md bg-primary/15 font-semibold text-primary`}>
      {appInitials(name)}
    </span>
  );
}

const STATE_LABEL: Record<FeaturedState, string> = {
  connected: "Connected",
  pending: "Finish signing in",
  attention: "Needs reconnecting",
  available: "Not connected",
  unavailable: "Unavailable right now",
};

/** "Connect your apps": big cards for Drive, OneDrive, Gmail, Outlook, Calendar, Notion and Slack. */
export function FeaturedApps() {
  const qc = useQueryClient();
  const apps = useHubApps();
  const [opening, setOpening] = useState<Set<string>>(() => new Set());
  const { connect, disconnect } = useAppActions((slug) => setOpening((prev) => new Set(prev).add(slug)));

  // Coming back from the Connect Link tab: refresh so the card flips to Connected.
  useEffect(() => {
    if (!opening.size) return;
    const onFocus = () => void qc.invalidateQueries({ queryKey: HUB_APPS });
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [opening, qc]);

  const data = apps.data;
  const cards = useMemo(
    () => (data?.configured ? mergeFeatured(data.apps, data.connections, opening) : []),
    [data, opening],
  );
  // Once the server reports connected, stop treating the app as "opening".
  useEffect(() => {
    const done = cards.filter((c) => c.state === "connected" && opening.has(c.slug));
    if (done.length) setOpening((prev) => new Set([...prev].filter((s) => !done.some((d) => d.slug === s))));
  }, [cards, opening]);

  return (
    <section className="rounded-xl border border-border bg-card p-5" data-testid="featured-apps" aria-labelledby="featured-apps-title">
      <h2 id="featured-apps-title" className="font-display text-xl">
        Connect your apps
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Sign in once through Composio's secure Connect Link. MindMeld never sees your passwords.
      </p>
      {apps.isLoading ? (
        <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {FEATURED_APPS.map((f) => (
            <li key={f.slug} className="h-[76px] animate-pulse rounded-lg bg-muted" />
          ))}
        </ul>
      ) : apps.isError ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <p className="text-destructive">Couldn't load your apps.</p>
          <Button variant="outline" className="min-h-11" onClick={() => void apps.refetch()}>
            Try again
          </Button>
        </div>
      ) : !data?.configured ? (
        <p className="mt-3 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground" data-testid="featured-not-set-up">
          App connections aren't available yet: Composio isn't set up on this server. Add COMPOSIO_API_KEY to the
          server environment to connect Google Drive, OneDrive, Gmail, Outlook and more.
        </p>
      ) : "error" in data && data.error ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <p className="text-destructive">{data.error}</p>
          <Button variant="outline" className="min-h-11" onClick={() => void apps.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {cards.map((c) => (
            <li
              key={c.slug}
              data-testid={`featured-${c.slug}`}
              data-state={c.state}
              className={`flex min-w-0 items-center gap-3 rounded-lg border bg-background/60 p-3 ${c.state === "connected" ? "border-primary/40" : "border-border"} ${c.state === "unavailable" ? "opacity-60" : ""}`}
            >
              <AppLogo name={c.name} logo={c.logo} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.name}</p>
                <p className={`truncate text-xs ${c.state === "connected" ? "text-primary" : c.state === "attention" ? "text-amber-500" : "text-muted-foreground"}`}>
                  {c.state === "available" ? c.blurb : STATE_LABEL[c.state]}
                </p>
              </div>
              {c.state === "connected" && c.accountId ? (
                <Button
                  variant="ghost"
                  className="min-h-11 shrink-0"
                  disabled={disconnect.isPending}
                  aria-label={`Disconnect ${c.name}`}
                  onClick={() => disconnect.mutate(c.accountId!)}
                >
                  Disconnect
                </Button>
              ) : c.state === "pending" ? (
                <Button
                  variant="outline"
                  className="min-h-11 shrink-0"
                  aria-label={`Check ${c.name} connection`}
                  onClick={() => void qc.invalidateQueries({ queryKey: HUB_APPS })}
                >
                  {apps.isFetching ? "Checking…" : "Check"}
                </Button>
              ) : c.state === "unavailable" ? (
                <Button variant="outline" className="min-h-11 shrink-0" disabled aria-label={`${c.name} unavailable`}>
                  Connect
                </Button>
              ) : (
                <Button
                  className="min-h-11 shrink-0"
                  disabled={connect.isPending && connect.variables === c.slug}
                  aria-label={`Connect ${c.name}`}
                  onClick={() => connect.mutate(c.slug)}
                >
                  {connect.isPending && connect.variables === c.slug ? "Opening…" : c.state === "attention" ? "Reconnect" : "Connect"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Apps (via Composio) plus the approval queue for connector-proposed actions. */
export function AppHub() {
  const qc = useQueryClient();
  const apps = useHubApps();
  const actions = useQuery({ queryKey: ["hub-actions"], queryFn: () => listPendingActions(), refetchInterval: 15_000 });
  const [filter, setFilter] = useState("");

  const { connect, disconnect } = useAppActions();
  const decide = useMutation({
    mutationFn: (v: { id: string; approve: boolean }) => decidePendingAction({ data: v }),
    onSuccess: (res) => {
      if (!res.ok) toast.error(res.error);
      else if (res.status === "failed") toast.error(res.error ?? "The action failed.");
      void qc.invalidateQueries({ queryKey: ["hub-actions"] });
      void qc.invalidateQueries({ queryKey: ["connector-audit"] });
    },
  });

  const connected = useMemo(
    () => new Map((apps.data?.connections ?? []).filter((c) => c.active).map((c) => [c.app, c.accountId])),
    [apps.data],
  );
  // Featured apps have their own cards at the top of the page, so the catalog lists everything else.
  const all = otherApps(apps.data?.apps ?? []);
  const list = otherApps(apps.data?.apps ?? [], filter);
  const pending = (actions.data ?? []).filter((a) => a.status === "pending");
  const recent = (actions.data ?? []).filter((a) => a.status !== "pending").slice(0, 10);

  return (
    <section className="mt-8 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Apps &amp; actions</h2>
        <p className="text-sm text-muted-foreground">
          Connect apps through Composio, then allow them on a connector scope with Act. Connectors can only propose
          actions; nothing runs until you approve it here.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card/70 p-4">
        <h3 className="text-sm font-medium">Waiting for approval</h3>
        {!pending.length ? (
          <p className="mt-2 text-sm text-muted-foreground">Nothing waiting.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {pending.map((a) => (
              <li key={a.id} className="rounded-lg border border-border bg-background/60 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{a.connectorName ?? "Connector"}</Badge>
                  <span className="font-medium">{a.kind === "app" ? `${a.app} · ${a.action}` : `${a.browserAction} on ${a.targetDomain}`}</span>
                </div>
                <p className="mt-1">{a.summary}</p>
                {a.targetUrl ? <p className="mt-1 break-all text-xs text-muted-foreground">{a.targetUrl}</p> : null}
                <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 text-xs">{a.arguments}</pre>
                <p className="mt-1 text-xs text-amber-600">Written by an agent. Check every field before approving.</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: a.id, approve: true })}>
                    Approve &amp; run
                  </Button>
                  <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ id: a.id, approve: false })}>
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {recent.length ? (
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            {recent.map((a) => (
              <li key={a.id}>
                {a.status} · {a.kind === "app" ? `${a.app} ${a.action}` : `${a.browserAction} ${a.targetDomain}`} · {a.summary}
                {a.error ? ` (${a.error})` : ""}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="rounded-xl border border-border bg-card/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium">More apps</h3>
          <Input
            className="min-h-11 w-full sm:max-w-xs"
            placeholder="Search apps"
            aria-label="Search apps"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            disabled={!apps.data?.configured || !all.length}
          />
        </div>
        {apps.isLoading ? (
          <p className="mt-2 text-sm text-muted-foreground">Loading apps…</p>
        ) : apps.isError ? (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <p className="text-destructive">Couldn't load apps.</p>
            <Button variant="outline" className="min-h-11" onClick={() => void apps.refetch()}>
              Try again
            </Button>
          </div>
        ) : !apps.data?.configured ? (
          <p className="mt-2 text-sm text-muted-foreground" data-testid="apps-not-set-up">
            Composio isn't set up on this server. Add COMPOSIO_API_KEY to the server environment to connect apps.
          </p>
        ) : "error" in apps.data && apps.data.error ? (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <p className="text-destructive">{apps.data.error}</p>
            <Button variant="outline" className="min-h-11" onClick={() => void apps.refetch()}>
              Try again
            </Button>
          </div>
        ) : !all.length ? (
          <p className="mt-2 text-sm text-muted-foreground">No other apps are available from Composio right now.</p>
        ) : !list.length ? (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground" data-testid="apps-no-results">
            <p>No apps match "{filter.trim()}".</p>
            <Button variant="ghost" className="min-h-11" onClick={() => setFilter("")}>
              Clear search
            </Button>
          </div>
        ) : (
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="apps-list">
            {list.map((app) => {
              const accountId = connected.get(app.slug);
              return (
                <li key={app.slug} className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-background/60 p-2">
                  <AppLogo name={app.name} logo={app.logo} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{app.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{app.slug}</p>
                  </div>
                  {accountId ? (
                    <Button variant="ghost" className="min-h-11" disabled={disconnect.isPending} onClick={() => disconnect.mutate(accountId)}>
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      className="min-h-11"
                      disabled={connect.isPending && connect.variables === app.slug}
                      onClick={() => connect.mutate(app.slug)}
                    >
                      {connect.isPending && connect.variables === app.slug ? "Opening…" : "Connect"}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Sites without an app use the MindMeld Bridge Chrome extension: give a connector Act with allowed websites, and
          load the extension with that connector's token.
        </p>
      </div>
    </section>
  );
}
