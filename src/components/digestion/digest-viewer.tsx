import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Mail, Phone, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ColumnDef, ColumnType } from "@/lib/digestion/columns";
import { ARCHETYPE_LABEL, type DigestArchetype, type SchemaJson } from "@/lib/digestion/detect";
import type { SummaryMetrics } from "@/lib/digestion/metrics";
import { safeHttpUrl } from "@/lib/digestion/normalize";
import { getDigestForMemory, queryDigestedRows } from "@/lib/server/digestion";
import { formatMoney, formatNum, SmartCell } from "./smart-cell";

type Row = { rowIndex: number; canonical: Record<string, unknown>; custom: Record<string, unknown> };
type Header = { datasetId: string; archetype: DigestArchetype; status: string; filename: string; rowCount: number; schema: SchemaJson; metrics: SummaryMetrics };
type HasFilter = "phone" | "email" | "avatar" | "website";

const CANONICAL_TYPE: Record<string, ColumnType> = {
  amount: "currency", assessedValue: "currency", offerValue: "currency", pricePerAcre: "currency", debit: "currency",
  credit: "currency", balance: "currency", revenue: "currency", expense: "currency",
  acreage: "number", qty: "number", durationSec: "number", lat: "number", lng: "number",
  phones: "phone", ownerPhone: "phone", emails: "email", ownerEmail: "email", website: "url", avatarUrl: "image_url",
};

const PAGE = 50;

/** Interactive viewer for a digested dataset: archetype metrics, search, filters, sort and paging. */
export function DigestViewer({ memoryId }: { memoryId: string }) {
  const header = useQuery({ queryKey: ["digest", memoryId], queryFn: () => getDigestForMemory({ data: memoryId }) });
  if (header.isPending) return <p role="status" className="mt-4 text-sm text-muted-foreground">Loading dataset…</p>;
  const h = header.data as unknown as Header | null;
  if (!h) return <p className="mt-4 text-sm text-muted-foreground">This dataset's rows are no longer available.</p>;
  if (h.status !== "ready") return <p className="mt-4 text-sm text-muted-foreground">This dataset didn't finish uploading. Import the file again to rebuild it.</p>;
  return <DatasetBody header={h} />;
}

