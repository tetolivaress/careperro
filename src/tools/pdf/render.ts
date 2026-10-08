"use client";

import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";

type PdfJs = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfJs> | null = null;

/** Loads pdfjs once and points it at its own (bundled) worker. */
export function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      return mod;
    });
  }
  return pdfjsPromise;
}

export interface OpenedPdf {
  doc: PDFDocumentProxy;
  pageCount: number;
  /** Displayed (rotated) size of each page in points, for layout before rendering. */
  sizes: { width: number; height: number }[];
  destroy: () => Promise<void>;
}

export async function openPdf(bytes: ArrayBuffer): Promise<OpenedPdf> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) });
  const doc = await task.promise;
  const sizes: { width: number; height: number }[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    sizes.push({ width: vp.width, height: vp.height });
    page.cleanup();
  }
  return { doc, pageCount: doc.numPages, sizes, destroy: () => task.destroy() };
}

export interface RenderHandle {
  promise: Promise<Blob>;
  cancel: () => void;
}

/**
 * Renders one page to a Blob (PNG or JPEG) at the requested scale. Cancelable.
 * `width` caps the output width in CSS px, independent of device pixel ratio.
 */
export function renderPage(
  doc: PDFDocumentProxy,
  pageNumber: number,
  opts: { width?: number; scale?: number; type?: "image/png" | "image/jpeg"; quality?: number; extraRotation?: number } = {},
): RenderHandle {
  let task: RenderTask | null = null;
  let cancelled = false;
  const promise = (async () => {
    const page: PDFPageProxy = await doc.getPage(pageNumber);
    const base = page.getViewport({ scale: 1, rotation: page.rotate + (opts.extraRotation ?? 0) });
    const scale = opts.scale ?? (opts.width ? opts.width / base.width : 1);
    const viewport = page.getViewport({ scale, rotation: page.rotate + (opts.extraRotation ?? 0) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("no-2d-context");
    if (cancelled) throw new Error("cancelled");
    task = page.render({ canvasContext: ctx, viewport, canvas });
    await task.promise;
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob-failed"))), opts.type ?? "image/jpeg", opts.quality ?? 0.82),
    );
    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();
    return blob;
  })();
  return {
    promise,
    cancel: () => {
      cancelled = true;
      task?.cancel();
    },
  };
}

/**
 * Small concurrency-limited queue for thumbnail rendering. Visible pages are requested first by the UI;
 * requests can be dropped when they scroll away.
 */
export class RenderQueue {
  private queue: { key: string; run: () => RenderHandle; resolve: (b: Blob) => void; reject: (e: unknown) => void }[] = [];
  private active = new Map<string, RenderHandle>();
  private pending = new Set<string>();
  constructor(private concurrency = 3) {}

  request(key: string, run: () => RenderHandle): Promise<Blob> {
    if (this.pending.has(key)) return Promise.reject(new Error("duplicate"));
    this.pending.add(key);
    return new Promise<Blob>((resolve, reject) => {
      this.queue.push({ key, run, resolve, reject });
      this.pump();
    });
  }

  drop(key: string) {
    const i = this.queue.findIndex((q) => q.key === key);
    if (i >= 0) {
      const [q] = this.queue.splice(i, 1);
      this.pending.delete(key);
      q.reject(new Error("cancelled"));
    }
  }

  cancelAll() {
    for (const q of this.queue) q.reject(new Error("cancelled"));
    this.queue = [];
    this.pending.clear();
    for (const h of this.active.values()) h.cancel();
    this.active.clear();
  }

  private pump() {
    while (this.active.size < this.concurrency && this.queue.length) {
      const item = this.queue.shift()!;
      const handle = item.run();
      this.active.set(item.key, handle);
      handle.promise
        .then(item.resolve, item.reject)
        .finally(() => {
          this.active.delete(item.key);
          this.pending.delete(item.key);
          this.pump();
        });
    }
  }
}
