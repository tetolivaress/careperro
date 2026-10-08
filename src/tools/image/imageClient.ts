"use client";

import * as Comlink from "comlink";
import type { ImageWorkerApi } from "@/workers/image.worker";

/**
 * Main-thread handle to a pool of image workers.
 * One worker serves live previews; extra workers join only for batch export.
 */
class ImageWorkerHandle {
  readonly api: Comlink.Remote<ImageWorkerApi>;
  private readonly worker: Worker;
  busy = 0;

  constructor() {
    this.worker = new Worker(new URL("../../workers/image.worker.ts", import.meta.url), { type: "module", name: "image" });
    this.api = Comlink.wrap<ImageWorkerApi>(this.worker);
  }

  terminate() {
    this.api[Comlink.releaseProxy]();
    this.worker.terminate();
  }
}

let primary: ImageWorkerHandle | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

/** The worker holding decoded sources for the editor session. Created lazily. */
export function imageWorker(): ImageWorkerHandle {
  if (!primary) primary = new ImageWorkerHandle();
  if (idleTimer) clearTimeout(idleTimer);
  return primary;
}

/** Called when the editor unmounts: free decoded bitmaps and stop the worker after a grace period. */
export function releaseImageWorker(): void {
  const w = primary;
  if (!w) return;
  void w.api.unloadAll();
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (primary === w) {
      w.terminate();
      primary = null;
    }
  }, 30_000);
}

/** Suggested export concurrency: leave a core for the UI, cap at 4 as the plan requires. */
export function exportConcurrency(): number {
  const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 2 : 2;
  return Math.max(2, Math.min(4, cores - 1));
}

/** Creates short-lived helper workers for batch export. Caller terminates them when done. */
export function spawnExportWorkers(count: number): ImageWorkerHandle[] {
  return Array.from({ length: count }, () => new ImageWorkerHandle());
}

export type { ImageWorkerHandle };
