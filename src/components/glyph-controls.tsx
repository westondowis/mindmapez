import { useEffect, useMemo, useRef, useState } from "react";
import { EMOJI_GROUPS, searchEmoji } from "@/lib/emoji-catalog";
import { NODE_COLORS } from "@/lib/node-colors";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export function EmojiPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string>("mind");
  const root = useRef<HTMLDivElement>(null);
  const glyphs = useMemo(() => {
    if (query.trim()) return searchEmoji(query);
    return EMOJI_GROUPS.find((g) => g.id === group)?.glyphs ?? EMOJI_GROUPS[0]!.glyphs;
  }, [query, group]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex size-11 items-center justify-center rounded-md border border-input bg-card text-xl"
        aria-label="Choose an icon"
      >
        {value || "✨"}
      </button>
      {open ? (
        <div className="absolute z-50 mt-2 w-[min(100vw-2rem,20rem)] rounded-xl border border-border bg-popover p-3 shadow-soft">
          <Input
            placeholder="Search icons…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div className="mt-2 flex gap-1 overflow-x-auto scrollbar-none">
            {EMOJI_GROUPS.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  setGroup(g.id);
                  setQuery("");
                }}
                className={cn(
                  "shrink-0 rounded-md px-2 py-1 text-[11px]",
                  group === g.id && !query
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
          <div className="mt-2 grid max-h-48 grid-cols-8 gap-1 overflow-y-auto">
            {glyphs.map((g, i) => (
              <button
                key={`${g}-${i}`}
                type="button"
                onClick={() => {
                  onChange(g);
                  setOpen(false);
                }}
                className={cn(
                  "grid size-8 place-items-center rounded-md text-lg hover:bg-primary/15",
                  value === g && "bg-primary/20",
                )}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      ) : null}
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
