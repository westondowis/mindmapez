import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "default",
  ...props
}: React.ComponentProps<"span"> & {
  tone?: "default" | "gold" | "learning" | "success" | "problem" | "idea" | "muted";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide",
        tone === "default" && "bg-primary/15 text-primary",
        tone === "gold" && "bg-gold/15 text-gold",
        tone === "learning" && "bg-learning/15 text-learning",
        tone === "success" && "bg-success/15 text-success",
        tone === "problem" && "bg-problem/15 text-problem",
        tone === "idea" && "bg-idea/15 text-idea",
        tone === "muted" && "bg-muted text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
