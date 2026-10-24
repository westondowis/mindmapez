export type SourceKind = "article" | "podcast" | "youtube" | "rss" | "other";

export type ExtractedLink = {
  url: string;
  title: string;
  site: string;
  description: string;
  body: string;
  transcript: string | null;
  transcriptFound: boolean;
  sourceKind: SourceKind;
  warning: string | null;
};

const FETCH_MS = 10_000;
const MAX_BYTES = 1_800_000;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export function parseYouTubeId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id ? id.slice(0, 11) : null;
  }
  if (
    host === "youtube.com" ||
    host === "music.youtube.com" ||
    host === "youtube-nocookie.com"
  ) {
    const v = url.searchParams.get("v");
    if (v) return v.slice(0, 11);
    const m = url.pathname.match(/\/(?:embed|shorts|live|podcasts)\/([^/?]+)/);
    if (m?.[1]) return m[1].slice(0, 11);
  }
  return null;
}

export function assertPublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("That doesn’t look like a valid link.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only public http(s) links can be imported.");
  }
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "[::1]" ||
    host.endsWith(".internal") ||
    host.endsWith(".local")
  ) {
    throw new Error("That link isn’t publicly reachable.");
  }
  if (
    /^(127|10|0)\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    /^169\.254\./.test(host) ||
    host.includes(":")
  ) {
    throw new Error("That link isn’t publicly reachable.");
  }
  return url;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&/g, "&")
    .replace(/"/g, '"')
    .replace(/&#39;|'/g, "'")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h1|h2|h3|li|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function metaContent(html: string, key: string): string | null {
  const a = new RegExp(
    `<meta[^>]+(?:property|name|itemprop)=["']${key}["'][^>]*content=["']([^"']+)["']`,
    "i",
  ).exec(html);
  if (a?.[1]) return decodeEntities(a[1]);
  const b = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["']${key}["']`,
    "i",
  ).exec(html);
  return b?.[1] ? decodeEntities(b[1]) : null;
}

function tagText(html: string, tag: string): string | null {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(html);
  return m?.[1] ? stripTags(m[1]) : null;
}

function xmlTag(xml: string, tag: string): string | null {
  const m = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, "i").exec(xml);
  if (m?.[1]) return decodeEntities(m[1].trim());
  const n = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(xml);
  return n?.[1] ? stripTags(n[1]) : null;
}

function extractJsonObject(source: string, startMarker: string): string | null {
  const i = source.indexOf(startMarker);
  if (i < 0) return null;
  const start = source.indexOf("{", i);
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  const limit = Math.min(source.length, start + 2_000_000);
  for (let j = start; j < limit; j++) {
    const ch = source[j];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === "\\") {
        esc = true;
        continue;
      }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, j + 1);
    }
  }
  return null;
}

