import { useMemo, useState } from "react";
import { CalendarDays, Download, MapPin, Video } from "lucide-react";
import type { Memory } from "@/lib/types";
import type { CalendarEvent } from "@/lib/digestion/viewer-types";
import { buildIcs, icsInstant } from "@/lib/digestion/ics";
import { safeLink } from "@/lib/digestion/sanitize-html";
import { useMemoryMedia } from "./use-memory-media";
import { ViewerFrame } from "./viewer-kit";

type Props = { memory: Memory; compact?: boolean };

const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

function formatWhen(ev: CalendarEvent, tz?: string): string {
  if (ev.allDay) {
    const d = new Date(`${ev.start}T00:00:00`);
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) + " · all day";
  }
  const start = icsInstant(ev.start, ev.tz);
  const opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" };
  try {
    if (tz) opts.timeZone = tz;
    const end = ev.end ? icsInstant(ev.end, ev.tz) : null;
    const s = start.toLocaleString(undefined, opts);
    return end ? `${s} – ${end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", ...(tz ? { timeZone: tz } : {}) })}` : s;
  } catch {
    return start.toLocaleString();
  }
}

function validZone(tz?: string): string | undefined {
  if (!tz || tz === "UTC") return tz;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return undefined;
  }
}

export function CalendarEventView({ memory, compact }: Props) {
  const events = ((memory.extractedMetadata as { events?: CalendarEvent[] }).events ?? []) as CalendarEvent[];
  const media = useMemoryMedia(memory.id, memory.hasMedia);
  const [shown, setShown] = useState(compact ? 3 : 50);
  const sorted = useMemo(() => [...events].sort((a, b) => icsInstant(a.start, a.tz).getTime() - icsInstant(b.start, b.tz).getTime()), [events]);

  const exportIcs = (only?: CalendarEvent) => {
    const original = !only ? media.data?.mediaUrl : null;
    const href = original ?? URL.createObjectURL(new Blob([buildIcs(only ? [only] : events)], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = href;
    a.download = `${(only?.summary || memory.title || "event").replace(/[^\w.-]+/g, "_").slice(0, 60)}.ics`;
    a.click();
    if (!original) setTimeout(() => URL.revokeObjectURL(href), 1000);
  };

  return (
    <ViewerFrame
      compact={compact}
      toolbar={
        <>
          <span className="text-xs text-muted-foreground">
            {events.length} event{events.length === 1 ? "" : "s"} · shown in {LOCAL_TZ}
          </span>
          <button type="button" onClick={() => exportIcs()} className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline">
            <Download className="size-3.5" /> Export .ics
          </button>
        </>
      }
    >
      <ul className="space-y-2">
        {sorted.slice(0, shown).map((ev, i) => {
          const zone = validZone(ev.tz);
          const join = ev.joinUrl ? safeLink(ev.joinUrl) : null;
          return (
            <li key={`${ev.uid}-${i}`} className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-start gap-3">
                <CalendarDays className="mt-0.5 size-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{ev.summary || "Untitled event"}</p>
                  <p className="text-sm text-foreground/80">{formatWhen(ev)}</p>
                  {zone && zone !== LOCAL_TZ && !ev.allDay ? <p className="text-xs text-muted-foreground">Event time: {formatWhen(ev, zone)}</p> : null}
                  {ev.rrule ? <p className="text-xs text-muted-foreground">Repeats ({ev.rrule.slice(0, 80)})</p> : null}
                  {ev.location ? (
                    <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="size-3.5 shrink-0" /> <span className="min-w-0 break-words">{ev.location}</span>
                    </p>
                  ) : null}
                  {ev.organizer || ev.attendees?.length ? (
                    <p className="mt-1 text-xs text-muted-foreground">{[ev.organizer ? `Organizer: ${ev.organizer}` : "", ev.attendees?.length ? `${ev.attendees.length} attendee${ev.attendees.length === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ")}</p>
                  ) : null}
                  {ev.description && !compact ? <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-sm text-foreground/80">{ev.description}</p> : null}
                  <div className="mt-2 flex flex-wrap gap-3">
                    {join && join.startsWith("https:") ? (
                      <a href={join} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground">
                        <Video className="size-3.5" /> Join
                      </a>
                    ) : null}
                    {events.length > 1 ? (
                      <button type="button" onClick={() => exportIcs(ev)} className="text-xs text-primary hover:underline">
                        Add this one to calendar
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {sorted.length > shown ? (
        <button type="button" className="mt-2 text-xs text-primary hover:underline" onClick={() => setShown(shown + 50)}>
          Show more ({sorted.length - shown} left)
        </button>
      ) : null}
    </ViewerFrame>
  );
}
