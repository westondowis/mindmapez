import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { mergeTags, normalizeTags } from "@/lib/tags";
import { extractPublicLink } from "./extract-web";
import { organizeMemory } from "./ai";

export const extractLink = createServerFn({ method: "POST" })
  .validator((input: { url: string; tags?: string[] }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data }) => {
    try {
      const extracted = await extractPublicLink(data.url);
      const raw = [extracted.title, extracted.description, extracted.body, extracted.transcript]
        .filter(Boolean)
        .join("\n\n");
      const organized = await organizeMemory(raw, extracted.title);
      const tags = mergeTags(data.tags, organized.tags);
      return {
        ok: true as const,
        extracted,
        organized: {
          title: organized.title,
          summary: organized.summary,
          tags: normalizeTags(tags),
          emotion: organized.emotion,
          importance: organized.importance,
        },
      };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "Couldn’t read that link.",
      };
    }
  });
