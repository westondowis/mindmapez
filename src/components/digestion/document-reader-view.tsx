import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, Minus, Plus, Sparkles } from "lucide-react";
import type { Memory } from "@/lib/types";
import type { OutlineEntry } from "@/lib/digestion/viewer-types";
import { markdownToHtml, textToHtml } from "@/lib/digestion/markdown";
import { sanitizeHtml } from "@/lib/digestion/sanitize-html";
import { digestDocument } from "@/lib/server/memories";
import { useMemoryMedia } from "./use-memory-media";
import { dataUrlToBytes, dataUrlToText, isPreviewMemory, ModeTabs, Notice, useArtifactState, ViewerFrame } from "./viewer-kit";

type Props = { memory: Memory; compact?: boolean };
type Mode = "original" | "reader" | "summary";
type Meta = {
  format?: "pdf" | "docx" | "doc" | "rtf" | "epub" | "txt" | "md" | "html";
  pages?: number;
  words?: number;
  outline?: OutlineEntry[];
  digest?: { summary: string; keyPoints: string[] };
  lossy?: boolean;
  originalStored?: boolean;
};

const HAS_ORIGINAL_VIEW = new Set(["pdf", "docx", "epub", "md"]);

function scrollToAnchor(root: HTMLElement | null, entry: OutlineEntry) {
  if (!root) return;
  let el: Element | null = entry.anchor ? root.querySelector(`[id="${CSS.escape(entry.anchor)}"]`) : null;
  if (!el) {
    const want = entry.text.trim().toLowerCase();
    el = Array.from(root.querySelectorAll("h1,h2,h3,h4,h5,h6,p")).find((n) => n.textContent?.trim().toLowerCase().startsWith(want)) ?? null;
  }
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Reader text: paragraphs, with "[Page N]" markers turned into page anchors for the outline. */
function readerHtml(memory: Memory, format?: string): string {
  if (format === "md") return sanitizeHtml(markdownToHtml(memory.body));
  return textToHtml(memory.body).replace(/<p>\[Page (\d+)\]/g, (_m, n: string) => `<p id="page-${n}" class="mt-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Page ${n}</p><p>`);
}

function PdfPages({ url, compact }: { url: string; compact?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    let cancelled = false;
    let close: (() => void) | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLDivElement & { render?: () => void };
          observer.unobserve(el);
          el.render?.();
        }
      },
      { rootMargin: "600px" },
    );
    (async () => {
      try {
        const { openPdf, PDF_LIMITS } = await import("@/lib/digestion/pdf");
        const opened = await openPdf(dataUrlToBytes(url));
        close = opened.close;
        if (cancelled) return opened.close();
        const doc = opened.doc;
        const root = host.current!;
        root.replaceChildren();
        const width = Math.min(root.clientWidth || 800, 1100);
        for (let p = 1; p <= Math.min(doc.numPages, PDF_LIMITS.maxPages); p++) {
          const slot = document.createElement("div") as HTMLDivElement & { render?: () => void };
          slot.id = `page-${p}`;
          slot.className = "mx-auto mb-3 bg-white shadow-sm";
          slot.style.minHeight = `${Math.round(width * 1.3)}px`;
          slot.render = async () => {
            if (cancelled) return;
            const page = await doc.getPage(p);
            const base = page.getViewport({ scale: 1 });
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const vp = page.getViewport({ scale: (width / base.width) * dpr });
            const canvas = document.createElement("canvas");
            canvas.width = Math.ceil(vp.width);
            canvas.height = Math.ceil(vp.height);
            canvas.style.width = "100%";
            canvas.setAttribute("aria-label", `Page ${p}`);
            await page.render({ canvas, viewport: vp }).promise;
            slot.style.minHeight = "";
            slot.replaceChildren(canvas);
            page.cleanup();
          };
          root.appendChild(slot);
          observer.observe(slot);
        }
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
      observer.disconnect();
      close?.();
    };
  }, [url]);
  return (
    <>
      {status === "loading" ? <Notice>Opening PDF…</Notice> : status === "error" ? <Notice>This PDF couldn't be rendered; the Reader still has its text.</Notice> : null}
      <div ref={host} className={`overflow-y-auto rounded-xl bg-muted p-2 ${compact ? "max-h-80" : "max-h-[80dvh]"}`} />
    </>
  );
}

