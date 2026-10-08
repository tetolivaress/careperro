/// <reference lib="webworker" />
import * as Comlink from "comlink";
import { inflateSync } from "fflate";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  StandardFonts,
  degrees,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";

export type Rotation = 0 | 90 | 180 | 270;
export type Position9 = "tl" | "tc" | "tr" | "ml" | "mc" | "mr" | "bl" | "bc" | "br";

export interface SourceInput {
  id: string;
  bytes: ArrayBuffer;
}

export interface PageRef {
  sourceId: string;
  pageIndex: number;
  rotation: Rotation;
}

export interface ImageInput {
  bytes: ArrayBuffer;
  type: "png" | "jpeg";
}

export interface WatermarkOptions {
  kind: "text" | "image";
  text?: string;
  image?: ImageInput;
  /** One of nine positions, or tiled across the page. */
  position: Position9 | "tile";
  /** 0..1 */
  opacity: number;
  /** Text: font size in pt. Image: width as a fraction of the page width (0..1). */
  size: number;
  /** Degrees, counter-clockwise. */
  rotation: number;
  /** Hex color for text. */
  color: string;
}

export interface PageNumberOptions {
  position: "tl" | "tc" | "tr" | "bl" | "bc" | "br";
  start: number;
  format: "n" | "n-of-total" | "page-n";
  size: number;
  margin: number;
}

export interface SignatureOptions {
  image: ImageInput;
  /** Index into the output page list. */
  pageIndex: number;
  /** Normalized rectangle on the displayed (rotated) page, top-left origin. */
  x: number;
  y: number;
  width: number;
  /** Aspect ratio of the signature image (height / width). */
  aspect: number;
}

export interface CompressOptions {
  /** JPEG quality 0..1 */
  quality: number;
  /** Longest side cap in px. */
  maxDimension: number;
}

export interface AssembleOptions {
  watermark?: WatermarkOptions;
  pageNumbers?: PageNumberOptions;
  signature?: SignatureOptions;
  compress?: CompressOptions;
}

export interface Progress {
  phase: "copy" | "watermark" | "numbers" | "signature" | "compress" | "save";
  done: number;
  total: number;
}

export interface AssembleResult {
  bytes: ArrayBuffer;
  pages: number;
  /** Image compression stats when requested. */
  imagesTouched?: number;
}

export interface ImagesToPdfOptions {
  pageSize: "fit" | "a4" | "letter";
  orientation: "auto" | "portrait" | "landscape";
  /** Points. */
  margin: number;
}

type ProgressCb = (p: Progress) => void;

const cancelled = new Set<string>();

class Cancelled extends Error {
  constructor() {
    super("cancelled");
    this.name = "Cancelled";
  }
}

function check(jobId: string) {
  if (cancelled.has(jobId)) throw new Cancelled();
}

