import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Memory } from "@/lib/types";
import type { ChecklistItem } from "@/lib/digestion/viewer-types";
import { CHECKLIST_MAX_ITEMS } from "@/lib/digestion/viewer-types";
import { newId } from "@/lib/utils";
import { useMemoryMedia } from "./use-memory-media";
import { useArtifactState, ViewerFrame } from "./viewer-kit";

type Props = { memory: Memory; compact?: boolean };

/** Screenshot → to-do list: check, edit, date, add and delete; saved to artifact_state.items (1 s debounce). */
export function ChecklistDigestView({ memory, compact }: Props) {
  const { state, update, saving } = useArtifactState<{ items?: ChecklistItem[] }>(memory);
  const items = state.items ?? [];
  const [draft, setDraft] = useState("");
  const media = useMemoryMedia(memory.id, memory.hasMedia);
  const src = media.data?.mediaUrl ?? memory.thumbUrl;
  const caption = (memory.extractedMetadata as { caption?: string }).caption;
  const done = items.filter((i) => i.completed).length;

  const set = (next: ChecklistItem[]) => update({ items: next });
  const patch = (id: string, p: Partial<ChecklistItem>) => set(items.map((i) => (i.id === id ? { ...i, ...p } : i)));
  const add = () => {
    const text = draft.trim();
    if (!text || items.length >= CHECKLIST_MAX_ITEMS) return;
    set([...items, { id: newId(), text: text.slice(0, 1000), completed: false }]);
    setDraft("");
  };

  return (
    <ViewerFrame
      compact={compact}
      toolbar={
        <span className="text-xs text-muted-foreground">
          {done}/{items.length} done{saving === "saving" ? " · saving…" : saving === "error" ? " · not saved, retrying on next change" : ""}
        </span>
      }
    >
      {items.length ? (
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${(done / items.length) * 100}%` }} />
        </div>
      ) : null}
      <ul className="space-y-1.5">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5">
            <input type="checkbox" checked={it.completed} onChange={(e) => patch(it.id, { completed: e.target.checked })} aria-label={`Done: ${it.text}`} className="size-4 shrink-0 accent-[var(--color-primary)]" />
            <input
              value={it.text}
              onChange={(e) => patch(it.id, { text: e.target.value.slice(0, 1000) })}
              aria-label="Task"
              className={`min-w-0 flex-1 bg-transparent text-sm outline-none ${it.completed ? "text-muted-foreground line-through" : ""}`}
            />
            <input
              type="date"
              value={it.dueDate ?? ""}
              onChange={(e) => patch(it.id, { dueDate: e.target.value || undefined })}
              aria-label="Due date"
              className="w-[8.5rem] shrink-0 rounded border border-border bg-transparent px-1 text-xs text-muted-foreground"
            />
            <button type="button" aria-label={`Delete ${it.text}`} onClick={() => set(items.filter((i) => i.id !== it.id))} className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive">
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a task" aria-label="Add a task" className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm" />
        <button type="submit" disabled={!draft.trim()} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 text-sm text-primary-foreground disabled:opacity-50">
          <Plus className="size-4" /> Add
        </button>
      </form>
      {src ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground">Source screenshot</summary>
          <img src={src} alt={caption ?? memory.title} className="mt-2 max-h-96 w-full rounded-xl bg-muted object-contain" />
        </details>
      ) : null}
    </ViewerFrame>
  );
}
