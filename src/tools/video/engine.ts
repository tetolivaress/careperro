"use client";

import * as Comlink from "comlink";
import type { VideoWorkerApi } from "@/workers/video.worker";
import type { ExportOptions, ExportResult, ProgressCallback, VideoInfo } from "./types";
import { EngineUnsupportedError, JobCanceledError } from "./types";

/** Lazy Comlink proxy to the WebCodecs worker; terminated after a quiet period to free memory. */
let worker: Worker | null = null;
let proxy: Comlink.Remote<VideoWorkerApi> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let jobCounter = 0;

function touch() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(terminateWorker, 60_000);
}

function getWorker(): Comlink.Remote<VideoWorkerApi> {
  if (!proxy) {
    worker = new Worker(new URL("../../workers/video.worker.ts", import.meta.url), { type: "module" });
    proxy = Comlink.wrap<VideoWorkerApi>(worker);
  }
  touch();
  return proxy;
}

export function terminateWorker(): void {
  worker?.terminate();
  worker = null;
  proxy = null;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
}

function translate(e: unknown): never {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("ENGINE_UNSUPPORTED")) throw new EngineUnsupportedError();
  if (msg.includes("JOB_CANCELED")) throw new JobCanceledError();
  throw e;
}

export function webCodecsAvailable(): boolean {
  return typeof window !== "undefined" && typeof VideoEncoder !== "undefined" && typeof VideoDecoder !== "undefined";
}

export async function probeVideo(file: File): Promise<VideoInfo> {
  try {
    return await getWorker().probe(file);
  } catch (e) {
    translate(e);
  }
}

export interface RunningJob<T> {
  id: string;
  result: Promise<T>;
  cancel: () => Promise<void>;
}

export function exportWithWebCodecs(file: File, options: ExportOptions, onProgress: ProgressCallback): RunningJob<ExportResult> {
  const id = `job-${++jobCounter}`;
  const w = getWorker();
  const transfer = options.watermark?.kind === "image" ? [options.watermark.bitmap] : [];
  const payload = transfer.length ? Comlink.transfer(options, transfer) : options;
  const result = w.exportVideo(id, file, payload, Comlink.proxy(onProgress)).catch(translate).finally(touch);
  return { id, result, cancel: () => w.cancel(id) };
}

export function extractWavWithWebCodecs(file: File, trim: { start: number; end: number } | undefined, onProgress: ProgressCallback): RunningJob<ExportResult> {
  const id = `job-${++jobCounter}`;
  const w = getWorker();
  const result = w.extractWav(id, file, trim, Comlink.proxy(onProgress)).catch(translate).finally(touch);
  return { id, result, cancel: () => w.cancel(id) };
}
