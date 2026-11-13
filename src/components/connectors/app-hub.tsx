import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { connectApp, decidePendingAction, disconnectApp, listApps, listPendingActions } from "@/lib/server/apps";

/** Apps (via Composio) plus the approval queue for connector-proposed actions. */
export function AppHub() {
  const qc = useQueryClient();
  const apps = useQuery({ queryKey: ["hub-apps"], queryFn: () => listApps(), staleTime: 60_000 });
  const actions = useQuery({ queryKey: ["hub-actions"], queryFn: () => listPendingActions(), refetchInterval: 15_000 });
  const [filter, setFilter] = useState("");

  const connect = useMutation({
    mutationFn: (app: string) => connectApp({ data: { app, callbackUrl: window.location.href } }),
    onSuccess: (res) => {
      if (!res.ok || !res.redirectUrl) return toast.error(res.ok ? "Already connected." : res.error);
      window.open(res.redirectUrl, "_blank", "noopener");
    },
    onError: () => toast.error("Couldn't start the connection."),
  });
  const disconnect = useMutation({
    mutationFn: (accountId: string) => disconnectApp({ data: { accountId } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["hub-apps"] }),
  });
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
  const list = (apps.data?.apps ?? []).filter(
    (a) => !filter || a.name.toLowerCase().includes(filter.toLowerCase()) || a.slug.includes(filter.toLowerCase()),
  );
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
          <h3 className="text-sm font-medium">Apps</h3>
          <Input className="max-w-xs" placeholder="Filter apps" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        {apps.isLoading ? (
          <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
        ) : !apps.data?.configured ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Composio isn't set up on this server. Add COMPOSIO_API_KEY to the server environment to connect apps.
          </p>
        ) : "error" in apps.data && apps.data.error ? (
          <p className="mt-2 text-sm text-destructive">{apps.data.error}</p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((app) => {
              const accountId = connected.get(app.slug);
              return (
                <li key={app.slug} className="flex items-center gap-3 rounded-lg border border-border bg-background/60 p-2">
                  {app.logo ? <img src={app.logo} alt="" className="h-6 w-6 rounded" /> : null}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{app.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{app.slug}</p>
                  </div>
                  {accountId ? (
                    <Button size="sm" variant="ghost" onClick={() => disconnect.mutate(accountId)}>
                      Disconnect
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled={connect.isPending} onClick={() => connect.mutate(app.slug)}>
                      Connect
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
