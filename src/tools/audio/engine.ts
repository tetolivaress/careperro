"use client";

import { wrap, type Remote } from "comlink";
import type { AudioWorkerApi, Analysis } from "@/workers/audio.worker";
import { ffmpegLoading, loadFFmpeg, resetFFmpeg, type FFmpegInstance } from "@/lib/ffmpeg";

export type AudioFormat = "mp3" | "wav" | "ogg" | "m4a";
export type NormalizeMode = "peak" | "rms";

export interface AudioSettings {
  /** Trim range in seconds of the source; null = whole file. */
  trim: { start: number; end: number } | null;
  /** Gain in dB, -24..+24 */
  gainDb: number;
  fadeIn: number;
  fadeOut: number;
  /** Playback rate 0.5..3 */
  speed: number;
  normalize: { enabled: boolean; mode: NormalizeMode; targetDb: number };
  format: AudioFormat;
  /** kbps, ignored for WAV */
  bitrate: number;
}

export const DEFAULT_SETTINGS: AudioSettings = {
  trim: null,
  gainDb: 0,
  fadeIn: 0,
  fadeOut: 0,
  speed: 1,
  normalize: { enabled: false, mode: "peak", targetDb: -1 },
  format: "mp3",
  bitrate: 192,
};

export const FORMAT_MIME: Record<AudioFormat, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
};

export const BITRATES = [96, 128, 192, 256, 320] as const;

// ───────── Worker ─────────

let worker: Worker | null = null;
let remote: Remote<AudioWorkerApi> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function getWorker(): Remote<AudioWorkerApi> {
  if (!remote) {
    worker = new Worker(new URL("../../workers/audio.worker.ts", import.meta.url), { type: "module" });
    remote = wrap<AudioWorkerApi>(worker);
  }
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(terminateWorker, 60_000);
  return remote;
}

export function terminateWorker(): void {
  worker?.terminate();
  worker = null;
  remote = null;
}

function channelsOf(buffer: AudioBuffer): Float32Array[] {
  const out: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) out.push(buffer.getChannelData(c));
  return out;
}

/** Copies channel data so the originals stay usable after transfer. */
function copyChannels(buffer: AudioBuffer): Float32Array[] {
  return channelsOf(buffer).map((ch) => new Float32Array(ch));
}

export async function analyzeBuffer(buffer: AudioBuffer, range?: { start: number; end: number } | null): Promise<Analysis> {
  const sr = buffer.sampleRate;
  const from = range ? Math.floor(range.start * sr) : 0;
  const to = range ? Math.min(buffer.length, Math.ceil(range.end * sr)) : buffer.length;
  const channels = channelsOf(buffer).map((ch) => new Float32Array(ch.subarray(from, to)));
  return getWorker().analyze(channels);
}

export async function encodeWav(buffer: AudioBuffer): Promise<Blob> {
  const bytes = await getWorker().encodeWav(copyChannels(buffer), buffer.sampleRate);
  return new Blob([bytes], { type: FORMAT_MIME.wav });
}

// ───────── Decoding ─────────

let decodeCtx: AudioContext | null = null;

export async function decodeFile(file: File): Promise<AudioBuffer> {
  if (!decodeCtx) decodeCtx = new AudioContext();
  const data = await file.arrayBuffer();
  return decodeCtx.decodeAudioData(data);
}

// ───────── Rendering (OfflineAudioContext, main thread) ─────────

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function trimmedDuration(buffer: AudioBuffer | null, s: AudioSettings): number {
  if (!buffer) return 0;
  const start = s.trim ? Math.max(0, s.trim.start) : 0;
  const end = s.trim ? Math.min(buffer.duration, s.trim.end) : buffer.duration;
  return Math.max(0, end - start) / s.speed;
}

/** Output duration in seconds for the current pipeline (merge concatenates every clip, untrimmed). */
export function outputDuration(buffers: AudioBuffer[], s: AudioSettings, merge: boolean): number {
  if (merge) return buffers.reduce((n, b) => n + b.duration, 0) / s.speed;
  return trimmedDuration(buffers[0] ?? null, s);
}

/** Estimated output bytes: PCM for WAV, bitrate × duration otherwise. */
export function estimateBytes(duration: number, s: AudioSettings, channels = 2, sampleRate = 44_100): number {
  if (s.format === "wav") return Math.round(duration * sampleRate * channels * 2) + 44;
  return Math.round((duration * s.bitrate * 1000) / 8);
}

export interface RenderInput {
  buffers: AudioBuffer[];
  settings: AudioSettings;
  merge: boolean;
  /** Pre-computed normalize gain (linear). */
  normalizeGain: number;
}

