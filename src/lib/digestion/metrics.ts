/** Summary metrics per archetype, accumulated row by row (server streams rows in pages). Pure. */
import type { DigestArchetype } from "./detect.ts";

export type SummaryMetrics = {
  rows: number;
  contacts?: { withPhone: number; withEmail: number; withAvatar: number; withWebsite: number; fillPct: Record<string, number> };
  invoices?: { total: number; paid: number; open: number; overdue: number; voided: number; byCategory: { name: string; total: number; count: number }[]; firstDate?: string; lastDate?: string };
  parcels?: { totalAcres: number; totalAssessed: number; medianAssessed: number | null; medianPricePerAcre: number | null; counties: { name: string; count: number }[] };
  financial?: { debit: number; credit: number; net: number };
  comms?: { inbound: number; outbound: number; missed: number; other: number; totalDurationSec: number };
};

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

export class MetricsAccumulator {
  private rows = 0;
  private c = { withPhone: 0, withEmail: 0, withAvatar: 0, withWebsite: 0, fields: new Map<string, number>() };
  private inv = { total: 0, paid: 0, open: 0, overdue: 0, voided: 0, cats: new Map<string, { total: number; count: number }>(), first: "", last: "" };
  private par = { acres: 0, assessed: 0, assessedList: [] as number[], ppa: [] as number[], counties: new Map<string, number>() };
  private fin = { debit: 0, credit: 0 };
  private com = { inbound: 0, outbound: 0, missed: 0, other: 0, dur: 0 };

  private archetype: DigestArchetype;
  constructor(archetype: DigestArchetype) {
    this.archetype = archetype;
  }

  add(canonical: Record<string, unknown>) {
    this.rows++;
    switch (this.archetype) {
      case "contacts_crm": {
        if (Array.isArray(canonical.phones) && canonical.phones.length) this.c.withPhone++;
        if (Array.isArray(canonical.emails) && canonical.emails.length) this.c.withEmail++;
        if (canonical.avatarUrl) this.c.withAvatar++;
        if (canonical.website) this.c.withWebsite++;
        for (const k of Object.keys(canonical)) this.c.fields.set(k, (this.c.fields.get(k) ?? 0) + 1);
        break;
      }
      case "invoice_ledger": {
        const amt = num(canonical.amount) ?? 0;
        const status = String(canonical.status ?? "");
        if (status === "void") this.inv.voided += amt;
        else {
          this.inv.total += amt;
          if (status === "paid") this.inv.paid += amt;
          else if (status === "overdue") this.inv.overdue += amt;
          else this.inv.open += amt;
        }
        const cat = String(canonical.category ?? "Uncategorized") || "Uncategorized";
        const e = this.inv.cats.get(cat) ?? { total: 0, count: 0 };
        e.total += status === "void" ? 0 : amt;
        e.count++;
        this.inv.cats.set(cat, e);
        const d = typeof canonical.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(canonical.date) ? canonical.date : "";
        if (d) {
          if (!this.inv.first || d < this.inv.first) this.inv.first = d;
          if (!this.inv.last || d > this.inv.last) this.inv.last = d;
        }
        break;
      }
      case "real_estate_parcels": {
        const acres = num(canonical.acreage);
        const assessed = num(canonical.assessedValue);
        if (acres && acres > 0) this.par.acres += acres;
        if (assessed !== undefined) {
          this.par.assessed += assessed;
          this.par.assessedList.push(assessed);
        }
        const ppa = num(canonical.pricePerAcre);
        if (ppa !== undefined) this.par.ppa.push(ppa);
        if (canonical.county) this.par.counties.set(String(canonical.county), (this.par.counties.get(String(canonical.county)) ?? 0) + 1);
        break;
      }
      case "financial_statement":
        this.fin.debit += num(canonical.debit) ?? 0;
        this.fin.credit += num(canonical.credit) ?? 0;
        break;
      case "communication_log": {
        const d = String(canonical.direction ?? "");
        if (d === "inbound") this.com.inbound++;
        else if (d === "outbound") this.com.outbound++;
        else if (d === "missed") this.com.missed++;
        else this.com.other++;
        this.com.dur += num(canonical.durationSec) ?? 0;
        break;
      }
      default:
        break;
    }
  }

  result(): SummaryMetrics {
    const m: SummaryMetrics = { rows: this.rows };
    const pct = (n: number) => (this.rows ? Math.round((n / this.rows) * 1000) / 10 : 0);
    if (this.archetype === "contacts_crm") {
      m.contacts = {
        withPhone: this.c.withPhone,
        withEmail: this.c.withEmail,
        withAvatar: this.c.withAvatar,
        withWebsite: this.c.withWebsite,
        fillPct: Object.fromEntries([...this.c.fields].map(([k, n]) => [k, pct(n)])),
      };
    } else if (this.archetype === "invoice_ledger") {
      m.invoices = {
        total: round2(this.inv.total),
        paid: round2(this.inv.paid),
        open: round2(this.inv.open),
        overdue: round2(this.inv.overdue),
        voided: round2(this.inv.voided),
        byCategory: [...this.inv.cats]
          .map(([name, e]) => ({ name, total: round2(e.total), count: e.count }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 12),
        firstDate: this.inv.first || undefined,
        lastDate: this.inv.last || undefined,
      };
    } else if (this.archetype === "real_estate_parcels") {
      const ma = median(this.par.assessedList);
      const mp = median(this.par.ppa);
      m.parcels = {
        totalAcres: round2(this.par.acres),
        totalAssessed: round2(this.par.assessed),
        medianAssessed: ma === null ? null : round2(ma),
        medianPricePerAcre: mp === null ? null : round2(mp),
        counties: [...this.par.counties].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 12),
      };
    } else if (this.archetype === "financial_statement") {
      m.financial = { debit: round2(this.fin.debit), credit: round2(this.fin.credit), net: round2(this.fin.debit - this.fin.credit) };
    } else if (this.archetype === "communication_log") {
      const { inbound, outbound, missed, other, dur } = this.com;
      m.comms = { inbound, outbound, missed, other, totalDurationSec: dur };
    }
    return m;
  }
}

export function summarize(archetype: DigestArchetype, rows: Record<string, unknown>[]): SummaryMetrics {
  const acc = new MetricsAccumulator(archetype);
  for (const r of rows) acc.add(r);
  return acc.result();
}