async function fetchText(url: string, accept?: string): Promise<{ text: string; finalUrl: string; type: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": UA,
        Accept: accept ?? "text/html,application/xhtml+xml,application/xml,application/json,text/plain;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) throw new Error(`Couldn’t open that page (${res.status}).`);
    const type = res.headers.get("content-type") ?? "";
    const buf = new Uint8Array(await res.arrayBuffer());
    const sliced = buf.byteLength > MAX_BYTES ? buf.slice(0, MAX_BYTES) : buf;
    const text = new TextDecoder("utf-8", { fatal: false }).decode(sliced);
    return { text, finalUrl: res.url || url, type };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("That page took too long to respond.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function parseVttOrSrt(raw: string): string {
  return raw
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (!t || t === "WEBVTT" || t.startsWith("NOTE")) return false;
      if (/^\d+$/.test(t)) return false;
      if (/-->/.test(t)) return false;
      if (/^\d{2}:\d{2}/.test(t)) return false;
      return true;
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTimedTextXml(xml: string): string {
  const parts: string[] = [];
  const re = /<text[^>]*>([\s\S]*?)<\/text>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const piece = stripTags(m[1]).trim();
    if (piece) parts.push(piece);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function parseJson3Captions(raw: string): string {
  try {
    const json = JSON.parse(raw) as { events?: { segs?: { utf8?: string }[] }[] };
    const parts: string[] = [];
    for (const ev of json.events ?? []) {
      const piece = (ev.segs ?? []).map((s) => s.utf8 ?? "").join("");
      if (piece.trim()) parts.push(piece.trim());
    }
    return parts.join(" ").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

function transcriptFromUnknown(raw: string, type: string): string {
  const t = type.toLowerCase();
  if (t.includes("json") || raw.trim().startsWith("{")) {
    const json3 = parseJson3Captions(raw);
    if (json3) return json3;
    try {
      const parsed = JSON.parse(raw) as { text?: string; transcript?: string; content?: string };
      const s = parsed.text || parsed.transcript || parsed.content;
      if (s) return String(s);
    } catch {
      /* fall through */
    }
  }
  if (t.includes("vtt") || t.includes("srt") || /WEBVTT|-->/.test(raw.slice(0, 400))) {
    return parseVttOrSrt(raw);
  }
  if (raw.includes("<text")) return parseTimedTextXml(raw);
  return stripTags(raw);
}

function extractArticle(html: string): string {
  const article = /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(html)?.[1];
  if (article) {
    const text = stripTags(article);
    if (text.length > 200) return text;
  }
  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html)?.[1];
  if (main) {
    const text = stripTags(main);
    if (text.length > 200) return text;
  }
  const paras = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => stripTags(m[1]))
    .filter((p) => p.length > 40);
  return paras.slice(0, 40).join("\n\n");
}

function extractTranscriptSection(html: string): string | null {
  const heading = /<(?:h[1-4]|div|section)[^>]*>\s*transcript\s*<\/(?:h[1-4]|div|section)>/i.exec(html);
  if (!heading || heading.index == null) return null;
  const after = html.slice(heading.index, heading.index + 80_000);
  const block = /<(?:div|section|article)[^>]*>([\s\S]*?)<\/(?:div|section|article)>/i.exec(after);
  if (!block?.[1]) return null;
  const text = stripTags(block[1]);
  return text.length > 80 ? text : null;
}

function looksLikeFeed(text: string, type: string): boolean {
  return /xml|rss|atom/i.test(type) || /<(rss|feed|rdf:RDF)\b/i.test(text.slice(0, 800));
}

function parseFeedItems(xml: string): {
  title: string;
  description: string;
  link: string;
  transcriptUrl: string | null;
  guid: string;
}[] {
  const chunks = xml.split(/<item\b/i).slice(1);
  const entries = xml.split(/<entry\b/i).slice(1);
  return [...chunks, ...entries].slice(0, 40).map((chunk) => {
    const close = chunk.search(/<\/item>|<\/entry>/i);
    const item = close >= 0 ? chunk.slice(0, close) : chunk.slice(0, 20_000);
    const transcriptTag =
      /<podcast:transcript[^>]+url=["']([^"']+)["']/i.exec(item) ??
      /<podcast:transcript[^>]*>([^<]+)<\/podcast:transcript>/i.exec(item);
    return {
      title: xmlTag(item, "title") ?? "",
      description: xmlTag(item, "content:encoded") || xmlTag(item, "description") || xmlTag(item, "summary") || "",
      link: xmlTag(item, "link") || /<link[^>]+href=["']([^"']+)["']/i.exec(item)?.[1] || "",
      transcriptUrl: transcriptTag?.[1]?.trim() || null,
      guid: xmlTag(item, "guid") || xmlTag(item, "id") || "",
    };
  });
}

async function fetchTranscriptUrl(url: string): Promise<string | null> {
  try {
    const { text, type } = await fetchText(url, "text/vtt,application/json,text/plain,application/xml,*/*");
    const parsed = transcriptFromUnknown(text, type);
    return parsed.length > 40 ? parsed.slice(0, 24_000) : null;
  } catch {
    return null;
  }
}

type YtPlayer = {
  videoDetails?: { title?: string; shortDescription?: string };
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: { baseUrl?: string; languageCode?: string; kind?: string }[];
    };
  };
};

async function captionsFromPlayer(player: YtPlayer): Promise<string | null> {
  const tracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  const preferred =
    tracks.find((t) => t.languageCode?.startsWith("en") && t.kind !== "asr") ||
    tracks.find((t) => t.languageCode?.startsWith("en")) ||
    tracks[0];
  if (!preferred?.baseUrl) return null;
  const cap = await fetchText(`${preferred.baseUrl}&fmt=json3`, "application/json");
  const parsed =
    parseJson3Captions(cap.text) || parseTimedTextXml(cap.text) || transcriptFromUnknown(cap.text, cap.type);
  return parsed.length > 40 ? parsed : null;
}

async function extractYouTube(id: string, pageUrl: string): Promise<ExtractedLink> {
  let title = "YouTube video";
  let description = "";
  let transcript: string | null = null;

  try {
    const oembed = await fetchText(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`,
      "application/json",
    );
    const data = JSON.parse(oembed.text) as { title?: string; author_name?: string };
    if (data.title) title = data.title;
    if (data.author_name) description = `By ${data.author_name}`;
  } catch {
    /* page scrape next */
  }

  try {
    const page = await fetchText(`https://www.youtube.com/watch?v=${id}`);
    const jsonText = extractJsonObject(page.text, "ytInitialPlayerResponse");
    if (jsonText) {
      const player = JSON.parse(jsonText) as YtPlayer;
      title = player.videoDetails?.title || title;
      description = player.videoDetails?.shortDescription || description;
      transcript = await captionsFromPlayer(player);
    }
    if (!title || title === "YouTube video") {
      title = metaContent(page.text, "og:title") || tagText(page.text, "title") || title;
    }
    if (!description) description = metaContent(page.text, "og:description") || description;
  } catch {
    /* innertube fallback */
  }

  if (!transcript) {
    try {
      const innertube = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": UA },
        body: JSON.stringify({
          context: { client: { clientName: "WEB", clientVersion: "2.20240101.00.00", hl: "en" } },
          videoId: id,
        }),
      });
      if (innertube.ok) {
        const player = (await innertube.json()) as YtPlayer;
        title = player.videoDetails?.title || title;
        description = player.videoDetails?.shortDescription || description;
        transcript = await captionsFromPlayer(player);
      }
    } catch {
      /* keep going */
    }
  }

  const warning = transcript
    ? null
    : "No public transcript was available for this video. Saving the title and description instead.";

  return {
    url: pageUrl,
    title,
    site: "YouTube",
    description: description.slice(0, 1200),
    body: (description || title).slice(0, 8000),
    transcript: transcript ? transcript.slice(0, 24_000) : null,
    transcriptFound: Boolean(transcript),
    sourceKind: "youtube",
    warning,
  };
}