function OriginalHtml({ url, format }: { url: string; format: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let out: string;
        if (format === "md") out = markdownToHtml(dataUrlToText(url));
        else {
          const { openZip } = await import("@/lib/digestion/zip-guard");
          const { ARCHIVE_LIMITS } = await import("@/lib/digestion/limits");
          const zip = await openZip(dataUrlToBytes(url), ARCHIVE_LIMITS);
          out = format === "docx" ? (await (await import("@/lib/digestion/docx")).docxToDoc(zip)).html : (await (await import("@/lib/digestion/epub")).epubToDoc(zip)).html;
        }
        if (!cancelled) setHtml(sanitizeHtml(out));
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, format]);
  if (error) return <Notice>The original couldn't be opened; the Reader still has its text.</Notice>;
  if (html === null) return <Notice>Opening document…</Notice>;
  return <div className="doc-prose" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function DocumentReaderView({ memory, compact }: Props) {
  const meta = memory.extractedMetadata as Meta;
  const format = meta.format ?? "txt";
  const canOriginal = HAS_ORIGINAL_VIEW.has(format) && memory.hasMedia;
  const { state, update } = useArtifactState<{ mode?: Mode; fontSize?: number }>(memory);
  const [mode, setMode] = useState<Mode>(state.mode === "summary" ? "summary" : state.mode === "original" && canOriginal ? "original" : canOriginal && format === "pdf" ? "original" : "reader");
  const fontSize = state.fontSize ?? 16;
  const media = useMemoryMedia(memory.id, memory.hasMedia && (mode === "original" || canOriginal));
  const body = useRef<HTMLDivElement>(null);
  const reader = useMemo(() => (mode === "reader" ? readerHtml(memory, format) : ""), [mode, memory, format]);
  const [digest, setDigest] = useState(meta.digest ?? null);
  const [digestState, setDigestState] = useState<{ busy: boolean; error?: string }>({ busy: false });
  const outline = (meta.outline ?? []).filter((o) => o.text);

  const choose = (m: Mode) => {
    setMode(m);
    update({ mode: m });
  };

  const runDigest = async (refresh = false) => {
    if (isPreviewMemory(memory)) return setDigestState({ busy: false, error: "Save the document first to generate a digest." });
    setDigestState({ busy: true });
    try {
      const res = await digestDocument({ data: { id: memory.id, refresh } });
      if (res.ok) {
        setDigest({ summary: res.summary, keyPoints: res.keyPoints });
        setDigestState({ busy: false });
      } else setDigestState({ busy: false, error: res.error });
    } catch {
      setDigestState({ busy: false, error: "Couldn't reach the AI; try again" });
    }
  };

  const url = media.data?.mediaUrl ?? null;
  const modes: { id: Mode; label: string }[] = [
    ...(canOriginal ? [{ id: "original" as const, label: "Original" }] : []),
    { id: "reader", label: "Reader" },
    { id: "summary", label: "Digest" },
  ];

  return (
    <ViewerFrame
      compact={compact}
      toolbar={
        <>
          <ModeTabs modes={modes} value={mode} onChange={choose} />
          <span className="text-xs text-muted-foreground">
            {format.toUpperCase()}
            {meta.pages ? ` · ${meta.pages} pages` : ""}
            {meta.words ? ` · ${meta.words.toLocaleString()} words` : ""}
          </span>
          {mode === "reader" ? (
            <span className="ml-auto flex items-center gap-1">
              <button type="button" aria-label="Smaller text" className="rounded border border-border p-1 text-muted-foreground hover:text-foreground" onClick={() => update({ fontSize: Math.max(12, fontSize - 1) })}>
                <Minus className="size-3.5" />
              </button>
              <button type="button" aria-label="Larger text" className="rounded border border-border p-1 text-muted-foreground hover:text-foreground" onClick={() => update({ fontSize: Math.min(24, fontSize + 1) })}>
                <Plus className="size-3.5" />
              </button>
            </span>
          ) : null}
          {url ? (
            <a href={url} download={memory.mediaName ?? "document"} className={`${mode === "reader" ? "" : "ml-auto"} inline-flex items-center gap-1 text-xs text-primary hover:underline`}>
              <Download className="size-3.5" /> Original
            </a>
          ) : null}
        </>
      }
    >
      {meta.lossy ? <Notice>Best effort: legacy .doc text was scraped, so some formatting or characters may be missing.</Notice> : null}
      {!memory.hasMedia && meta.originalStored === false ? <p className="mb-2 text-xs text-muted-foreground">Original not stored (over 3 MB); the full text is kept.</p> : null}
      {outline.length && mode !== "summary" ? (
        <details className="mb-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Contents ({outline.length})</summary>
          <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
            {outline.map((o, i) => (
              <li key={i} style={{ paddingLeft: (o.level - 1) * 12 }}>
                <button type="button" className="text-left text-sm hover:text-primary" onClick={() => scrollToAnchor(body.current, o)}>
                  {o.text}
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <div ref={body}>
        {mode === "original" ? (
          url ? (
            format === "pdf" ? <PdfPages url={url} compact={compact} /> : <div className={`overflow-y-auto rounded-xl border border-border bg-card p-4 ${compact ? "max-h-80" : "max-h-[80dvh]"}`}><OriginalHtml url={url} format={format} /></div>
          ) : (
            <Notice>{media.isPending ? "Loading original…" : "Original unavailable."}</Notice>
          )
        ) : mode === "reader" ? (
          <article className={`doc-prose overflow-y-auto rounded-xl border border-border bg-card p-4 leading-relaxed ${compact ? "max-h-80" : "max-h-[80dvh]"}`} style={{ fontSize }} dangerouslySetInnerHTML={{ __html: reader }} />
        ) : (
          <div className="rounded-xl border border-border bg-card p-4">
            {digest ? (
              <>
                <p className="text-sm leading-relaxed">{digest.summary}</p>
                {digest.keyPoints.length ? (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                    {digest.keyPoints.map((k, i) => (
                      <li key={i}>{k}</li>
                    ))}
                  </ul>
                ) : null}
                <button type="button" disabled={digestState.busy} onClick={() => void runDigest(true)} className="mt-3 text-xs text-primary hover:underline disabled:opacity-50">
                  Regenerate
                </button>
              </>
            ) : (
              <button type="button" disabled={digestState.busy} onClick={() => void runDigest()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60">
                {digestState.busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Generate summary & key points
              </button>
            )}
            {digestState.busy && digest ? <Loader2 className="mt-2 size-4 animate-spin text-muted-foreground" /> : null}
            {digestState.error ? <p role="alert" className="mt-2 text-xs text-destructive">{digestState.error}</p> : null}
          </div>
        )}
      </div>
    </ViewerFrame>
  );
}
