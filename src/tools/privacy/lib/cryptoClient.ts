"use client";

import { wrap, proxy, type Remote } from "comlink";
import type { CryptoWorkerApi } from "@/workers/crypto.worker";

let remote: Remote<CryptoWorkerApi> | null = null;
let worker: Worker | null = null;
let idleTimer: number | null = null;

/** Lazily spins up the crypto worker; terminates it after a minute idle. */
export function cryptoWorker(): Remote<CryptoWorkerApi> {
  if (idleTimer) window.clearTimeout(idleTimer);
  if (!remote) {
    worker = new Worker(new URL("../../../workers/crypto.worker.ts", import.meta.url), { type: "module" });
    remote = wrap<CryptoWorkerApi>(worker);
  }
  idleTimer = window.setTimeout(() => {
    worker?.terminate();
    worker = null;
    remote = null;
  }, 60_000);
  return remote;
}

export { proxy };