function appleIds(url: URL): { collection?: string; episode?: string } {
  const collection = /\/id(\d+)/.exec(url.pathname)?.[1];
  const episode = url.searchParams.get("i") ?? undefined;
  return { collection, episode };
}

async function extractApplePodcast(url: URL): Promise<ExtractedLink | null> {
  const ids = appleIds(url);
  if (!ids.collection && !ids.episode) return null;
  const lookupId = ids.episode || ids.collection;
  if (!lookupId) return null;
  try {
    const { text } = await fetchText(`https://itunes.apple.com/lookup?id=${lookupId}`, "application/json");
    const data = JSON.parse(text) as {
      results?: {
        wrapperType?: string;
        kind?: string;
        trackName?: string;
        collectionName?: string;
        artistName?: string;
        description?: string;
        feedUrl?: string;
      }[];
    };
    const episode =
      data.results?.find((r) => r.kind === "podcast-episode" || r.wrapperType === "podcastEpisode") ??
      data.results?.[0];
    const show = data.results?.find((r) => r.feedUrl) ?? episode;
    const feedUrl = show?.feedUrl;
    let transcript: string | null = null;
    let description = episode?.description || "";
    let title = episode?.trackName || show?.collectionName || "Podcast episode";
    if (feedUrl) {
      const feed = await fetchText(feedUrl, "application/rss+xml,application/xml,text/xml");
      const items = parseFeedItems(feed.text);
      const match =
        items.find((it) => ids.episode && (it.guid.includes(ids.episode) || it.link.includes(ids.episode))) ||
        items.find((it) => it.title && title && it.title.toLowerCase() === title.toLowerCase()) ||
        items[0];
      if (match) {
        title = match.title || title;
        description = stripTags(match.description) || description;
        if (match.transcriptUrl) transcript = await fetchTranscriptUrl(match.transcriptUrl);
      }
    }
    const warning = transcript
      ? null
      : "No public transcript was listed for this episode. Saving the episode notes instead.";
    return {
      url: url.toString(),
      title,
      site: episode?.collectionName || episode?.artistName || "Apple Podcasts",
      description: description.slice(0, 1200),
      body: (description || title).slice(0, 8000),
      transcript: transcript ? transcript.slice(0, 24_000) : null,
      transcriptFound: Boolean(transcript),
      sourceKind: "podcast",
      warning,
    };
  } catch {
    return null;
  }
}

