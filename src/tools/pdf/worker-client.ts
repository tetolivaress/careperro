"use client";

import * as Comlink from "comlink";
import type { PdfWorkerApi } from "@/workers/pdf.worker";

let worker: Worker | null = null;
let api: Comlink.Remote<PdfWorkerApi> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

/** Lazily spins up the PDF worker; terminates it after a minute of inactivity. */
export function getPdfWorker(): Comlink.Remote<PdfWorkerApi> {
  if (!api) {
    worker = new Worker(new URL("../../workers/pdf.worker.ts", import.meta.url), { type: "module" });
    api = Comlink.wrap<PdfWorkerApi>(worker);
  }
  touchIdle();
  return api;
}

function touchIdle() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    worker?.terminate();
    worker = null;
    api = null;
  }, 60_000);
}

export function newJobId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Wraps a progress callback so Comlink can call it from the worker. */
export function progressProxy<T>(cb: (p: T) => void) {
  return Comlink.proxy(cb);
}
