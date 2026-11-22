import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Memory } from "@/lib/types";
import type { JsonObject } from "@/lib/digestion/viewer-types";
import { saveArtifactState } from "@/lib/server/memories";

export const PREVIEW_PREFIX = "preview:";

export function isPreviewMemory(memory: Pick<Memory, "id">): boolean {
  return memory.id.startsWith(PREVIEW_PREFIX);
}

export function dataUrlToBytes(url: string): Uint8Array {
  const comma = url.indexOf(",");
  const head = url.slice(0, comma);
  const payload = url.slice(comma + 1);
  if (/;base64$/i.test(head)) {
    const bin = atob(payload);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new TextEncoder().encode(decodeURIComponent(payload));
}

export function dataUrlToText(url: string): string {
  return new TextDecoder().decode(dataUrlToBytes(url));
}

/**
 * Editable viewer state (artifact_state_json): local updates apply immediately and are saved with a
 * 1 s debounce; a server "rate_limited" reply retries once the window passes. Previews never save.
 */
export function useArtifactState<T extends JsonObject>(memory: Memory) {
  const [state, setState] = useState<T>(() => (memory.artifactState ?? {}) as T);
  const pending = useRef<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saving, setSaving] = useState<"idle" | "saving" | "error">("idle");
  const preview = isPreviewMemory(memory);

  const flush = useCallback(async () => {
    const next = pending.current;
    if (!next || preview) return;
    pending.current = null;
    setSaving("saving");
    try {
      const res = await saveArtifactState({ data: { id: memory.id, state: next } });
      if (res.ok) setSaving("idle");
      else if (res.error === "rate_limited") {
        pending.current ??= next;
        timer.current = setTimeout(() => void flush(), 1200);
      } else setSaving("error");
    } catch {
      pending.current ??= next;
      setSaving("error");
    }
  }, [memory.id, preview]);

  const update = useCallback(
    (patch: Partial<T>) => {
      setState((prev) => {
        const next = { ...prev, ...patch } as T;
        pending.current = next;
        return next;
      });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 1000);
    },
    [flush],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      void flush();
    },
    [flush],
  );

  // Mobile Safari/PWA can suspend a backgrounded page without unmounting it: save pending edits then.
  useEffect(() => {
    const onHide = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") return;
      if (timer.current) clearTimeout(timer.current);
      void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [flush]);

  return { state, update, saving };
}

export function ModeTabs<M extends string>({ modes, value, onChange }: { modes: { id: M; label: string }[]; value: M; onChange: (m: M) => void }) {
  return (
    <div role="tablist" className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5 text-xs">
      {modes.map((m) => (
        <button
          key={m.id}
          type="button"
          role="tab"
          aria-selected={value === m.id}
          onClick={() => onChange(m.id)}
          className={`rounded-md px-2.5 py-1 font-medium transition-colors ${value === m.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

export function ViewerFrame({ compact, toolbar, children }: { compact?: boolean; toolbar?: ReactNode; children: ReactNode }) {
  return (
    <section className={compact ? "mt-3" : "mt-6"}>
      {toolbar ? <div className="mb-2 flex flex-wrap items-center gap-2">{toolbar}</div> : null}
      {children}
    </section>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return <p role="status" className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{children}</p>;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