function DatasetBody({ header }: { header: Header }) {
  const { archetype, schema, metrics } = header;
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [offset, setOffset] = useState(0);
  const [has, setHas] = useState<HasFilter[]>([]);
  const [status, setStatus] = useState<string>("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setOffset(0), [debounced, has, status, sort]);
  const rows = useQuery({
    queryKey: ["digest-rows", header.datasetId, debounced, offset, has, status, sort],
    queryFn: () =>
      queryDigestedRows({
        data: {
          datasetId: header.datasetId,
          limit: PAGE,
          offset,
          search: debounced || undefined,
          filters: { has, eq: status ? { status } : undefined },
          sortBy: sort ?? undefined,
        },
      }),
    placeholderData: keepPreviousData,
  });
  const list = (rows.data?.rows ?? []) as Row[];
  const total = rows.data?.total ?? 0;

  return (
    <section className="mt-4 space-y-3" aria-label={`${ARCHETYPE_LABEL[archetype]} dataset`}>
      <MetricsStrip archetype={archetype} metrics={metrics} rowCount={header.rowCount} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Search rows</span>
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${header.rowCount.toLocaleString()} rows…`} className="pl-8" />
        </label>
        {archetype === "contacts_crm" ? (
          <div role="group" aria-label="Contact filters" className="flex flex-wrap gap-1.5">
            {(["phone", "email", "avatar", "website"] as const).map((f) => (
              <Button key={f} type="button" size="sm" variant={has.includes(f) ? "default" : "outline"} aria-pressed={has.includes(f)} onClick={() => setHas((c) => (c.includes(f) ? c.filter((x) => x !== f) : [...c, f]))}>
                Has {f}
              </Button>
            ))}
          </div>
        ) : null}
        {archetype === "invoice_ledger" ? (
          <select aria-label="Invoice status" value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
            <option value="">All statuses</option>
            {["paid", "open", "overdue", "void"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        ) : null}
      </div>
      {rows.isError || rows.data?.ok === false ? (
        <p role="alert" className="text-sm text-destructive">{rows.data && "error" in rows.data ? rows.data.error : "Could not load rows."}</p>
      ) : archetype === "contacts_crm" ? (
        <ContactsList rows={list} />
      ) : (
        <RowsTable archetype={archetype} schema={schema} rows={list} sort={sort} onSort={setSort} />
      )}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span role="status">{rows.isFetching ? "Loading…" : total ? `${offset + 1}–${Math.min(offset + PAGE, total)} of ${total.toLocaleString()}` : "No matching rows"}</span>
        <span className="flex gap-1">
          <Button type="button" size="icon" variant="ghost" aria-label="Previous rows" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}><ChevronLeft className="size-4" /></Button>
          <Button type="button" size="icon" variant="ghost" aria-label="Next rows" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}><ChevronRight className="size-4" /></Button>
        </span>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium tabular-nums">{value}</p>
    </div>
  );
}

export function MetricsStrip({ archetype, metrics, rowCount }: { archetype: DigestArchetype; metrics: SummaryMetrics; rowCount: number }) {
  const stats: [string, string][] = [[ARCHETYPE_LABEL[archetype], rowCount.toLocaleString() + " rows"]];
  if (metrics.contacts) stats.push(["With phone", metrics.contacts.withPhone.toLocaleString()], ["With email", metrics.contacts.withEmail.toLocaleString()], ["With photo", metrics.contacts.withAvatar.toLocaleString()]);
  if (metrics.invoices) stats.push(["Total", formatMoney(metrics.invoices.total)], ["Paid", formatMoney(metrics.invoices.paid)], ["Open", formatMoney(metrics.invoices.open)], ["Overdue", formatMoney(metrics.invoices.overdue)]);
  if (metrics.parcels) stats.push(["Acres", formatNum(metrics.parcels.totalAcres)], ["Assessed", formatMoney(metrics.parcels.totalAssessed)], ["Median $/acre", formatMoney(metrics.parcels.medianPricePerAcre)]);
  if (metrics.financial) stats.push(["Debits", formatMoney(metrics.financial.debit)], ["Credits", formatMoney(metrics.financial.credit)], ["Net", formatMoney(metrics.financial.net)]);
  if (metrics.comms) stats.push(["Inbound", String(metrics.comms.inbound)], ["Outbound", String(metrics.comms.outbound)], ["Missed", String(metrics.comms.missed)], ["Talk time", `${Math.round(metrics.comms.totalDurationSec / 60)} min`]);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map(([l, v]) => (
          <Stat key={l} label={l} value={v} />
        ))}
      </div>
      {metrics.invoices?.byCategory.length ? (
        <p className="text-xs text-muted-foreground">Top categories: {metrics.invoices.byCategory.slice(0, 4).map((c) => `${c.name} ${formatMoney(c.total)}`).join(" · ")}</p>
      ) : null}
      {metrics.parcels?.counties.length ? (
        <p className="text-xs text-muted-foreground">Counties: {metrics.parcels.counties.slice(0, 5).map((c) => `${c.name} (${c.count})`).join(" · ")}</p>
      ) : null}
    </div>
  );
}

function ContactsList({ rows }: { rows: Row[] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2" aria-label="Contacts">
      {rows.map((r) => {
        const c = r.canonical;
        const name = String(c.name ?? ([c.firstName, c.lastName].filter(Boolean).join(" ") || c.company || "Unnamed"));
        const phones = (Array.isArray(c.phones) ? c.phones : []) as string[];
        const emails = (Array.isArray(c.emails) ? c.emails : []) as string[];
        const avatar = typeof c.avatarUrl === "string" ? safeHttpUrl(c.avatarUrl) : undefined;
        return (
          <li key={r.rowIndex} className="flex gap-3 rounded-xl border border-border bg-card p-3">
            {avatar ? (
              <img src={avatar} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-10 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-sm font-medium">{name.slice(0, 1).toUpperCase()}</span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{name}</p>
              {c.company || c.title ? <p className="truncate text-xs text-muted-foreground">{[c.title, c.company].filter(Boolean).join(" · ")}</p> : null}
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {phones.slice(0, 2).map((p) => (
                  <a key={p} href={`tel:${p.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 text-primary"><Phone className="size-3" />{p}</a>
                ))}
                {emails.slice(0, 2).map((e) => (
                  <a key={e} href={`mailto:${e}`} className="inline-flex min-w-0 items-center gap-1 truncate text-primary"><Mail className="size-3" />{e}</a>
                ))}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

type Col = { id: string; label: string; type: ColumnType; get: (r: Row) => unknown; sortKey?: string };

function columnsFor(archetype: DigestArchetype, schema: SchemaJson): Col[] {
  const cols: Col[] = [];
  const byCanonical = new Map<string, ColumnDef>();
  for (const c of schema.columns) if (c.canonical) byCanonical.set(c.canonical, c);
  if (archetype !== "generic_table") {
    for (const c of schema.columns) {
      if (!c.canonical) continue;
      const key = c.canonical;
      cols.push({ id: `c:${key}`, label: c.header, type: CANONICAL_TYPE[key] ?? (key.toLowerCase().includes("date") ? "date" : c.type), get: (r) => r.canonical[key], sortKey: key });
    }
    if (archetype === "real_estate_parcels") cols.push({ id: "c:pricePerAcre", label: "$ / acre", type: "currency", get: (r) => r.canonical.pricePerAcre, sortKey: "pricePerAcre" });
  }
  for (const c of schema.columns) {
    if (c.canonical && archetype !== "generic_table") continue;
    cols.push({ id: `x:${c.key}`, label: c.header, type: c.type, get: (r) => r.custom[c.key] });
  }
  return cols.slice(0, 40);
}

function RowsTable({ archetype, schema, rows, sort, onSort }: { archetype: DigestArchetype; schema: SchemaJson; rows: Row[]; sort: { key: string; dir: "asc" | "desc" } | null; onSort: (s: { key: string; dir: "asc" | "desc" } | null) => void }) {
  const cols = useMemo(() => columnsFor(archetype, schema), [archetype, schema]);
  return (
    <div className="max-h-[60dvh] overflow-auto rounded-xl border border-border">
      <table className="w-full min-w-max border-collapse text-left text-xs">
        <thead className="sticky top-0 bg-secondary/95 backdrop-blur">
          <tr>
            {cols.map((c) => {
              const active = sort?.key === c.sortKey;
              return (
                <th key={c.id} scope="col" className="whitespace-nowrap px-2.5 py-2 font-medium">
                  {c.sortKey ? (
                    <button type="button" className="hover:text-primary" aria-label={`Sort by ${c.label}`} onClick={() => onSort(active && sort?.dir === "desc" ? null : { key: c.sortKey!, dir: active ? "desc" : "asc" })}>
                      {c.label}
                      {active ? (sort?.dir === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.rowIndex} className="border-t border-border align-top">
              {cols.map((c) => (
                <td key={c.id} className="max-w-[16rem] px-2.5 py-1.5">
                  <SmartCell value={c.get(r)} type={c.type} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
