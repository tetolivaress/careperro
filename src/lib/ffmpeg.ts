"use client";

import type { FFmpeg } from "@ffmpeg/ffmpeg";

/**
 * Shared ffmpeg.wasm loader.
 *
 * `@ffmpeg/ffmpeg` creates its class worker with a dynamic `new URL(x, import.meta.url)` that
 * bundlers cannot resolve, and its worker.js has relative imports so it cannot run from a blob URL.
 * We therefore self-host the library's small ESM files under /public/ffmpeg (copied from the npm
 * package) and import them at runtime, while the ~32 MB single-threaded core is fetched from a CDN
 * into blob URLs (code only, never user data). Single-threaded core works without COOP/COEP.
 */
const CORE_VERSION = "0.12.10";
const FFMPEG_BASE = "/ffmpeg";
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`;

export type FFmpegInstance = FFmpeg;

export interface FFmpegLoadOptions {
  /** 0..1 download progress of the ~31 MB core. */
  onDownload?: (ratio: number) => void;
  signal?: AbortSignal;
}

interface FFmpegModule {
  FFmpeg: new () => FFmpeg;
}

let cached: Promise<FFmpeg> | null = null;

async function fetchAsBlobUrl(url: string, type: string, onProgress?: (ratio: number) => void, signal?: AbortSignal): Promise<string> {
  const res = await fetch(url, { signal });
  if (!res.ok || !res.body) throw new Error(`Failed to download ${url} (${res.status})`);
  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (onProgress) onProgress(total ? received / total : Math.min(0.95, received / (32 * 1024 * 1024)));
  }
  const blob = new Blob(chunks as BlobPart[], { type });
  return URL.createObjectURL(blob);
}

/** Loads (once) and returns a ready FFmpeg instance. Terminate it with `ffmpeg.terminate()` to cancel work; call `resetFFmpeg()` afterwards. */
export function loadFFmpeg(opts: FFmpegLoadOptions = {}): Promise<FFmpeg> {
  if (cached) return cached;
  cached = (async () => {
    const mod = (await import(/* turbopackIgnore: true */ /* webpackIgnore: true */ `${FFMPEG_BASE}/index.js`)) as FFmpegModule;
    const ffmpeg = new mod.FFmpeg();
    const classWorkerURL = new URL(`${FFMPEG_BASE}/worker.js`, window.location.origin).href;
    const [coreURL, wasmURL] = await Promise.all([
      fetchAsBlobUrl(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript", undefined, opts.signal),
      fetchAsBlobUrl(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm", opts.onDownload, opts.signal),
    ]);
    await ffmpeg.load({ classWorkerURL, coreURL, wasmURL });
    return ffmpeg;
  })();
  cached.catch(() => {
    cached = null;
  });
  return cached;
}

/** Forgets the cached instance (after terminate()) so the next load creates a fresh one. */
export function resetFFmpeg(): void {
  cached = null;
}

/** True when a load has already completed or is in flight. */
export function ffmpegLoading(): boolean {
  return cached !== null;
}
