import type { IngestItem } from "@/lib/ingest";
import type { Memory } from "@/lib/types";
import { PREVIEW_PREFIX } from "./viewer-kit";

let seq = 0;

/** A not-yet-saved item shaped as a Memory so MemoryViewer can render it (preview mode, never saved). */
export function previewMemoryFromItem(item: IngestItem): Memory {
  const now = new Date().toISOString();
  const memory: Memory = {
    id: `${PREVIEW_PREFIX}${++seq}`,
    title: item.title || item.mediaName || "Preview",
    memoryType: item.memoryType === "dataset" ? "document" : (item.memoryType ?? "document"),
    viewerType: item.viewerType ?? "plain",
    emotion: null,
    importance: 0,
    aiImpact: "low",
    aiSummary: null,
    snippet: item.body.slice(0, 280),
    contentLength: item.body.length,
    thumbUrl: item.thumbDataUrl ?? null,
    hasMedia: Boolean(item.mediaUrl),
    mediaMime: item.mediaMime,
    mediaName: item.mediaName,
    nodeKind: "idea",
    tags: [],
    accessCount: 0,
    positionX: null,
    positionY: null,
    emoji: null,
    color: null,
    sourceUrl: item.sourceUrl,
    sourceKind: null,
    createdAt: now,
    updatedAt: now,
    body: item.body,
    transcript: item.transcript ?? null,
    mediaUrl: item.mediaUrl,
    extractedMetadata: item.extractedMetadata ?? {},
    artifactState: item.artifactState ?? {},
  };
  return memory;
}
