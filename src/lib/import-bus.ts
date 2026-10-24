import type { IngestItem } from "./ingest";

type Listener = (items: IngestItem[]) => void;

const listeners = new Set<Listener>();
let pending: IngestItem[] | null = null;

export function offerImport(items: IngestItem[]) {
  const usable = items.filter((item) => item.body || item.mediaUrl || item.sourceUrl || item.warning);
  if (!usable.length) return;
  if (listeners.size) {
    listeners.forEach((listener) => listener(usable));
    return;
  }
  pending = usable;
}

export function subscribeImport(listener: Listener): () => void {
  listeners.add(listener);
  if (pending) {
    const items = pending;
    pending = null;
    listener(items);
  }
  return () => {
    listeners.delete(listener);
  };
}
