/// <reference lib="webworker" />
import * as Comlink from "comlink";
import type { EditSettings, OutputFormat, RenderRequest, RenderResult, SourceInfo } from "@/tools/image/types";
import { extractExif, injectExif } from "@/tools/image/exif";

interface Source {
  bitmap: ImageBitmap;
  file: Blob;
  type: string;
  exif: Uint8Array | null;
}

const sources = new Map<string, Source>();
/** Highest render token seen per source. Older in-flight renders abort at their next checkpoint. */
const latest = new Map<string, number>();
let avifEncoder: ((data: ImageData, opts: { quality: number }) => Promise<ArrayBuffer>) | null = null;

const MIME: Record<OutputFormat, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif" };

async function decode(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Some browsers reject the orientation option for certain formats; retry plainly.
    return createImageBitmap(file);
  }
}

function canvas(w: number, h: number): OffscreenCanvas {
  return new OffscreenCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

function ctx2d(c: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const ctx = c.getContext("2d", { alpha: true });
  if (!ctx) throw new Error("2D context unavailable in worker");
  return ctx;
}

/** Applies brightness/contrast/saturation/grayscale manually when ctx.filter is unsupported (Safari). */
function manualFilters(ctx: OffscreenCanvasRenderingContext2D, w: number, h: number, f: EditSettings["filters"]) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const b = f.brightness / 100;
  const c = f.contrast / 100;
  const s = f.saturation / 100;
  const g = f.grayscale / 100;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] * b;
    let gg = d[i + 1] * b;
    let bb = d[i + 2] * b;
    r = (r - 128) * c + 128;
    gg = (gg - 128) * c + 128;
    bb = (bb - 128) * c + 128;
    const lum = 0.2126 * r + 0.7152 * gg + 0.0722 * bb;
    r = lum + (r - lum) * s;
    gg = lum + (gg - lum) * s;
    bb = lum + (bb - lum) * s;
    if (g > 0) {
      const l2 = 0.2126 * r + 0.7152 * gg + 0.0722 * bb;
      r = r + (l2 - r) * g;
      gg = gg + (l2 - gg) * g;
      bb = bb + (l2 - bb) * g;
    }
    d[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    d[i + 1] = gg < 0 ? 0 : gg > 255 ? 255 : gg;
    d[i + 2] = bb < 0 ? 0 : bb > 255 ? 255 : bb;
  }
  ctx.putImageData(img, 0, 0);
}

/** Three-pass box blur approximating a gaussian, used only when ctx.filter is unavailable. */
function manualBlur(ctx: OffscreenCanvasRenderingContext2D, w: number, h: number, radius: number) {
  if (radius < 0.5) return;
  const r = Math.round(radius);
  const img = ctx.getImageData(0, 0, w, h);
  const src = img.data;
  const tmp = new Uint8ClampedArray(src.length);
  const pass = (from: Uint8ClampedArray, to: Uint8ClampedArray, horizontal: boolean) => {
    const len = horizontal ? w : h;
    const lines = horizontal ? h : w;
    for (let line = 0; line < lines; line++) {
      let sr = 0, sg = 0, sb = 0, sa = 0, count = 0;
      const idx = (p: number) => (horizontal ? (line * w + p) * 4 : (p * w + line) * 4);
      for (let p = -r; p <= r; p++) {
        const q = Math.min(len - 1, Math.max(0, p));
        const k = idx(q);
        sr += from[k]; sg += from[k + 1]; sb += from[k + 2]; sa += from[k + 3]; count++;
      }
      for (let p = 0; p < len; p++) {
        const k = idx(p);
        to[k] = sr / count; to[k + 1] = sg / count; to[k + 2] = sb / count; to[k + 3] = sa / count;
        const outQ = Math.min(len - 1, Math.max(0, p - r));
        const inQ = Math.min(len - 1, Math.max(0, p + r + 1));
        const ko = idx(outQ), ki = idx(inQ);
        sr += from[ki] - from[ko]; sg += from[ki + 1] - from[ko + 1]; sb += from[ki + 2] - from[ko + 2]; sa += from[ki + 3] - from[ko + 3];
      }
    }
  };
  for (let i = 0; i < 3; i++) {
    pass(src, tmp, true);
    pass(tmp, src, false);
  }
  ctx.putImageData(img, 0, 0);
}

