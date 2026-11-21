import { useQuery } from "@tanstack/react-query";
import { getMemoryMedia } from "@/lib/server/memories";

/** The original file/recording loads only when a viewer actually needs it (lightweight graph). */
export function useMemoryMedia(id: string, hasMedia: boolean) {
  return useQuery({
    queryKey: ["memory-media", id],
    queryFn: () => getMemoryMedia({ data: id }),
    enabled: hasMedia,
    staleTime: 5 * 60_000,
  });
}
