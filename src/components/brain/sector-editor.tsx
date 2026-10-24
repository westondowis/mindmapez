import { useState } from "react";
import { GlyphRow } from "@/components/glyph-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { defaultSectors, type BrainSector } from "@/lib/brain";

export function SectorEditor({
  sector,
  onCancel,
  onSave,
  pending,
  error,
}: {
  sector: BrainSector;
  onCancel: () => void;
  onSave: (input: { label: string; kicker: string; emoji: string; color: string }) => void;
  pending?: boolean;
  error?: string | null;
}) {
  const fallback = defaultSectors().find((s) => s.id === sector.id) ?? sector;
  const [label, setLabel] = useState(sector.label);
  const [kicker, setKicker] = useState(sector.kicker);
  const [emoji, setEmoji] = useState(sector.emoji);
  const [color, setColor] = useState(sector.color);
  const dirty =
    label !== sector.label || kicker !== sector.kicker || emoji !== sector.emoji || color !== sector.color;

  return (
    <aside className="absolute inset-x-0 bottom-0 z-30 mx-auto w-full max-w-md rounded-t-2xl border border-border bg-background/95 p-5 shadow-soft backdrop-blur-md md:bottom-6 md:rounded-2xl">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary">Edit main branch</p>
      <h2 className="mt-1 font-display text-2xl">Make it yours</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Rename this brain sector, change its icon and color, or restore the original. Nested maps stay where they are.
      </p>
      <div className="mt-4">
        <GlyphRow emoji={emoji} color={color} onEmoji={setEmoji} onColor={setColor} />
      </div>
      <label className="mt-3 block text-xs text-muted-foreground" htmlFor="sector-name">
        Name
      </label>
      <Input
        id="sector-name"
        autoFocus
        value={label}
        maxLength={32}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && label.trim()) onSave({ label, kicker, emoji, color });
          if (e.key === "Escape") onCancel();
        }}
      />
      <label className="mt-3 block text-xs text-muted-foreground" htmlFor="sector-kicker">
        Short description
      </label>
      <Input
        id="sector-kicker"
        value={kicker}
        maxLength={48}
        onChange={(e) => setKicker(e.target.value)}
        placeholder={fallback.kicker}
      />
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setLabel(fallback.label);
            setKicker(fallback.kicker);
            setEmoji(fallback.emoji);
            setColor(fallback.color);
          }}
        >
          Restore default
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={pending || !label.trim()}
          onClick={() => onSave({ label, kicker, emoji, color })}
        >
          {dirty ? "Save branch" : "Keep as is"}
        </Button>
      </div>
    </aside>
  );
}
