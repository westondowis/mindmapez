import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftRight, GripVertical, Lock, Search, Tags, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createTag,
  deleteTag,
  getTagRelations,
  listTags,
  setConnectorTag,
  setTagLink,
  setTagTier,
  type TagHub,
  type TagListItem,
} from "@/lib/server/tags";
import { DRAG_THRESHOLD, dropResult, isDrag, matchesTag, otherTier, tierAtPoint, type Zone } from "@/lib/tag-dnd";
import type { TagTier } from "@/lib/tag-intel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tags")({ component: TagsRoute });

function TagsRoute() {
  return (
    <RequireAuth>
      <TagsPage />
    </RequireAuth>
  );
}

type Drag = { id: string; name: string; from: TagTier; x: number; y: number; over: TagTier | null };

function TagsPage() {
  const qc = useQueryClient();
  const hub = useQuery({ queryKey: ["tags"], queryFn: () => listTags() });
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [newTier, setNewTier] = useState<TagTier>("primary");
  const [openId, setOpenId] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const zoneRefs = useRef<Record<TagTier, HTMLElement | null>>({ primary: null, secondary: null });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["tags"] });
    void qc.invalidateQueries({ queryKey: ["tag-relations"] });
    void qc.invalidateQueries({ queryKey: ["connectors"] });
  };
  const tierMut = useMutation({
    mutationFn: (v: { id: string; tier: TagTier }) => setTagTier({ data: v }),
    onSuccess: refresh,
    onError: () => toast.error("Could not move that tag."),
  });
  const createMut = useMutation({
    mutationFn: () => createTag({ data: { name, tier: newTier } }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error(r.error);
      setName("");
      refresh();
    },
  });
  const delMut = useMutation({
    mutationFn: (id: string) => deleteTag({ data: { id } }),
    onSuccess: (r, id) => {
      if (!r.ok) return toast.error(r.error);
      if (openId === id) setOpenId(null);
      refresh();
      void qc.invalidateQueries({ queryKey: ["graph"] });
    },
  });

  const data: TagHub | undefined = hub.data;
  const visible = useMemo(() => {
    const out: { tag: TagListItem; via: string | null }[] = [];
    for (const tag of data?.tags ?? []) {
      const m = matchesTag(query, tag);
      if (m.match) out.push({ tag, via: m.via });
    }
    return out;
  }, [data, query]);
  const primary = visible.filter((v) => v.tag.tier === "primary");
  const secondary = visible.filter((v) => v.tag.tier === "secondary");

  const zones = (): Zone[] =>
    (["primary", "secondary"] as const).flatMap((tier) => {
      const el = zoneRefs.current[tier];
      if (!el) return [];
      const r = el.getBoundingClientRect();
      return [{ tier, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } }];
    });

  /** Pointer-event drag (mouse, touch and pen alike; HTML5 drag events do not fire on iOS PWAs). */
  const startDrag = (e: React.PointerEvent, tag: TagListItem) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const sx = e.clientX;
    const sy = e.clientY;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && !isDrag(ev.clientX - sx, ev.clientY - sy)) return;
      moved = true;
      setDrag({ id: tag.id, name: tag.name, from: tag.tier, x: ev.clientX, y: ev.clientY, over: tierAtPoint(ev.clientX, ev.clientY, zones()) });
    };
    const end = (ev: PointerEvent) => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", cancel);
      try {
        target.releasePointerCapture(ev.pointerId);
      } catch {
        // already released
      }
      setDrag(null);
      if (!moved) return;
      const to = dropResult(tag.tier, tierAtPoint(ev.clientX, ev.clientY, zones()));
      if (to) tierMut.mutate({ id: tag.id, tier: to });
    };
    const cancel = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", cancel);
      setDrag(null);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", cancel);
  };

  const confirmDelete = (tag: TagListItem) => {
    if (tag.occurrenceCount > 0 && !window.confirm(`"${tag.name}" is attached to ${tag.occurrenceCount} item${tag.occurrenceCount === 1 ? "" : "s"}. Delete it and detach it everywhere, including connector access?`)) return;
    delMut.mutate(tag.id);
  };

  const renderZone = (tier: TagTier, items: { tag: TagListItem; via: string | null }[]) => (
    <section
      ref={(el) => {
        zoneRefs.current[tier] = el;
      }}
      data-tier-zone={tier}
      aria-label={`${tier === "primary" ? "Primary" : "Secondary"} tags`}
      className={cn(
        "min-h-32 rounded-xl border border-dashed p-4 transition-colors",
        drag?.over === tier ? "border-highlight bg-highlight/10" : "border-border bg-card/60",
      )}
    >
      <h2 className="font-display text-lg">{tier === "primary" ? "Primary tags" : "Secondary tags"}</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        {tier === "primary" ? "Core concepts. Drop a tag here to lock it in." : "Emerging patterns across your brain. Drop a tag here to lock it in."}
      </p>
      <div className="flex flex-wrap gap-2">
        {items.length ? (
          items.map(({ tag, via }) => (
            <div
              key={tag.id}
              className={cn(
                "flex min-h-11 items-center gap-1 rounded-full border bg-background/80 pl-1 pr-1 text-sm",
                openId === tag.id ? "border-highlight" : "border-border",
                drag?.id === tag.id && "opacity-40",
              )}
            >
              <button
                type="button"
                aria-label={`Drag ${tag.name}`}
                title="Drag to move between Primary and Secondary"
                className="grid size-9 cursor-grab place-items-center rounded-full text-muted-foreground active:cursor-grabbing"
                style={{ touchAction: "none" }}
                onPointerDown={(e) => startDrag(e, tag)}
              >
                <GripVertical className="size-4" />
              </button>
              <button type="button" className="min-w-0 px-1 text-left" onClick={() => setOpenId(openId === tag.id ? null : tag.id)}>
                <span className="block truncate">{tag.name}</span>
                {via ? <span className="block truncate text-[10px] text-muted-foreground">via {via}</span> : null}
              </button>
              {tag.isManualOverride ? <Lock className="size-3 shrink-0 text-highlight" aria-label="Locked in this tier" /> : null}
              <span className="px-1 text-[11px] tabular-nums text-muted-foreground">{tag.occurrenceCount}</span>
              <button
                type="button"
                aria-label={`Move ${tag.name} to ${otherTier(tag.tier)}`}
                title={`Move to ${otherTier(tag.tier)}`}
                className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                onClick={() => tierMut.mutate({ id: tag.id, tier: otherTier(tag.tier) })}
              >
                <ArrowLeftRight className="size-4" />
              </button>
              <button
                type="button"
                aria-label={`Delete ${tag.name}`}
                className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                onClick={() => confirmDelete(tag)}
              >
                <X className="size-4" />
              </button>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">{query ? "No matches." : "Nothing here yet."}</p>
        )}
      </div>
    </section>
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <PageHeader kicker="More" title="Tagging system" action={<Button asChild variant="ghost" size="sm"><Link to="/settings">Back to More</Link></Button>} />

        <div className="mb-5 rounded-xl border border-highlight/40 bg-card p-4 text-sm leading-relaxed text-muted-foreground" data-testid="tag-banner">
          <p className="mb-1 flex items-center gap-2 font-medium text-foreground"><Tags className="size-4 text-highlight" /> How tags work</p>
          <p>
            <strong className="text-foreground">Primary tags</strong> are your core concepts: ones you lock in, or that show up in at least 5 items or 2 different branches.{" "}
            <strong className="text-foreground">Secondary tags</strong> are emerging patterns the app notices across your brain (a word has to appear in at least 2 different notes or branches).
          </p>
          <p className="mt-2">
            <strong className="text-foreground">Dragging a tag into Primary or Secondary locks it there</strong> (the lock icon), so automatic counting never moves or deletes it. On a phone use the grip handle, or tap the arrows button to switch tiers.
          </p>
          <p className="mt-2">
            Attach a tag to a sector, a branch or a memory to connect them across the whole brain. A connector given a tag can read everything under each tagged sector or branch, and nothing above it.
          </p>
        </div>

        <div className="mb-4 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tags, or branches and memories they are on" aria-label="Search tags" />
          </div>
        </div>

        <form
          className="mb-5 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) createMut.mutate();
          }}
        >
          <Input className="min-w-40 flex-1" value={name} maxLength={48} onChange={(e) => setName(e.target.value)} placeholder="New tag name" aria-label="New tag name" />
          <select
            aria-label="Tier for the new tag"
            className="h-11 rounded-md border border-input bg-card px-3 text-sm"
            value={newTier}
            onChange={(e) => setNewTier(e.target.value as TagTier)}
          >
            <option value="primary">Primary</option>
            <option value="secondary">Secondary</option>
          </select>
          <Button type="submit" disabled={!name.trim() || createMut.isPending}>Add tag</Button>
        </form>

        {hub.isLoading ? <p className="text-sm text-muted-foreground">Loading tags…</p> : null}
        <div className="grid gap-4 md:grid-cols-2">
          {renderZone("primary", primary)}
          {renderZone("secondary", secondary)}
        </div>

        {openId ? <Relations id={openId} hub={data} onChange={refresh} /> : null}
      </div>
      {drag ? (
        <div
          aria-hidden
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-full border border-highlight bg-background px-3 py-1.5 text-sm shadow-soft"
          style={{ left: drag.x, top: drag.y - DRAG_THRESHOLD * 4 }}
        >
          {drag.name}
        </div>
      ) : null}
    </AppShell>
  );
}

