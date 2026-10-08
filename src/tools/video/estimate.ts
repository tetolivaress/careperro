import type { QualityLevel, Resolution, VideoInfo } from "./types";

/** Bits per pixel per second for each quality level (H.264-ish). */
const BPP: Record<QualityLevel, number> = { low: 0.045, medium: 0.08, high: 0.14 };
const AUDIO_BITRATE = 128_000;

export function targetHeightFor(res: Resolution, info: VideoInfo): number | undefined {
  if (res === "original") return undefined;
  const h = Number(res);
  const sourceShort = Math.min(info.width, info.height);
  return h >= sourceShort ? undefined : h;
}

export function outputDimensions(info: VideoInfo, targetHeight?: number): { width: number; height: number } {
  const landscape = info.width >= info.height;
  const short = Math.min(info.width, info.height);
  const long = Math.max(info.width, info.height);
  const s = targetHeight && targetHeight < short ? targetHeight : short;
  const l = Math.round((long * s) / short / 2) * 2;
  return landscape ? { width: l, height: s } : { width: s, height: l };
}

export function bitrateFor(level: QualityLevel, width: number, height: number, fps: number): number {
  const v = BPP[level] * width * height * Math.min(Math.max(fps, 15), 60);
  return Math.round(Math.max(v, 300_000));
}

/** Estimated output size in bytes for a transcode. */
export function estimateTranscodeSize(videoBitrate: number, duration: number, hasAudio: boolean): number {
  return Math.round(((videoBitrate + (hasAudio ? AUDIO_BITRATE : 0)) * duration) / 8);
}

/** Estimated size when streams are copied: proportional to the trimmed duration. */
export function estimateCopySize(originalBytes: number, duration: number, trimmedDuration: number): number {
  if (duration <= 0) return originalBytes;
  return Math.round((originalBytes * Math.min(trimmedDuration, duration)) / duration);
}

/** GIFs are roughly 0.3 bytes per pixel per frame after palette quantization. */
export function estimateGifSize(width: number, aspect: number, fps: number, duration: number): number {
  const height = width / aspect;
  return Math.round(width * height * fps * duration * 0.3);
}

export function estimateAudioSize(format: "mp3" | "wav", duration: number, sampleRate = 48_000, channels = 2): number {
  if (format === "wav") return Math.round(duration * sampleRate * channels * 2);
  return Math.round((192_000 * duration) / 8);
}

export function formatTime(seconds: number, withMillis = false): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const base = `${m}:${String(sec).padStart(2, "0")}`;
  if (!withMillis) return base;
  const ms = Math.floor((s - Math.floor(s)) * 10);
  return `${base}.${ms}`;
}
