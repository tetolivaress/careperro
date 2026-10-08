/// <reference lib="webworker" />
import * as Comlink from "comlink";
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  ConversionCanceledError,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  VideoSample,
  WavOutputFormat,
  WebMOutputFormat,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  type AudioCodec,
  type ConversionVideoOptions,
  type VideoCodec,
} from "mediabunny";
import type { ExportOptions, ExportResult, ProgressCallback, VideoInfo, Watermark, WatermarkPosition } from "@/tools/video/types";

/**
 * WebCodecs engine (through mediabunny). Pure functions: File + options in, ArrayBuffer out.
 * No React, no DOM. Falls through with a typed "unsupported" error when this browser lacks an encoder.
 */

const UNSUPPORTED = "ENGINE_UNSUPPORTED";
const CANCELED = "JOB_CANCELED";

const jobs = new Map<string, Conversion>();

function hasWebCodecs(): boolean {
  return typeof VideoEncoder !== "undefined" && typeof VideoDecoder !== "undefined";
}

async function probe(file: File): Promise<VideoInfo> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const [video, audio, duration, mimeType] = await Promise.all([
      input.getPrimaryVideoTrack(),
      input.getPrimaryAudioTrack(),
      input.computeDuration(),
      input.getMimeType(),
    ]);
    let width = 0;
    let height = 0;
    let rotation: VideoInfo["rotation"] = 0;
    let fps = 30;
    let videoCodec: string | null = null;
    if (video) {
      [width, height, rotation, videoCodec] = await Promise.all([
        video.getDisplayWidth(),
        video.getDisplayHeight(),
        video.getRotation(),
        video.getCodec(),
      ]);
      try {
        const metrics = await video.computeFrameRateMetrics({ targetPacketCount: 120 });
        const rate = metrics.underlyingFrameRate ?? metrics.averageFrameRate;
        if (rate && Number.isFinite(rate)) fps = Math.round(rate * 100) / 100;
      } catch {
        /* keep default */
      }
    }
    return {
      duration,
      width,
      height,
      rotation,
      fps,
      hasAudio: !!audio,
      hasVideo: !!video,
      videoCodec,
      audioCodec: audio ? await audio.getCodec() : null,
      mimeType,
    };
  } finally {
    input.dispose();
  }
}

function anchor(position: WatermarkPosition, w: number, h: number, bw: number, bh: number, pad: number) {
  const col = position[1];
  const row = position[0];
  const x = col === "l" ? pad : col === "c" ? (w - bw) / 2 : w - bw - pad;
  const y = row === "t" ? pad : row === "m" ? (h - bh) / 2 : h - bh - pad;
  return { x, y };
}

function drawWatermark(ctx: OffscreenCanvasRenderingContext2D, w: number, h: number, wm: Watermark) {
  const pad = Math.round(Math.min(w, h) * 0.03);
  ctx.save();
  ctx.globalAlpha = wm.opacity;
  if (wm.kind === "text") {
    const size = Math.max(10, Math.round(h * wm.size));
    ctx.font = `600 ${size}px Inter, system-ui, sans-serif`;
    ctx.textBaseline = "top";
    const metrics = ctx.measureText(wm.text);
    const bw = metrics.width;
    const bh = size * 1.2;
    const { x, y } = anchor(wm.position, w, h, bw, bh, pad);
    ctx.lineWidth = Math.max(1, size / 12);
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.strokeText(wm.text, x, y);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(wm.text, x, y);
  } else {
    const bw = Math.max(8, Math.round(w * wm.size));
    const bh = Math.round((bw * wm.bitmap.height) / wm.bitmap.width);
    const { x, y } = anchor(wm.position, w, h, bw, bh, pad);
    ctx.drawImage(wm.bitmap, x, y, bw, bh);
  }
  ctx.restore();
}

async function pickVideoCodec(container: "mp4" | "webm", width: number, height: number, bitrate?: number): Promise<VideoCodec> {
  const candidates: VideoCodec[] = container === "mp4" ? ["avc", "hevc", "av1"] : ["vp9", "av1", "vp8"];
  const codec = await getFirstEncodableVideoCodec(candidates, { width, height, ...(bitrate ? { bitrate } : {}) });
  if (!codec) throw new Error(UNSUPPORTED);
  return codec;
}

async function pickAudioCodec(container: "mp4" | "webm"): Promise<AudioCodec | null> {
  const candidates: AudioCodec[] = container === "mp4" ? ["aac", "opus"] : ["opus", "vorbis"];
  return getFirstEncodableAudioCodec(candidates);
}

