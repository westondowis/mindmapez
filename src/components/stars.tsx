import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function Stars({
  value,
  onChange,
  size = "sm",
}: {
  value: number;
  onChange?: (n: number) => void;
  size?: "sm" | "md";
}) {
  const cls = size === "md" ? "size-5" : "size-3.5";
  return (
    <div className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          className={cn("text-gold", !onChange && "cursor-default")}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
        >
          <Star className={cls} fill={n <= value ? "currentColor" : "none"} />
        </button>
      ))}
    </div>
  );
}
