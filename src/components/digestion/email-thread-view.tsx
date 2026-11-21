import { useMemo, useState } from "react";
import { ChevronDown, Paperclip } from "lucide-react";
import type { Memory } from "@/lib/types";
import type { EmailMessage } from "@/lib/digestion/viewer-types";
import { sanitizeHtml } from "@/lib/digestion/sanitize-html";
import { Notice, ViewerFrame, formatSize } from "./viewer-kit";

type Props = { memory: Memory; compact?: boolean };

/** Formatted email: sanitized, then shown in a script-less sandbox whose CSP blocks remote images. */
export const EMAIL_FRAME_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'";

function emailSrcdoc(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${EMAIL_FRAME_CSP}"><meta name="referrer" content="no-referrer"><style>body{font:14px/1.5 system-ui,sans-serif;margin:12px;color:#111;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style></head><body>${sanitizeHtml(html)}</body></html>`;
}

function Message({ m, initiallyOpen }: { m: EmailMessage; initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [formatted, setFormatted] = useState(false);
  const srcdoc = useMemo(() => (formatted && m.html ? emailSrcdoc(m.html) : null), [formatted, m.html]);
  const when = m.date ? new Date(m.date) : null;
  return (
    <li className="rounded-xl border border-border bg-card">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-start gap-2 p-3 text-left">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{m.from || "Unknown sender"}</p>
          <p className="truncate text-xs text-muted-foreground">
            {m.subject || "(no subject)"}
            {when && !Number.isNaN(when.getTime()) ? ` · ${when.toLocaleString()}` : ""}
          </p>
        </div>
        {m.attachments.length ? <Paperclip className="mt-0.5 size-3.5 text-muted-foreground" /> : null}
        <ChevronDown className={`mt-0.5 size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="border-t border-border p-3">
          {m.to.length ? <p className="mb-2 text-xs text-muted-foreground">To: {m.to.join(", ")}{m.cc?.length ? ` · Cc: ${m.cc.join(", ")}` : ""}</p> : null}
          {srcdoc ? (
            <iframe title={m.subject || "Email"} sandbox="" srcDoc={srcdoc} referrerPolicy="no-referrer" className="h-96 w-full rounded-lg border border-border bg-white" />
          ) : (
            <p className="max-h-96 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{m.text || "(no text)"}</p>
          )}
          {m.html ? (
            <button type="button" onClick={() => setFormatted(!formatted)} className="mt-2 text-xs text-primary hover:underline">
              {formatted ? "Show plain text" : "Show formatted"}
            </button>
          ) : null}
          {m.attachments.length ? (
            <ul className="mt-2 flex flex-wrap gap-2">
              {m.attachments.map((a, i) => (
                <li key={i} className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {a.name} · {formatSize(a.bytes)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function EmailThreadView({ memory, compact }: Props) {
  const meta = memory.extractedMetadata as { messages?: EmailMessage[]; truncated?: boolean };
  const messages = meta.messages ?? [];
  const [shown, setShown] = useState(compact ? 3 : 30);
  if (!messages.length) return <Notice>No messages were kept for this email.</Notice>;
  return (
    <ViewerFrame compact={compact} toolbar={<span className="text-xs text-muted-foreground">{messages.length} message{messages.length === 1 ? "" : "s"}{meta.truncated ? " · trimmed" : ""} · remote images blocked</span>}>
      <ul className="space-y-2">
        {messages.slice(0, shown).map((m, i) => (
          <Message key={m.id || i} m={m} initiallyOpen={messages.length === 1 || i === messages.length - 1} />
        ))}
      </ul>
      {messages.length > shown ? (
        <button type="button" className="mt-2 text-xs text-primary hover:underline" onClick={() => setShown(shown + 30)}>
          Show more ({messages.length - shown} left)
        </button>
      ) : null}
    </ViewerFrame>
  );
}
