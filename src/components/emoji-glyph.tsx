import { useQuery } from "@tanstack/react-query";
import { listCustomEmojis } from "@/lib/server/custom-emojis";
import { parseCustomEmojiToken, sanitizeSvg, svgDataUri, type CustomEmoji } from "@/lib/custom-emoji";
import { cn } from "@/lib/utils";

export const CUSTOM_EMOJIS_KEY = ["custom-emojis"] as const;

export type RenderableCustomEmoji = CustomEmoji & { src: string };

/** Data URIs keyed by `id:svg-length` so re-renders and refetches reuse the encoded string. */
const uriCache = new Map<string, string | null>();

function toRenderable(list: CustomEmoji[]): RenderableCustomEmoji[] {
  const out: RenderableCustomEmoji[] = [];
  for (const e of list) {
    const key = `${e.id}:${e.svg.length}`;
    let src = uriCache.get(key);
    if (src === undefined) {
      const clean = sanitizeSvg(e.svg);
      src = clean ? svgDataUri(clean) : null;
      uriCache.set(key, src);
    }
    if (src) out.push({ ...e, src });
  }
  return out;
}

/** The signed-in user's custom emojis (client-side re-sanitized), shared by every glyph via the query cache. */
export function useCustomEmojis(enabled = true) {
  return useQuery({
    queryKey: CUSTOM_EMOJIS_KEY,
    queryFn: async () => toRenderable(await listCustomEmojis()),
    enabled,
    staleTime: 5 * 60_000,
  });
}

/**
 * Renders a branch / sector / memory emoji value: plain emoji as text, a
 * `custom:<id>` token as the user's sanitized SVG (an <img>, sized to 1em so it
 * drops in wherever the text glyph used to be). Unknown tokens show `fallback`.
 */
export function EmojiGlyph({ value, fallback = "✨", className }: { value: string | null | undefined; fallback?: string; className?: string }) {
  const id = parseCustomEmojiToken(value);
  const { data } = useCustomEmojis(id !== null);
  if (!id) {
    const text = value?.trim();
    if (text?.startsWith("custom:")) return <span className={className}>{fallback}</span>;
    return text ? <span className={className}>{text}</span> : null;
  }
  const hit = data?.find((e) => e.id === id);
  if (!hit) return <span className={className}>{fallback}</span>;
  return (
    <img
      src={hit.src}
      alt={hit.label || "custom emoji"}
      title={hit.label || undefined}
      draggable={false}
      className={cn("inline-block size-[1.15em] select-none align-[-0.2em]", className)}
    />
  );
}
