import * as Dialog from "@radix-ui/react-dialog";
import { Search, X } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildSearchIndex, filterSearchIndex, type SearchScope, type SearchTarget } from "@/lib/graph-search";
import type { GraphPayload } from "@/lib/types";

export function GraphSearchPanel({ graph, onPick }: { graph: GraphPayload; onPick: (target: SearchTarget) => void }) {
  const uid = useId();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>("all");
  const [tags, setTags] = useState<string[]>([]);
  const index = useMemo(() => buildSearchIndex(graph), [graph]);
  const availableTags = useMemo(() => [...new Set(index.flatMap(entry => entry.tags))].sort(), [index]);
  const results = useMemo(() => filterSearchIndex(index, { query, scope, tags }), [index, query, scope, tags]);
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <label htmlFor={`${uid}-query`} className="text-sm text-muted-foreground">Keywords in titles, descriptions or key points</label>
      <Input id={`${uid}-query`} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search every branch and memory…" />
      <div role="group" aria-label="Search scope" className="flex flex-wrap gap-2">
        {([['all', 'All'], ['branches', 'Branches'], ['memories', 'Memories']] as const).map(([value, label]) => (
          <Button key={value} type="button" size="sm" variant={scope === value ? "default" : "outline"} aria-pressed={scope === value} onClick={() => setScope(value)}>{label}</Button>
        ))}
      </div>
      {availableTags.length ? <fieldset className="max-h-28 overflow-y-auto rounded-xl border border-border p-2">
        <legend className="px-1 text-xs text-muted-foreground">Tags · match all selected (branches use their own memories’ tags)</legend>
        <div className="flex flex-wrap gap-2">
          {availableTags.map(tag => <label key={tag} className="flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1 text-xs">
            <input type="checkbox" checked={tags.includes(tag)} onChange={() => setTags(current => current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag])} />{tag}
          </label>)}
        </div>
      </fieldset> : null}
      <p role="status" className="text-xs text-muted-foreground">{results.length} results across all depths</p>
      <ul className="max-h-[45dvh] space-y-2 overflow-y-auto overscroll-contain pb-1" aria-label="Graph search results">
        {results.map(result => <li key={`${result.type}-${result.id}`}>
          <button type="button" disabled={!result.branchId || !result.sectorId} onClick={() => onPick({ type: result.type, id: result.id })}
            className="w-full rounded-xl border border-border bg-card p-3 text-left hover:border-primary focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50">
            <span className="text-[10px] uppercase tracking-wide text-primary">{result.type} · {result.branchId ? graph.concepts.find(c => c.id === result.branchId)?.name : "No owning branch link"}</span>
            <p className="text-sm font-medium">{result.title}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{result.snippet}</p>
            {result.tags.length ? <p className="mt-1 text-[10px] text-muted-foreground">{result.tags.map(tag => `#${tag}`).join(" ")}</p> : null}
          </button>
        </li>)}
      </ul>
      {!results.length ? <p className="text-sm text-muted-foreground">No matches. Try fewer keywords or tags.</p> : null}
    </div>
  );
}

export function GraphSearchDialog({ graph, onPick }: { graph: GraphPayload; onPick: (target: SearchTarget) => void }) {
  const [open, setOpen] = useState(false);
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger asChild><Button type="button" size="sm" variant="outline" className="pointer-events-auto shrink-0"><Search className="size-4" />Search</Button></Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[min(94vw,44rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-background p-4 shadow-soft sm:p-6">
        <div className="mb-2 flex items-center justify-between gap-2">
          <Dialog.Title className="font-display text-xl">Search your whole graph</Dialog.Title>
          <Dialog.Close asChild><Button type="button" size="icon" variant="ghost" aria-label="Close graph search"><X className="size-4" /></Button></Dialog.Close>
        </div>
        <Dialog.Description className="mb-4 text-sm text-muted-foreground">Jump to any branch, or center and highlight a memory on its owning branch.</Dialog.Description>
        <GraphSearchPanel graph={graph} onPick={target => { onPick(target); setOpen(false); }} />
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
