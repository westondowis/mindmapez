/**
 * PDF via pdfjs-dist, loaded lazily (its own chunk + worker) only when a PDF is digested or viewed.
 * Text per page, the document outline, and a page-1 thumbnail. No scripting/XFA.
 */
import type { OutlineEntry } from "./viewer-types.ts";
import { MAX_EXTRACTED_TEXT_CHARS } from "./limits.ts";

type PdfJs = typeof import("pdfjs-dist");
let loading: Promise<PdfJs> | null = null;

export function loadPdfJs(): Promise<PdfJs> {
  loading ??= (async () => {
    const [lib, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  })();
  return loading;
}

export const PDF_LIMITS = { maxPages: 1000, maxBytes: 50 * 1024 * 1024 } as const;

export async function openPdf(data: ArrayBuffer | Uint8Array) {
  const lib = await loadPdfJs();
  const task = lib.getDocument({ data: data instanceof Uint8Array ? data : new Uint8Array(data), enableXfa: false, isOffscreenCanvasSupported: false, stopAtErrors: false });
  const doc = await task.promise;
  return { doc, close: () => void task.destroy() };
}

export type PdfDigest = { text: string; pages: number; outline: OutlineEntry[]; title?: string; thumb: string | null; truncated: boolean };

export async function digestPdf(data: ArrayBuffer, makeThumb: (canvas: HTMLCanvasElement) => string | null): Promise<PdfDigest> {
  const { doc, close } = await openPdf(data.slice(0));
  try {
    const pages = doc.numPages;
    const parts: string[] = [];
    let chars = 0;
    let truncated = pages > PDF_LIMITS.maxPages;
    for (let p = 1; p <= Math.min(pages, PDF_LIMITS.maxPages); p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      let line = "";
      const lines: string[] = [];
      for (const item of content.items) {
        if (!("str" in item)) continue;
        line += item.str;
        if (item.hasEOL) {
          lines.push(line);
          line = "";
        }
      }
      if (line) lines.push(line);
      const text = lines.join("\n").replace(/[ \t]+\n/g, "\n").trim();
      parts.push(text);
      chars += text.length;
      page.cleanup();
      if (chars > MAX_EXTRACTED_TEXT_CHARS) {
        truncated = true;
        break;
      }
      if (p % 10 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    const outline: OutlineEntry[] = [];
    try {
      const items = (await doc.getOutline()) ?? [];
      const walk = async (list: typeof items, level: number) => {
        for (const it of list) {
          if (outline.length >= 300) return;
          let pageNo = 0;
          try {
            const dest = typeof it.dest === "string" ? await doc.getDestination(it.dest) : it.dest;
            if (Array.isArray(dest) && dest[0]) pageNo = (await doc.getPageIndex(dest[0] as never)) + 1;
          } catch {
            pageNo = 0;
          }
          outline.push({ level, text: String(it.title ?? "").slice(0, 200), anchor: pageNo ? `page-${pageNo}` : "" });
          if (it.items?.length && level < 4) await walk(it.items, level + 1);
        }
      };
      await walk(items, 1);
    } catch {
      // Outline is optional.
    }
    let title: string | undefined;
    try {
      const meta = await doc.getMetadata();
      const t = (meta.info as { Title?: unknown } | undefined)?.Title;
      if (typeof t === "string" && t.trim()) title = t.trim().slice(0, 200);
    } catch {
      title = undefined;
    }
    let thumb: string | null = null;
    try {
      const page = await doc.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      const scale = Math.min(1, 320 / Math.max(viewport.width, viewport.height));
      const vp = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      await page.render({ canvas, viewport: vp }).promise;
      thumb = makeThumb(canvas);
    } catch {
      thumb = null;
    }
    return {
      text: parts.map((t, i) => (pages > 1 ? `[Page ${i + 1}]\n${t}` : t)).join("\n\n").slice(0, MAX_EXTRACTED_TEXT_CHARS),
      pages,
      outline,
      title,
      thumb,
      truncated,
    };
  } finally {
    close();
  }
}