async function drawWatermark(ctx: OffscreenCanvasRenderingContext2D, w: number, h: number, wm: EditSettings["watermark"]) {
  ctx.save();
  ctx.globalAlpha = wm.opacity / 100;
  const margin = Math.round(Math.min(w, h) * 0.03);
  const targetW = (w * wm.size) / 100;
  let itemW = targetW;
  let itemH = 0;
  let draw: (x: number, y: number) => void;

  if (wm.type === "image" && wm.image) {
    const logo = await createImageBitmap(wm.image);
    const scale = targetW / logo.width;
    itemH = logo.height * scale;
    draw = (x, y) => ctx.drawImage(logo, x, y, itemW, itemH);
  } else {
    const text = wm.text || "";
    let fontSize = Math.max(12, Math.round(targetW / Math.max(4, text.length * 0.55)));
    ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
    let metrics = ctx.measureText(text);
    if (metrics.width > targetW) {
      fontSize = Math.max(10, Math.floor(fontSize * (targetW / metrics.width)));
      ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
      metrics = ctx.measureText(text);
    }
    itemW = metrics.width;
    itemH = fontSize * 1.2;
    ctx.fillStyle = wm.color;
    ctx.textBaseline = "top";
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = Math.max(2, fontSize * 0.12);
    draw = (x, y) => ctx.fillText(text, x, y);
  }

  if (wm.tiled) {
    const stepX = itemW + Math.max(itemW * 0.6, 40);
    const stepY = itemH + Math.max(itemH * 1.2, 40);
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-Math.PI / 6);
    const diag = Math.hypot(w, h);
    for (let y = -diag; y < diag; y += stepY) {
      const offset = (Math.round(y / stepY) % 2) * (stepX / 2);
      for (let x = -diag + offset; x < diag; x += stepX) draw(x, y);
    }
  } else {
    const col = (wm.position - 1) % 3;
    const row = Math.floor((wm.position - 1) / 3);
    const x = col === 0 ? margin : col === 1 ? (w - itemW) / 2 : w - itemW - margin;
    const y = row === 0 ? margin : row === 1 ? (h - itemH) / 2 : h - itemH - margin;
    draw(x, y);
  }
  ctx.restore();
}

async function encode(c: OffscreenCanvas, format: OutputFormat, quality: number): Promise<Blob> {
  if (format === "avif") {
    if (!avifEncoder) {
      const mod = await import("@jsquash/avif");
      avifEncoder = (data, opts) => mod.encode(data, { quality: opts.quality, speed: 8 });
    }
    const ctx = ctx2d(c);
    const data = ctx.getImageData(0, 0, c.width, c.height);
    const buf = await avifEncoder(data, { quality });
    return new Blob([buf], { type: "image/avif" });
  }
  const type = MIME[format];
  const blob = await c.convertToBlob({ type, quality: format === "png" ? undefined : quality / 100 });
  if (blob.type !== type) throw new Error(`Encoder for ${type} unavailable in this browser`);
  return blob;
}

