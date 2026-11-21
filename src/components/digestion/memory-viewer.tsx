import { lazy, Suspense } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import type { Memory } from "@/lib/types";
import { DigestViewer } from "./digest-viewer";
import { useMemoryMedia } from "./use-memory-media";

type Props = { memory: Memory; compact?: boolean };

// Each rich viewer is its own chunk, loaded only when a memory of that type is opened.
const HtmlAppView = lazy(() => import("./html-app-view").then((m) => ({ default: m.HtmlAppView })));
const StructuredTreeView = lazy(() => import("./structured-tree-view").then((m) => ({ default: m.StructuredTreeView })));
const SvgView = lazy(() => import("./svg-view").then((m) => ({ default: m.SvgView })));
const DocumentReaderView = lazy(() => import("./document-reader-view").then((m) => ({ default: m.DocumentReaderView })));
const CalendarEventView = lazy(() => import("./calendar-event-view").then((m) => ({ default: m.CalendarEventView })));
const EmailThreadView = lazy(() => import("./email-thread-view").then((m) => ({ default: m.EmailThreadView })));
const GeoMapView = lazy(() => import("./geo-map-view").then((m) => ({ default: m.GeoMapView })));
const ChecklistDigestView = lazy(() => import("./checklist-view").then((m) => ({ default: m.ChecklistDigestView })));
const MediaDigestView = lazy(() => import("./media-digest-view").then((m) => ({ default: m.MediaDigestView })));
const ImageAiPanel = lazy(() => import("./image-ai-panel").then((m) => ({ default: m.ImageAiPanel })));
const ArchiveTreeView = lazy(() => import("./archive-tree-view").then((m) => ({ default: m.ArchiveTreeView })));

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<Loader2 aria-label="Loading viewer" className="mt-4 size-4 animate-spin text-muted-foreground" />}>{children}</Suspense>;
}

/**
 * Adaptive viewer shell: picks the renderer from memories.viewer_type. Heavy originals (images,
 * recordings, files) are fetched lazily via getMemoryMedia only when the viewer is on screen.
 */
export function MemoryViewer({ memory, compact }: Props) {
  switch (memory.viewerType) {
    case "dataset":
    case "contacts_crm":
      return <DigestViewer memoryId={memory.id} />;
    case "image":
      return (
        <>
          <ImageViewer memory={memory} compact={compact} />
          <Lazy><ImageAiPanel memory={memory} compact={compact} /></Lazy>
        </>
      );
    case "interactive_checklist":
      return <Lazy><ChecklistDigestView memory={memory} compact={compact} /></Lazy>;
    case "media":
      return (memory.extractedMetadata as { v?: string }).v === "media" ? <Lazy><MediaDigestView memory={memory} compact={compact} /></Lazy> : <MediaViewer memory={memory} compact={compact} />;
    case "html_app":
      return <Lazy><HtmlAppView memory={memory} compact={compact} /></Lazy>;
    case "structured_tree":
      return <Lazy><StructuredTreeView memory={memory} compact={compact} /></Lazy>;
    case "svg_viewer":
      return <Lazy><SvgView memory={memory} compact={compact} /></Lazy>;
    case "document_reader":
      return <Lazy><DocumentReaderView memory={memory} compact={compact} /></Lazy>;
    case "calendar_event":
      return <Lazy><CalendarEventView memory={memory} compact={compact} /></Lazy>;
    case "email_thread":
      return <Lazy><EmailThreadView memory={memory} compact={compact} /></Lazy>;
    case "geo_map":
      return <Lazy><GeoMapView memory={memory} compact={compact} /></Lazy>;
    case "archive_tree":
      return <Lazy><ArchiveTreeView memory={memory} compact={compact} /></Lazy>;
    case "file":
      return (
        <>
          {(memory.extractedMetadata as { note?: string }).note ? (
            <p role="status" className="mt-4 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{String((memory.extractedMetadata as { note?: string }).note)}</p>
          ) : (
            <PlainText memory={memory} compact={compact} />
          )}
          <FileCard memory={memory} />
        </>
      );
    default:
      return <PlainViewer memory={memory} compact={compact} />;
  }
}

