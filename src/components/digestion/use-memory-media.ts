import { createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMemoryMedia } from "@/lib/server/memories";

/**
 * Previews of not-yet-saved items (archive entries, the capture queue) supply their bytes directly,
 * keyed by the preview memory id, instead of fetching from the server.
 */
export const MediaOverrideContext = createContext<Record<string, string | null> | null>(null);

/** The original file/recording loads only when a viewer actually needs it (lightweight graph). */
export function useMemoryMedia(id: string, hasMedia: boolean) {
  const overrides = useContext(MediaOverrideContext);
  const override = overrides && id in overrides ? overrides[id] : undefined;
  const query = useQuery({
    queryKey: ["memory-media", id],
    queryFn: () => getMemoryMedia({ data: id }),
    enabled: hasMedia && override === undefined,
    staleTime: 5 * 60_000,
  });
  if (override !== undefined) return { data: { mediaUrl: override }, isPending: false, isError: false } as const;
  return query;
}
