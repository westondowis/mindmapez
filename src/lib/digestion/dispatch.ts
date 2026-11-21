/**
 * Unified multimodal dispatcher (digestMultimodalFile). Routes every upload by extension + MIME +
 * magic bytes to its parser, producing an IngestItem with its adaptive viewer_type, extracted
 * metadata and preview thumbnail. All parsing runs in the browser; the server re-validates.
 * Returns null only for routes that keep the plain path (audio/video/HEIC until v5.37).
 */
import { blobToDataUrl } from "../utils.ts";
import type { IngestItem } from "../ingest.ts";
import { clipText, formatBytes, titleFromFilename } from "../ingest.ts";
import { buildDatasetDraft, draftFromTable } from "./dataset-draft.ts";
import { ARCHETYPE_LABEL } from "./detect.ts";
import { fitMetadata, overRequestBudget } from "./fit.ts";
import { makeImageVariants, thumbFromCanvas, thumbFromUrl } from "./image.ts";
import { ARCHIVE_LIMITS, DATASET_LIMITS, EMAIL_LIMITS, XML_LIMITS } from "./limits.ts";
import { sniffRoute, type Route } from "./sniff.ts";
import { INLINE_ORIGINAL_MAX_BYTES, type JsonObject, type JsonValue, type OutlineEntry, type ViewerType } from "./viewer-types.ts";

const TEXT_MAX_BYTES = 25 * 1024 * 1024;

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

function errText(err: unknown, file: File): string {
  return err instanceof Error && err.message ? `${file.name}: ${err.message}` : `${file.name} could not be read`;
}

async function headBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, 64).arrayBuffer());
}

export async function routeOf(file: File): Promise<Route> {
  return sniffRoute(file.name, file.type, await headBytes(file));
}

async function originalOf(file: File, mime?: string): Promise<string | null> {
  if (file.size > INLINE_ORIGINAL_MAX_BYTES) return null;
  const url = await blobToDataUrl(file);
  return mime ? url.replace(/^data:[^;,]*/, `data:${mime}`) : url;
}

function richItem(file: File, viewerType: ViewerType, meta: JsonObject, over: Partial<IngestItem>): IngestItem {
  const fitted = fitMetadata(meta);
  if (fitted.shrunk && "truncated" in fitted.meta) (fitted.meta as JsonObject).truncated = true;
  const clipped = clipText(over.body ?? "", file.name);
  let dropped = false;
  if (over.mediaUrl && overRequestBudget({ mediaUrl: over.mediaUrl, meta: fitted.meta, body: clipped.body, thumb: over.thumbDataUrl })) {
    // Original + extracted details together would exceed the upload limit: keep the details.
    over = { ...over, mediaUrl: null };
    if ("originalStored" in fitted.meta) (fitted.meta as JsonObject).originalStored = false;
    dropped = true;
  }
  return base(file, {
    memoryType: "document",
    viewerType,
    extractedMetadata: fitted.meta,
    ...over,
    body: clipped.body,
    truncated: clipped.truncated || over.truncated || false,
    warning:
      over.warning ??
      clipped.warning ??
      (dropped ? `${file.name}: the original plus its details exceed the upload limit, so only the details are saved.` : fitted.shrunk ? `${file.name} was large, so its preview was trimmed.` : undefined),
  });
}

async function textOf(file: File, max = TEXT_MAX_BYTES): Promise<string> {
  if (file.size > max) throw new Error(`is ${formatBytes(file.size)}; the limit is ${formatBytes(max)}`);
  return file.text();
}

// ── Tables ────────────────────────────────────────────────────────────────────