function PlainText({ memory, compact }: Props) {
  if (!memory.body) return null;
  return (
    <p className={compact ? "mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground/90" : "mt-6 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/90"}>
      {memory.body}
    </p>
  );
}

function Transcript({ memory, compact }: Props) {
  if (!memory.transcript) return null;
  return (
    <blockquote className={`${compact ? "mt-3 max-h-48 overflow-y-auto" : "mt-6"} border-l-2 border-primary/40 pl-4 text-sm italic text-muted-foreground`}>
      {memory.transcript}
    </blockquote>
  );
}

/** Legacy/plain memories: text plus whatever original was attached, chosen by MIME. */
function PlainViewer({ memory, compact }: Props) {
  const mime = memory.mediaMime ?? "";
  return (
    <>
      <PlainText memory={memory} compact={compact} />
      <Transcript memory={memory} compact={compact} />
      {memory.hasMedia ? (
        mime.startsWith("image/") ? <ImageViewer memory={memory} compact={compact} /> : mime.startsWith("audio/") || mime.startsWith("video/") ? <MediaPlayer memory={memory} compact={compact} /> : <FileCard memory={memory} />
      ) : null}
    </>
  );
}

function ImageViewer({ memory, compact }: Props) {
  const media = useMemoryMedia(memory.id, memory.hasMedia);
  const src = media.data?.mediaUrl ?? memory.thumbUrl;
  const meta = memory.extractedMetadata as { width?: number; height?: number };
  return (
    <figure className={compact ? "mt-3" : "mt-6"}>
      {src ? (
        <img
          src={src}
          alt={memory.title}
          width={meta.width}
          height={meta.height}
          className={`w-full rounded-xl bg-muted object-contain ${compact ? "max-h-56" : "max-h-[75dvh]"} ${media.data?.mediaUrl ? "" : "blur-[1px]"}`}
        />
      ) : (
        <div className="grid h-40 place-items-center rounded-xl bg-muted text-xs text-muted-foreground">{media.isPending ? "Loading image…" : "Image not stored"}</div>
      )}
      {memory.body && memory.body !== memory.title && !(meta as { caption?: string; ocrText?: string; promptText?: string }).caption && !(meta as { ocrText?: string }).ocrText && !(meta as { promptText?: string }).promptText ? <figcaption className="mt-2 text-sm text-muted-foreground">{memory.body}</figcaption> : null}
    </figure>
  );
}

function MediaPlayer({ memory, compact }: Props) {
  const media = useMemoryMedia(memory.id, memory.hasMedia);
  const url = media.data?.mediaUrl;
  if (!memory.hasMedia) return null;
  if (!url) return <p role="status" className="mt-3 text-xs text-muted-foreground">{media.isPending ? "Loading recording…" : "Recording unavailable"}</p>;
  return (memory.mediaMime ?? "").startsWith("video/") ? (
    <video className={`${compact ? "mt-4" : "mt-6"} w-full rounded-xl`} controls preload="metadata" src={url} poster={memory.thumbUrl ?? undefined} />
  ) : (
    <audio className={`${compact ? "mt-4" : "mt-6"} w-full`} controls preload="metadata" src={url} />
  );
}

function MediaViewer({ memory, compact }: Props) {
  return (
    <>
      <MediaPlayer memory={memory} compact={compact} />
      <Transcript memory={memory} compact={compact} />
      <PlainText memory={memory} compact={compact} />
    </>
  );
}

function FileCard({ memory }: { memory: Memory }) {
  const media = useMemoryMedia(memory.id, memory.hasMedia);
  const url = media.data?.mediaUrl;
  return (
    <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <FileText className="size-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{memory.mediaName || "Attached file"}</p>
        <p className="text-xs text-muted-foreground">{memory.mediaMime || "file"}{memory.hasMedia ? "" : " · original not stored (over 3 MB)"}</p>
      </div>
      {url ? (
        <a href={url} download={memory.mediaName ?? "file"} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <Download className="size-4" /> Download
        </a>
      ) : null}
    </div>
  );
}
