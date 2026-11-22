import { FileText, ImageIcon, Link2, Mic, MoreHorizontal, Plus, Type, Video, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CapturePanel } from "@/components/capture-panel";
import { cn } from "@/lib/utils";

type Mode = "voice" | "text" | "photo" | "video" | "document" | "thought" | "link";

const ITEMS: { id: string; label: string; hint: string; mode: Mode; icon: typeof Mic }[] = [
  { id: "record", label: "Record", hint: "Talk it out", mode: "voice", icon: Mic },
  { id: "text", label: "Text", hint: "Type a quick note", mode: "text", icon: Type },
  { id: "file", label: "Document or file", hint: "PDF, text, anything", mode: "document", icon: FileText },
  { id: "photo", label: "Photo", hint: "Camera or library", mode: "photo", icon: ImageIcon },
  { id: "video", label: "Video", hint: "Camera or library", mode: "video", icon: Video },
  { id: "link", label: "Link", hint: "Paste a web address", mode: "link", icon: Link2 },
  { id: "other", label: "Other", hint: "Thought, clipboard, more", mode: "thought", icon: MoreHorizontal },
];

/**
 * Pulsing plus at the top right of the mesh. Opens a menu of ways to add a memory to the level
 * being viewed; picking one opens the capture form in a sheet that files the memory there.
 */
export function QuickAdd({ conceptId, label }: { conceptId: string | null; label: string }) {
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState<{ mode: Mode; n: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheet(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheet]);

  return (
    <div ref={root} className="absolute right-3 top-3 z-40" onPointerDown={(e) => e.stopPropagation()}>
      <button
        type="button"
        data-testid="quick-add"
        aria-label="Add a memory here"
        aria-haspopup="menu"
        aria-expanded={menu}
        onClick={() => setMenu((v) => !v)}
        className="quick-add-pulse flex size-14 items-center justify-center rounded-full bg-highlight text-highlight-foreground"
      >
        <Plus className={cn("size-7 transition-transform duration-200", menu && "rotate-45")} />
      </button>
      {menu ? (
        <div
          role="menu"
          aria-label="Add a memory"
          data-testid="quick-add-menu"
          className="absolute right-0 top-16 w-64 overflow-hidden rounded-2xl border border-border bg-background/95 p-1.5 shadow-soft backdrop-blur-md"
        >
          <p className="truncate px-3 pb-1 pt-2 text-[11px] uppercase tracking-wide text-muted-foreground">Add to {label}</p>
          {ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-secondary focus-visible:bg-secondary"
                onClick={() => {
                  setMenu(false);
                  setSheet((s) => ({ mode: item.mode, n: (s?.n ?? 0) + 1 }));
                }}
              >
                <Icon className="size-5 shrink-0 text-highlight" />
                <span className="min-w-0">
                  <span className="block text-sm text-foreground">{item.label}</span>
                  <span className="block text-xs text-muted-foreground">{item.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
      {sheet && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[60]" data-testid="quick-add-sheet">
              <button type="button" aria-label="Close" className="absolute inset-0 bg-black/55" onClick={() => setSheet(null)} />
              <section
                role="dialog"
                aria-label="Add a memory"
                className="clear-bottom-nav absolute inset-x-0 flex max-h-[88dvh] flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-soft md:inset-y-0 md:bottom-0 md:left-auto md:right-0 md:max-h-none md:w-[30rem] md:rounded-none md:border-y-0 md:border-r-0"
              >
                <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                  <h2 className="font-display text-lg">Add a memory</h2>
                  <button type="button" aria-label="Close" className="grid size-10 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground" onClick={() => setSheet(null)}>
                    <X className="size-5" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-8">
                  <CapturePanel key={sheet.n} defaultMode={sheet.mode} target={{ conceptId, label }} onCreated={() => setSheet(null)} />
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