async function exportVideo(jobId: string, file: File, options: ExportOptions, onProgress: ProgressCallback): Promise<ExportResult> {
  if (!hasWebCodecs()) throw new Error(UNSUPPORTED);
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) {
    input.dispose();
    throw new Error(UNSUPPORTED);
  }
  const [srcW, srcH] = await Promise.all([track.getDisplayWidth(), track.getDisplayHeight()]);

  // Crop in source pixels (fractions are relative to the displayed frame).
  let crop: { left: number; top: number; width: number; height: number } | undefined;
  let frameW = srcW;
  let frameH = srcH;
  if (options.crop && (options.crop.w < 0.999 || options.crop.h < 0.999)) {
    const left = Math.round(srcW * options.crop.x);
    const top = Math.round(srcH * options.crop.y);
    const width = Math.max(16, Math.round((srcW * options.crop.w) / 2) * 2);
    const height = Math.max(16, Math.round((srcH * options.crop.h) / 2) * 2);
    crop = { left, top, width, height };
    frameW = width;
    frameH = height;
  }

  // Resize keeps aspect; targetHeight applies to the short side.
  let outW = frameW;
  let outH = frameH;
  if (options.targetHeight) {
    const short = Math.min(frameW, frameH);
    if (options.targetHeight < short) {
      const scale = options.targetHeight / short;
      outW = Math.round((frameW * scale) / 2) * 2;
      outH = Math.round((frameH * scale) / 2) * 2;
    }
  }

  const needsTranscode = !!(options.forceTranscode || crop || options.watermark || options.videoBitrate || outW !== frameW || outH !== frameH);
  const format = options.container === "mp4" ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat();
  const output = new Output({ format, target: new BufferTarget() });

  const videoOptions: ConversionVideoOptions = {};
  if (crop) videoOptions.crop = crop;
  if (outW !== frameW || outH !== frameH) {
    videoOptions.width = outW;
    videoOptions.height = outH;
    videoOptions.fit = "contain";
  }
  if (needsTranscode) {
    videoOptions.codec = await pickVideoCodec(options.container, outW, outH, options.videoBitrate);
    videoOptions.forceTranscode = true;
    videoOptions.quality = options.videoBitrate ? new Quality({ bitrate: options.videoBitrate }) : new Quality("medium");
  }
  if (options.watermark) {
    const wm = options.watermark;
    let canvas: OffscreenCanvas | null = null;
    let ctx: OffscreenCanvasRenderingContext2D | null = null;
    videoOptions.process = (sample: VideoSample) => {
      const w = sample.squarePixelWidth;
      const h = sample.squarePixelHeight;
      if (!canvas || canvas.width !== w || canvas.height !== h) {
        canvas = new OffscreenCanvas(w, h);
        ctx = canvas.getContext("2d");
      }
      if (!ctx) return sample;
      ctx.clearRect(0, 0, w, h);
      sample.draw(ctx, 0, 0, w, h);
      drawWatermark(ctx, w, h, wm);
      const out = new VideoSample(canvas, { timestamp: sample.timestamp, duration: sample.duration });
      sample.close();
      return out;
    };
    videoOptions.processedWidth = outW;
    videoOptions.processedHeight = outH;
  }

  const audioCodec = options.removeAudio ? null : await pickAudioCodec(options.container);

  const conversion = await Conversion.init({
    input,
    output,
    tracks: "primary",
    video: videoOptions,
    audio: options.removeAudio ? { discard: true } : audioCodec ? { codec: audioCodec } : { discard: true },
    trim: options.trim,
    showWarnings: false,
  });
  if (!conversion.isValid) {
    input.dispose();
    throw new Error(UNSUPPORTED);
  }
  conversion.onProgress = (p) => onProgress(Math.min(1, p));
  jobs.set(jobId, conversion);
  try {
    await conversion.execute();
  } catch (e) {
    if (e instanceof ConversionCanceledError || conversion.state === "canceled") throw new Error(CANCELED);
    throw e;
  } finally {
    jobs.delete(jobId);
    input.dispose();
    if (options.watermark?.kind === "image") options.watermark.bitmap.close();
  }
  const buffer = output.target.buffer;
  if (!buffer) throw new Error("Empty output");
  return Comlink.transfer(
    { buffer, mimeType: options.container === "mp4" ? "video/mp4" : "video/webm", extension: options.container, engine: "webcodecs" },
    [buffer],
  );
}

/** Decodes the audio track to a WAV file (PCM 16-bit). */
async function extractWav(jobId: string, file: File, trim: { start: number; end: number } | undefined, onProgress: ProgressCallback): Promise<ExportResult> {
  if (typeof AudioDecoder === "undefined") throw new Error(UNSUPPORTED);
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const output = new Output({ format: new WavOutputFormat(), target: new BufferTarget() });
  const conversion = await Conversion.init({
    input,
    output,
    tracks: "primary",
    video: { discard: true },
    audio: { codec: "pcm-s16", forceTranscode: true },
    trim,
    showWarnings: false,
  });
  if (!conversion.isValid) {
    input.dispose();
    throw new Error(UNSUPPORTED);
  }
  conversion.onProgress = (p) => onProgress(Math.min(1, p));
  jobs.set(jobId, conversion);
  try {
    await conversion.execute();
  } catch (e) {
    if (e instanceof ConversionCanceledError || conversion.state === "canceled") throw new Error(CANCELED);
    throw e;
  } finally {
    jobs.delete(jobId);
    input.dispose();
  }
  const buffer = output.target.buffer;
  if (!buffer) throw new Error("Empty output");
  return Comlink.transfer({ buffer, mimeType: "audio/wav", extension: "wav", engine: "webcodecs" }, [buffer]);
}

async function cancel(jobId: string): Promise<void> {
  const c = jobs.get(jobId);
  if (c) await c.cancel();
}

const api = { hasWebCodecs, probe, exportVideo, extractWav, cancel };
export type VideoWorkerApi = typeof api;

Comlink.expose(api);
