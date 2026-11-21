/** Zip listing for the archive_tree viewer: guarded entries, sizes, and which ones can preview. Pure. */
import type { ArchiveEntry } from "./viewer-types.ts";
import { sniffRoute } from "./sniff.ts";
import type { GuardedZip } from "./zip-guard.ts";

export const ARCHIVE_LIST_MAX = 2000;
const PREVIEW_MAX_BYTES = 3_000_000;
const PREVIEWABLE = new Set(["csv", "tsv", "json", "yaml", "xml", "txt", "md", "image", "gif", "svg", "pdf", "docx", "rtf", "ics", "vcf", "eml", "kml", "gpx", "html"]);

export function isPreviewable(path: string, bytes: number): boolean {
  if (bytes > PREVIEW_MAX_BYTES) return false;
  // No nested zip expansion (zip, xlsx, kmz, epub stay listed only).
  return PREVIEWABLE.has(sniffRoute(path, ""));
}

export function listArchive(zip: GuardedZip): { entries: ArchiveEntry[]; totalBytes: number; truncated: boolean } {
  const entries: ArchiveEntry[] = zip.entries.slice(0, ARCHIVE_LIST_MAX).map((e) => ({
    path: e.path,
    bytes: e.bytes,
    compressed: e.compressed,
    dir: e.dir,
    previewable: !e.dir && isPreviewable(e.path, e.bytes),
  }));
  return { entries, totalBytes: zip.totalBytes, truncated: zip.entries.length > ARCHIVE_LIST_MAX };
}