const PAGE_SIZES = { a4: [595.28, 841.89], letter: [612, 792] } as const;

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Helvetica only knows WinAnsi; drop characters it cannot encode instead of throwing. */
function sanitize(font: PDFFont, text: string): string {
  let out = "";
  for (const ch of text) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

/** Effective display rotation of a page (source /Rotate already applied by setRotation). */
function displayRotation(page: PDFPage): Rotation {
  const a = ((page.getRotation().angle % 360) + 360) % 360;
  return (a === 90 || a === 180 || a === 270 ? a : 0) as Rotation;
}

/** Displayed width/height of a page, accounting for rotation. */
function displaySize(page: PDFPage): { W: number; H: number } {
  const { width, height } = page.getSize();
  const r = displayRotation(page);
  return r === 90 || r === 270 ? { W: height, H: width } : { W: width, H: height };
}

/**
 * Converts a rectangle on the displayed page (top-left origin, in points of the displayed size)
 * into the pdf-lib anchor point for an item of size w×h drawn with `rotate: degrees(R)`.
 */
function anchorFor(page: PDFPage, dx: number, dy: number, w: number, h: number): { x: number; y: number; rotate: number } {
  const r = displayRotation(page);
  const { width: pw, height: ph } = page.getSize();
  switch (r) {
    case 90:
      return { x: dy + h, y: dx, rotate: 90 };
    case 180:
      return { x: pw - dx, y: dy + h, rotate: 180 };
    case 270:
      return { x: pw - dy - h, y: ph - dx, rotate: 270 };
    default:
      return { x: dx, y: ph - dy - h, rotate: 0 };
  }
}

function positionRect(pos: Position9, W: number, H: number, w: number, h: number, margin: number): { dx: number; dy: number } {
  const col = pos[1];
  const row = pos[0];
  const dx = col === "l" ? margin : col === "c" ? (W - w) / 2 : W - w - margin;
  const dy = row === "t" ? margin : row === "m" ? (H - h) / 2 : H - h - margin;
  return { dx, dy };
}

async function embedImage(doc: PDFDocument, img: ImageInput): Promise<PDFImage> {
  return img.type === "png" ? doc.embedPng(img.bytes) : doc.embedJpg(img.bytes);
}

function drawTextAt(page: PDFPage, font: PDFFont, text: string, size: number, dx: number, dy: number, color: ReturnType<typeof rgb>, opacity: number, extraRotation = 0) {
  const w = font.widthOfTextAtSize(text, size);
  const h = size;
  const a = anchorFor(page, dx, dy, w, h);
  // Text draws from its baseline; shift up by the descender so the box matches the rect.
  const descent = size * 0.22;
  page.drawText(text, {
    x: a.x,
    y: a.y,
    size,
    font,
    color,
    opacity,
    rotate: degrees(a.rotate + extraRotation),
  });
  void descent;
}

async function applyWatermark(doc: PDFDocument, pages: PDFPage[], wm: WatermarkOptions, jobId: string, onProgress: ProgressCb) {
  const font = wm.kind === "text" ? await doc.embedFont(StandardFonts.HelveticaBold) : null;
  const image = wm.kind === "image" && wm.image ? await embedImage(doc, wm.image) : null;
  const text = font ? sanitize(font, wm.text ?? "") : "";
  const color = hexToRgb(wm.color);
  let i = 0;
  for (const page of pages) {
    check(jobId);
    const { W, H } = displaySize(page);
    const margin = Math.min(W, H) * 0.05;
    let w: number;
    let h: number;
    if (font) {
      w = font.widthOfTextAtSize(text, wm.size);
      h = wm.size;
    } else if (image) {
      w = W * wm.size;
      h = w * (image.height / image.width);
    } else break;

    const draw = (dx: number, dy: number) => {
      const a = anchorFor(page, dx, dy, w, h);
      if (font) {
        page.drawText(text, { x: a.x, y: a.y, size: wm.size, font, color, opacity: wm.opacity, rotate: degrees(a.rotate + wm.rotation) });
      } else if (image) {
        page.drawImage(image, { x: a.x, y: a.y, width: w, height: h, opacity: wm.opacity, rotate: degrees(a.rotate + wm.rotation) });
      }
    };

    if (wm.position === "tile") {
      const stepX = w + Math.max(40, w * 0.6);
      const stepY = h + Math.max(40, h * 2);
      for (let y = -h; y < H + h; y += stepY) {
        for (let x = -w; x < W + w; x += stepX) draw(x, y);
      }
    } else {
      const { dx, dy } = positionRect(wm.position, W, H, w, h, margin);
      draw(dx, dy);
    }
    i += 1;
    if (i % 10 === 0) onProgress({ phase: "watermark", done: i, total: pages.length });
  }
}

async function applyPageNumbers(doc: PDFDocument, pages: PDFPage[], opt: PageNumberOptions, jobId: string, onProgress: ProgressCb) {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const total = pages.length;
  const color = rgb(0.2, 0.2, 0.2);
  pages.forEach((page, i) => {
    check(jobId);
    const n = opt.start + i;
    const label = opt.format === "n-of-total" ? `${n} / ${opt.start + total - 1}` : opt.format === "page-n" ? `Page ${n}` : `${n}`;
    const { W, H } = displaySize(page);
    const w = font.widthOfTextAtSize(label, opt.size);
    const h = opt.size;
    const { dx, dy } = positionRect(opt.position as Position9, W, H, w, h, opt.margin);
    drawTextAt(page, font, label, opt.size, dx, dy, color, 1);
    if (i % 20 === 0) onProgress({ phase: "numbers", done: i, total });
  });
}

async function applySignature(doc: PDFDocument, pages: PDFPage[], sig: SignatureOptions) {
  const page = pages[sig.pageIndex];
  if (!page) return;
  const image = await embedImage(doc, sig.image);
  const { W, H } = displaySize(page);
  const w = sig.width * W;
  const h = w * sig.aspect;
  const dx = sig.x * W;
  const dy = sig.y * H;
  const a = anchorFor(page, dx, dy, w, h);
  page.drawImage(image, { x: a.x, y: a.y, width: w, height: h, rotate: degrees(a.rotate) });
}

// ───────── Image re-encoding (compress) ─────────

interface ImageInfo {
  ref: PDFRef;
  stream: PDFRawStream;
  width: number;
  height: number;
  filter: "DCTDecode" | "FlateDecode" | "other";
  colorSpace: "rgb" | "gray" | "other";
  bpc: number;
  hasSMask: boolean;
}

function nameOf(v: unknown): string | null {
  return v instanceof PDFName ? v.decodeText() : null;
}

function numOf(v: unknown): number | null {
  return v instanceof PDFNumber ? v.asNumber() : null;
}

function colorSpaceOf(doc: PDFDocument, cs: unknown): ImageInfo["colorSpace"] {
  const n = nameOf(cs);
  if (n === "DeviceRGB") return "rgb";
  if (n === "DeviceGray") return "gray";
  if (cs instanceof PDFArray && cs.size() >= 2 && nameOf(cs.get(0)) === "ICCBased") {
    const s = doc.context.lookup(cs.get(1));
    if (s instanceof PDFRawStream) {
      const N = numOf(s.dict.get(PDFName.of("N")));
      if (N === 3) return "rgb";
      if (N === 1) return "gray";
    }
  }
  return "other";
}

function collectImages(doc: PDFDocument): ImageInfo[] {
  const out: ImageInfo[] = [];
  const smaskRefs = new Set<string>();
  const entries = doc.context.enumerateIndirectObjects();
  for (const [, obj] of entries) {
    if (obj instanceof PDFRawStream) {
      const sm = obj.dict.get(PDFName.of("SMask"));
      if (sm instanceof PDFRef) smaskRefs.add(sm.toString());
    }
  }
  for (const [ref, obj] of entries) {
    if (!(obj instanceof PDFRawStream)) continue;
    const d = obj.dict;
    if (nameOf(d.get(PDFName.of("Subtype"))) !== "Image") continue;
    if (smaskRefs.has(ref.toString())) continue; // keep soft masks untouched
    if (d.has(PDFName.of("ImageMask")) || d.has(PDFName.of("Decode")) || d.has(PDFName.of("DecodeParms"))) continue;
    const width = numOf(d.get(PDFName.of("Width")));
    const height = numOf(d.get(PDFName.of("Height")));
    if (!width || !height) continue;
    const f = d.get(PDFName.of("Filter"));
    const fname = nameOf(f) ?? (f instanceof PDFArray && f.size() === 1 ? nameOf(f.get(0)) : null);
    const filter: ImageInfo["filter"] = fname === "DCTDecode" ? "DCTDecode" : fname === "FlateDecode" ? "FlateDecode" : "other";
    if (filter === "other") continue;
    const bpc = numOf(d.get(PDFName.of("BitsPerComponent"))) ?? 8;
    out.push({
      ref,
      stream: obj,
      width,
      height,
      filter,
      colorSpace: colorSpaceOf(doc, d.get(PDFName.of("ColorSpace"))),
      bpc,
      hasSMask: d.has(PDFName.of("SMask")),
    });
  }
  return out;
}

async function decodeToBitmap(info: ImageInfo): Promise<ImageBitmap | null> {
  if (info.filter === "DCTDecode") {
    if (info.colorSpace === "other") return null; // CMYK JPEGs decode inverted in browsers
    try {
      return await createImageBitmap(new Blob([info.stream.contents as BlobPart], { type: "image/jpeg" }));
    } catch {
      return null;
    }
  }
  if (info.bpc !== 8 || info.colorSpace === "other") return null;
  let raw: Uint8Array;
  try {
    raw = inflateSync(info.stream.contents);
  } catch {
    return null;
  }
  const px = info.width * info.height;
  const rgba = new Uint8ClampedArray(px * 4);
  if (info.colorSpace === "rgb") {
    if (raw.length < px * 3) return null;
    for (let i = 0, j = 0; i < px; i++, j += 3) {
      rgba[i * 4] = raw[j];
      rgba[i * 4 + 1] = raw[j + 1];
      rgba[i * 4 + 2] = raw[j + 2];
      rgba[i * 4 + 3] = 255;
    }
  } else {
    if (raw.length < px) return null;
    for (let i = 0; i < px; i++) {
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = raw[i];
      rgba[i * 4 + 3] = 255;
    }
  }
  return createImageBitmap(new ImageData(rgba, info.width, info.height));
}

async function compressImages(doc: PDFDocument, opt: CompressOptions, jobId: string, onProgress: ProgressCb): Promise<number> {
  if (typeof OffscreenCanvas === "undefined") throw new Error("offscreen-canvas-unsupported");
  const images = collectImages(doc);
  let touched = 0;
  for (let i = 0; i < images.length; i++) {
    check(jobId);
    const info = images[i];
    onProgress({ phase: "compress", done: i, total: images.length });
    const original = info.stream.contents.length;
    if (original < 2048) continue;
    const bitmap = await decodeToBitmap(info);
    if (!bitmap) continue;
    try {
      const scale = info.hasSMask ? 1 : Math.min(1, opt.maxDimension / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.drawImage(bitmap, 0, 0, w, h);
      const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: opt.quality });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (bytes.length >= original * 0.95) continue;
      const dict = info.stream.dict.clone(doc.context) as PDFDict;
      dict.set(PDFName.of("Filter"), PDFName.of("DCTDecode"));
      dict.set(PDFName.of("Width"), PDFNumber.of(w));
      dict.set(PDFName.of("Height"), PDFNumber.of(h));
      dict.set(PDFName.of("BitsPerComponent"), PDFNumber.of(8));
      dict.set(PDFName.of("ColorSpace"), PDFName.of(info.colorSpace === "gray" ? "DeviceGray" : "DeviceRGB"));
      dict.set(PDFName.of("Length"), PDFNumber.of(bytes.length));
      dict.delete(PDFName.of("DecodeParms"));
      doc.context.assign(info.ref, PDFRawStream.of(dict, bytes));
      touched += 1;
    } finally {
      bitmap.close();
    }
  }
  return touched;
}

