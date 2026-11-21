import { Download, FileText } from "lucide-react";
import type { Memory } from "@/lib/types";
import { DigestViewer } from "./digest-viewer";
import { useMemoryMedia } from "./use-memory-media";

type Props = { memory: Memory; compact?: boolean };

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
      return <ImageViewer memory={memory} compact={compact} />;
    case "media":
      return <MediaViewer memory={memory} compact={compact} />;
    case "file":
      return (
        <>
          <PlainText memory={memory} compact={compact} />
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
      {memory.body && memory.body !== memory.title ? <figcaption className="mt-2 text-sm text-muted-foreground">{memory.body}</figcaption> : null}
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
