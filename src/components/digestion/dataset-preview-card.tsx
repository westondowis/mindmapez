import { useState } from "react";
import { retargetDraft, switchDraftSheet, type DatasetDraft } from "@/lib/digestion/dataset-draft";
import { ARCHETYPE_LABEL, DIGEST_ARCHETYPES, type DigestArchetype } from "@/lib/digestion/detect";

/** Queue preview for a parsed table: detected type (overridable), sheet picker and first rows. */
export function DatasetPreviewCard({ draft, onChange, disabled }: { draft: DatasetDraft; onChange: (d: DatasetDraft) => void; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confidence = Math.round(draft.schema.confidence * 100);
  const mapped = draft.schema.columns.filter((c) => c.canonical).length;
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-border bg-background/60 p-2.5 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Looks like</span>
          <select
            aria-label="Dataset type"
            disabled={disabled}
            value={draft.schema.archetype}
            onChange={(e) => onChange(retargetDraft(draft, e.target.value as DigestArchetype))}
            className="h-8 rounded-md border border-border bg-background px-1.5"
          >
            {DIGEST_ARCHETYPES.map((a) => (
              <option key={a} value={a}>{ARCHETYPE_LABEL[a]}</option>
            ))}
          </select>
        </label>
        {draft.schema.archetype !== "generic_table" ? <span className="text-muted-foreground">{confidence}% sure · {mapped} of {draft.schema.columns.length} columns understood</span> : null}
        {draft.sheets && draft.sheets.length > 1 ? (
          <label className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Sheet</span>
            <select
              aria-label="Worksheet"
              disabled={disabled || busy}
              value={draft.sheetPath}
              onChange={async (e) => {
                setBusy(true);
                setError(null);
                const next = await switchDraftSheet(draft, e.target.value);
                setBusy(false);
                if ("error" in next) setError(next.error);
                else onChange(next);
              }}
              className="h-8 rounded-md border border-border bg-background px-1.5"
            >
              {draft.sheets.map((s) => (
                <option key={s.path} value={s.path}>{s.name}</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {error ? <p role="alert" className="text-destructive">{error}</p> : null}
      <div className="max-h-36 overflow-auto rounded border border-border">
        <table className="w-full min-w-max text-left">
          <thead className="bg-secondary/80">
            <tr>
              {draft.schema.columns.slice(0, 8).map((c) => (
                <th key={c.key} scope="col" className="whitespace-nowrap px-2 py-1 font-medium">
                  {c.header}
                  {c.canonical ? <span className="ml-1 text-primary">· {c.canonical}</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {draft.rows.slice(0, 5).map((r, i) => (
              <tr key={i} className="border-t border-border">
                {r.slice(0, 8).map((v, j) => (
                  <td key={j} className="max-w-[10rem] truncate px-2 py-1">{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground">
        {draft.rows.length.toLocaleString()} rows · {draft.schema.columns.length} columns{draft.truncated ? " · trimmed to 100,000 rows" : ""} · counts as 1 memory
      </p>
    </div>
  );
}
