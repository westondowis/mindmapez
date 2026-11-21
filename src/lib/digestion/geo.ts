/** KML / GPX / GeoJSON → points and lines with bbox and haversine lengths. Pure (xml-lite, no DOM). */
import type { GeoFeature, JsonValue } from "./viewer-types.ts";
import { findAll, findFirst, localName, parseXml, textOf, type XmlNode } from "./xml-lite.ts";

export const GEO_LIMITS = { maxFeatures: 2000, maxPointsPerLine: 2000 } as const;

export type GeoResult = { features: GeoFeature[]; bbox: [number, number, number, number] | null; truncated: boolean };

export function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371.0088;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function validLatLng(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/** Evenly thin a long track so metadata stays small; length is computed on the full track first. */
function thin(coords: [number, number][]): [number, number][] {
  if (coords.length <= GEO_LIMITS.maxPointsPerLine) return coords;
  const step = coords.length / GEO_LIMITS.maxPointsPerLine;
  const out: [number, number][] = [];
  for (let i = 0; i < GEO_LIMITS.maxPointsPerLine; i++) out.push(coords[Math.floor(i * step)]!);
  out.push(coords[coords.length - 1]!);
  return out;
}

function finish(raw: GeoFeature[], truncatedIn = false): GeoResult {
  let truncated = truncatedIn || raw.length > GEO_LIMITS.maxFeatures;
  const features = raw.slice(0, GEO_LIMITS.maxFeatures).map((f) => {
    const round = (c: [number, number]): [number, number] => [Math.round(c[0] * 1e6) / 1e6, Math.round(c[1] * 1e6) / 1e6];
    if (f.kind !== "point" && f.coords.length > 1) {
      let km = 0;
      for (let i = 1; i < f.coords.length; i++) km += haversineKm(f.coords[i - 1]!, f.coords[i]!);
      f.lengthKm = Math.round(km * 1000) / 1000;
      if (f.coords.length > GEO_LIMITS.maxPointsPerLine) truncated = true;
      f.coords = thin(f.coords);
    }
    f.coords = f.coords.map(round);
    return f;
  });
  let bbox: [number, number, number, number] | null = null;
  for (const f of features) {
    for (const [lat, lng] of f.coords) {
      if (!bbox) bbox = [lat, lng, lat, lng];
      else bbox = [Math.min(bbox[0], lat), Math.min(bbox[1], lng), Math.max(bbox[2], lat), Math.max(bbox[3], lng)];
    }
  }
  return { features, bbox, truncated };
}

function kmlCoords(text: string): [number, number][] {
  const out: [number, number][] = [];
  for (const tuple of text.trim().split(/\s+/)) {
    const [lng, lat] = tuple.split(",").map(Number);
    if (validLatLng(lat!, lng!)) out.push([lat!, lng!]);
  }
  return out;
}

export function parseKml(xml: string): GeoResult {
  const doc = parseXml(xml);
  const raw: GeoFeature[] = [];
  for (const pm of findAll(doc, "Placemark")) {
    const name = textOf(findFirst(pm, "name")).trim().slice(0, 200) || undefined;
    const description = textOf(findFirst(pm, "description")).trim().replace(/<[^>]+>/g, " ").slice(0, 500) || undefined;
    const push = (kind: GeoFeature["kind"], node: XmlNode) => {
      const coords = kmlCoords(textOf(findFirst(node, "coordinates")));
      if (coords.length) raw.push({ kind, name, description, coords });
    };
    for (const n of findAll(pm, "Point")) push("point", n);
    for (const n of findAll(pm, "LineString")) push("line", n);
    for (const n of findAll(pm, "LinearRing")) push("polygon", n);
    for (const t of findAll(pm, "Track")) {
      const coords = findAll(t, "coord").map((c) => c.text.trim().split(/\s+/).map(Number)).filter((v) => validLatLng(v[1]!, v[0]!)).map((v): [number, number] => [v[1]!, v[0]!]);
      if (coords.length) raw.push({ kind: "line", name, description, coords });
    }
    if (raw.length > GEO_LIMITS.maxFeatures) break;
  }
  return finish(raw);
}

export function parseGpx(xml: string): GeoResult {
  const doc = parseXml(xml);
  const raw: GeoFeature[] = [];
  const pt = (n: XmlNode): [number, number] | null => {
    const lat = Number(n.attrs.lat);
    const lng = Number(n.attrs.lon);
    return validLatLng(lat, lng) ? [lat, lng] : null;
  };
  const nameOf = (n: XmlNode) => textOf(n.children.find((c) => localName(c.name) === "name")).trim().slice(0, 200) || undefined;
  for (const w of findAll(doc, "wpt")) {
    const c = pt(w);
    if (c) raw.push({ kind: "point", name: nameOf(w), coords: [c] });
  }
  for (const trk of findAll(doc, "trk")) {
    for (const seg of findAll(trk, "trkseg")) {
      const coords = findAll(seg, "trkpt").map(pt).filter((c): c is [number, number] => !!c);
      if (coords.length) raw.push({ kind: "line", name: nameOf(trk), coords });
    }
  }
  for (const rte of findAll(doc, "rte")) {
    const coords = findAll(rte, "rtept").map(pt).filter((c): c is [number, number] => !!c);
    if (coords.length) raw.push({ kind: "line", name: nameOf(rte), coords });
  }
  return finish(raw);
}

export function isGeoJson(v: JsonValue): boolean {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const t = (v as { type?: unknown }).type;
  return t === "FeatureCollection" || t === "Feature" || t === "Point" || t === "LineString" || t === "MultiLineString" || t === "Polygon" || t === "MultiPoint" || t === "MultiPolygon";
}

export function parseGeoJson(v: JsonValue): GeoResult {
  const raw: GeoFeature[] = [];
  const toLL = (c: unknown): [number, number] | null => (Array.isArray(c) && validLatLng(Number(c[1]), Number(c[0])) ? [Number(c[1]), Number(c[0])] : null);
  const line = (cs: unknown) => (Array.isArray(cs) ? cs.map(toLL).filter((x): x is [number, number] => !!x) : []);
  const geom = (g: unknown, name?: string, description?: string) => {
    if (!g || typeof g !== "object" || raw.length > GEO_LIMITS.maxFeatures) return;
    const o = g as { type?: string; coordinates?: unknown; geometries?: unknown[] };
    switch (o.type) {
      case "Point": {
        const c = toLL(o.coordinates);
        if (c) raw.push({ kind: "point", name, description, coords: [c] });
        break;
      }
      case "MultiPoint":
        for (const c of line(o.coordinates)) raw.push({ kind: "point", name, description, coords: [c] });
        break;
      case "LineString":
        raw.push({ kind: "line", name, description, coords: line(o.coordinates) });
        break;
      case "MultiLineString":
        for (const l of (o.coordinates as unknown[]) ?? []) raw.push({ kind: "line", name, description, coords: line(l) });
        break;
      case "Polygon":
        raw.push({ kind: "polygon", name, description, coords: line((o.coordinates as unknown[])?.[0]) });
        break;
      case "MultiPolygon":
        for (const p of (o.coordinates as unknown[][]) ?? []) raw.push({ kind: "polygon", name, description, coords: line(p?.[0]) });
        break;
      case "GeometryCollection":
        for (const x of o.geometries ?? []) geom(x, name, description);
        break;
    }
  };
  const feature = (f: unknown) => {
    if (!f || typeof f !== "object") return;
    const o = f as { geometry?: unknown; properties?: Record<string, unknown> | null };
    const p = o.properties ?? {};
    const name = typeof p.name === "string" ? p.name.slice(0, 200) : typeof p.title === "string" ? p.title.slice(0, 200) : undefined;
    const description = typeof p.description === "string" ? p.description.slice(0, 500) : undefined;
    geom(o.geometry, name, description);
  };
  const o = v as { type?: string; features?: unknown[] };
  if (o.type === "FeatureCollection") for (const f of o.features ?? []) feature(f);
  else if (o.type === "Feature") feature(o);
  else geom(o);
  return finish(raw.filter((f) => f.coords.length));
}

export function geoText(r: GeoResult): string {
  return r.features
    .map((f) => [f.name, f.description].filter(Boolean).join(" — "))
    .filter(Boolean)
    .join("\n")
    .slice(0, 50_000);
}
