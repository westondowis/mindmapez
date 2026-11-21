import { lazy, Suspense, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, File, Folder, Loader2, X } from "lucide-react";
import type { Memory } from "@/lib/types";
import type { ArchiveEntry } from "@/lib/digestion/viewer-types";
import type { IngestItem } from "@/lib/ingest";
import { useMemoryMedia, MediaOverrideContext } from "./use-memory-media";
import { previewMemoryFromItem } from "./preview-memory";
import { dataUrlToBytes, formatSize, isPreviewMemory, Notice, ViewerFrame } from "./viewer-kit";

const MemoryViewer = lazy(() => import("./memory-viewer").then((m) => ({ default: m.MemoryViewer })));

type Props = { memory: Memory; compact?: boolean };
type Meta = { entries?: ArchiveEntry[]; totalBytes?: number; truncated?: boolean };
type Dir = { name: string; path: string; dirs: Map<string, Dir>; files: ArchiveEntry[] };

export function buildArchiveTree(entries: ArchiveEntry[]): Dir {
  const root: Dir = { name: "", path: "", dirs: new Map(), files: [] };
  for (const e of entries) {
    const parts = e.path.split("/").filter(Boolean);
    let cur = root;
    const dirParts = e.dir ? parts : parts.slice(0, -1);
    for (const p of dirParts) {
      let next = cur.dirs.get(p);
      if (!next) {
        next = { name: p, path: cur.path ? `${cur.path}/${p}` : p, dirs: new Map(), files: [] };
        cur.dirs.set(p, next);
      }
      cur = next;
    }
    if (!e.dir) cur.files.push(e);
  }
  return root;
}

function DirNode({ dir, depth, onOpen }: { dir: Dir; depth: number; onOpen: (e: ArchiveEntry) => void }) {
  const [open, setOpen] = useState(depth <= 1);
  const dirs = [...dir.dirs.values()].sort((a, b) => a.name.localeCompare(b.name));
  const files = [...dir.files].sort((a, b) => a.path.localeCompare(b.path));
  const body = (
    <ul>
      {dirs.map((d) => (
        <DirNode key={d.path} dir={d} depth={depth + 1} onOpen={onOpen} />
      ))}
      {files.map((f) => (
        <li key={f.path} style={{ paddingLeft: (depth + 1) * 14 }} className="flex items-center gap-2 py-0.5 text-sm">
          <File className="size-3.5 shrink-0 text-muted-foreground" />
          {f.previewable ? (
            <button type="button" onClick={() => onOpen(f)} className="min-w-0 flex-1 truncate text-left text-primary hover:underline">
              {f.path.split("/").pop()}
            </button>
          ) : (
            <span className="min-w-0 flex-1 truncate">{f.path.split("/").pop()}</span>
          )}
          <span className="shrink-0 text-xs text-muted-foreground">{formatSize(f.bytes)}</span>
        </li>
      ))}
    </ul>
  );
  if (depth === 0) return body;
  return (
    <li>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} style={{ paddingLeft: depth * 14 }} className="flex w-full items-center gap-1.5 py-0.5 text-left text-sm font-medium">
        <ChevronRight className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
        <Folder className="size-3.5 text-amber-500" /> {dir.name}
      </button>
      {open ? body : null}
    </li>
  );
}

export function ArchiveTreeView({ memory, compact }: Props) {
  const meta = memory.extractedMetadata as Meta;
  const entries = meta.entries ?? [];
  const media = useMemoryMedia(memory.id, memory.hasMedia);
  const tree = useMemo(() => buildArchiveTree(entries), [entries]);
  const qc = useQueryClient();
  const [preview, setPreview] = useState<{ entry: ArchiveEntry; item?: IngestItem; error?: string; saved?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const url = media.data?.mediaUrl ?? null;

  const open = async (entry: ArchiveEntry) => {
    if (!url) return;
    setPreview({ entry });
    try {
      const { openZip } = await import("@/lib/digestion/zip-guard");
      const { ARCHIVE_LIMITS } = await import("@/lib/digestion/limits");
      const { digestMultimodalFile } = await import("@/lib/digestion/dispatch");
      const zip = await openZip(dataUrlToBytes(url), ARCHIVE_LIMITS);
      const bytes = await zip.readBytes(entry.path, 3_000_000);
      const name = entry.path.split("/").pop() || entry.path;
      const item = await digestMultimodalFile(new globalThis.File([bytes as BlobPart], name));
      setPreview(item ? { entry, item } : { entry, error: "This entry can't be previewed." });
    } catch (err) {
      setPreview({ entry, error: err instanceof Error ? err.message : "This entry couldn't be read." });
    }
  };

  const saveEntry = async () => {
    if (!preview?.item) return;
    setBusy(true);
    try {
      const { saveIngestItem } = await import("@/lib/digestion/client-save");
      const res = await saveIngestItem(preview.item, {});
      if (res.ok) {
        setPreview({ ...preview, saved: "Saved as a new memory." });
        await Promise.all([qc.invalidateQueries({ queryKey: ["graph"] }), qc.invalidateQueries({ queryKey: ["memories"] }), qc.invalidateQueries({ queryKey: ["dashboard"] })]);
      } else setPreview({ ...preview, error: res.error });
    } finally {
      setBusy(false);
    }
  };

  const pm = useMemo(() => (preview?.item ? previewMemoryFromItem(preview.item) : null), [preview?.item]);
  const files = entries.filter((e) => !e.dir).length;

  return (
    <ViewerFrame compact={compact} toolbar={<span className="text-xs text-muted-foreground">{files} files · {formatSize(meta.totalBytes ?? 0)} uncompressed{meta.truncated ? " · list trimmed" : ""}</span>}>
      {!memory.hasMedia ? <Notice>Original over 3 MB, so only the file list is kept.</Notice> : null}
      <div className={`overflow-y-auto rounded-xl border border-border bg-card p-2 ${compact ? "max-h-64" : "max-h-[50dvh]"}`}>
        <DirNode dir={tree} depth={0} onOpen={(e) => void open(e)} />
      </div>
      {preview ? (
        <div className="mt-3 rounded-xl border border-border bg-background p-3">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-medium">{preview.entry.path}</p>
            {preview.item && !preview.saved && !isPreviewMemory(memory) && preview.item.viewerType ? (
              <button type="button" disabled={busy} onClick={() => void saveEntry()} className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50">
                {busy ? "Saving…" : "Save entry as memory"}
              </button>
            ) : null}
            <button type="button" aria-label="Close preview" onClick={() => setPreview(null)} className="rounded p-1 text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>
          {preview.saved ? <p className="mt-1 text-xs text-emerald-600">{preview.saved}</p> : null}
          {preview.error ? <p role="alert" className="mt-2 text-xs text-destructive">{preview.error}</p> : null}
          {!preview.item && !preview.error ? <Loader2 className="mt-2 size-4 animate-spin text-muted-foreground" /> : null}
          {pm && preview.item ? (
            preview.item.dataset ? (
              <p className="mt-2 text-sm text-muted-foreground">{preview.item.body}. Save it to explore the full dataset.</p>
            ) : (
              <MediaOverrideContext.Provider value={{ [pm.id]: preview.item.mediaUrl }}>
                <Suspense fallback={<Loader2 className="mt-2 size-4 animate-spin" />}>
                  <MemoryViewer memory={pm} compact />
                </Suspense>
              </MediaOverrideContext.Provider>
            )
          ) : null}
        </div>
      ) : null}
    </ViewerFrame>
  );
}
