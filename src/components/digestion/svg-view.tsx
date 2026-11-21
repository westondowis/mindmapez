import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import type { Memory } from "@/lib/types";
import { useMemoryMedia } from "./use-memory-media";
import { Notice, ViewerFrame } from "./viewer-kit";

type Props = { memory: Memory; compact?: boolean };

/** SVG renders only through <img src="data:image/svg+xml…"> (scripts never run); never inlined. */
export function SvgView({ memory, compact }: Props) {
  const media = useMemoryMedia(memory.id, memory.hasMedia);
  const [zoom, setZoom] = useState(1);
  const meta = memory.extractedMetadata as { width?: number; height?: number; texts?: string[] };
  const raw = media.data?.mediaUrl ?? null;
  const src = raw && raw.startsWith("data:image/svg+xml") ? raw : memory.thumbUrl;
  return (
    <ViewerFrame
      compact={compact}
      toolbar={
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <button type="button" aria-label="Zoom out" className="rounded border border-border p-1 hover:text-foreground" onClick={() => setZoom((z) => Math.max(0.25, z / 1.5))}>
            <Minus className="size-3.5" />
          </button>
          <span className="w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button type="button" aria-label="Zoom in" className="rounded border border-border p-1 hover:text-foreground" onClick={() => setZoom((z) => Math.min(8, z * 1.5))}>
            <Plus className="size-3.5" />
          </button>
          {meta.width && meta.height ? <span className="ml-2">{Math.round(meta.width)}×{Math.round(meta.height)}</span> : null}
        </div>
      }
    >
      {src ? (
        <div className={`overflow-auto rounded-xl border border-border bg-[repeating-conic-gradient(#f1f1f1_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] p-2 ${compact ? "max-h-64" : "max-h-[75dvh]"}`}>
          <img src={src} alt={memory.title} style={{ width: `${zoom * 100}%`, maxWidth: "none" }} className="mx-auto block" />
        </div>
      ) : (
        <Notice>{media.isPending && memory.hasMedia ? "Loading drawing…" : "The SVG isn't stored."}</Notice>
      )}
      {meta.texts?.length ? <p className="mt-2 text-xs text-muted-foreground">Text in drawing: {meta.texts.slice(0, 30).join(" · ")}</p> : null}
    </ViewerFrame>
  );
}
