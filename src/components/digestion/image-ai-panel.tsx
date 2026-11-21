import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ClipboardCopy, ListChecks, Loader2, ScanText, Sparkles, Wand2 } from "lucide-react";
import type { Memory } from "@/lib/types";
import type { VisionMode } from "@/lib/digestion/vision-core";
import { analyzeImageMemory } from "@/lib/server/vision";
import { isPreviewMemory } from "./viewer-kit";

type Meta = { caption?: string; ocrText?: string; promptText?: string; heicNotice?: boolean };

/** Prompt / caption / OCR read from the image, plus actions that re-read it with AI vision. */
export function ImageAiPanel({ memory, compact }: { memory: Memory; compact?: boolean }) {
  const meta = memory.extractedMetadata as Meta;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<VisionMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const preview = isPreviewMemory(memory);

  const run = async (mode: VisionMode) => {
    setBusy(mode);
    setError(null);
    try {
      const res = await analyzeImageMemory({ data: { id: memory.id, mode } });
      if (!res.ok) setError(res.error);
      else await Promise.all([qc.invalidateQueries({ queryKey: ["memory", memory.id] }), qc.invalidateQueries({ queryKey: ["graph"] })]);
    } catch {
      setError("Couldn't reach the AI; try again");
    } finally {
      setBusy(null);
    }
  };

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const actions: { mode: VisionMode; label: string; icon: typeof Sparkles }[] = [
    { mode: "checklist", label: "To-do list", icon: ListChecks },
    { mode: "prompt", label: "Prompt", icon: Wand2 },
    { mode: "caption", label: "Caption", icon: Sparkles },
    { mode: "ocr", label: "Text (OCR)", icon: ScanText },
  ];

  return (
    <div className="mt-3 space-y-2">
      {meta.heicNotice ? <p className="text-xs text-muted-foreground">Converted from HEIC in this browser (stored as a web image).</p> : null}
      {meta.promptText ? (
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Prompt</span>
            <button type="button" onClick={() => void copy(meta.promptText!)} className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline">
              {copied ? <Check className="size-3.5" /> : <ClipboardCopy className="size-3.5" />} {copied ? "Copied" : "Copy"}
            </button>
            <button type="button" onClick={() => void navigate({ to: "/capture", search: { text: meta.promptText! } })} className="text-xs text-primary hover:underline">
              Use as new capture
            </button>
          </div>
          <pre className={`overflow-y-auto whitespace-pre-wrap font-sans text-sm ${compact ? "max-h-32" : "max-h-72"}`}>{meta.promptText}</pre>
        </div>
      ) : null}
      {meta.caption && !meta.promptText ? <p className="text-sm italic text-muted-foreground">{meta.caption}</p> : null}
      {meta.ocrText && !meta.promptText ? (
        <details className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Text in image</summary>
          <pre className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap font-sans">{meta.ocrText}</pre>
        </details>
      ) : null}
      {!preview && memory.hasMedia ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Read with AI:</span>
          {actions.map((a) => (
            <button key={a.mode} type="button" disabled={busy !== null} onClick={() => void run(a.mode)} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-50">
              {busy === a.mode ? <Loader2 className="size-3.5 animate-spin" /> : <a.icon className="size-3.5" />} {a.label}
            </button>
          ))}
        </div>
      ) : null}
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
