import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { offerImport } from "@/lib/import-bus";
import { canDropFiles, ingestDataTransfer } from "@/lib/ingest";

export function ImportDropHost({ disabled = false }: { disabled?: boolean }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [active, setActive] = useState(false);
  const depth = useRef(0);

  useEffect(() => {
    if (disabled) return;

    function hide() {
      depth.current = 0;
      setActive(false);
    }

    function onEnter(e: DragEvent) {
      if (!canDropFiles(e.dataTransfer)) return;
      depth.current += 1;
      setActive(true);
    }

    function onOver(e: DragEvent) {
      if (!canDropFiles(e.dataTransfer)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    }

    function onLeave() {
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setActive(false);
    }

    async function onDrop(e: DragEvent) {
      if (!canDropFiles(e.dataTransfer)) {
        hide();
        return;
      }
      e.preventDefault();
      hide();
      const dt = e.dataTransfer;
      if (!dt) return;
      try {
        const items = await ingestDataTransfer(dt);
        if (!items.length) {
          toast.error("Nothing usable in that drop.");
          return;
        }
        offerImport(items);
        if (pathname !== "/capture") {
          void navigate({ to: "/capture" });
        }
      } catch {
        toast.error("Couldn’t read that drop.");
      }
    }

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragend", hide);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragend", hide);
    };
  }, [disabled, navigate, pathname]);

  if (disabled || !active) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm">
      <div className="rounded-2xl border border-primary bg-card px-8 py-6 text-center shadow-soft">
        <p className="font-display text-2xl">Drop into your mesh</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Files, photos, or notes from any app — they’ll open in Capture.
        </p>
      </div>
    </div>
  );
}