async function digestDataset(file: File, format: "csv" | "tsv" | "xlsx" | "json", text?: string): Promise<IngestItem | { notTabular: unknown }> {
  const draft = await buildDatasetDraft(file, format, text);
  if ("notTabular" in draft) return draft;
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

async function digestVcf(file: File): Promise<IngestItem> {
  const { parseVcards } = await import("./vcard.ts");
  const table = parseVcards(await textOf(file));
  if (!table.rows.length) return errorItem(file, `${file.name} has no contacts`);
  const draft = draftFromTable("vcf", file.name, { headers: table.headers, rows: table.rows }, table.truncated);
  if ("error" in draft) return errorItem(file, draft.error);
  const notes = [table.photosDropped ? `${table.photosDropped} embedded photo${table.photosDropped === 1 ? "" : "s"} over 256 KB skipped` : "", table.truncated ? "kept the first 5,000 contacts" : ""].filter(Boolean);
  return base(file, {
    kind: "dataset",
    memoryType: "dataset",
    viewerType: "contacts_crm",
    body: `Contacts · ${draft.rows.length.toLocaleString()} people`,
    dataset: draft,
    truncated: table.truncated,
    warning: notes.length ? `${file.name}: ${notes.join("; ")}.` : undefined,
  });
}

// ── Images ────────────────────────────────────────────────────────────────────

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

async function digestSvg(file: File): Promise<IngestItem> {
  if (file.size > INLINE_ORIGINAL_MAX_BYTES) return errorItem(file, `${file.name} is over 3 MB; SVGs are stored whole so they can render`);
  const text = await file.text();
  const { parseXml, findAll, textOf: xmlText, rootElement } = await import("./xml-lite.ts");
  const doc = parseXml(text, XML_LIMITS);
  const root = rootElement(doc);
  if (!root || !/(^|:)svg$/.test(root.name)) return errorItem(file, `${file.name} is not an SVG image`);
  const texts = ["title", "desc", "text"].flatMap((n) => findAll(doc, n).map((x) => xmlText(x).trim())).filter(Boolean).slice(0, 200).map((t) => t.slice(0, 300));
  // Rendered only through <img src="data:image/svg+xml…">, which never runs scripts.
  const mediaUrl = await originalOf(file, "image/svg+xml");
  const t = mediaUrl ? await thumbFromUrl(mediaUrl) : { thumb: null, width: 0, height: 0 };
  const num = (v?: string) => (v && Number.isFinite(parseFloat(v)) ? parseFloat(v) : undefined);
  const meta: JsonObject = { v: "svg_viewer", texts };
  const w = num(root.attrs.width) ?? (t.width || undefined);
  const h = num(root.attrs.height) ?? (t.height || undefined);
  if (w) meta.width = w;
  if (h) meta.height = h;
  return richItem(file, "svg_viewer", meta, { memoryType: "photo", mediaUrl, mediaMime: "image/svg+xml", thumbDataUrl: t.thumb, body: texts.join("\n") });
}

// ── Structured data ───────────────────────────────────────────────────────────

async function treeItem(file: File, format: "json" | "yaml" | "xml", value: JsonValue | null, rawText: string, rawReason?: string): Promise<IngestItem> {
  const { jsonToTree, treeText } = await import("./tree.ts");
  if (value === null && rawReason) {
    return richItem(file, "structured_tree", { v: "structured_tree", format, nodes: 0, depth: 0, truncated: false, raw: true, tree: null }, {
      body: rawText,
      mediaUrl: await originalOf(file),
      warning: `${file.name}: ${rawReason}. Showing the raw text.`,
    });
  }
  const t = jsonToTree(value);
  return richItem(file, "structured_tree", { v: "structured_tree", format, nodes: t.nodes, depth: t.depth, truncated: t.truncated, tree: t.tree as unknown as JsonObject }, {
    body: treeText(t.tree),
    mediaUrl: await originalOf(file),
  });
}

async function digestJson(file: File): Promise<IngestItem> {
  if (file.size > DATASET_LIMITS.maxFileBytes) return errorItem(file, `${file.name} is ${formatBytes(file.size)}; the limit is 25 MB`);
  const text = await file.text();
  const res = await digestDataset(file, "json", text);
  if (!("notTabular" in res)) return res;
  const value = res.notTabular as JsonValue;
  const geo = await import("./geo.ts");
  if (geo.isGeoJson(value)) return geoItem(file, geo.parseGeoJson(value), geo.geoText);
  return treeItem(file, "json", value, text);
}

async function digestYaml(file: File): Promise<IngestItem> {
  const text = await textOf(file, XML_LIMITS.maxBytes);
  const { parseYamlSubset } = await import("./yaml-lite.ts");
  try {
    return await treeItem(file, "yaml", parseYamlSubset(text), text);
  } catch (err) {
    return treeItem(file, "yaml", null, text, err instanceof Error ? err.message : "Unsupported YAML");
  }
}

async function digestXml(file: File): Promise<IngestItem> {
  const text = await textOf(file, XML_LIMITS.maxBytes);
  const { parseXml, rootElement, localName } = await import("./xml-lite.ts");
  const doc = parseXml(text, XML_LIMITS);
  const root = rootElement(doc);
  if (!root) return errorItem(file, `${file.name} has no XML elements`);
  const name = localName(root.name).toLowerCase();
  if (name === "kml" || name === "gpx") {
    const geo = await import("./geo.ts");
    return geoItem(file, name === "kml" ? geo.parseKml(text) : geo.parseGpx(text), geo.geoText);
  }
  if (name === "svg") return digestSvg(file);
  const { xmlToTree, treeText } = await import("./tree.ts");
  const t = xmlToTree(root);
  return richItem(file, "structured_tree", { v: "structured_tree", format: "xml", nodes: t.nodes, depth: t.depth, truncated: t.truncated, tree: t.tree as unknown as JsonObject }, {
    body: treeText(t.tree),
    mediaUrl: await originalOf(file, "application/xml"),
  });
}

// ── Web apps ──────────────────────────────────────────────────────────────────

async function digestHtml(file: File): Promise<IngestItem> {
  if (file.size > INLINE_ORIGINAL_MAX_BYTES) return errorItem(file, `${file.name} is over 3 MB; HTML apps are stored whole so they can run`);
  const html = await file.text();
  const { htmlHasScripts, htmlTitle } = await import("./html-app.ts");
  const { htmlToPlainText } = await import("./sanitize-html.ts");
  const title = htmlTitle(html);
  const meta: JsonObject = { v: "html_app", bytes: file.size, hasScripts: htmlHasScripts(html) };
  if (title) meta.title = title;
  return richItem(file, "html_app", meta, {
    title: title ?? titleFromFilename(file.name),
    body: htmlToPlainText(html),
    mediaUrl: await originalOf(file, "text/html"),
    mediaMime: "text/html",
  });
}

// ── Documents ─────────────────────────────────────────────────────────────────

type DocFormat = "pdf" | "docx" | "doc" | "rtf" | "epub" | "txt" | "md";

async function docItem(file: File, format: DocFormat, text: string, outline: OutlineEntry[], extra: { pages?: number; lossy?: boolean; title?: string; thumb?: string | null; truncated?: boolean } = {}): Promise<IngestItem> {
  if (!text.trim()) return errorItem(file, `${file.name} has no readable text`);
  const original = await originalOf(file);
  const meta: JsonObject = {
    v: "document_reader",
    format,
    words: text.split(/\s+/).filter(Boolean).length,
    outline: outline as unknown as JsonValue,
    originalStored: Boolean(original),
  };
  if (extra.pages) meta.pages = extra.pages;
  if (extra.lossy) meta.lossy = true;
  const notes = [extra.lossy ? "best-effort text from a legacy .doc" : "", original ? "" : "original over 3 MB, so only its text is saved", extra.truncated ? "very long, text was trimmed" : ""].filter(Boolean);
  return richItem(file, "document_reader", meta, {
    kind: "document",
    title: extra.title || titleFromFilename(file.name),
    body: text,
    mediaUrl: original,
    thumbDataUrl: extra.thumb ?? null,
    truncated: extra.truncated,
    warning: notes.length ? `${file.name}: ${notes.join("; ")}.` : undefined,
  });
}

async function digestDocument(file: File, route: DocFormat): Promise<IngestItem> {
  switch (route) {
    case "pdf": {
      const { digestPdf, PDF_LIMITS } = await import("./pdf.ts");
      if (file.size > PDF_LIMITS.maxBytes) return errorItem(file, `${file.name} is ${formatBytes(file.size)}; the PDF limit is 50 MB`);
      const d = await digestPdf(await file.arrayBuffer(), thumbFromCanvas);
      if (!d.text.replace(/\[Page \d+\]/g, "").trim()) return errorItem(file, `${file.name} has no selectable text (scanned PDFs need OCR, coming with screenshot vision)`);
      return docItem(file, "pdf", d.text, d.outline, { pages: d.pages, title: d.title, thumb: d.thumb, truncated: d.truncated });
    }
    case "docx": {
      const { openZip } = await import("./zip-guard.ts");
      const { docxToDoc } = await import("./docx.ts");
      const d = await docxToDoc(await openZip(await file.arrayBuffer(), ARCHIVE_LIMITS));
      return docItem(file, "docx", d.text, d.outline, { title: d.title });
    }
    case "epub": {
      const { openZip } = await import("./zip-guard.ts");
      const { epubToDoc } = await import("./epub.ts");
      const d = await epubToDoc(await openZip(await file.arrayBuffer(), ARCHIVE_LIMITS));
      return docItem(file, "epub", d.text, d.outline, { title: d.title });
    }
    case "doc": {
      if (file.size > TEXT_MAX_BYTES) return errorItem(file, `${file.name} is larger than 25 MB`);
      const { scrapeDocText } = await import("./doc-scrape.ts");
      return docItem(file, "doc", scrapeDocText(new Uint8Array(await file.arrayBuffer())), [], { lossy: true });
    }
    case "rtf": {
      const { rtfToText } = await import("./rtf.ts");
      return docItem(file, "rtf", rtfToText(await textOf(file)), []);
    }
    case "md": {
      const { markdownOutline } = await import("./markdown.ts");
      const text = await textOf(file);
      return docItem(file, "md", text, markdownOutline(text));
    }
    case "txt":
      return docItem(file, "txt", await textOf(file), []);
  }
}

// ── Calendar, email, geo, archives ───────────────────────────────────────────

async function digestIcs(file: File): Promise<IngestItem> {
  const { parseIcs } = await import("./ics.ts");
  const events = parseIcs(await textOf(file, 10 * 1024 * 1024));
  if (!events.length) return errorItem(file, `${file.name} has no events`);
  const when = (iso: string) => iso.replace("T", " ").slice(0, 16);
  return richItem(file, "calendar_event", { v: "calendar_event", events: events as unknown as JsonValue }, {
    memoryType: "text",
    title: events.length === 1 ? events[0]!.summary.slice(0, 160) : `${events.length} calendar events`,
    body: events.map((e) => [e.summary, when(e.start), e.location, e.description].filter(Boolean).join(" · ")).join("\n"),
    mediaUrl: await originalOf(file, "text/calendar"),
    mediaMime: "text/calendar",
  });
}

async function emailItem(file: File, raws: string[], truncated: boolean): Promise<IngestItem> {
  const { parseEml } = await import("./mime.ts");
  const messages = [];
  for (let i = 0; i < raws.length; i++) {
    try {
      messages.push(parseEml(raws[i]!, `m${i}`));
    } catch {
      // Skip unreadable messages inside an mbox.
    }
    if (i % 25 === 24) await new Promise((r) => setTimeout(r, 0));
  }
  if (!messages.length) return errorItem(file, `${file.name} has no readable messages`);
  messages.sort((a, b) => a.date.localeCompare(b.date));
  const first = messages[0]!;
  return richItem(file, "email_thread", { v: "email_thread", messages: messages as unknown as JsonValue, truncated }, {
    memoryType: "text",
    title: (first.subject || titleFromFilename(file.name)).slice(0, 160),
    body: messages.map((m) => `From ${m.from} · ${m.subject}\n${m.text}`).join("\n\n"),
    mediaUrl: await originalOf(file, "message/rfc822"),
    warning: truncated ? `${file.name}: kept the first ${EMAIL_LIMITS.maxMessages} messages.` : undefined,
  });
}

async function digestEmail(file: File, route: "eml" | "mbox"): Promise<IngestItem> {
  if (file.size > TEXT_MAX_BYTES) return errorItem(file, `${file.name} is larger than 25 MB`);
  const { binaryString, splitMbox } = await import("./mime.ts");
  const raw = binaryString(new Uint8Array(await file.arrayBuffer()));
  if (route === "eml") return emailItem(file, [raw], false);
  const { messages, truncated } = splitMbox(raw);
  return emailItem(file, messages, truncated);
}

function geoItem(file: File, r: import("./geo.ts").GeoResult, geoText: (r: import("./geo.ts").GeoResult) => string): IngestItem | Promise<IngestItem> {
  if (!r.features.length) return errorItem(file, `${file.name} has no points or tracks`);
  const km = r.features.reduce((s, f) => s + (f.lengthKm ?? 0), 0);
  const points = r.features.filter((f) => f.kind === "point").length;
  return (async () =>
    richItem(file, "geo_map", { v: "geo_map", bbox: r.bbox, features: r.features as unknown as JsonValue, truncated: r.truncated }, {
      memoryType: "text",
      body: [`${points} place${points === 1 ? "" : "s"}${km ? ` · ${km.toFixed(1)} km of tracks` : ""}`, geoText(r)].filter(Boolean).join("\n"),
      mediaUrl: await originalOf(file),
    }))();
}

async function digestGeo(file: File, route: "kml" | "kmz" | "gpx"): Promise<IngestItem> {
  const geo = await import("./geo.ts");
  if (route === "kmz") {
    const { openZip } = await import("./zip-guard.ts");
    const zip = await openZip(await file.arrayBuffer(), ARCHIVE_LIMITS);
    const kml = zip.entries.find((e) => e.path === "doc.kml") ?? zip.entries.find((e) => /\.kml$/i.test(e.path));
    if (!kml) return errorItem(file, `${file.name} has no KML inside`);
    return geoItem(file, geo.parseKml(await zip.readText(kml.path, XML_LIMITS.maxBytes)), geo.geoText);
  }
  const text = await textOf(file, XML_LIMITS.maxBytes);
  return geoItem(file, route === "kml" ? geo.parseKml(text) : geo.parseGpx(text), geo.geoText);
}

async function digestZip(file: File): Promise<IngestItem> {
  const { openZip } = await import("./zip-guard.ts");
  const { listArchive } = await import("./archive.ts");
  const l = listArchive(await openZip(await file.arrayBuffer(), ARCHIVE_LIMITS));
  const files = l.entries.filter((e) => !e.dir);
  return richItem(file, "archive_tree", { v: "archive_tree", entries: l.entries as unknown as JsonValue, totalBytes: l.totalBytes, truncated: l.truncated }, {
    body: `${files.length} files · ${formatBytes(l.totalBytes)} uncompressed\n${files.map((e) => e.path).join("\n")}`,
    mediaUrl: await originalOf(file, "application/zip"),
    warning: file.size > INLINE_ORIGINAL_MAX_BYTES ? `${file.name} is over 3 MB, so its file list is saved but entries can't be previewed later.` : undefined,
  });
}

async function fileCard(file: File, note?: string): Promise<IngestItem> {
  const meta: JsonObject = { v: "file", mime: file.type || "application/octet-stream", bytes: file.size };
  if (note) meta.note = note;
  const mediaUrl = await originalOf(file);
  return richItem(file, "file", meta, {
    kind: "document",
    body: note ? `${file.name} — ${note}` : file.name,
    mediaUrl,
    warning: note ? `${file.name}: ${note}.` : mediaUrl ? undefined : `${file.name} is over 3 MB, so only its name and size are saved.`,
  });
}

export async function digestMultimodalFile(file: File): Promise<IngestItem | null> {
  const route = await routeOf(file);
  try {
    switch (route) {
      case "csv":
      case "tsv":
      case "xlsx": {
        const r = await digestDataset(file, route);
        return "notTabular" in r ? errorItem(file, `${file.name} is not a table`) : r;
      }
      case "json":
        return await digestJson(file);
      case "vcf":
        return await digestVcf(file);
      case "image":
        return await digestImage(file, false);
      case "gif":
        return await digestImage(file, true);
      case "svg":
        return await digestSvg(file);
      case "yaml":
        return await digestYaml(file);
      case "xml":
        return await digestXml(file);
      case "html":
        return await digestHtml(file);
      case "pdf":
      case "docx":
      case "doc":
      case "rtf":
      case "epub":
      case "txt":
      case "md":
        return await digestDocument(file, route);
      case "ics":
        return await digestIcs(file);
      case "eml":
      case "mbox":
        return await digestEmail(file, route);
      case "msg":
        return await fileCard(file, "Outlook .msg not supported yet — export as .eml to read it here");
      case "kml":
      case "kmz":
      case "gpx":
        return await digestGeo(file, route);
      case "zip":
        return await digestZip(file);
      case "xls":
        return await fileCard(file, "legacy .xls workbooks aren't readable yet — save as .xlsx or .csv");
      case "video":
      case "audio":
      case "heic":
        return null;
      default:
        return await fileCard(file);
    }
  } catch (err) {
    return errorItem(file, errText(err, file));
  }
}
