import { useEffect, useMemo, useRef, useState } from "react";
import type { Memory } from "@/lib/types";
import { buildHtmlAppSrcdoc, handleBridgeMessage, HTML_APP_SANDBOX, type BridgeContext } from "@/lib/digestion/html-app";
import { useMemoryMedia } from "./use-memory-media";
import { dataUrlToText, ModeTabs, Notice, ViewerFrame, useArtifactState } from "./viewer-kit";

type Props = { memory: Memory; compact?: boolean };

/**
 * Uploaded HTML runs in an opaque-origin sandbox (allow-scripts + allow-forms, never
 * allow-same-origin) with a strict CSP (connect-src 'none'). Its only persistence is the
 * window.brainStorage bridge, validated by handleBridgeMessage and saved to artifact_state.kv.
 */
export function HtmlAppView({ memory, compact }: Props) {
  const media = useMemoryMedia(memory.id, memory.hasMedia);
  const { state, update } = useArtifactState<{ kv?: Record<string, string>; mode?: "original" | "reader" }>(memory);
  const [mode, setMode] = useState<"original" | "reader">(state.mode === "reader" ? "reader" : "original");
  const frame = useRef<HTMLIFrameElement>(null);
  const nonce = useMemo(() => crypto.randomUUID(), []);
  const ctx = useRef<BridgeContext>({ nonce, frameWindow: null, kv: { ...(state.kv ?? {}) }, recent: [], now: 0 });
  const url = media.data?.mediaUrl;
  const srcdoc = useMemo(() => (url ? buildHtmlAppSrcdoc(dataUrlToText(url), nonce) : null), [url, nonce]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const win = frame.current?.contentWindow;
      if (!win) return;
      ctx.current.frameWindow = win;
      ctx.current.now = Date.now();
      const res = handleBridgeMessage({ source: event.source, origin: event.origin, data: event.data }, ctx.current);
      if (!res) return;
      // An opaque-origin frame can only be addressed with "*"; the reply carries only its own data.
      win.postMessage(res.reply, "*");
      if (res.kv) {
        ctx.current.kv = res.kv;
        update({ kv: res.kv });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [update]);

  const choose = (m: "original" | "reader") => {
    setMode(m);
    update({ mode: m });
  };

  return (
    <ViewerFrame
      compact={compact}
      toolbar={
        <ModeTabs
          modes={[
            { id: "original", label: "App" },
            { id: "reader", label: "Reader" },
          ]}
          value={mode}
          onChange={choose}
        />
      }
    >
      {mode === "reader" ? (
        <p className="max-h-[70dvh] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{memory.body}</p>
      ) : srcdoc ? (
        <>
          <iframe
            ref={frame}
            title={memory.title}
            sandbox={HTML_APP_SANDBOX}
            srcDoc={srcdoc}
            referrerPolicy="no-referrer"
            className={`w-full rounded-xl border border-border bg-white ${compact ? "h-72" : "h-[70dvh]"}`}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">Runs sandboxed with no network access. Saved data stays with this memory.</p>
        </>
      ) : (
        <Notice>{media.isPending && memory.hasMedia ? "Loading app…" : "The original page isn't stored, so only its text is available (Reader)."}</Notice>
      )}
    </ViewerFrame>
  );
}
