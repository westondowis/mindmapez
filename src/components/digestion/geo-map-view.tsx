import { useMemo, useState } from "react";
import { ExternalLink, MapPin, Route } from "lucide-react";
import type { Memory } from "@/lib/types";
import type { GeoFeature } from "@/lib/digestion/viewer-types";
import { Notice, ViewerFrame } from "./viewer-kit";

type Props = { memory: Memory; compact?: boolean };
type Meta = { bbox?: [number, number, number, number] | null; features?: GeoFeature[]; truncated?: boolean };

const W = 640;
const H = 400;
const PAD = 24;

function mapsLink(f: GeoFeature): string {
  const [lat, lng] = f.coords[0] ?? [0, 0];
  if (f.kind === "point" || f.coords.length < 2) return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;
  const last = f.coords[f.coords.length - 1]!;
  return `https://www.google.com/maps/dir/?api=1&origin=${lat.toFixed(6)},${lng.toFixed(6)}&destination=${last[0].toFixed(6)},${last[1].toFixed(6)}`;
}

/** Equirectangular plot (lng → x, lat → y, cos(lat) aspect) with no tiles or network. */
export function projectGeo(bbox: [number, number, number, number]) {
  const [minLat, minLng, maxLat, maxLng] = bbox;
  const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180);
  const spanX = Math.max((maxLng - minLng) * Math.cos(midLat), 1e-6);
  const spanY = Math.max(maxLat - minLat, 1e-6);
  const scale = Math.min((W - PAD * 2) / spanX, (H - PAD * 2) / spanY);
  const offX = (W - spanX * scale) / 2;
  const offY = (H - spanY * scale) / 2;
  return ([lat, lng]: [number, number]) => [offX + (lng - minLng) * Math.cos(midLat) * scale, H - (offY + (lat - minLat) * scale)] as const;
}

export function GeoMapView({ memory, compact }: Props) {
  const meta = memory.extractedMetadata as Meta;
  const features = meta.features ?? [];
  const [active, setActive] = useState<number | null>(null);
  const project = useMemo(() => (meta.bbox ? projectGeo(meta.bbox) : null), [meta.bbox]);
  if (!features.length || !project) return <Notice>No mappable points were found.</Notice>;
  const totalKm = features.reduce((s, f) => s + (f.lengthKm ?? 0), 0);
  return (
    <ViewerFrame compact={compact} toolbar={<span className="text-xs text-muted-foreground">{features.length} feature{features.length === 1 ? "" : "s"}{totalKm ? ` · ${totalKm.toFixed(1)} km` : ""}{meta.truncated ? " · simplified" : ""}</span>}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Map of ${memory.title}`} className="w-full rounded-xl border border-border bg-[#eef4f7] dark:bg-slate-900">
        {features.map((f, i) => {
          const pts = f.coords.map((c) => project(c));
          const on = active === i;
          if (f.kind === "point") {
            const [x, y] = pts[0]!;
            return <circle key={i} cx={x} cy={y} r={on ? 7 : 5} className="fill-rose-500 stroke-white" strokeWidth={1.5} onMouseEnter={() => setActive(i)} onClick={() => setActive(i)}><title>{f.name ?? "Point"}</title></circle>;
          }
          const d = pts.map(([x, y], k) => `${k ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("") + (f.kind === "polygon" ? "Z" : "");
          return <path key={i} d={d} fill={f.kind === "polygon" ? "rgba(59,130,246,0.15)" : "none"} stroke={on ? "#f43f5e" : "#2563eb"} strokeWidth={on ? 3.5 : 2.2} strokeLinejoin="round" onMouseEnter={() => setActive(i)} onClick={() => setActive(i)}><title>{f.name ?? "Track"}</title></path>;
        })}
      </svg>
      <ul className={`mt-2 space-y-1 overflow-y-auto ${compact ? "max-h-32" : "max-h-72"}`}>
        {features.slice(0, 300).map((f, i) => (
          <li key={i} className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm ${active === i ? "bg-muted" : ""}`} onMouseEnter={() => setActive(i)}>
            {f.kind === "point" ? <MapPin className="size-3.5 shrink-0 text-rose-500" /> : <Route className="size-3.5 shrink-0 text-blue-600" />}
            <span className="min-w-0 flex-1 truncate">{f.name || (f.kind === "point" ? "Point" : "Track")}{f.lengthKm ? ` · ${f.lengthKm.toFixed(1)} km` : ""}</span>
            <a href={mapsLink(f)} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline">
              Google Maps <ExternalLink className="size-3" />
            </a>
          </li>
        ))}
      </ul>
    </ViewerFrame>
  );
}
