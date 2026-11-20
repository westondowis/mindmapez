import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Redo2, Sparkles, Trash2, Undo2 } from "lucide-react";
import { aiCustomEmoji, createCustomEmoji } from "@/lib/server/custom-emojis";
import { customEmojiToken, sanitizeSvg, svgDataUri, type CustomEmojiSource } from "@/lib/custom-emoji";
import { generateEmojiSvg } from "@/lib/emoji-generator";
import { DEFAULT_SKETCH_STYLE, sketchToSvg, type SketchStyle, type Stroke } from "@/lib/sketch";
import { CUSTOM_EMOJIS_KEY, type RenderableCustomEmoji } from "@/components/emoji-glyph";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const FILLS: { id: string; style: SketchStyle }[] = [
  { id: "sun", style: DEFAULT_SKETCH_STYLE },
  { id: "sky", style: { ink: "#0f2a3d", fill: "#60a5fa", bg: "#e0f2fe", bg2: "#bae6fd" } },
  { id: "mint", style: { ink: "#0f2f22", fill: "#34d399", bg: "#dcfce7", bg2: "#bbf7d0" } },
  { id: "rose", style: { ink: "#3b0d1c", fill: "#fb7185", bg: "#ffe4e6", bg2: "#fecdd3" } },
  { id: "grape", style: { ink: "#24123d", fill: "#a78bfa", bg: "#ede9fe", bg2: "#ddd6fe" } },
];

function Preview({ svg, label }: { svg: string | null; label: string }) {
  const src = useMemo(() => {
    const clean = svg ? sanitizeSvg(svg) : null;
    return clean ? svgDataUri(clean) : null;
  }, [svg]);
  return (
    <div className="grid size-20 shrink-0 place-items-center rounded-xl border border-border bg-card">
      {src ? <img src={src} alt={label || "preview"} className="size-16" draggable={false} /> : <span className="text-[11px] text-muted-foreground">Preview</span>}
    </div>
  );
}

function useSaveCustom(onPick: (token: string) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { label: string; svg: string; source: CustomEmojiSource }) => createCustomEmoji({ data: input }),
    onSuccess: (saved) => {
      const clean = sanitizeSvg(saved.svg);
      if (clean) {
        qc.setQueryData<RenderableCustomEmoji[]>(CUSTOM_EMOJIS_KEY, (prev) => [
          { ...saved, src: svgDataUri(clean) },
          ...(prev ?? []).filter((e) => e.id !== saved.id),
        ]);
      }
      void qc.invalidateQueries({ queryKey: CUSTOM_EMOJIS_KEY });
      onPick(customEmojiToken(saved.id));
    },
  });
}

