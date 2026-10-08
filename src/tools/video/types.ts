/** Shared types between the video editor UI, the WebCodecs worker and the ffmpeg fallback. */

export type Container = "mp4" | "webm";
export type AudioFormat = "mp3" | "wav";
export type Resolution = "original" | "1080" | "720" | "480";
export type QualityLevel = "low" | "medium" | "high";
export type Engine = "webcodecs" | "ffmpeg";

export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
  fps: number;
  hasAudio: boolean;
  hasVideo: boolean;
  videoCodec: string | null;
  audioCodec: string | null;
  mimeType: string;
}

/** Crop rectangle as fractions (0..1) of the displayed frame. */
export interface CropFraction {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type WatermarkPosition = "tl" | "tc" | "tr" | "ml" | "mc" | "mr" | "bl" | "bc" | "br";

export interface TextWatermark {
  kind: "text";
  text: string;
  position: WatermarkPosition;
  /** 0..1 */
  opacity: number;
  /** Font size as a fraction of the frame height (0.02..0.2). */
  size: number;
}

export interface ImageWatermark {
  kind: "image";
  bitmap: ImageBitmap;
  position: WatermarkPosition;
  opacity: number;
  /** Logo width as a fraction of the frame width. */
  size: number;
}

export type Watermark = TextWatermark | ImageWatermark;

/** Everything the export pipeline needs. Options are applied in order: trim, crop, resize, watermark, encode. */
export interface ExportOptions {
  container: Container;
  trim?: { start: number; end: number };
  crop?: CropFraction;
  /** Target height in pixels (keeps aspect). Undefined keeps the source size. */
  targetHeight?: number;
  /** Video bitrate in bits per second. Undefined copies the stream when possible. */
  videoBitrate?: number;
  removeAudio?: boolean;
  watermark?: Watermark;
  /** Encode even if the stream could be copied (needed for crop, watermark, resize). */
  forceTranscode?: boolean;
}

export interface ExportResult {
  buffer: ArrayBuffer;
  mimeType: string;
  extension: string;
  engine: Engine;
}

export type ProgressCallback = (progress: number) => void;

export class EngineUnsupportedError extends Error {
  constructor(message = "WebCodecs cannot encode this request") {
    super(message);
    this.name = "EngineUnsupportedError";
  }
}

export class JobCanceledError extends Error {
  constructor() {
    super("Job canceled");
    this.name = "JobCanceledError";
  }
}
