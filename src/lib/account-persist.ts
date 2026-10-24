export type FlushReason = "idle" | "unload" | "logout";

type Flusher = (reason: FlushReason) => Promise<void>;

const flushers = new Set<Flusher>();
let dirty = false;
let inflight: Promise<void> | null = null;

export function markAccountDirty() {
  dirty = true;
}

export function registerAccountFlusher(fn: Flusher): () => void {
  flushers.add(fn);
  return () => {
    flushers.delete(fn);
  };
}

export async function flushAccount(reason: FlushReason): Promise<void> {
  if (!dirty && reason !== "logout") return;
  if (inflight) {
    await inflight;
    if (!dirty && reason !== "logout") return;
  }
  dirty = false;
  const run = (async () => {
    for (const fn of [...flushers]) {
      try {
        await fn(reason);
      } catch {
        /* keep flushing the rest */
      }
    }
  })();
  inflight = run;
  try {
    await run;
  } finally {
    if (inflight === run) inflight = null;
  }
}
