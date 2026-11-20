import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, X } from "lucide-react";
import { QUICK_PICKS, loadEmojiLibrary } from "@/lib/emoji-catalog";
import { EMOJI_CATEGORIES, entriesInCategory, searchEmojiEntries, type EmojiCategoryId, type EmojiEntry } from "@/lib/emoji-search";
import { customEmojiToken, parseCustomEmojiToken } from "@/lib/custom-emoji";
import { deleteCustomEmoji } from "@/lib/server/custom-emojis";
import { NODE_COLORS } from "@/lib/node-colors";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { CUSTOM_EMOJIS_KEY, EmojiGlyph, useCustomEmojis, type RenderableCustomEmoji } from "@/components/emoji-glyph";
import { CustomEmojiStudio } from "@/components/custom-emoji-studio";

type Tab = "quick" | "custom" | "create" | EmojiCategoryId;

const stopBubble = (e: { stopPropagation: () => void }) => e.stopPropagation();

/**
 * Icon picker for branches, sectors and memories. Same trigger as before; the
 * sheet (bottom sheet on phones, centered card on desktop, portaled so parent
 * blur/transform layers cannot clip it) adds the full Unicode library with
 * search and category tabs, the user's custom emojis, and a Create tab for
 * type-to-generate and draw-to-refine. The chosen value is a plain emoji or a
 * `custom:<id>` token, saved through the same `onChange` as always.
 */
export function EmojiPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex size-11 items-center justify-center rounded-md border border-input bg-card text-xl"
        aria-label="Choose an icon"
        aria-haspopup="dialog"
      >
        <EmojiGlyph value={value || "✨"} />
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <EmojiSheet
              value={value}
              onClose={() => setOpen(false)}
              onPick={(v) => {
                onChange(v);
                setOpen(false);
              }}
            />,
            document.body,
          )
        : null}
    </div>
  );
}

