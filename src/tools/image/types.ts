export type OutputFormat = "jpeg" | "png" | "webp" | "avif";

export const OUTPUT_FORMATS: { value: OutputFormat; label: string; ext: string; mime: string; lossy: boolean }[] = [
  { value: "jpeg", label: "JPG", ext: "jpg", mime: "image/jpeg", lossy: true },
  { value: "webp", label: "WebP", ext: "webp", mime: "image/webp", lossy: true },
  { value: "png", label: "PNG", ext: "png", mime: "image/png", lossy: false },
  { value: "avif", label: "AVIF", ext: "avif", mime: "image/avif", lossy: true },
];

export function formatInfo(format: OutputFormat) {
  return OUTPUT_FORMATS.find((f) => f.value === format) ?? OUTPUT_FORMATS[0];
}

export type CompressPreset = "smallest" | "balanced" | "best";

export interface CompressSettings {
  preset: CompressPreset;
  format: OutputFormat;
  /** 1..100 */
  quality: number;
  stripMetadata: boolean;
  /** Optional target size in bytes; the encoder searches for the quality that fits. */
  maxBytes: number | null;
}

export type ResizeMode = "pixels" | "percent";

export interface ResizeSettings {
  enabled: boolean;
  mode: ResizeMode;
  width: number | null;
  height: number | null;
  lockRatio: boolean;
  percent: number;
  /** Never upscale beyond the source size. */
  noUpscale: boolean;
}

/** Crop rectangle in relative units (0..1 of the oriented source). */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type AspectPreset = "free" | "1:1" | "4:5" | "16:9" | "9:16" | "3:2" | "4:3";

export interface CropSettings {
  rect: CropRect | null;
  aspect: AspectPreset;
}

export interface RotateSettings {
  /** Clockwise degrees: 0, 90, 180, 270 */
  angle: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
}

export interface FilterSettings {
  /** 0..200, 100 = unchanged */
  brightness: number;
  contrast: number;
  saturation: number;
  /** 0..100 */
  grayscale: number;
  /** px blur 0..20 at 1000px reference width */
  blur: number;
}

export type WatermarkPosition = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface WatermarkSettings {
  enabled: boolean;
  type: "text" | "image";
  text: string;
  /** Logo bytes; kept as a Blob so it can be posted to the worker. */
  image: Blob | null;
  position: WatermarkPosition;
  /** 0..100 */
  opacity: number;
  /** Percentage of the output width 5..60 */
  size: number;
  tiled: boolean;
  color: string;
}

export interface EditSettings {
  compress: CompressSettings;
  resize: ResizeSettings;
  crop: CropSettings;
  rotate: RotateSettings;
  filters: FilterSettings;
  watermark: WatermarkSettings;
}

export const DEFAULT_SETTINGS: EditSettings = {
  compress: { preset: "balanced", format: "webp", quality: 82, stripMetadata: true, maxBytes: null },
  resize: { enabled: false, mode: "pixels", width: null, height: null, lockRatio: true, percent: 100, noUpscale: true },
  crop: { rect: null, aspect: "free" },
  rotate: { angle: 0, flipH: false, flipV: false },
  filters: { brightness: 100, contrast: 100, saturation: 100, grayscale: 0, blur: 0 },
  watermark: { enabled: false, type: "text", text: "© Caribito", image: null, position: 9, opacity: 60, size: 20, tiled: false, color: "#FFFFFF" },
};

export interface SourceInfo {
  width: number;
  height: number;
  /** Raw EXIF APP1 segment (JPEG sources only) for the keep-metadata option. */
  hasExif: boolean;
}

export interface RenderResult {
  blob: Blob;
  width: number;
  height: number;
  format: OutputFormat;
  /** Quality actually used (after a target-size search). */
  quality: number;
  ms: number;
}

export interface RenderRequest {
  id: string;
  /** Monotonic per session; a newer token cancels older renders of the same source. */
  token: number;
  settings: EditSettings;
  /** Preview renders cap the longest side to keep the UI fluid. */
  previewMaxSide?: number;
}

/** Tab ids in the editor, matching registry slugs where they exist. */
export type EditorTab = "compress" | "resize" | "crop" | "watermark" | "filters" | "convert";

export const TABS: EditorTab[] = ["compress", "resize", "crop", "watermark", "filters", "convert"];

export function tabForSlug(slug: string): EditorTab {
  switch (slug) {
    case "resize":
    case "crop":
    case "watermark":
    case "filters":
    case "convert":
      return slug;
    case "rotate":
      return "crop";
    case "heic-to-jpg":
      return "convert";
    default:
      return "compress";
  }
}
