"use client";

import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { loadFFmpeg, resetFFmpeg } from "@/lib/ffmpeg";
import type { ExportResult, ProgressCallback } from "./types";
import { JobCanceledError } from "./types";

/**
 * ffmpeg.wasm fallback engine for the video tools. The shared loader hands us a ready FFmpeg whose
 * class worker does all decoding/encoding, so the UI thread never touches media data.
 */
export type LoadStatus = (phase: "downloading" | "ready", ratio?: number) => void;

let current: FFmpeg | null = null;
let counter = 0;

export async function loadFfmpeg(onStatus?: LoadStatus): Promise<FFmpeg> {
  onStatus?.("downloading", 0);
  const ff = await loadFFmpeg({ onDownload: (ratio) => onStatus?.("downloading", ratio) });
  onStatus?.("ready");
  current = ff;
  return ff;
}

/** Terminates the worker. Any running job rejects; the next call reloads the core (from the HTTP cache). */
export function cancelFfmpeg(): void {
  current?.terminate();
  current = null;
  resetFFmpeg();
}

export interface FfmpegJob {
  input: File;
  /** Output file name inside the virtual FS, e.g. "out.mp4". */
  output: string;
  /** ffmpeg arguments between input and output (input is "in.<ext>"). */
  args: string[];
  mimeType: string;
  /** Duration of the output in seconds, used to normalize progress. */
  duration?: number;
  /** Extra inputs (e.g. a rendered watermark PNG) written to the FS before running; reference them by name in args. */
  extraInputs?: { name: string; data: Blob }[];
}

export async function runFfmpeg(job: FfmpegJob, onProgress: ProgressCallback, onStatus?: LoadStatus): Promise<ExportResult> {
  const ff = await loadFfmpeg(onStatus);
  const id = ++counter;
  const ext = job.input.name.split(".").pop()?.toLowerCase() || "mp4";
  const inName = `in-${id}.${ext}`;
  const outName = `${id}-${job.output}`;
  const { fetchFile } = await import("@ffmpeg/util");
  const progressHandler = ({ progress, time }: { progress: number; time: number }) => {
    // ffmpeg's progress is relative to the input; use time when we know the output duration.
    const byTime = job.duration ? time / 1_000_000 / job.duration : progress;
    onProgress(Math.max(0, Math.min(1, Number.isFinite(byTime) ? byTime : progress)));
  };
  ff.on("progress", progressHandler);
  try {
    await ff.writeFile(inName, await fetchFile(job.input));
    for (const extra of job.extraInputs ?? []) await ff.writeFile(extra.name, await fetchFile(extra.data));
    const code = await ff.exec(["-hide_banner", "-i", inName, ...job.args, outName]);
    if (code !== 0) throw new Error(`ffmpeg exited with code ${code}`);
    const data = await ff.readFile(outName);
    if (typeof data === "string") throw new Error("Unexpected text output");
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    return { buffer: copy.buffer, mimeType: job.mimeType, extension: job.output.split(".").pop() ?? "bin", engine: "ffmpeg" };
  } catch (e) {
    if (current !== ff) throw new JobCanceledError();
    throw e;
  } finally {
    if (current === ff) {
      ff.off("progress", progressHandler);
      await Promise.allSettled([ff.deleteFile(inName), ff.deleteFile(outName), ...(job.extraInputs ?? []).map((x) => ff.deleteFile(x.name))]);
    }
  }
}