/** Applies trim → speed → gain/normalize → fades with an OfflineAudioContext. */
export async function renderPipeline({ buffers, settings, merge, normalizeGain }: RenderInput): Promise<AudioBuffer> {
  const first = buffers[0];
  if (!first) throw new Error("No audio");
  const sampleRate = first.sampleRate;
  const channels = Math.max(...buffers.map((b) => b.numberOfChannels));

  const segments: { buffer: AudioBuffer; offset: number; duration: number }[] = merge
    ? buffers.map((b) => ({ buffer: b, offset: 0, duration: b.duration }))
    : [
        {
          buffer: first,
          offset: settings.trim ? Math.max(0, settings.trim.start) : 0,
          duration: settings.trim ? Math.max(0.01, Math.min(first.duration, settings.trim.end) - Math.max(0, settings.trim.start)) : first.duration,
        },
      ];

  const sourceDuration = segments.reduce((n, seg) => n + seg.duration, 0);
  const outDuration = sourceDuration / settings.speed;
  const length = Math.max(1, Math.ceil(outDuration * sampleRate));
  const ctx = new OfflineAudioContext(channels, length, sampleRate);

  const gainNode = ctx.createGain();
  const g = dbToGain(settings.gainDb) * (settings.normalize.enabled ? normalizeGain : 1);
  const fadeIn = Math.min(settings.fadeIn, outDuration / 2);
  const fadeOut = Math.min(settings.fadeOut, outDuration / 2);
  gainNode.gain.setValueAtTime(fadeIn > 0 ? 0 : g, 0);
  if (fadeIn > 0) gainNode.gain.linearRampToValueAtTime(g, fadeIn);
  if (fadeOut > 0) {
    gainNode.gain.setValueAtTime(g, Math.max(fadeIn, outDuration - fadeOut));
    gainNode.gain.linearRampToValueAtTime(0, outDuration);
  }
  gainNode.connect(ctx.destination);

  let when = 0;
  for (const seg of segments) {
    const src = ctx.createBufferSource();
    src.buffer = seg.buffer;
    src.playbackRate.value = settings.speed;
    src.connect(gainNode);
    src.start(when, seg.offset, seg.duration);
    when += seg.duration / settings.speed;
  }

  return ctx.startRendering();
}

/** Linear gain that brings the analyzed level to the target. */
export function normalizeGainFor(analysis: Analysis | null, mode: NormalizeMode, targetDb: number): number {
  if (!analysis) return 1;
  const current = mode === "peak" ? analysis.peak : analysis.rms;
  if (current <= 0) return 1;
  return Math.min(dbToGain(targetDb) / current, 100);
}

// ───────── ffmpeg.wasm (shared lazy loader in src/lib/ffmpeg.ts) ─────────

export function isFfmpegLoaded(): boolean {
  return ffmpegLoading();
}

/** Loads ffmpeg once. `onProgress` reports the core download (0..1). */
export async function loadFfmpeg(onProgress?: (ratio: number) => void): Promise<FFmpegInstance> {
  const ffmpeg = await loadFFmpeg({ onDownload: onProgress });
  onProgress?.(1);
  return ffmpeg;
}

/** Terminates the ffmpeg worker (cancels any running job). A later call to loadFfmpeg reloads it. */
export async function terminateFfmpeg(): Promise<void> {
  if (!ffmpegLoading()) return;
  try {
    (await loadFFmpeg()).terminate();
  } catch {
    /* never loaded or already gone */
  } finally {
    resetFFmpeg();
  }
}

const CODEC: Record<Exclude<AudioFormat, "wav">, string[]> = {
  mp3: ["-c:a", "libmp3lame"],
  ogg: ["-c:a", "libvorbis"],
  m4a: ["-c:a", "aac"],
};

export interface EncodeOptions {
  format: AudioFormat;
  bitrate: number;
  onProgress?: (ratio: number) => void;
  signal?: AbortSignal;
}

/** Encodes a rendered buffer to the target format. WAV never touches ffmpeg. */
export async function encodeBuffer(buffer: AudioBuffer, { format, bitrate, onProgress, signal }: EncodeOptions): Promise<Blob> {
  const wav = await encodeWav(buffer);
  if (format === "wav") {
    onProgress?.(1);
    return wav;
  }
  const ffmpeg = await loadFfmpeg();
  const { fetchFile } = await import("@ffmpeg/util");
  const input = "input.wav";
  const output = `output.${format}`;
  const progress = ({ progress: p }: { progress: number }) => onProgress?.(Math.max(0, Math.min(1, p)));
  ffmpeg.on("progress", progress);
  try {
    await ffmpeg.writeFile(input, await fetchFile(wav));
    const code = await ffmpeg.exec(["-i", input, ...CODEC[format], "-b:a", `${bitrate}k`, "-vn", output], undefined, { signal });
    if (code !== 0) throw new Error(`ffmpeg exited with ${code}`);
    const data = await ffmpeg.readFile(output);
    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
    return new Blob([bytes as BlobPart], { type: FORMAT_MIME[format] });
  } finally {
    ffmpeg.off("progress", progress);
    await Promise.allSettled([ffmpeg.deleteFile(input), ffmpeg.deleteFile(output)]);
  }
}

// ───────── Formatting helpers ─────────

export function formatTime(seconds: number, withTenths = false): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  if (withTenths) return `${m}:${s.toFixed(1).padStart(4, "0")}`;
  return `${m}:${Math.floor(s).toString().padStart(2, "0")}`;
}

export function parseTime(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const parts = t.split(":").map((p) => Number(p));
  if (parts.some((p) => !Number.isFinite(p) || p < 0)) return null;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

export function formatDb(db: number): string {
  if (!Number.isFinite(db)) return "−∞ dB";
  return `${db > 0 ? "+" : db < 0 ? "−" : ""}${Math.abs(db).toFixed(1)} dB`;
}
