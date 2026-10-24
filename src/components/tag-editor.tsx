import { Sparkles, X } from "lucide-react";
import { useState } from "react";
import { normalizeTags } from "@/lib/tags";
import { cn } from "@/lib/utils";

export function TagEditor({
  tags,
  onChange,
  onSuggest,
  suggesting,
  hint = "AI tags this node. Add or remove anything you want.",
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  onSuggest?: () => void;
  suggesting?: boolean;
  hint?: string;
}) {
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const next = normalizeTags([...tags, raw]);
    onChange(next);
    setDraft("");
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Tags</p>
        {onSuggest ? (
          <button
            type="button"
            onClick={onSuggest}
            disabled={suggesting}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-60"
          >
            <Sparkles className="size-3" />
            {suggesting ? "Generating…" : "Regenerate with AI"}
          </button>
        ) : null}
      </div>
      <div className="mt-2 flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-card px-2 py-1.5">
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full bg-primary/15 py-1 pl-2.5 pr-1 text-xs text-primary"
          >
            {t}
            <button
              type="button"
              aria-label={`Remove ${t}`}
              onClick={() => onChange(tags.filter((x) => x !== t))}
              className="flex size-5 items-center justify-center rounded-full hover:bg-primary/20"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              if (draft.trim()) add(draft);
            }
            if (e.key === "Backspace" && !draft && tags.length) {
              onChange(tags.slice(0, -1));
            }
          }}
          onBlur={() => {
            if (draft.trim()) add(draft);
          }}
          placeholder={tags.length ? "Add a tag" : "Add a tag or let AI name them"}
          className={cn("h-8 min-w-32 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground")}
        />
      </div>
      {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
