import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { RequireAuth } from "@/components/require-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ConnectorSummary } from "@/lib/connectors/admin";
import { AppHub } from "@/components/connectors/app-hub";
import {
  normalizeFlags,
  PERMISSION_LABELS,
  PERMISSIONS,
  type AuditStatus,
  type Permission,
  type PermissionFlags,
  type ScopeKind,
} from "@/lib/connectors/types";
import {
  createConnector,
  listConnectorAudit,
  listConnectors,
  previewConnectorScope,
  revokeConnector,
  saveConnectorGrants,
  type ConnectorTreeNode,
} from "@/lib/server/connectors";
import { cn, formatRelative } from "@/lib/utils";

export const Route = createFileRoute("/connectors")({ component: ConnectorsRoute });

function ConnectorsRoute() {
  return (
    <RequireAuth>
      <ConnectorsPage />
    </RequireAuth>
  );
}

type Sector = { id: string; label: string; emoji: string };
type DraftGrant = {
  key: string;
  scopeKind: ScopeKind;
  scopeRef: string | null;
  permissions: PermissionFlags;
  allowedApps: string;
  allowedDomains: string;
};
const splitList = (v: string) => v.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
const toGrantInput = ({ scopeKind, scopeRef, permissions, allowedApps, allowedDomains }: DraftGrant) => ({
  scopeKind,
  scopeRef,
  permissions,
  allowedApps: splitList(allowedApps),
  allowedDomains: splitList(allowedDomains),
});

const NO_FLAGS: PermissionFlags = { read: false, search: false, write_review: false, write_direct: false, execute: false };
let draftSeq = 0;
const draftKey = () => `g${(draftSeq += 1)}`;

function newDraft(): DraftGrant {
  return {
    key: draftKey(),
    scopeKind: "branch",
    scopeRef: null,
    permissions: { ...NO_FLAGS, read: true, search: true },
    allowedApps: "",
    allowedDomains: "",
  };
}

/** "Frontal lobe › Work-Life › Real-Estate" for a branch id. */
function branchTrail(id: string, byId: Map<string, ConnectorTreeNode>, sectors: Sector[]) {
  const names: string[] = [];
  const seen = new Set<string>();
  let node = byId.get(id);
  let top = node;
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    names.unshift(node.name);
    top = node;
    node = node.parentId ? byId.get(node.parentId) : undefined;
  }
  const sector = sectors.find((s) => s.id === top?.sectorId);
  return [sector?.label ?? "Unsorted", ...names].join(" › ");
}

function scopeLabel(g: { scopeKind: ScopeKind; scopeRef: string | null }, byId: Map<string, ConnectorTreeNode>, sectors: Sector[]) {
  if (g.scopeKind === "root") return "Full brain";
  if (g.scopeKind === "sector") return sectors.find((s) => s.id === g.scopeRef)?.label ?? "Main branch";
  if (!g.scopeRef) return "Pick a branch";
  return byId.has(g.scopeRef) ? branchTrail(g.scopeRef, byId, sectors) : "Deleted branch";
}

function ConnectorsPage() {
  const qc = useQueryClient();
  const data = useQuery({ queryKey: ["connectors"], queryFn: () => listConnectors() });
  const tree = data.data?.tree ?? [];
  const sectors = data.data?.sectors ?? [];
  const byId = useMemo(() => new Map(tree.map((n) => [n.id, n])), [tree]);
  const connectors = data.data?.connectors ?? [];
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<{ name: string; token: string } | null>(null);
  // Resolved after hydration so the server and client render the same first frame.
  const [mcpUrl, setMcpUrl] = useState("/mcp");
  useEffect(() => setMcpUrl(`${window.location.origin}/mcp`), []);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["connectors"] });
    void qc.invalidateQueries({ queryKey: ["connector-audit"] });
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <PageHeader
          kicker="Security"
          title="Connectors"
          description="Give an AI agent or app access to one part of your brain. It sees the branch you pick and everything under it, nothing above or beside it."
          action={
            !creating ? (
              <Button variant="highlight" onClick={() => setCreating(true)}>
                New connector
              </Button>
            ) : null
          }
        />

        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-display text-xl">MCP endpoint</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Point any MCP client that supports a remote server with a bearer token at this URL. Send the connector's
            token as <code className="rounded bg-muted px-1">Authorization: Bearer mm_…</code>.
          </p>
          <CopyRow value={mcpUrl} label="MCP URL" />
        </section>

        {revealed ? (
          <section className="mt-4 rounded-xl border border-highlight/60 bg-card p-5" aria-live="polite">
            <h2 className="font-display text-xl">Token for {revealed.name}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Copy it now. This is the only time it's shown; MindMeld keeps just a fingerprint. If you lose it, revoke the
              connector and make a new one.
            </p>
            <CopyRow value={revealed.token} label="Connector token" secret />
            <Button className="mt-3" variant="outline" onClick={() => setRevealed(null)}>
              I've saved it
            </Button>
          </section>
        ) : null}

        {creating ? (
          <CreateConnector
            tree={tree}
            sectors={sectors}
            byId={byId}
            onCancel={() => setCreating(false)}
            onCreated={(name, token) => {
              setCreating(false);
              setRevealed({ name, token });
              refresh();
            }}
          />
        ) : null}

        <section className="mt-4">
          <h2 className="mb-2 font-display text-xl">Your connectors</h2>
          {data.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !connectors.length ? (
            <p className="rounded-xl border border-border bg-card/70 p-5 text-sm text-muted-foreground">
              No connectors yet. Create one, pick the branch it may see, then paste its token into the agent.
            </p>
          ) : (
            <div className="space-y-3">
              {connectors.map((c) => (
                <ConnectorCard key={c.id} connector={c} tree={tree} sectors={sectors} byId={byId} onChanged={refresh} />
              ))}
            </div>
          )}
        </section>

        <AppHub />
        <AuditLog connectors={connectors} />
      </div>
    </AppShell>
  );
}