/** Type a description -> instant built-in icon; optional AI version when a model is configured. */
function GeneratePanel({ onPick, initialText = "" }: { onPick: (token: string) => void; initialText?: string }) {
  const [text, setText] = useState(initialText.slice(0, 60));
  const [aiSvg, setAiSvg] = useState<{ for: string; svg: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const local = useMemo(() => (text.trim() ? generateEmojiSvg(text).svg : null), [text]);
  const svg = aiSvg && aiSvg.for === text.trim() ? aiSvg.svg : local;
  const save = useSaveCustom(onPick);
  const ai = useMutation({
    mutationFn: (description: string) => aiCustomEmoji({ data: { description } }),
    onSuccess: (res, description) => {
      if (res.ok) {
        setAiSvg({ for: description, svg: res.svg });
        setNote(null);
      } else setNote(res.error);
    },
    onError: () => setNote("AI could not draw that right now, so the built-in icon was kept."),
  });
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Preview svg={svg} label={text} />
        <div className="min-w-0 flex-1 space-y-2">
          <Input
            placeholder="Describe it: golf putter, real estate key…"
            value={text}
            maxLength={60}
            onChange={(e) => {
              setText(e.target.value);
              setNote(null);
            }}
            aria-label="Describe your emoji"
          />
          <button
            type="button"
            disabled={!text.trim() || ai.isPending}
            onClick={() => ai.mutate(text.trim())}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {ai.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            {aiSvg && aiSvg.for === text.trim() ? "Try another AI version" : "AI version"}
          </button>
        </div>
      </div>
      {note ? <p className="text-[11px] text-muted-foreground">{note}</p> : null}
      {save.error ? <p className="text-[11px] text-destructive">{save.error instanceof Error ? save.error.message : "Could not save"}</p> : null}
      <button
        type="button"
        disabled={!svg || save.isPending}
        onClick={() => svg && save.mutate({ label: text.trim(), svg, source: "generated" })}
        className="h-11 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {save.isPending ? "Saving…" : "Save & use"}
      </button>
    </div>
  );
}

/** Sketch with finger, mouse or pen -> simplified, smoothed emoji-style SVG. */
function DrawPanel({ onPick }: { onPick: (token: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redo, setRedo] = useState<Stroke[]>([]);
  const live = useRef<Stroke | null>(null);
  const [fill, setFill] = useState(true);
  const [paletteId, setPaletteId] = useState(FILLS[0]!.id);
  const [label, setLabel] = useState("");
  const [aiSvg, setAiSvg] = useState<{ key: string; svg: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const style = FILLS.find((f) => f.id === paletteId)!.style;
  const refined = useMemo(() => sketchToSvg(strokes, { fillClosed: fill, style }), [strokes, fill, style]);
  const key = `${strokes.length}:${fill}:${paletteId}`;
  const svg = aiSvg && aiSvg.key === key ? aiSvg.svg : refined;
  const save = useSaveCustom(onPick);
  const ai = useMutation({
    mutationFn: (input: { description: string; sketch: string }) => aiCustomEmoji({ data: input }),
    onSuccess: (res) => {
      if (res.ok) {
        setAiSvg({ key, svg: res.svg });
        setNote(null);
      } else setNote(res.error.replace("built-in generator was used", "refined sketch was kept").replace("built-in icon was kept", "refined sketch was kept"));
    },
    onError: () => setNote("AI cleanup failed, so the refined sketch was kept."),
  });

  const paint = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 4;
    const ink = getComputedStyle(c).color || "#e5e7eb";
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    const all = live.current ? [...strokes, live.current] : strokes;
    for (const s of all) {
      if (s.length === 1) {
        ctx.beginPath();
        ctx.arc(s[0]!.x, s[0]!.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      s.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    }
  }, [strokes]);

  useEffect(() => {
    paint();
    const c = canvasRef.current;
    if (!c || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => paint());
    ro.observe(c);
    return () => ro.disconnect();
  }, [paint]);

  const at = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <canvas
          ref={canvasRef}
          aria-label="Drawing pad"
          className="aspect-square w-full max-w-[14rem] flex-1 cursor-crosshair text-foreground rounded-xl border border-dashed border-border bg-card/60"
          style={{ touchAction: "none" }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            live.current = [at(e)];
            paint();
          }}
          onPointerMove={(e) => {
            if (!live.current) return;
            const native = e.nativeEvent as PointerEvent;
            const events = typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [];
            const r = e.currentTarget.getBoundingClientRect();
            if (events.length) for (const ev of events) live.current.push({ x: ev.clientX - r.left, y: ev.clientY - r.top });
            else live.current.push(at(e));
            paint();
          }}
          onPointerUp={() => {
            const s = live.current;
            live.current = null;
            if (s && s.length) {
              setStrokes((prev) => [...prev, s]);
              setRedo([]);
            }
          }}
          onPointerCancel={() => {
            live.current = null;
            paint();
          }}
        />
        <div className="flex flex-col items-center gap-2">
          <Preview svg={svg} label={label} />
          <div className="flex gap-1">
            <button type="button" aria-label="Undo" disabled={!strokes.length} onClick={() => { setRedo((r) => [strokes[strokes.length - 1]!, ...r]); setStrokes((s) => s.slice(0, -1)); }} className="grid size-9 place-items-center rounded-md border border-border disabled:opacity-40"><Undo2 className="size-4" /></button>
            <button type="button" aria-label="Redo" disabled={!redo.length} onClick={() => { setStrokes((s) => [...s, redo[0]!]); setRedo((r) => r.slice(1)); }} className="grid size-9 place-items-center rounded-md border border-border disabled:opacity-40"><Redo2 className="size-4" /></button>
          </div>
          <button type="button" aria-label="Clear" disabled={!strokes.length} onClick={() => { setStrokes([]); setRedo([]); }} className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-2 text-xs disabled:opacity-40"><Trash2 className="size-3.5" />Clear</button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {FILLS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-label={`${f.id} colors`}
            onClick={() => setPaletteId(f.id)}
            className={cn("size-8 rounded-full border-2", paletteId === f.id ? "border-foreground" : "border-transparent")}
            style={{ background: `linear-gradient(135deg, ${f.style.bg2}, ${f.style.fill})` }}
          />
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={fill} onChange={(e) => setFill(e.target.checked)} className="size-4" />
          Fill closed shapes
        </label>
      </div>
      <div className="flex gap-2">
        <Input placeholder="Name (optional)" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} aria-label="Emoji name" />
        <button
          type="button"
          disabled={!refined || ai.isPending}
          onClick={() => refined && ai.mutate({ description: label.trim(), sketch: refined })}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {ai.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          AI cleanup
        </button>
      </div>
      {note ? <p className="text-[11px] text-muted-foreground">{note}</p> : null}
      {save.error ? <p className="text-[11px] text-destructive">{save.error instanceof Error ? save.error.message : "Could not save"}</p> : null}
      <button
        type="button"
        disabled={!svg || save.isPending}
        onClick={() => svg && save.mutate({ label: label.trim(), svg, source: "drawn" })}
        className="h-11 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {save.isPending ? "Saving…" : strokes.length ? "Save & use" : "Draw something first"}
      </button>
    </div>
  );
}

export function CustomEmojiStudio({ onPick, initialText }: { onPick: (token: string) => void; initialText?: string }) {
  const [mode, setMode] = useState<"type" | "draw">("type");
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-secondary/60 p-1">
        {(["type", "draw"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn("h-9 rounded-md text-xs font-medium", mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}
          >
            {m === "type" ? "Type to generate" : "Draw to refine"}
          </button>
        ))}
      </div>
      {mode === "type" ? <GeneratePanel onPick={onPick} initialText={initialText} /> : <DrawPanel onPick={onPick} />}
    </div>
  );
}
