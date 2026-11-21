/**
 * Browser image variants: a ≤1600px display copy (re-encoding drops EXIF, including GPS) and a
 * ≤24 KB thumbnail for graph previews. Decoding is refused above 40 MP.
 */
import { IMAGE_LIMITS } from "./limits.ts";
import { INLINE_DATA_URL_MAX_CHARS, THUMB_MAX_CHARS } from "./viewer-types.ts";

export type ImageVariants = { display: string | null; thumb: string | null; width: number; height: number };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("This image could not be decoded in this browser"));
    img.src = src;
  });
}

function encode(canvas: HTMLCanvasElement, quality: number): string {
  const webp = canvas.toDataURL("image/webp", quality);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", quality);
}

export function drawScaled(source: CanvasImageSource, w: number, h: number, maxEdge: number): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Smallest thumbnail that fits the 24 KB budget (quality steps down, then size). */
export function thumbFrom(source: CanvasImageSource, w: number, h: number): string | null {
  for (const edge of [IMAGE_LIMITS.thumbEdge, 120, 96]) {
    const c = drawScaled(source, w, h, edge);
    for (const q of [0.72, 0.55, 0.4]) {
      const url = encode(c, q);
      if (url.length <= THUMB_MAX_CHARS) return url;
    }
  }
  return null;
}

export async function makeImageVariants(blob: Blob): Promise<ImageVariants> {
  const src = URL.createObjectURL(blob);
  try {
    const img = await loadImage(src);
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    if (!width || !height) throw new Error("This image has no pixels");
    if (width * height > IMAGE_LIMITS.maxPixels) throw new Error(`This image is ${Math.round((width * height) / 1e6)} MP; the limit is 40 MP`);
    const displayCanvas = drawScaled(img, width, height, IMAGE_LIMITS.displayEdge);
    let display: string | null = encode(displayCanvas, 0.85);
    if (display.length > INLINE_DATA_URL_MAX_CHARS) display = encode(displayCanvas, 0.6);
    if (display.length > INLINE_DATA_URL_MAX_CHARS) display = null;
    return { display, thumb: thumbFrom(img, width, height), width, height };
  } finally {
    URL.revokeObjectURL(src);
  }
}

/** Raster thumbnail of any image URL the browser can decode (used for SVG through <img>, never inline). */
export async function thumbFromUrl(url: string): Promise<{ thumb: string | null; width: number; height: number }> {
  try {
    const img = await loadImage(url);
    const width = img.naturalWidth || 300;
    const height = img.naturalHeight || 150;
    return { thumb: thumbFrom(img, width, height), width, height };
  } catch {
    return { thumb: null, width: 0, height: 0 };
  }
}

export function thumbFromCanvas(canvas: HTMLCanvasElement): string | null {
  return thumbFrom(canvas, canvas.width, canvas.height);
}

/** Smaller JPEG copy sent to the vision model (≤1280 px, well under the request limit). */
export async function visionCopy(blob: Blob): Promise<string | null> {
  const src = URL.createObjectURL(blob);
  try {
    const img = await loadImage(src);
    if (!img.naturalWidth || !img.naturalHeight) return null;
    const canvas = drawScaled(img, img.naturalWidth, img.naturalHeight, 1280);
    const url = canvas.toDataURL("image/jpeg", 0.82);
    return url.length <= 2_500_000 ? url : canvas.toDataURL("image/jpeg", 0.6);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(src);
  }
}
