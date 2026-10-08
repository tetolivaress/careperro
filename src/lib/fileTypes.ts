import { splitFileName } from "./download";

export type FileKind = "image" | "audio" | "video" | "pdf" | "text" | "archive" | "other";

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  svg: "image/svg+xml",
  heic: "image/heic",
  heif: "image/heif",
  bmp: "image/bmp",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  flac: "audio/flac",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  pdf: "application/pdf",
  json: "application/json",
  csv: "text/csv",
  txt: "text/plain",
  md: "text/markdown",
  zip: "application/zip",
};

/** Resolves a MIME type for a File, falling back to its extension (Safari and HEIC often report none). */
export function mimeOf(file: File): string {
  if (file.type) return file.type;
  const { ext } = splitFileName(file.name);
  return EXT_TO_MIME[ext.toLowerCase()] ?? "";
}

export function kindOf(file: File): FileKind {
  const mime = mimeOf(file);
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/pdf") return "pdf";
  if (mime === "application/zip") return "archive";
  if (mime.startsWith("text/") || mime === "application/json") return "text";
  return "other";
}

/** Short upper-case label like "JPG", "WebP", "PDF" for badges and readouts. */
export function formatLabel(file: File): string {
  const mime = mimeOf(file);
  const map: Record<string, string> = {
    "image/jpeg": "JPG",
    "image/png": "PNG",
    "image/webp": "WebP",
    "image/avif": "AVIF",
    "image/gif": "GIF",
    "image/svg+xml": "SVG",
    "image/heic": "HEIC",
    "audio/mpeg": "MP3",
    "audio/wav": "WAV",
    "audio/ogg": "OGG",
    "audio/mp4": "M4A",
    "video/mp4": "MP4",
    "video/webm": "WebM",
    "video/quicktime": "MOV",
    "application/pdf": "PDF",
    "application/json": "JSON",
    "text/csv": "CSV",
    "application/zip": "ZIP",
  };
  if (map[mime]) return map[mime];
  const { ext } = splitFileName(file.name);
  return ext ? ext.toUpperCase() : "FILE";
}

/**
 * Checks a file against an accept list such as ["image/*", "application/pdf", ".heic"].
 * An empty list accepts everything.
 */
export function matchesAccept(file: File, accept: readonly string[]): boolean {
  if (accept.length === 0) return true;
  const mime = mimeOf(file).toLowerCase();
  const name = file.name.toLowerCase();
  return accept.some((rule) => {
    const r = rule.toLowerCase();
    if (r.startsWith(".")) return name.endsWith(r);
    if (r.endsWith("/*")) return mime.startsWith(r.slice(0, -1));
    return mime === r;
  });
}
