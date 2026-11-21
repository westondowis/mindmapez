/**
 * Routes an upload by extension + MIME + magic bytes. Pure (tests run in node). The dispatcher maps
 * each route to its parser and viewer.
 */

export type Route =
  | "csv" | "tsv" | "xlsx" | "xls" | "json" | "yaml" | "xml" | "html" | "svg"
  | "image" | "gif" | "heic" | "video" | "audio"
  | "pdf" | "docx" | "doc" | "rtf" | "epub" | "txt" | "md"
  | "ics" | "vcf" | "eml" | "mbox" | "msg" | "kml" | "kmz" | "gpx" | "zip"
  | "other";

const EXT: Record<string, Route> = {
  csv: "csv", tsv: "tsv", tab: "tsv", xlsx: "xlsx", xlsm: "xlsx", xls: "xls",
  json: "json", ndjson: "json", jsonl: "json", geojson: "json",
  yaml: "yaml", yml: "yaml", xml: "xml", html: "html", htm: "html", xhtml: "html", svg: "svg",
  jpg: "image", jpeg: "image", png: "image", webp: "image", avif: "image", bmp: "image", gif: "gif",
  heic: "heic", heif: "heic",
  mp4: "video", m4v: "video", mov: "video", webm: "video", mpeg: "video", mpg: "video", mkv: "video", avi: "video",
  wav: "audio", mp3: "audio", m4a: "audio", ogg: "audio", oga: "audio", opus: "audio", aac: "audio", flac: "audio",
  pdf: "pdf", docx: "docx", doc: "doc", rtf: "rtf", epub: "epub",
  txt: "txt", text: "txt", log: "txt", md: "md", markdown: "md", mdx: "md",
  ics: "ics", ical: "ics", ifb: "ics", vcf: "vcf", vcard: "vcf",
  eml: "eml", mbox: "mbox", msg: "msg", kml: "kml", kmz: "kmz", gpx: "gpx", zip: "zip",
};

export function extensionOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name.trim());
  return m ? m[1]!.toLowerCase() : "";
}

function startsWith(head: Uint8Array | undefined, bytes: number[], offset = 0): boolean {
  if (!head || head.length < offset + bytes.length) return false;
  return bytes.every((b, i) => head[offset + i] === b);
}

function ascii(head: Uint8Array | undefined, from: number, to: number): string {
  if (!head) return "";
  return String.fromCharCode(...head.slice(from, Math.min(to, head.length)));
}

export function sniffRoute(name: string, mime: string, head?: Uint8Array): Route {
  const ext = extensionOf(name);
  const byExt = EXT[ext];
  const isZip = startsWith(head, [0x50, 0x4b, 0x03, 0x04]) || startsWith(head, [0x50, 0x4b, 0x05, 0x06]);
  const isOle = startsWith(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const isPdf = ascii(head, 0, 5) === "%PDF-";
  const brand = ascii(head, 4, 12);
  if (byExt) {
    // Magic bytes overrule a misleading extension only for unambiguous containers.
    if (isPdf && byExt !== "pdf") return "pdf";
    return byExt;
  }
  if (isPdf) return "pdf";
  if (/^ftyp(heic|heix|mif1|msf1|hevc)/.test(brand)) return "heic";
  if (isZip) return "zip";
  if (isOle) return "other";
  const m = mime.toLowerCase();
  if (m === "text/csv") return "csv";
  if (m === "text/tab-separated-values") return "tsv";
  if (m.includes("json")) return "json";
  if (m.includes("yaml")) return "yaml";
  if (m === "text/html") return "html";
  if (m === "image/svg+xml") return "svg";
  if (m === "image/gif") return "gif";
  if (m === "image/heic" || m === "image/heif") return "heic";
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (m === "application/pdf") return "pdf";
  if (m === "text/calendar") return "ics";
  if (m === "text/vcard" || m === "text/x-vcard") return "vcf";
  if (m === "message/rfc822") return "eml";
  if (m.includes("xml")) return "xml";
  if (m === "text/markdown") return "md";
  if (m.startsWith("text/")) return "txt";
  return "other";
}

/** File-picker hint for every format the dispatcher digests (pickers still allow "all files"). */
export const SUPPORTED_ACCEPT = [
  ".csv", ".tsv", ".tab", ".xlsx", ".xlsm", ".json", ".ndjson", ".jsonl", ".geojson",
  ".yaml", ".yml", ".xml", ".html", ".htm", ".svg",
  ".pdf", ".doc", ".docx", ".txt", ".md", ".markdown", ".rtf", ".epub",
  ".ics", ".vcf", ".eml", ".mbox", ".msg", ".kml", ".kmz", ".gpx", ".zip",
  "image/*", "audio/*", "video/*", "application/pdf", "text/csv", "text/calendar", "text/vcard", "message/rfc822",
].join(",");
