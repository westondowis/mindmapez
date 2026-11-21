/**
 * RFC 5545 calendar parser: line unfolding, VEVENT fields, TZID, all-day dates, RRULE kept as text,
 * https-only join links. Plus an exporter that rebuilds an .ics from the stored fields. Pure.
 */
import type { CalendarEvent } from "./viewer-types.ts";

export const ICS_LIMITS = { maxEvents: 2000, maxText: 4000 } as const;

type Prop = { name: string; params: Record<string, string>; value: string };

export function unfoldIcs(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n").filter((l) => l.length);
}

function parseProp(line: string): Prop | null {
  // name;param=value;param="v:al":value
  let i = 0;
  let q = false;
  for (; i < line.length; i++) {
    const c = line[i];
    if (c === '"') q = !q;
    else if (c === ":" && !q) break;
  }
  if (i >= line.length) return null;
  const head = line.slice(0, i);
  const value = line.slice(i + 1);
  const [name, ...params] = head.split(";");
  const p: Record<string, string> = {};
  for (const kv of params) {
    const eq = kv.indexOf("=");
    if (eq > 0) p[kv.slice(0, eq).toUpperCase()] = kv.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name!.toUpperCase(), params: p, value };
}

export function unescapeIcsText(v: string): string {
  return v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
}

/** DATE or DATE-TIME → ISO string (UTC "Z" when given, floating/TZID local otherwise). */
export function icsDate(value: string, params: Record<string, string>): { iso: string; allDay: boolean; tz?: string } | null {
  const v = value.trim();
  const d = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (d || params.VALUE === "DATE") {
    const m = d ?? /^(\d{4})(\d{2})(\d{2})/.exec(v);
    if (!m) return null;
    return { iso: `${m[1]}-${m[2]}-${m[3]}`, allDay: true };
  }
  const t = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (!t) return null;
  const iso = `${t[1]}-${t[2]}-${t[3]}T${t[4]}:${t[5]}:${t[6] ?? "00"}${t[7] ? "Z" : ""}`;
  return { iso, allDay: false, tz: t[7] ? "UTC" : params.TZID?.slice(0, 64) };
}

const URL_RE = /https:\/\/[^\s<>"'\\,;)]+/i;
const MEETING_RE = /https:\/\/[^\s<>"'\\]*?(zoom\.us|meet\.google\.com|teams\.microsoft\.com|teams\.live\.com|webex\.com|whereby\.com|gotomeeting\.com|chime\.aws)[^\s<>"'\\,;)]*/i;

export function parseIcs(text: string): CalendarEvent[] {
  if (!/BEGIN:VCALENDAR/i.test(text) && !/BEGIN:VEVENT/i.test(text)) throw new Error("Not an iCalendar file");
  const events: CalendarEvent[] = [];
  let cur: Prop[] | null = null;
  let depth = 0;
  for (const line of unfoldIcs(text)) {
    const up = line.toUpperCase();
    if (up === "BEGIN:VEVENT") {
      cur = [];
      depth = 0;
      continue;
    }
    if (!cur) continue;
    if (up.startsWith("BEGIN:")) {
      depth++;
      continue;
    }
    if (up.startsWith("END:") && depth > 0) {
      depth--;
      continue;
    }
    if (up === "END:VEVENT") {
      const ev = toEvent(cur);
      if (ev) events.push(ev);
      cur = null;
      if (events.length >= ICS_LIMITS.maxEvents) break;
      continue;
    }
    if (depth === 0) {
      const p = parseProp(line);
      if (p) cur.push(p);
    }
  }
  return events;
}

function toEvent(props: Prop[]): CalendarEvent | null {
  const get = (n: string) => props.find((p) => p.name === n);
  const start = get("DTSTART");
  const s = start ? icsDate(start.value, start.params) : null;
  if (!s) return null;
  const endP = get("DTEND");
  const e = endP ? icsDate(endP.value, endP.params) : null;
  const clip = (v: string | undefined) => (v ? unescapeIcsText(v).slice(0, ICS_LIMITS.maxText) : undefined);
  const location = clip(get("LOCATION")?.value);
  const description = clip(get("DESCRIPTION")?.value);
  const conf = [get("URL")?.value, get("X-GOOGLE-CONFERENCE")?.value, get("CONFERENCE")?.value, location, description].filter(Boolean).join(" ");
  const join = MEETING_RE.exec(conf)?.[0] ?? URL_RE.exec([get("URL")?.value, get("X-GOOGLE-CONFERENCE")?.value].filter(Boolean).join(" "))?.[0];
  const organizer = get("ORGANIZER");
  const ev: CalendarEvent = {
    uid: (get("UID")?.value ?? `${s.iso}-${props.length}`).slice(0, 200),
    summary: clip(get("SUMMARY")?.value) ?? "Untitled event",
    start: s.iso,
    allDay: s.allDay,
  };
  if (e) ev.end = e.iso;
  if (s.tz) ev.tz = s.tz;
  if (location) ev.location = location;
  if (join) ev.joinUrl = join.slice(0, 2048);
  const rrule = get("RRULE")?.value;
  if (rrule) ev.rrule = rrule.slice(0, 300);
  if (organizer) ev.organizer = (organizer.params.CN ?? organizer.value.replace(/^mailto:/i, "")).slice(0, 200);
  const attendees = props.filter((p) => p.name === "ATTENDEE").map((p) => (p.params.CN ?? p.value.replace(/^mailto:/i, "")).slice(0, 200)).slice(0, 100);
  if (attendees.length) ev.attendees = attendees;
  if (description) ev.description = description;
  return ev;
}

function escapeIcsText(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
}

function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = " " + rest.slice(74);
  }
  out.push(rest);
  return out.join("\r\n");
}

