/**
 * Unified multimodal dispatcher (digestMultimodalFile). Routes every upload by extension + MIME +
 * magic bytes to its parser, producing an IngestItem with its adaptive viewer_type, extracted
 * metadata and preview thumbnail. Returns null only for routes that keep the plain text/file path.
 */
import { blobToDataUrl } from "../utils.ts";
import type { IngestItem } from "../ingest.ts";
import { clipText, formatBytes, titleFromFilename } from "../ingest.ts";
import { buildDatasetDraft } from "./dataset-draft.ts";
import { ARCHETYPE_LABEL } from "./detect.ts";
import { makeImageVariants } from "./image.ts";
import { decodeXmlEntities } from "./xml-scan.ts";
import { openZip } from "./zip-guard.ts";
import { sniffRoute, type Route } from "./sniff.ts";
import { INLINE_ORIGINAL_MAX_BYTES, type JsonObject } from "./viewer-types.ts";

function base(file: File, over: Partial<IngestItem>): IngestItem {
  return {
    kind: "rich",
    title: titleFromFilename(file.name),
    body: "",
    mediaUrl: null,
    mediaMime: file.type || null,
    mediaName: file.name,
    sourceUrl: null,
    truncated: false,
    bytes: file.size,
    ...over,
  };
}

function errorItem(file: File, warning: string): IngestItem {
  return base(file, { kind: "document", warning });
}

async function headBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, 64).arrayBuffer());
}

export async function routeOf(file: File): Promise<Route> {
  return sniffRoute(file.name, file.type, await headBytes(file));
}

async function digestDataset(file: File, format: "csv" | "tsv" | "xlsx" | "json", text?: string): Promise<IngestItem | null> {
  const draft = await buildDatasetDraft(file, format, text);
  if ("notTabular" in draft) return null;
  if ("error" in draft) return errorItem(file, draft.error);
  const label = ARCHETYPE_LABEL[draft.schema.archetype];
  return base(file, {
    kind: "dataset",
    memoryType: "dataset",
    viewerType: "dataset",
    body: `${label} · ${draft.rows.length.toLocaleString()} rows`,
    dataset: draft,
    truncated: draft.truncated,
    warning: draft.truncated ? `Kept the first 100,000 rows of ${file.name}.` : undefined,
  });
}

async function digestImage(file: File, keepOriginal: boolean): Promise<IngestItem> {
  try {
    const v = await makeImageVariants(file);
    // Animated GIFs keep their original bytes when they fit; everything else stores the
    // re-encoded display copy (smaller, EXIF/GPS stripped).
    const original = keepOriginal && file.size <= INLINE_ORIGINAL_MAX_BYTES ? await blobToDataUrl(file) : null;
    const mediaUrl = original ?? v.display;
    const meta: JsonObject = { v: "image", width: v.width, height: v.height };
    return base(file, {
      memoryType: "photo",
      viewerType: "image",
      mediaUrl,
      mediaMime: original ? file.type || "image/gif" : mediaUrl?.slice(5, mediaUrl.indexOf(";")) || file.type,
      thumbDataUrl: v.thumb,
      extractedMetadata: meta,
      body: "",
      warning: mediaUrl ? undefined : `${file.name} is too large to store even after resizing.`,
    });
  } catch (err) {
    return errorItem(file, err instanceof Error ? err.message : `${file.name} could not be read`);
  }
}

/** Word .docx: paragraph text from word/document.xml through the guarded zip reader. */
async function digestDocxText(file: File): Promise<IngestItem> {
  try {
    const zip = await openZip(await file.arrayBuffer());
    if (!zip.has("word/document.xml")) return errorItem(file, `${file.name} is not a Word document`);
    const xml = await zip.readText("word/document.xml", 20_000_000);
    const text = decodeXmlEntities(
      xml
        .replace(/<w:tab\/>/g, "\t")
        .replace(/<w:br\/>|<\/w:p>/g, "\n")
        .replace(/<[^>]+>/g, ""),
    )
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    const clamped = clipText(text, file.name);
    const original = file.size <= INLINE_ORIGINAL_MAX_BYTES ? await blobToDataUrl(file) : null;
    return base(file, {
      kind: "document",
      viewerType: "file",
      memoryType: "document",
      body: clamped.body,
      truncated: clamped.truncated,
      mediaUrl: original,
      warning: clamped.warning ?? (original ? undefined : `${file.name} is over 3 MB, so only its text is saved.`),
    });
  } catch (err) {
    return errorItem(file, err instanceof Error ? err.message : `${file.name} could not be read`);
  }
}

export async function digestMultimodalFile(file: File): Promise<IngestItem | null> {
  const route = await routeOf(file);
  switch (route) {
    case "csv":
    case "tsv":
    case "xlsx":
      return digestDataset(file, route);
    case "json":
      if (file.size > 25 * 1024 * 1024) return errorItem(file, `${file.name} is ${formatBytes(file.size)}; the limit is 25 MB`);
      return digestDataset(file, "json");
    case "image":
      return digestImage(file, false);
    case "gif":
      return digestImage(file, true);
    case "docx":
      return digestDocxText(file);
    default:
      return null;
  }
}
