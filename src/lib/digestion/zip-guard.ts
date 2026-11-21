/**
 * Guarded zip access for xlsx/docx/epub/kmz/zip. jszip only reads the central directory on load;
 * this wrapper rejects archives with too many entries, unsafe paths (zip-slip), oversized declared
 * totals or extreme compression ratios, and reads entries through a byte-counting stream that aborts
 * past the cap, so a lying header cannot inflate a zip bomb in memory.
 */
import type JSZip from "jszip";
import { ARCHIVE_LIMITS } from "./limits.ts";
import type { ArchiveEntry } from "./viewer-types.ts";

export class ArchiveError extends Error {}

type Limits = { maxEntries: number; maxTotalUncompressed: number; maxRatio: number; maxEntryBytes: number };
type Sizes = { compressedSize?: number; uncompressedSize?: number };

/** Rejects "..", absolute paths, backslash roots, drive letters and NUL. Returns the normalized path. */
export function safeArchivePath(name: string): string | null {
  if (!name || name.includes("\0")) return null;
  const unified = name.replace(/\\/g, "/");
  if (unified.startsWith("/") || /^[a-zA-Z]:/.test(unified)) return null;
  const parts = unified.split("/");
  if (parts.some((p) => p === "..")) return null;
  return parts.filter((p) => p && p !== ".").join("/") + (unified.endsWith("/") ? "/" : "");
}

export type GuardedZip = {
  entries: ArchiveEntry[];
  totalBytes: number;
  has(path: string): boolean;
  readText(path: string, maxBytes?: number): Promise<string>;
  readBytes(path: string, maxBytes?: number): Promise<Uint8Array>;
};

type StreamHelper = {
  on(ev: "data", cb: (chunk: Uint8Array) => void): StreamHelper;
  on(ev: "end", cb: () => void): StreamHelper;
  on(ev: "error", cb: (e: Error) => void): StreamHelper;
  pause(): StreamHelper;
  resume(): StreamHelper;
};

export async function openZip(data: ArrayBuffer | Uint8Array, limits: Limits = ARCHIVE_LIMITS, previewable: (path: string) => boolean = () => false): Promise<GuardedZip> {
  const { default: JSZipCtor } = await import("jszip");
  let zip: JSZip;
  try {
    zip = await JSZipCtor.loadAsync(data);
  } catch {
    throw new ArchiveError("This file is not a readable zip archive");
  }
  const files = Object.values(zip.files);
  if (files.length > limits.maxEntries) throw new ArchiveError(`Archive has ${files.length} entries (limit ${limits.maxEntries})`);
  const entries: ArchiveEntry[] = [];
  const byPath = new Map<string, JSZip.JSZipObject>();
  let total = 0;
  for (const f of files) {
    const original = f.unsafeOriginalName ?? f.name;
    const path = safeArchivePath(original);
    if (path === null) throw new ArchiveError("Archive contains an unsafe path");
    const sizes = (f as unknown as { _data?: Sizes })._data ?? {};
    const bytes = Number(sizes.uncompressedSize ?? 0);
    const compressed = Number(sizes.compressedSize ?? 0);
    if (!f.dir) {
      if (bytes > limits.maxEntryBytes) throw new ArchiveError(`${path} is larger than ${Math.round(limits.maxEntryBytes / 1048576)} MB unpacked`);
      if (bytes > 1_048_576 && compressed > 0 && bytes / compressed > limits.maxRatio) throw new ArchiveError(`${path} has a suspicious compression ratio`);
      total += bytes;
      if (total > limits.maxTotalUncompressed) throw new ArchiveError("Archive unpacks to more than 100 MB");
    }
    entries.push({ path, bytes, compressed, dir: f.dir, previewable: !f.dir && previewable(path) });
    byPath.set(path, f);
  }
  let readTotal = 0;
  const read = (path: string, maxBytes: number): Promise<Uint8Array> => {
    const f = byPath.get(path) ?? byPath.get(path.replace(/^\/+/, ""));
    if (!f || f.dir) return Promise.reject(new ArchiveError(`Missing ${path}`));
    const cap = Math.min(maxBytes, limits.maxEntryBytes);
    return new Promise((resolve, reject) => {
      const chunks: Uint8Array[] = [];
      let n = 0;
      let done = false;
      const helper = (f as unknown as { internalStream(t: "uint8array"): StreamHelper }).internalStream("uint8array");
      helper
        .on("data", (chunk) => {
          if (done) return;
          n += chunk.length;
          readTotal += chunk.length;
          if (n > cap || readTotal > limits.maxTotalUncompressed) {
            done = true;
            helper.pause();
            reject(new ArchiveError(`${path} unpacks past the size limit`));
            return;
          }
          chunks.push(chunk);
        })
        .on("error", (e) => {
          if (done) return;
          done = true;
          reject(new ArchiveError(e.message || "Corrupt archive entry"));
        })
        .on("end", () => {
          if (done) return;
          done = true;
          const out = new Uint8Array(n);
          let o = 0;
          for (const c of chunks) {
            out.set(c, o);
            o += c.length;
          }
          resolve(out);
        })
        .resume();
    });
  };
  return {
    entries,
    totalBytes: total,
    has: (p) => byPath.has(p),
    readBytes: (p, max = limits.maxEntryBytes) => read(p, max),
    readText: async (p, max = limits.maxEntryBytes) => new TextDecoder("utf-8").decode(await read(p, max)),
  };
}