function icsStamp(iso: string, allDay: boolean): { params: string; value: string } {
  if (allDay) return { params: ";VALUE=DATE", value: iso.slice(0, 10).replace(/-/g, "") };
  return { params: "", value: iso.replace(/[-:]/g, "").replace(/\.\d+/, "") };
}

export function buildIcs(events: CalendarEvent[]): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//MindMeld//Brain//EN"];
  for (const ev of events) {
    const s = icsStamp(ev.start, ev.allDay);
    lines.push("BEGIN:VEVENT", `UID:${ev.uid}`, `DTSTART${ev.tz && ev.tz !== "UTC" && !ev.allDay ? `;TZID=${ev.tz}` : ""}${s.params}:${s.value}`);
    if (ev.end) {
      const e = icsStamp(ev.end, ev.allDay);
      lines.push(`DTEND${ev.tz && ev.tz !== "UTC" && !ev.allDay ? `;TZID=${ev.tz}` : ""}${e.params}:${e.value}`);
    }
    lines.push(`SUMMARY:${escapeIcsText(ev.summary)}`);
    if (ev.location) lines.push(`LOCATION:${escapeIcsText(ev.location)}`);
    if (ev.description) lines.push(`DESCRIPTION:${escapeIcsText(ev.description)}`);
    if (ev.joinUrl) lines.push(`URL:${ev.joinUrl}`);
    if (ev.rrule) lines.push(`RRULE:${ev.rrule}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

function tzOffsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second")) - utcMs;
}

/**
 * The instant an event starts: "Z" times as-is, TZID wall times converted through Intl (IANA names),
 * floating or unknown-zone times read as the viewer's local time. All-day dates stay dates.
 */
export function icsInstant(iso: string, tz?: string): Date {
  if (/Z$/.test(iso) || /^\d{4}-\d{2}-\d{2}$/.test(iso)) return new Date(/Z$/.test(iso) ? iso : `${iso}T00:00:00`);
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(iso);
  if (!m) return new Date(iso);
  const wall = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!);
  if (!tz) return new Date(`${iso}`);
  try {
    let guess = wall - tzOffsetMs(wall, tz);
    guess = wall - tzOffsetMs(guess, tz);
    return new Date(guess);
  } catch {
    return new Date(`${iso}`);
  }
}
