import { Link } from "@tanstack/react-router";
import { FileText, ImageIcon, Link2, Mic, Network, Table2, Type, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { KIND_LABEL, KIND_TONE } from "@/lib/kind-styles";
import type { MemorySummary } from "@/lib/types";
import { formatRelative } from "@/lib/utils";
import { Stars } from "./stars";

const TYPE_ICON = {
  voice: Mic,
  text: Type,
  photo: ImageIcon,
  video: Video,
  document: FileText,
  thought: Type,
  reflection: Type,
  link: Link2,
  dataset: Table2,
};

export function MemoryCard({ memory }: { memory: MemorySummary }) {
  const Icon = TYPE_ICON[memory.memoryType] ?? Type;
  return (
    <div>
    <Link
      to="/memory/$id"
      params={{ id: memory.id }}
      className="block rounded-xl border border-border bg-card/80 p-4 transition-colors hover:border-primary/40 hover:bg-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="size-4" />
          <span className="text-xs">{formatRelative(memory.createdAt)}</span>
        </div>
        <Badge tone={KIND_TONE[memory.nodeKind]}>{KIND_LABEL[memory.nodeKind]}</Badge>
      </div>
      <h3 className="mt-2 font-display text-base font-medium tracking-tight text-foreground">
        {memory.title}
      </h3>
      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
        {memory.snippet}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {memory.tags.slice(0, 4).map((t) => (
          <Badge key={t} tone="muted">
            {t}
          </Badge>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <Stars value={memory.importance} />
        {memory.emotion ? (
          <span className="text-xs text-muted-foreground">{memory.emotion}</span>
        ) : null}
      </div>
    </Link>
    <Link
      to="/"
      search={{ focus: memory.id, focusType: "memory" }}
      className="mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs text-primary hover:underline"
    >
      <Network className="size-3.5" aria-hidden /> Show in mesh
    </Link>
    </div>
  );
}
