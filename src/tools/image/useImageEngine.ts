"use client";

import { useCallback, useEffect, useRef } from "react";
import { zip } from "fflate";
import * as Comlink from "comlink";
import { useImageEditor, selectedItem, type EditorItem } from "./store";
import { DEFAULT_SETTINGS, formatInfo, type EditSettings, type RenderResult } from "./types";
import { exportConcurrency, imageWorker, releaseImageWorker, spawnExportWorkers, type ImageWorkerHandle } from "./imageClient";
import { mimeOf } from "@/lib/fileTypes";
import { decodeHeic, isHeicFile } from "@/lib/heic";
import type { SourceInfo } from "./types";
import { downloadBlob, outputFileName } from "@/lib/download";
import { useSessionStore } from "@/stores/session";

const PREVIEW_DEBOUNCE_MS = 100;
/** Previews above this longest side are capped so a 50 MP photo still feels live. */
const PREVIEW_MAX_SIDE = 4096;

let tokenSeq = 1;
const nextToken = () => tokenSeq++;

export interface ExportOutcome {
  blob: Blob;
  name: string;
  result: RenderResult;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

/** Loads a file into a worker; HEIC photos the worker can't decode are decoded here and transferred. */
async function loadSource(handle: ImageWorkerHandle, id: string, file: File): Promise<SourceInfo> {
  try {
    return await handle.api.load(id, file, mimeOf(file));
  } catch (e) {
    if (!isHeicFile(file)) throw e;
    const bitmap = await decodeHeic(file);
    return handle.api.loadBitmap(id, Comlink.transfer(bitmap, [bitmap]), file, "image/heic");
  }
}

/**
 * Drives the worker for the editor: loads sources, keeps a thumbnail + original preview per item,
 * re-renders the selected item (debounced, cancelable) when settings change, and exports.
 */
export function useImageEngine() {
  const items = useImageEditor((s) => s.items);
  const selectedId = useImageEditor((s) => s.selectedId);
  const settings = useImageEditor((s) => s.settings);
  const patchItem = useImageEditor((s) => s.patchItem);
  const setExporting = useImageEditor((s) => s.setExporting);
  const recordProcessed = useSessionStore((s) => s.recordProcessed);

  const loading = useRef(new Set<string>());
  const known = useRef(new Set<string>());
  const originals = useRef(new Map<string, string>());
  const lastRender = useRef(new Map<string, { token: number; settings: EditSettings; result: RenderResult }>());

  // Load newly added items; unload removed ones.
  useEffect(() => {
    const w = imageWorker();
    const ids = new Set(items.map((i) => i.id));
    for (const id of known.current) {
      if (!ids.has(id)) {
        known.current.delete(id);
        loading.current.delete(id);
        lastRender.current.delete(id);
        const url = originals.current.get(id);
        if (url) URL.revokeObjectURL(url);
        originals.current.delete(id);
        void w.api.unload(id);
      }
    }
    for (const item of items) {
      known.current.add(item.id);
      if (item.status !== "loading" || loading.current.has(item.id)) continue;
      loading.current.add(item.id);
      void (async () => {
        try {
          const info = await loadSource(w, item.id, item.file);
          const [thumb, original] = await Promise.all([
            w.api.thumbnail(item.id, 192),
            w.api.render({ id: item.id, token: nextToken(), settings: { ...DEFAULT_SETTINGS, compress: { ...DEFAULT_SETTINGS.compress, format: "webp", quality: 90 } }, previewMaxSide: 2048 }),
          ]);
          originals.current.set(item.id, URL.createObjectURL(original.blob));
          patchItem(item.id, { info, thumbUrl: URL.createObjectURL(thumb), status: "ready" });
        } catch (e) {
          patchItem(item.id, { status: "error", error: errorMessage(e) });
        }
      })();
    }
  }, [items, patchItem]);

  // Debounced preview render of the selected item whenever settings change.
  // Depends on the selected item's *load state* only (not the items array), otherwise the
  // status patches made by the render itself would re-trigger and cancel it forever.
  const selectedLoad = useImageEditor((s) => {
    const it = s.items.find((i) => i.id === s.selectedId);
    if (!it) return "none";
    if (it.status === "loading") return "loading";
    if (it.status === "error") return "error";
    return "ready";
  });
  const selectedMaxSide = useImageEditor((s) => {
    const it = s.items.find((i) => i.id === s.selectedId);
    return it?.info ? Math.max(it.info.width, it.info.height) : 0;
  });
  useEffect(() => {
    if (!selectedId || selectedLoad !== "ready") return;
    const id = selectedId;
    const token = nextToken();
    const w = imageWorker();
    const capped = selectedMaxSide > PREVIEW_MAX_SIDE;
    const timer = setTimeout(() => {
      void w.api.cancel(id, token);
      patchItem(id, { status: "rendering" });
      w.api
        .render({ id, token, settings, previewMaxSide: PREVIEW_MAX_SIDE })
        .then((result) => {
          if (capped) lastRender.current.delete(id);
          else lastRender.current.set(id, { token, settings, result });
          patchItem(id, {
            previewUrl: URL.createObjectURL(result.blob),
            estimate: { bytes: result.blob.size, width: result.width, height: result.height, quality: result.quality, ms: result.ms },
            status: "done",
            error: null,
          });
        })
        .catch((e: unknown) => {
          if (isAbort(e)) return;
          patchItem(id, { status: "error", error: errorMessage(e) });
        });
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [selectedId, selectedLoad, selectedMaxSide, settings, patchItem]);

  // Release the worker and object URLs on unmount.
  useEffect(() => {
    const urls = originals.current;
    return () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
      releaseImageWorker();
    };
  }, []);

  const originalUrl = useCallback((id: string) => originals.current.get(id) ?? null, []);

  /** Full-resolution render for one item, reusing the live preview when it already is full-res. */
  const renderFull = useCallback(
    async (item: EditorItem, handle: ImageWorkerHandle = imageWorker(), s: EditSettings = settings): Promise<ExportOutcome> => {
      const cached = lastRender.current.get(item.id);
      let result: RenderResult;
      if (cached && cached.settings === s) {
        result = cached.result;
      } else {
        if (handle !== imageWorker()) await loadSource(handle, item.id, item.file);
        result = await handle.api.render({ id: item.id, token: nextToken(), settings: s });
      }
      const name = outputFileName(item.file.name, "edited", formatInfo(result.format).ext);
      return { blob: result.blob, name, result };
    },
    [settings],
  );

  const exportSelected = useCallback(async (): Promise<ExportOutcome | null> => {
    const item = selectedItem(useImageEditor.getState());
    if (!item || item.status === "loading" || item.status === "error") return null;
    const out = await renderFull(item);
    downloadBlob(out.blob, out.name);
    recordProcessed();
    return out;
  }, [renderFull, recordProcessed]);

  /** Processes every item with limited concurrency and downloads a zip. Returns total before/after bytes. */
  const exportAll = useCallback(
    async (signal?: AbortSignal): Promise<{ before: number; after: number; count: number } | null> => {
      const list = useImageEditor.getState().items.filter((i) => i.status !== "loading" && i.status !== "error");
      if (list.length === 0) return null;
      if (list.length === 1) {
        const out = await exportSelected();
        return out ? { before: list[0].file.size, after: out.blob.size, count: 1 } : null;
      }
      const s = useImageEditor.getState().settings;
      const concurrency = Math.min(exportConcurrency(), list.length);
      const helpers = spawnExportWorkers(Math.max(0, concurrency - 1));
      const pool: ImageWorkerHandle[] = [imageWorker(), ...helpers];
      const files: Record<string, Uint8Array> = {};
      let done = 0;
      let before = 0;
      let after = 0;
      setExporting({ done: 0, total: list.length });
      const queue = [...list];
      const usedNames = new Set<string>();

      const run = async (handle: ImageWorkerHandle) => {
        while (queue.length && !signal?.aborted) {
          const item = queue.shift()!;
          try {
            patchItem(item.id, { status: "rendering", progress: 0 });
            const out = await renderFull(item, handle, s);
            let name = out.name;
            let n = 1;
            while (usedNames.has(name)) name = out.name.replace(/(\.[^.]+)$/, `-${++n}$1`);
            usedNames.add(name);
            files[name] = new Uint8Array(await out.blob.arrayBuffer());
            before += item.file.size;
            after += out.blob.size;
            patchItem(item.id, { status: "done", result: out.result, progress: 100 });
          } catch (e) {
            if (!isAbort(e)) patchItem(item.id, { status: "error", error: errorMessage(e) });
          } finally {
            if (handle !== imageWorker()) void handle.api.unload(item.id);
            done += 1;
            setExporting({ done, total: list.length });
          }
        }
      };

      try {
        await Promise.all(pool.map(run));
        if (signal?.aborted) return null;
        const zipped = await new Promise<Uint8Array>((resolve, reject) => {
          zip(files, { level: 0 }, (err, data) => (err ? reject(err) : resolve(data)));
        });
        downloadBlob(new Blob([new Uint8Array(zipped)], { type: "application/zip" }), "caribito-images.zip");
        recordProcessed(list.length);
        return { before, after, count: list.length };
      } finally {
        for (const h of helpers) h.terminate();
        setExporting(null);
      }
    },
    [exportSelected, patchItem, recordProcessed, renderFull, setExporting],
  );

  return { originalUrl, exportSelected, exportAll };
}