function Relations({ id, hub, onChange }: { id: string; hub: TagHub | undefined; onChange: () => void }) {
  const rel = useQuery({ queryKey: ["tag-relations", id], queryFn: () => getTagRelations({ data: { id } }) });
  const [target, setTarget] = useState("");
  const linkMut = useMutation({
    mutationFn: (v: { targetType: "sector" | "branch" | "memory"; targetId: string; attached: boolean }) => setTagLink({ data: { tagId: id, ...v } }),
    onSuccess: (r) => (r.ok ? onChange() : toast.error(r.error)),
  });
  const connMut = useMutation({
    mutationFn: (v: { connectorId: string; enabled: boolean }) => setConnectorTag({ data: { tagId: id, ...v } }),
    onSuccess: (r) => (r.ok ? onChange() : toast.error(r.error)),
  });
  const r = rel.data;
  if (rel.isLoading) return <p className="mt-6 text-sm text-muted-foreground">Loading relationships…</p>;
  if (!r) return null;
  const sectorLabel = (sid: string) => hub?.sectors.find((s) => s.id === sid)?.label ?? sid;
  const attachedBranches = new Set(r.branches.map((b) => b.id));
  const attachedSectors = new Set(r.sectors);
  const attach = () => {
    const [type, ref] = target.split(":", 2) as ["sector" | "branch", string];
    if (!ref) return;
    linkMut.mutate({ targetType: type, targetId: ref, attached: true });
    setTarget("");
  };
  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-5" data-testid="tag-relations" aria-label={`Relationships for ${r.tag.name}`}>
      <h2 className="font-display text-xl">{r.tag.name}</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Inherited scope: {r.scope.sectors} sector{r.scope.sectors === 1 ? "" : "s"}, {r.scope.branches} branch{r.scope.branches === 1 ? "" : "es"}, {r.scope.memories} memor{r.scope.memories === 1 ? "y" : "ies"} (everything below each tagged sector or branch).
      </p>

      <h3 className="mt-4 text-sm font-medium">Sectors and branches</h3>
      <ul className="mt-2 space-y-1.5 text-sm">
        {r.sectors.map((s) => (
          <li key={`s-${s}`} className="flex items-center justify-between gap-2 rounded-md bg-background/60 px-3 py-2">
            <span>Sector: {sectorLabel(s)}</span>
            <button type="button" aria-label={`Detach from ${sectorLabel(s)}`} className="grid size-8 place-items-center text-muted-foreground hover:text-foreground" onClick={() => linkMut.mutate({ targetType: "sector", targetId: s, attached: false })}>
              <X className="size-4" />
            </button>
          </li>
        ))}
        {r.branches.map((b) => (
          <li key={b.id} className="flex items-center justify-between gap-2 rounded-md bg-background/60 px-3 py-2">
            <span className="min-w-0 break-words">{b.path}</span>
            <button type="button" aria-label={`Detach from ${b.path}`} className="grid size-8 shrink-0 place-items-center text-muted-foreground hover:text-foreground" onClick={() => linkMut.mutate({ targetType: "branch", targetId: b.id, attached: false })}>
              <X className="size-4" />
            </button>
          </li>
        ))}
        {!r.sectors.length && !r.branches.length ? <li className="text-muted-foreground">Not attached to any sector or branch yet.</li> : null}
      </ul>
      <div className="mt-3 flex gap-2">
        <select aria-label="Attach to a sector or branch" className="h-11 min-w-0 flex-1 rounded-md border border-input bg-card px-3 text-sm" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Attach to a sector or branch…</option>
          <optgroup label="Sectors">
            {(hub?.sectors ?? []).filter((s) => !attachedSectors.has(s.id)).map((s) => (
              <option key={s.id} value={`sector:${s.id}`}>{s.label}</option>
            ))}
          </optgroup>
          <optgroup label="Branches">
            {(hub?.branches ?? []).filter((b) => !attachedBranches.has(b.id)).map((b) => (
              <option key={b.id} value={`branch:${b.id}`}>{b.path}</option>
            ))}
          </optgroup>
        </select>
        <Button type="button" variant="outline" disabled={!target || linkMut.isPending} onClick={attach}>Attach</Button>
      </div>

      <h3 className="mt-5 text-sm font-medium">Memories ({r.memories.length})</h3>
      <ul className="mt-2 space-y-1.5 text-sm">
        {r.memories.map((m) => (
          <li key={m.id}>
            <Link to="/memory/$id" params={{ id: m.id }} className="block rounded-md bg-background/60 px-3 py-2 hover:text-primary">{m.title}</Link>
          </li>
        ))}
        {!r.memories.length ? <li className="text-muted-foreground">No memories carry this tag directly.</li> : null}
      </ul>

      <h3 className="mt-5 text-sm font-medium">Connectors with access through this tag</h3>
      <ul className="mt-2 space-y-1.5 text-sm">
        {(hub?.connectors ?? []).map((c) => {
          const on = r.connectors.some((x) => x.id === c.id);
          return (
            <li key={c.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md bg-background/60 px-3 py-2">
                <input type="checkbox" checked={on} disabled={connMut.isPending} onChange={(e) => connMut.mutate({ connectorId: c.id, enabled: e.target.checked })} />
                <span>{c.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">{on ? "can read the tagged subtrees" : "no access"}</span>
              </label>
            </li>
          );
        })}
        {!(hub?.connectors ?? []).length ? (
          <li className="text-muted-foreground">No active connectors. <Link to="/connectors" className="text-primary underline">Create one</Link> to share tagged data.</li>
        ) : null}
      </ul>
    </section>
  );
}