function EmojiSheet({ value, onPick, onClose }: { value: string; onPick: (v: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>(() => (parseCustomEmojiToken(value) ? "custom" : "quick"));
  const [entries, setEntries] = useState<EmojiEntry[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [seed, setSeed] = useState("");
  const custom = useCustomEmojis();
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: string) => deleteCustomEmoji({ data: { id } }),
    onSuccess: (_r, id) => {
      qc.setQueryData<RenderableCustomEmoji[]>(CUSTOM_EMOJIS_KEY, (prev) => (prev ?? []).filter((e) => e.id !== id));
    },
  });

  useEffect(() => {
    let live = true;
    loadEmojiLibrary()
      .then((list) => live && setEntries(list))
      .catch(() => live && setLoadError(true));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const q = query.trim();
  const customHits = useMemo(() => {
    const list = custom.data ?? [];
    if (!q) return list;
    const low = q.toLowerCase();
    return list.filter((e) => e.label.toLowerCase().includes(low));
  }, [custom.data, q]);
  const glyphs = useMemo((): { emoji: string; name: string }[] => {
    if (q) return entries ? searchEmojiEntries(entries, q) : [];
    if (tab === "quick") {
      const names = new Map((entries ?? []).map((e) => [e.emoji, e.name]));
      return QUICK_PICKS.map((g) => ({ emoji: g, name: names.get(g) ?? "" }));
    }
    if (tab === "custom" || tab === "create") return [];
    return entries ? entriesInCategory(entries, tab) : [];
  }, [q, tab, entries]);

  const tabs: { id: Tab; label: string; icon?: string }[] = [
    { id: "quick", label: "Quick" },
    { id: "custom", label: "Mine" },
    ...EMOJI_CATEGORIES.map((c) => ({ id: c.id as Tab, label: c.label, icon: c.icon })),
  ];
  const showCustomGrid = (tab === "custom" && !q) || (q && customHits.length > 0);

  return (
    <div
      className="fixed inset-0 z-[80]"
      role="dialog"
      aria-modal="true"
      aria-label="Choose an icon"
      onPointerDown={stopBubble}
      onMouseDown={stopBubble}
      onTouchStart={stopBubble}
      onClick={stopBubble}
      onDoubleClick={stopBubble}
      onKeyDown={stopBubble}
    >
      <button type="button" aria-label="Close icon picker" className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="clear-bottom-nav absolute inset-x-0 flex max-h-[min(80dvh,38rem)] flex-col rounded-t-2xl border border-border bg-popover p-3 shadow-soft md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:max-h-[min(86dvh,40rem)] md:w-[26rem] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl">
        <div className="flex items-center gap-2">
          <Input
            placeholder={tab === "create" ? "Search icons…" : "Search all emoji…"}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (tab === "create") setTab("quick");
            }}
            aria-label="Search emoji"
          />
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-10 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-2 flex gap-1 overflow-x-auto pb-1 scrollbar-none">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setQuery("");
              }}
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-[11px]",
                tab === t.id && !q ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.icon ? <span aria-hidden className="text-sm leading-none">{t.icon}</span> : null}
              {t.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setTab("create");
              setQuery("");
            }}
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-[11px]",
              tab === "create" && !q ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Plus className="size-3" />
            Create
          </button>
        </div>
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {tab === "create" && !q ? (
            <CustomEmojiStudio onPick={onPick} initialText={seed} />
          ) : (
            <>
              {showCustomGrid ? (
                <div className="mb-2">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Your emojis</p>
                    {!q && customHits.length ? (
                      <button type="button" onClick={() => setEditing((v) => !v)} className="text-[11px] text-muted-foreground hover:text-foreground">
                        {editing ? "Done" : "Edit"}
                      </button>
                    ) : null}
                  </div>
                  {custom.isLoading ? (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  ) : customHits.length ? (
                    <div className="grid grid-cols-7 gap-1 sm:grid-cols-8">
                      {customHits.map((e) => {
                        const token = customEmojiToken(e.id);
                        return (
                          <div key={e.id} className="relative">
                            <button
                              type="button"
                              title={e.label || "Custom emoji"}
                              onClick={() => onPick(token)}
                              className={cn("grid size-10 place-items-center rounded-md hover:bg-primary/15", value === token && "bg-primary/20")}
                            >
                              <img src={e.src} alt={e.label || "custom emoji"} className="size-7" draggable={false} />
                            </button>
                            {editing ? (
                              <button
                                type="button"
                                aria-label={`Delete ${e.label || "custom emoji"}`}
                                disabled={remove.isPending}
                                onClick={() => remove.mutate(e.id)}
                                className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-destructive text-[10px] text-white"
                              >
                                <X className="size-3" />
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <button type="button" onClick={() => setTab("create")} className="w-full rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground hover:text-foreground">
                      No custom emojis yet. Create one by typing a description or drawing it.
                    </button>
                  )}
                </div>
              ) : null}
              {tab !== "custom" || q ? (
                !entries && !loadError && tab !== "quick" ? (
                  <div className="grid h-24 place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
                ) : loadError && tab !== "quick" ? (
                  <p className="p-3 text-xs text-muted-foreground">Could not load the emoji library. Check your connection and reopen.</p>
                ) : glyphs.length ? (
                  <div className="grid grid-cols-8 gap-1 sm:grid-cols-9">
                    {glyphs.map((g, i) => (
                      <button
                        key={`${g.emoji}-${i}`}
                        type="button"
                        title={g.name || undefined}
                        aria-label={g.name || g.emoji}
                        onClick={() => onPick(g.emoji)}
                        className={cn("grid size-9 place-items-center rounded-md text-xl hover:bg-primary/15", value === g.emoji && "bg-primary/20")}
                      >
                        {g.emoji}
                      </button>
                    ))}
                  </div>
                ) : q ? (
                  <div className="space-y-2 p-2 text-center">
                    <p className="text-xs text-muted-foreground">No emoji match “{q}”.</p>
                    <button type="button" onClick={() => { setSeed(q); setQuery(""); setTab("create"); }} className="text-xs text-primary underline-offset-2 hover:underline">
                      Make a custom one
                    </button>
                  </div>
                ) : null
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function ColorSwatches({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="listbox" aria-label="Color">
      {NODE_COLORS.map((c) => (
        <button
          key={c.id}
          type="button"
          title={c.label}
          onClick={() => onChange(c.id)}
          className={cn(
            "size-9 rounded-full border-2 transition-transform duration-150 ease-out active:scale-[0.96]",
            value === c.id ? "border-foreground scale-110" : "border-transparent",
          )}
          style={{ background: c.css }}
          aria-label={c.label}
        />
      ))}
    </div>
  );
}

export function GlyphRow({
  emoji,
  color,
  onEmoji,
  onColor,
}: {
  emoji: string;
  color: string;
  onEmoji: (v: string) => void;
  onColor: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <EmojiPicker value={emoji} onChange={onEmoji} />
      <ColorSwatches value={color} onChange={onColor} />
    </div>
  );
}