function rssLinkFromHtml(html: string): string | null {
  const m =
    /<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]+href=["']([^"']+)["']/i.exec(html) ||
    /<link[^>]+href=["']([^"']+)["'][^>]+type=["']application\/(?:rss|atom)\+xml["']/i.exec(html);
  return m?.[1] ?? null;
}

function absolutize(base: string, href: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

export async function extractPublicLink(rawUrl: string): Promise<ExtractedLink> {
  const url = assertPublicHttpUrl(rawUrl);
  const yt = parseYouTubeId(url);
  if (yt) return extractYouTube(yt, url.toString());

  const host = url.hostname.replace(/^www\./, "");
  if (host === "podcasts.apple.com") {
    const apple = await extractApplePodcast(url);
    if (apple) return apple;
  }

  const fetched = await fetchText(url.toString());
  const { text, finalUrl, type } = fetched;

  if (looksLikeFeed(text, type)) {
    const items = parseFeedItems(text);
    const item = items[0];
    if (!item) throw new Error("That feed didn’t contain any episodes.");
    const transcript = item.transcriptUrl ? await fetchTranscriptUrl(item.transcriptUrl) : null;
    return {
      url: item.link || finalUrl,
      title: item.title || tagText(text, "title") || "Podcast episode",
      site: tagText(text, "title") || url.hostname,
      description: stripTags(item.description).slice(0, 1200),
      body: stripTags(item.description).slice(0, 8000) || item.title,
      transcript,
      transcriptFound: Boolean(transcript),
      sourceKind: "rss",
      warning: transcript ? null : "This feed had no public transcript tag. Saving the episode notes instead.",
    };
  }

  const title =
    metaContent(text, "og:title") ||
    metaContent(text, "twitter:title") ||
    tagText(text, "title") ||
    url.hostname;
  const description =
    metaContent(text, "og:description") ||
    metaContent(text, "description") ||
    metaContent(text, "twitter:description") ||
    "";
  const site = metaContent(text, "og:site_name") || url.hostname.replace(/^www\./, "");
  let transcript = extractTranscriptSection(text);
  let body = extractArticle(text) || description || title;
  const isPodcastHint =
    /podcast|episode|listen notes|overcast|pocket.?casts|spotify\.com\/episode|transistor|buzzsprout|simplecast|anchor\.fm|podbean/i.test(
      host + title + description,
    );

  const rssHref = rssLinkFromHtml(text);
  if (rssHref && (isPodcastHint || host.includes("podcast") || host.includes("listen"))) {
    try {
      const feed = await fetchText(absolutize(finalUrl, rssHref), "application/rss+xml,application/xml,text/xml");
      const items = parseFeedItems(feed.text);
      const match =
        items.find((it) => it.link && (finalUrl.includes(it.link) || it.link.includes(url.pathname))) ||
        items.find((it) => it.title && title && it.title.toLowerCase() === title.toLowerCase()) ||
        items[0];
      if (match?.transcriptUrl) {
        transcript = (await fetchTranscriptUrl(match.transcriptUrl)) ?? transcript;
      }
      if (match?.description && match.description.length > body.length) {
        body = stripTags(match.description);
      }
    } catch {
      /* page content is enough */
    }
  }

  if (transcript && transcript.length < 40) transcript = null;

  return {
    url: finalUrl,
    title: title.slice(0, 180),
    site,
    description: description.slice(0, 1200),
    body: body.slice(0, 8000) || title,
    transcript: transcript ? transcript.slice(0, 24_000) : null,
    transcriptFound: Boolean(transcript),
    sourceKind: isPodcastHint || host.includes("spotify.com") ? "podcast" : "article",
    warning:
      isPodcastHint && !transcript
        ? "No public transcript was available. Saving the episode notes and description instead."
        : null,
  };
}