// ───────── Public API ─────────

const api = {
  cancel(jobId: string) {
    cancelled.add(jobId);
  },

  async pageCount(bytes: ArrayBuffer): Promise<number> {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return doc.getPageCount();
  },

  /**
   * Builds one output PDF from an ordered list of page references across sources,
   * then applies watermark, page numbers, signature and image compression in that order.
   */
  async assemble(
    jobId: string,
    sources: SourceInput[],
    pages: PageRef[],
    options: AssembleOptions,
    onProgress: ProgressCb,
  ): Promise<AssembleResult> {
    try {
      return await assembleImpl(jobId, sources, pages, options, onProgress);
    } finally {
      cancelled.delete(jobId);
    }
  },

  /** Splits a document into several documents, one per group of zero-based page indices. */
  async splitGroups(jobId: string, bytes: ArrayBuffer, groups: number[][], onProgress: ProgressCb): Promise<ArrayBuffer[]> {
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const results: ArrayBuffer[] = [];
    for (let g = 0; g < groups.length; g++) {
      check(jobId);
      const doc = await PDFDocument.create();
      const copied = await doc.copyPages(src, groups[g]);
      copied.forEach((p) => doc.addPage(p));
      const out = await doc.save({ useObjectStreams: true });
      results.push(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer);
      onProgress({ phase: "copy", done: g + 1, total: groups.length });
    }
    cancelled.delete(jobId);
    return Comlink.transfer(results, results);
  },

  /** Lays out one image per page. Images must already be PNG or JPEG bytes. */
  async imagesToPdf(jobId: string, images: ImageInput[], opt: ImagesToPdfOptions, onProgress: ProgressCb): Promise<ArrayBuffer> {
    const doc = await PDFDocument.create();
    for (let i = 0; i < images.length; i++) {
      check(jobId);
      const img = await embedImage(doc, images[i]);
      const landscape = opt.orientation === "landscape" || (opt.orientation === "auto" && img.width > img.height);
      let pw: number;
      let ph: number;
      if (opt.pageSize === "fit") {
        pw = img.width + opt.margin * 2;
        ph = img.height + opt.margin * 2;
      } else {
        const [a, b] = PAGE_SIZES[opt.pageSize];
        pw = landscape ? b : a;
        ph = landscape ? a : b;
      }
      const page = doc.addPage([pw, ph]);
      const maxW = pw - opt.margin * 2;
      const maxH = ph - opt.margin * 2;
      const scale = Math.min(maxW / img.width, maxH / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
      onProgress({ phase: "copy", done: i + 1, total: images.length });
    }
    const out = await doc.save({ useObjectStreams: true });
    const buf = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
    cancelled.delete(jobId);
    return Comlink.transfer(buf, [buf]);
  },
};

async function assembleImpl(
  jobId: string,
  sources: SourceInput[],
  pages: PageRef[],
  options: AssembleOptions,
  onProgress: ProgressCb,
): Promise<AssembleResult> {
    const out = await PDFDocument.create();
    const loaded = new Map<string, PDFDocument>();
    for (const s of sources) {
      check(jobId);
      loaded.set(s.id, await PDFDocument.load(s.bytes, { ignoreEncryption: true }));
    }

    // Group consecutive copies per source to keep copyPages calls cheap.
    const outPages: PDFPage[] = [];
    for (let i = 0; i < pages.length; i++) {
      check(jobId);
      const ref = pages[i];
      const src = loaded.get(ref.sourceId);
      if (!src) continue;
      const [copied] = await out.copyPages(src, [ref.pageIndex]);
      const base = ((copied.getRotation().angle % 360) + 360) % 360;
      copied.setRotation(degrees((base + ref.rotation) % 360));
      out.addPage(copied);
      outPages.push(copied);
      if (i % 5 === 0) onProgress({ phase: "copy", done: i + 1, total: pages.length });
    }
    onProgress({ phase: "copy", done: pages.length, total: pages.length });

    if (options.watermark && (options.watermark.kind === "image" ? options.watermark.image : options.watermark.text?.trim())) {
      await applyWatermark(out, outPages, options.watermark, jobId, onProgress);
    }
    if (options.pageNumbers) await applyPageNumbers(out, outPages, options.pageNumbers, jobId, onProgress);
    if (options.signature) await applySignature(out, outPages, options.signature);

    let imagesTouched: number | undefined;
    if (options.compress) imagesTouched = await compressImages(out, options.compress, jobId, onProgress);

    check(jobId);
    onProgress({ phase: "save", done: 0, total: 1 });
    const bytes = await out.save({ useObjectStreams: true });
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return Comlink.transfer({ bytes: buf, pages: outPages.length, imagesTouched }, [buf]);
}

export type PdfWorkerApi = typeof api;

/** Exported for unit tests; the worker entry below is what the app uses. */
export const pdfWorkerApi = api;

if (typeof self !== "undefined" && typeof (self as unknown as { postMessage?: unknown }).postMessage === "function") {
  Comlink.expose(api);
}
