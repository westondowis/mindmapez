import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/70",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-32 w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/70",
        className,
      )}
      {...props}
    />
  );
}
