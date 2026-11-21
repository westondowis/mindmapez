import type { ColumnType } from "@/lib/digestion/columns";
import { safeHttpUrl } from "@/lib/digestion/normalize";

const money = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const num = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

export function formatMoney(n: unknown): string {
  return typeof n === "number" && Number.isFinite(n) ? money.format(n) : "—";
}
export function formatNum(n: unknown): string {
  return typeof n === "number" && Number.isFinite(n) ? num.format(n) : "—";
}

/** Renders one digested cell by its inferred type. Links are http(s)/mailto/tel only. */
export function SmartCell({ value, type }: { value: unknown; type: ColumnType | "auto" }) {
  if (value === undefined || value === null || value === "") return <span className="text-muted-foreground/60">—</span>;
  if (Array.isArray(value)) {
    return (
      <span className="flex flex-col gap-0.5">
        {value.slice(0, 3).map((v, i) => (
          <SmartCell key={i} value={v} type={type} />
        ))}
      </span>
    );
  }
  const s = String(value);
  const t = type === "auto" ? (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? "email" : /^\+\d{7,15}$/.test(s) ? "phone" : /^https?:\/\//i.test(s) ? "url" : "text") : type;
  switch (t) {
    case "email":
      return <a className="text-primary hover:underline" href={`mailto:${encodeURIComponent(s).replace(/%40/g, "@")}`}>{s}</a>;
    case "phone":
      return <a className="text-primary hover:underline" href={`tel:${s.replace(/[^\d+]/g, "")}`}>{s}</a>;
    case "url": {
      const href = safeHttpUrl(s);
      return href ? <a className="break-all text-primary hover:underline" href={href} target="_blank" rel="noreferrer noopener">{s.replace(/^https?:\/\//i, "").slice(0, 60)}</a> : <span>{s}</span>;
    }
    case "image_url": {
      const href = safeHttpUrl(s);
      return href ? <img src={href} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-8 rounded object-cover" /> : <span>{s}</span>;
    }
    case "currency":
      return <span className="tabular-nums">{typeof value === "number" ? formatMoney(value) : s}</span>;
    case "number":
    case "percent":
      return <span className="tabular-nums">{typeof value === "number" ? formatNum(value) : s}</span>;
    case "boolean":
      return <span>{value === true || /^(true|yes|y|1)$/i.test(s) ? "Yes" : "No"}</span>;
    default:
      return <span className="line-clamp-3 break-words">{s}</span>;
  }
}
