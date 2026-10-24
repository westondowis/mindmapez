function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export const MAX_TEXT_CHARS = 400_000;
export const MAX_MEDIA_BYTES = 6_000_000;

export type IngestKind = "text" | "photo" | "video" | "voice" | "document" | "link";

export type IngestItem = {
  kind: IngestKind;
  title: string;
  body: string;
  mediaUrl: string | null;
  mediaMime: string | null;
  mediaName: string | null;
  sourceUrl: string | null;
  truncated: boolean;
  bytes: number;
  warning?: string;
};

const TEXT_EXT =
  /\.(txt|md|markdown|mdx|csv|tsv|json|html?|xml|ya?ml|log|rtf|tex|srt|vtt|opml|org|rst|ini|conf|cfg)$/i;
const TEXT_MIME =
  /^(text\/|application\/(json|xml|javascript|x-javascript|yaml|x-yaml|rtf|sql|x-sql))/i;

export function wordCount(text: string): number {
  const parts = text.trim().match(/\S+/g);
  return parts ? parts.length : 0;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function formatTextStat(text: string): string {
  const words = wordCount(text);
  const chars = text.length;
  if (!chars) return "";
  return `${words.toLocaleString()} word${words === 1 ? "" : "s"} · ${chars.toLocaleString()} characters`;
}

export function looksLikeUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|pre|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&/gi, "&")
    .replace(/</gi, "<")
    .replace(/>/gi, ">")
    .replace(/"/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function titleFromFilename(name: string): string {
  const stem = name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  if (!stem) return "Imported file";
  return stem.replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

export function titleFromBody(body: string): string {
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const heading = lines.find((l) => /^#{1,6}\s+\S/.test(l));
  if (heading) return heading.replace(/^#{1,6}\s+/, "").slice(0, 80);
  const first = lines[0] ?? "";
  if (first.length && first.length <= 80 && !first.endsWith(".")) return first;
  const sentence = body.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/)[0] ?? "";
  if (sentence.length <= 72) return sentence.replace(/[.]+$/, "") || "Imported note";
  return `${sentence.slice(0, 69).trim()}…`;
}

export function isTextFile(file: File): boolean {
  if (file.type.startsWith("image/") || file.type.startsWith("video/") || file.type.startsWith("audio/")) {
    return false;
  }
  if (TEXT_MIME.test(file.type)) return true;
  if (TEXT_EXT.test(file.name)) return true;
  return false;
}

export function classifyFile(file: File): IngestKind {
  if (file.type.startsWith("image/")) return "photo";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "voice";
  if (isTextFile(file)) return "text";
  return "document";
}

function transferHasFiles(dt: DataTransfer | null | undefined): boolean {
  if (!dt) return false;
  if (dt.files && dt.files.length > 0) return true;
  return Array.from(dt.types ?? []).includes("Files");
}

export function canDropFiles(dt: DataTransfer | null | undefined): boolean {
  return transferHasFiles(dt);
}

export function canDropImport(dt: DataTransfer | null | undefined): boolean {
  if (!dt) return false;
  if (transferHasFiles(dt)) return true;
  const types = Array.from(dt.types ?? []);
  return types.includes("text/plain") || types.includes("text/uri-list") || types.includes("text/html");
}

function clipText(body: string, name?: string): { body: string; truncated: boolean; warning?: string } {
  if (body.length <= MAX_TEXT_CHARS) return { body, truncated: false };
  const kept = body.slice(0, MAX_TEXT_CHARS);
  return {
    body: kept,
    truncated: true,
    warning: `Kept the first ${MAX_TEXT_CHARS.toLocaleString()} characters${name ? ` of ${name}` : ""}. The rest was too large to store in one node.`,
  };
}

export function ingestTextBlock(text: string, sourceName?: string): IngestItem {
  const trimmed = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (looksLikeUrl(trimmed) && trimmed.length < 2048) {
    return {
      kind: "link",
      title: "",
      body: "",
      mediaUrl: null,
      mediaMime: null,
      mediaName: sourceName ?? null,
      sourceUrl: trimmed.trim(),
      truncated: false,
      bytes: trimmed.length,
    };
  }
  const clipped = clipText(trimmed, sourceName);
  return {
    kind: "text",
    title: titleFromBody(clipped.body),
    body: clipped.body,
    mediaUrl: null,
    mediaMime: "text/plain",
    mediaName: sourceName ?? null,
    sourceUrl: null,
    truncated: clipped.truncated,
    bytes: trimmed.length,
    warning: clipped.warning,
  };
}

export async function ingestFile(file: File): Promise<IngestItem> {
  const kind = classifyFile(file);
  const title = titleFromFilename(file.name);

  if (kind === "text") {
    const raw = (await file.text()).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
    const extracted = /\.(html?|xml)$/i.test(file.name) || /html|xml/.test(file.type)
      ? htmlToText(raw)
      : raw;
    const clipped = clipText(extracted, file.name);
    return {
      kind: "text",
      title: titleFromBody(clipped.body) === "Imported note" ? title : titleFromBody(clipped.body) || title,
      body: clipped.body,
      mediaUrl: null,
      mediaMime: file.type || "text/plain",
      mediaName: file.name,
      sourceUrl: null,
      truncated: clipped.truncated,
      bytes: file.size,
      warning: clipped.warning,
    };
  }

  if (file.size > MAX_MEDIA_BYTES) {
    return {
      kind,
      title,
      body: "",
      mediaUrl: null,
      mediaMime: file.type || null,
      mediaName: file.name,
      sourceUrl: null,
      truncated: false,
      bytes: file.size,
      warning: `${file.name} is ${formatBytes(file.size)}. Keep media under ${formatBytes(MAX_MEDIA_BYTES)}, or paste the text instead.`,
    };
  }

  const url = await blobToDataUrl(file);
  return {
    kind,
    title,
    body: "",
    mediaUrl: url,
    mediaMime: file.type || null,
    mediaName: file.name,
    sourceUrl: null,
    truncated: false,
    bytes: file.size,
  };
}

export async function ingestFiles(files: File[] | FileList): Promise<IngestItem[]> {
  const list = Array.from(files);
  const out: IngestItem[] = [];
  for (const file of list) {
    out.push(await ingestFile(file));
  }
  return out;
}

function filesFromClipboardItems(items: DataTransferItemList | undefined): File[] {
  if (!items) return [];
  const files: File[] = [];
  for (const item of Array.from(items)) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (file) files.push(file);
  }
  return files;
}

export async function ingestDataTransfer(dt: DataTransfer): Promise<IngestItem[]> {
  const listed = Array.from(dt.files ?? []);
  const fromItems = filesFromClipboardItems(dt.items);
  const files = listed.length ? listed : fromItems;
  if (files.length) return ingestFiles(files);

  const uriList = dt.getData("text/uri-list");
  const plain = dt.getData("text/plain");
  const html = dt.getData("text/html");
  const uri = uriList
    .split("\n")
    .map((s) => s.trim())
    .find((s) => s && !s.startsWith("#"));
  if (uri && looksLikeUrl(uri)) return [ingestTextBlock(uri)];
  const text = plain.trim() ? plain : html ? htmlToText(html) : "";
  if (text.trim()) return [ingestTextBlock(text)];
  return [];
}

export async function ingestClipboardEvent(event: ClipboardEvent): Promise<IngestItem[]> {
  const dt = event.clipboardData;
  if (!dt) return [];
  const files = Array.from(dt.files ?? []).length
    ? Array.from(dt.files)
    : filesFromClipboardItems(dt.items);
  const plain = dt.getData("text/plain");
  const html = dt.getData("text/html");
  const text = plain.trim() ? plain : html ? htmlToText(html) : "";
  const items: IngestItem[] = [];
  if (files.length) items.push(...(await ingestFiles(files)));
  if (text.trim() && !looksLikeUrl(text.trim()) && files.every((f) => !f.type.startsWith("text/"))) {
    if (!(files.length && text.trim().length < 80)) {
      items.push(ingestTextBlock(text));
    }
  } else if (text.trim() && !files.length) {
    items.push(ingestTextBlock(text));
  }
  return items;
}

export async function readSystemClipboard(): Promise<IngestItem[]> {
  const nav = navigator.clipboard;
  if (nav && "read" in nav && typeof nav.read === "function") {
    try {
      const clipboardItems = await nav.read();
      const files: File[] = [];
      let text = "";
      for (const item of clipboardItems) {
        const types = item.types ?? [];
        if (types.includes("text/plain")) {
          const blob = await item.getType("text/plain");
          text += await blob.text();
        } else {
          const imageType = types.find((t) => t.startsWith("image/"));
          const textType = types.find((t) => t.startsWith("text/"));
          const type = imageType ?? textType;
          if (!type) continue;
          const blob = await item.getType(type);
          const ext = type.split("/")[1]?.split("+")[0] || "bin";
          files.push(new File([blob], `clipboard.${ext}`, { type }));
        }
      }
      const items: IngestItem[] = [];
      if (files.length) items.push(...(await ingestFiles(files)));
      if (text.trim()) items.push(ingestTextBlock(text));
      if (items.length) return items;
    } catch {
      // Permission or empty clipboard — try readText next.
    }
  }
  if (nav && typeof nav.readText === "function") {
    const text = await nav.readText();
    if (text.trim()) return [ingestTextBlock(text)];
  }
  return [];
}

type FilePickerHandle = { getFile: () => Promise<File> };

export async function pickFilesFromDevice(): Promise<File[] | "cancelled" | "fallback"> {
  const w = window as Window & {
    showOpenFilePicker?: (opts: { multiple: boolean }) => Promise<FilePickerHandle[]>;
  };
  if (typeof w.showOpenFilePicker !== "function") return "fallback";
  try {
    const handles = await w.showOpenFilePicker({ multiple: true });
    return await Promise.all(handles.map((h) => h.getFile()));
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    return "fallback";
  }
}