/** Renders the full pipeline: crop → rotate/flip → resize → filters → watermark. Returns the canvas. */
async function compose(src: Source, s: EditSettings, previewMaxSide?: number): Promise<OffscreenCanvas> {
  const bmp = src.bitmap;
  // Crop in source pixels
  const cr = s.crop.rect;
  const sx = cr ? Math.round(cr.x * bmp.width) : 0;
  const sy = cr ? Math.round(cr.y * bmp.height) : 0;
  const sw = cr ? Math.max(1, Math.round(cr.width * bmp.width)) : bmp.width;
  const sh = cr ? Math.max(1, Math.round(cr.height * bmp.height)) : bmp.height;

  const rotated = s.rotate.angle === 90 || s.rotate.angle === 270;
  const baseW = rotated ? sh : sw;
  const baseH = rotated ? sw : sh;

  // Resize target
  let outW = baseW;
  let outH = baseH;
  if (s.resize.enabled) {
    if (s.resize.mode === "percent") {
      outW = Math.round((baseW * s.resize.percent) / 100);
      outH = Math.round((baseH * s.resize.percent) / 100);
    } else {
      const rw = s.resize.width;
      const rh = s.resize.height;
      if (rw && rh) {
        outW = rw;
        outH = rh;
      } else if (rw) {
        outW = rw;
        outH = Math.round((rw * baseH) / baseW);
      } else if (rh) {
        outH = rh;
        outW = Math.round((rh * baseW) / baseH);
      }
    }
    if (s.resize.noUpscale && (outW > baseW || outH > baseH)) {
      const k = Math.min(baseW / outW, baseH / outH);
      outW = Math.round(outW * k);
      outH = Math.round(outH * k);
    }
  }
  if (previewMaxSide && Math.max(outW, outH) > previewMaxSide) {
    const k = previewMaxSide / Math.max(outW, outH);
    outW = Math.round(outW * k);
    outH = Math.round(outH * k);
  }
  outW = Math.max(1, outW);
  outH = Math.max(1, outH);

  const c = canvas(outW, outH);
  const ctx = ctx2d(c);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const f = s.filters;
  const hasFilters = f.brightness !== 100 || f.contrast !== 100 || f.saturation !== 100 || f.grayscale > 0 || f.blur > 0;
  const supportsFilter = "filter" in ctx;
  const blurPx = (f.blur * outW) / 1000;
  if (hasFilters && supportsFilter) {
    ctx.filter = `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturation}%) grayscale(${f.grayscale}%)${f.blur > 0 ? ` blur(${blurPx.toFixed(2)}px)` : ""}`;
  }

  ctx.save();
  ctx.translate(outW / 2, outH / 2);
  ctx.rotate((s.rotate.angle * Math.PI) / 180);
  ctx.scale(s.rotate.flipH ? -1 : 1, s.rotate.flipV ? -1 : 1);
  const drawW = rotated ? outH : outW;
  const drawH = rotated ? outW : outH;
  ctx.drawImage(bmp, sx, sy, sw, sh, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
  if (supportsFilter) ctx.filter = "none";

  if (hasFilters && !supportsFilter) {
    manualFilters(ctx, outW, outH, f);
    if (f.blur > 0) manualBlur(ctx, outW, outH, blurPx);
  }

  if (s.watermark.enabled && (s.watermark.type === "image" ? !!s.watermark.image : s.watermark.text.trim().length > 0)) {
    await drawWatermark(ctx, outW, outH, s.watermark);
  }
  return c;
}

const api = {
  async load(id: string, file: Blob, type: string): Promise<SourceInfo> {
    const prev = sources.get(id);
    prev?.bitmap.close();
    const bitmap = await decode(file);
    const exif = type === "image/jpeg" ? await extractExif(file) : null;
    sources.set(id, { bitmap, file, type, exif });
    return { width: bitmap.width, height: bitmap.height, hasExif: !!exif };
  },

  /** Registers a bitmap decoded on the main thread (HEIC via libheif). Takes ownership of it. */
  loadBitmap(id: string, bitmap: ImageBitmap, file: Blob, type: string): SourceInfo {
    const prev = sources.get(id);
    prev?.bitmap.close();
    sources.set(id, { bitmap, file, type, exif: null });
    return { width: bitmap.width, height: bitmap.height, hasExif: false };
  },

  unload(id: string): void {
    sources.get(id)?.bitmap.close();
    sources.delete(id);
  },

  unloadAll(): void {
    for (const s of sources.values()) s.bitmap.close();
    sources.clear();
  },

  /** Cancels any in-flight render for `id` older than `token`. */
  cancel(id: string, token: number): void {
    latest.set(id, Math.max(latest.get(id) ?? 0, token));
  },

  /** Small thumbnail for the filmstrip. */
  async thumbnail(id: string, maxSide: number): Promise<Blob> {
    const src = sources.get(id);
    if (!src) throw new Error("Source not loaded");
    const k = Math.min(1, maxSide / Math.max(src.bitmap.width, src.bitmap.height));
    const c = canvas(src.bitmap.width * k, src.bitmap.height * k);
    const ctx = ctx2d(c);
    ctx.drawImage(src.bitmap, 0, 0, c.width, c.height);
    return c.convertToBlob({ type: "image/webp", quality: 0.7 });
  },

  async render(req: RenderRequest): Promise<RenderResult> {
    const src = sources.get(req.id);
    if (!src) throw new Error("Source not loaded");
    if (req.token > (latest.get(req.id) ?? 0)) latest.set(req.id, req.token);
    const stale = () => latest.get(req.id) !== req.token;
    const t0 = performance.now();
    const c = await compose(src, req.settings, req.previewMaxSide);
    if (stale()) throw new DOMException("Cancelled", "AbortError");

    const { format, maxBytes, stripMetadata } = req.settings.compress;
    let quality = format === "png" ? 100 : req.settings.compress.quality;
    let blob = await encode(c, format, quality);

    // Target-size search: binary search on quality for lossy formats.
    if (maxBytes && format !== "png" && blob.size > maxBytes) {
      let lo = 5;
      let hi = quality;
      let best = blob;
      let bestQ = quality;
      for (let i = 0; i < 6 && hi - lo > 2; i++) {
        if (stale()) throw new DOMException("Cancelled", "AbortError");
        const mid = Math.round((lo + hi) / 2);
        const b = await encode(c, format, mid);
        if (b.size <= maxBytes) {
          best = b;
          bestQ = mid;
          lo = mid;
        } else {
          hi = mid;
        }
      }
      blob = best;
      quality = bestQ;
    }

    if (!stripMetadata && src.exif && format === "jpeg") {
      blob = await injectExif(blob, src.exif);
    }
    if (stale()) throw new DOMException("Cancelled", "AbortError");
    return { blob, width: c.width, height: c.height, format, quality, ms: Math.round(performance.now() - t0) };
  },
};

export type ImageWorkerApi = typeof api;

Comlink.expose(api);