function CopyRow({ value, label, secret = false }: { value: string; label: string; secret?: boolean }) {
  return (
    <div className="mt-3 flex items-center gap-2">
      <code
        className={cn(
          "min-w-0 flex-1 truncate rounded-lg border border-border bg-background px-3 py-2 text-xs",
          secret && "select-all",
        )}
        aria-label={label}
      >
        {value}
      </code>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          void navigator.clipboard
            .writeText(value)
            .then(() => toast.success(`${label} copied`))
            .catch(() => toast.error("Copy failed. Select the text and copy it."));
        }}
      >
        Copy
      </Button>
    </div>
  );
}

function CreateConnector({
  tree,
  sectors,
  byId,
  onCancel,
  onCreated,
}: {
  tree: ConnectorTreeNode[];
  sectors: Sector[];
  byId: Map<string, ConnectorTreeNode>;
  onCancel: () => void;
  onCreated: (name: string, token: string) => void;
}) {
  const [name, setName] = useState("");
  const [grants, setGrants] = useState<DraftGrant[]>([newDraft()]);
  const create = useMutation({
    mutationFn: async () => {
      const res = await createConnector({
        data: {
          displayName: name,
          grants: grants.map(toGrantInput),
        },
      });
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    onSuccess: (res) => onCreated(name.trim(), res.token),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create the connector"),
  });
  const incomplete = !name.trim() || grants.some((g) => g.scopeKind !== "root" && !g.scopeRef);

  return (
    <section className="mt-4 rounded-xl border border-border bg-card p-5">
      <h2 className="font-display text-xl">New connector</h2>
      <label className="mt-3 block text-sm">
        <span className="text-muted-foreground">Name</span>
        <Input className="mt-1" value={name} maxLength={60} placeholder="Gmail agent" onChange={(e) => setName(e.target.value)} />
      </label>
      <ScopeListEditor value={grants} onChange={setGrants} tree={tree} sectors={sectors} byId={byId} />
      <div className="mt-4 flex gap-2">
        <Button variant="highlight" disabled={incomplete || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? "Creating…" : "Create and show token"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </section>
  );
}

function ConnectorCard({
  connector,
  tree,
  sectors,
  byId,
  onChanged,
}: {
  connector: ConnectorSummary;
  tree: ConnectorTreeNode[];
  sectors: Sector[];
  byId: Map<string, ConnectorTreeNode>;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<DraftGrant[] | null>(null);
  const active = connector.status === "active";
  const save = useMutation({
    mutationFn: async (grants: DraftGrant[]) => {
      const res = await saveConnectorGrants({
        data: {
          connectorId: connector.id,
          grants: grants.map(toGrantInput),
        },
      });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Scope saved. It applies to the connector's next request.");
      setEditing(null);
      onChanged();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save the scope"),
  });
  const revoke = useMutation({
    mutationFn: async () => {
      const res = await revokeConnector({ data: { connectorId: connector.id } });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success(`${connector.displayName} revoked`);
      onChanged();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not revoke"),
  });

  return (
    <article className={cn("rounded-xl border border-border bg-card p-4", !active && "opacity-70")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-medium">
            {connector.displayName}
            <Badge tone={active ? "success" : "muted"}>{active ? "Active" : "Revoked"}</Badge>
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            <code>{connector.tokenPrefix ?? "mm_"}…</code> · created {formatRelative(connector.createdAt)}
            {connector.lastUsedAt ? ` · last used ${formatRelative(connector.lastUsedAt)}` : " · never used"}
            {connector.revokedAt ? ` · revoked ${formatRelative(connector.revokedAt)}` : ""}
          </p>
        </div>
        {active && !editing ? (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setEditing(
                  connector.grants.map((g) => ({
                    key: draftKey(),
                    scopeKind: g.scopeKind,
                    scopeRef: g.scopeRef,
                    permissions: g.permissions,
                    allowedApps: g.allowedApps.join(", "),
                    allowedDomains: g.allowedDomains.join(", "),
                  })),
                )
              }
            >
              Edit scope
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={revoke.isPending}
              onClick={() => {
                if (window.confirm(`Revoke ${connector.displayName}? Its token stops working on the next request.`)) {
                  revoke.mutate();
                }
              }}
            >
              Revoke
            </Button>
          </div>
        ) : null}
      </div>

      {editing ? (
        <>
          <ScopeListEditor value={editing} onChange={setEditing} tree={tree} sectors={sectors} byId={byId} />
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="highlight"
              disabled={save.isPending || !editing.length || editing.some((g) => g.scopeKind !== "root" && !g.scopeRef)}
              onClick={() => save.mutate(editing)}
            >
              Save scope
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </>
      ) : active ? (
        <ul className="mt-3 space-y-1.5">
          {connector.grants.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="font-medium">{scopeLabel(g, byId, sectors)}</span>
              {PERMISSIONS.filter((p) => g.permissions[p]).map((p) => (
                <Badge key={p} tone={p === "write_direct" ? "problem" : "default"}>
                  {PERMISSION_LABELS[p].label}
                </Badge>
              ))}
            </li>
          ))}
          {!connector.grants.length ? <li className="text-sm text-muted-foreground">No scope: it can't see anything.</li> : null}
        </ul>
      ) : null}
    </article>
  );
}

function ScopeListEditor({
  value,
  onChange,
  tree,
  sectors,
  byId,
}: {
  value: DraftGrant[];
  onChange: (next: DraftGrant[]) => void;
  tree: ConnectorTreeNode[];
  sectors: Sector[];
  byId: Map<string, ConnectorTreeNode>;
}) {
  const update = (key: string, patch: Partial<DraftGrant>) =>
    onChange(value.map((g) => (g.key === key ? { ...g, ...patch } : g)));
  return (
    <div className="mt-4 space-y-3">
      {value.map((g, i) => (
        <div key={g.key} className="rounded-lg border border-border bg-background/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Scope {i + 1}</p>
            {value.length > 1 ? (
              <Button size="sm" variant="ghost" onClick={() => onChange(value.filter((x) => x.key !== g.key))}>
                Remove
              </Button>
            ) : null}
          </div>
          <ScopePicker
            value={g}
            tree={tree}
            sectors={sectors}
            byId={byId}
            onPick={(scopeKind, scopeRef) => update(g.key, { scopeKind, scopeRef })}
          />
          <PermissionToggles value={g.permissions} onChange={(permissions) => update(g.key, { permissions })} />
          {g.permissions.execute ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-muted-foreground">
                Apps it may act in (Composio slugs, e.g. gmail, slack)
                <Input
                  className="mt-1"
                  value={g.allowedApps}
                  placeholder="gmail"
                  onChange={(e) => update(g.key, { allowedApps: e.target.value })}
                />
              </label>
              <label className="text-xs text-muted-foreground">
                Websites for the browser bridge (e.g. facebook.com)
                <Input
                  className="mt-1"
                  value={g.allowedDomains}
                  placeholder="facebook.com"
                  onChange={(e) => update(g.key, { allowedDomains: e.target.value })}
                />
              </label>
              <p className="text-xs text-muted-foreground sm:col-span-2">Every action waits for your approval below.</p>
            </div>
          ) : null}
          <ScopePreview scopeKind={g.scopeKind} scopeRef={g.scopeRef} />
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={() => onChange([...value, newDraft()])}>
        Add another scope
      </Button>
    </div>
  );
}

function ScopePicker({
  value,
  tree,
  sectors,
  byId,
  onPick,
}: {
  value: { scopeKind: ScopeKind; scopeRef: string | null };
  tree: ConnectorTreeNode[];
  sectors: Sector[];
  byId: Map<string, ConnectorTreeNode>;
  onPick: (kind: ScopeKind, ref: string | null) => void;
}) {
  const [open, setOpen] = useState(value.scopeKind !== "root" && !value.scopeRef);
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const children = useMemo(() => {
    const map = new Map<string, ConnectorTreeNode[]>();
    for (const n of tree) {
      const parentKey = n.parentId && byId.has(n.parentId) ? n.parentId : `sector:${n.sectorId ?? "unsorted"}`;
      const list = map.get(parentKey) ?? [];
      list.push(n);
      map.set(parentKey, list);
    }
    return map;
  }, [tree, byId]);
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const pick = (kind: ScopeKind, ref: string | null) => {
    onPick(kind, ref);
    setOpen(false);
    setFilter("");
  };
  const isPicked = (kind: ScopeKind, ref: string | null) => value.scopeKind === kind && value.scopeRef === ref;
  const row = (kind: ScopeKind, ref: string | null) =>
    cn(
      "flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-primary/10",
      isPicked(kind, ref) && "bg-primary/15 text-primary",
    );

  const renderBranches = (parentKey: string, depth: number): React.ReactNode =>
    (children.get(parentKey) ?? []).map((n) => {
      const kids = children.get(n.id)?.length ?? 0;
      const isOpen = expanded.has(n.id);
      return (
        <li key={n.id}>
          <div className="flex items-center" style={{ paddingLeft: depth * 14 }}>
            <button
              type="button"
              className="size-6 shrink-0 text-xs text-muted-foreground"
              aria-label={isOpen ? `Collapse ${n.name}` : `Expand ${n.name}`}
              disabled={!kids}
              onClick={() => toggle(n.id)}
            >
              {kids ? (isOpen ? "▾" : "▸") : ""}
            </button>
            <button type="button" className={row("branch", n.id)} onClick={() => pick("branch", n.id)}>
              {n.emoji ? `${n.emoji} ` : ""}
              {n.name}
            </button>
          </div>
          {kids && isOpen ? <ul>{renderBranches(n.id, depth + 1)}</ul> : null}
        </li>
      );
    });

  const q = filter.trim().toLowerCase();
  const matches = q ? tree.filter((n) => n.name.toLowerCase().includes(q)).slice(0, 40) : [];

  return (
    <div className="mt-2">
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-left text-sm"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={cn(value.scopeKind !== "root" && !value.scopeRef && "text-muted-foreground")}>
          {scopeLabel(value, byId, sectors)}
        </span>
        <span className="text-xs text-muted-foreground">{open ? "Close" : "Change"}</span>
      </button>
      {open ? (
        <div className="mt-2 rounded-lg border border-border bg-card p-2">
          <Input value={filter} placeholder="Find a branch" onChange={(e) => setFilter(e.target.value)} aria-label="Find a branch" />
          {q ? (
            <ul className="mt-2 max-h-72 overflow-y-auto">
              {matches.map((n) => (
                <li key={n.id}>
                  <button type="button" className={cn(row("branch", n.id), "block w-full")} onClick={() => pick("branch", n.id)}>
                    {branchTrail(n.id, byId, sectors)}
                  </button>
                </li>
              ))}
              {!matches.length ? <li className="px-2 py-1.5 text-sm text-muted-foreground">No branch matches.</li> : null}
            </ul>
          ) : (
            <ul className="mt-2 max-h-80 overflow-y-auto">
              <li className="flex items-center">
                <span className="size-6 shrink-0" />
                <button type="button" className={row("root", null)} onClick={() => pick("root", null)}>
                  🧠 Full brain <span className="text-xs text-muted-foreground">(everything)</span>
                </button>
              </li>
              {sectors.map((s) => {
                const key = `sector:${s.id}`;
                const kids = children.get(key)?.length ?? 0;
                const isOpen = expanded.has(key);
                return (
                  <li key={s.id}>
                    <div className="flex items-center">
                      <button
                        type="button"
                        className="size-6 shrink-0 text-xs text-muted-foreground"
                        aria-label={isOpen ? `Collapse ${s.label}` : `Expand ${s.label}`}
                        disabled={!kids}
                        onClick={() => toggle(key)}
                      >
                        {kids ? (isOpen ? "▾" : "▸") : ""}
                      </button>
                      <button type="button" className={row("sector", s.id)} onClick={() => pick("sector", s.id)}>
                        {s.emoji} {s.label}
                      </button>
                    </div>
                    {kids && isOpen ? <ul>{renderBranches(key, 1)}</ul> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function PermissionToggles({ value, onChange }: { value: PermissionFlags; onChange: (next: PermissionFlags) => void }) {
  const set = (p: Permission, on: boolean) => {
    const next = { ...value, [p]: on };
    // Search and act need read; turning read off turns them off too.
    if (p === "read" && !on) {
      next.search = false;
      next.execute = false;
    }
    onChange(normalizeFlags(next));
  };
  return (
    <fieldset className="mt-3">
      <legend className="sr-only">Permissions</legend>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {PERMISSIONS.map((p) => (
          <label key={p} className="flex items-start gap-2 rounded-md px-1 py-1 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-primary"
              checked={value[p]}
              onChange={(e) => set(p, e.target.checked)}
            />
            <span>
              <span className="font-medium">{PERMISSION_LABELS[p].label}</span>
              <span className="block text-xs text-muted-foreground">{PERMISSION_LABELS[p].hint}</span>
            </span>
          </label>
        ))}
      </div>
      {value.write_direct ? (
        <p className="mt-2 text-xs text-problem">Write skips your review queue. Only allow it for agents you fully trust.</p>
      ) : null}
    </fieldset>
  );
}

function ScopePreview({ scopeKind, scopeRef }: { scopeKind: ScopeKind; scopeRef: string | null }) {
  const enabled = scopeKind === "root" || Boolean(scopeRef);
  const preview = useQuery({
    queryKey: ["scope-preview", scopeKind, scopeRef],
    queryFn: () => previewConnectorScope({ data: { scopeKind, scopeRef } }),
    enabled,
  });
  if (!enabled) return null;
  const d = preview.data;
  return (
    <p className="mt-2 text-xs text-muted-foreground">
      {!d
        ? "Counting what this exposes…"
        : d.ok
          ? `Exposes ${d.branches} branch${d.branches === 1 ? "" : "es"} and ${d.memories} memor${d.memories === 1 ? "y" : "ies"}, plus anything added under it later.`
          : d.error}
    </p>
  );
}

const STATUS_TONE: Record<AuditStatus, "success" | "muted" | "problem" | "gold"> = {
  allowed: "success",
  denied: "muted",
  boundary_violation: "problem",
  error: "problem",
  pending_approval: "gold",
};

const STATUS_LABEL: Record<AuditStatus, string> = {
  allowed: "Allowed",
  denied: "Denied",
  boundary_violation: "Blocked: outside scope",
  error: "Error",
  pending_approval: "Waiting for review",
};

function AuditLog({ connectors }: { connectors: ConnectorSummary[] }) {
  const [connectorId, setConnectorId] = useState<string>("");
  const [status, setStatus] = useState<AuditStatus | "">("");
  const audit = useQuery({
    queryKey: ["connector-audit", connectorId, status],
    queryFn: () => listConnectorAudit({ data: { connectorId: connectorId || null, status: status || null } }),
  });
  const select = "rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm";
  const entries = audit.data?.entries ?? [];
  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl">Activity</h2>
        {audit.data ? (
          <Badge tone={audit.data.chain.ok ? "success" : "problem"}>
            {audit.data.chain.ok ? `Log intact · ${audit.data.chain.rows} entries` : "Log tampering detected"}
          </Badge>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Every connector request, newest first. The log can't be edited or deleted, and each entry is chained to the one
        before it.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <select className={select} value={connectorId} onChange={(e) => setConnectorId(e.target.value)} aria-label="Connector">
          <option value="">All connectors</option>
          {connectors.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
            </option>
          ))}
        </select>
        <select className={select} value={status} onChange={(e) => setStatus(e.target.value as AuditStatus | "")} aria-label="Result">
          <option value="">All results</option>
          {(Object.keys(STATUS_LABEL) as AuditStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
      {audit.isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
      ) : !entries.length ? (
        <p className="mt-3 text-sm text-muted-foreground">Nothing yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {entries.map((e) => (
            <li key={e.seq} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <span className="w-24 shrink-0 text-xs text-muted-foreground" title={e.createdAt}>
                {formatRelative(e.createdAt)}
              </span>
              <span className="font-medium">{e.connectorName ?? "Connector"}</span>
              <span className="text-muted-foreground">{e.toolName ?? e.action.replace("_", " ")}</span>
              {e.targetBranchId ? (
                <span className="truncate text-muted-foreground">→ {e.targetBranchName ?? "unknown branch"}</span>
              ) : null}
              <Badge className="ml-auto" tone={STATUS_TONE[e.status]}>
                {STATUS_LABEL[e.status]}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
