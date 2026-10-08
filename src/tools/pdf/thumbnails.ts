"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { RenderQueue, renderPage } from "./render";

const queue = new RenderQueue(3);
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

function key(sourceId: string, pageIndex: number, width: number) {
  return `${sourceId}:${pageIndex}:${width}`;
}

/** Drops every cached thumbnail URL (call on reset). */
export function clearThumbnailCache() {
  queue.cancelAll();
  for (const url of cache.values()) URL.revokeObjectURL(url);
  cache.clear();
  inflight.clear();
}

/** Removes cached thumbnails for one source. */
export function clearSourceThumbnails(sourceId: string) {
  for (const [k, url] of cache) {
    if (k.startsWith(`${sourceId}:`)) {
      URL.revokeObjectURL(url);
      cache.delete(k);
    }
  }
}

function requestThumbnail(doc: PDFDocumentProxy, sourceId: string, pageIndex: number, width: number): Promise<string> {
  const k = key(sourceId, pageIndex, width);
  const hit = cache.get(k);
  if (hit) return Promise.resolve(hit);
  const existing = inflight.get(k);
  if (existing) return existing;
  const p = queue
    .request(k, () => renderPage(doc, pageIndex + 1, { width, type: "image/jpeg", quality: 0.8 }))
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      cache.set(k, url);
      return url;
    })
    .finally(() => inflight.delete(k));
  inflight.set(k, p);
  return p;
}

/** Rounds requested widths so neighbouring sizes share cache entries. */
function bucket(width: number): number {
  return Math.min(1200, Math.max(120, Math.ceil(width / 80) * 80));
}

/**
 * Lazily renders a page thumbnail when its element scrolls into view.
 * Returns the object URL (or null while pending) and a ref to attach to the element.
 */
export function useThumbnail(doc: PDFDocumentProxy | undefined, sourceId: string, pageIndex: number, cssWidth: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(() => cache.get(key(sourceId, pageIndex, bucket(cssWidth * 2))) ?? null);
  const width = bucket(cssWidth * 2);

  useEffect(() => {
    const el = ref.current;
    if (!el || !doc) return;
    const k = key(sourceId, pageIndex, width);
    const cached = cache.get(k);
    if (cached) {
      queueMicrotask(() => setUrl(cached));
      return;
    }
    let active = true;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            io.disconnect();
            requestThumbnail(doc, sourceId, pageIndex, width).then(
              (u) => active && setUrl(u),
              () => {},
            );
          }
        }
      },
      { rootMargin: "300px 0px" },
    );
    io.observe(el);
    return () => {
      active = false;
      io.disconnect();
      queue.drop(k);
    };
  }, [doc, sourceId, pageIndex, width]);

  return { ref, url };
}
