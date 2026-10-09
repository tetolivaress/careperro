"use client";

import { mimeOf } from "./fileTypes";

/** True when a file looks like an iPhone HEIC/HEIF photo (by MIME type or extension). */
export function isHeicFile(file: File | Blob): boolean {
  const mime = file instanceof File ? mimeOf(file) : file.type;
  if (mime === "image/heic" || mime === "image/heif" || mime === "image/heic-sequence" || mime === "image/heif-sequence") return true;
  return file instanceof File && /\.(heic|heif)$/i.test(file.name);
}

/**
 * Decodes a HEIC/HEIF image on this device. Safari decodes it natively; other browsers fall back to
 * libheif (WebAssembly, loaded only when needed via `heic-to`). The file never leaves the browser.
 */
export async function decodeHeic(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    const { heicTo } = await import("heic-to");
    return heicTo({ blob: file, type: "bitmap", options: { imageOrientation: "from-image" } });
  }
}

/**
 * Like createImageBitmap, but also understands HEIC in every browser.
 * Use this wherever a tool decodes a user-supplied image.
 */
export async function decodeImage(file: Blob): Promise<ImageBitmap> {
  if (isHeicFile(file)) return decodeHeic(file);
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

/**
 * Converts a HEIC/HEIF file to a lossless PNG File so libraries and <img> tags that only
 * understand common formats can use it. Non-HEIC files are returned unchanged.
 */
export async function heicToPngFile(file: File): Promise<File> {
  if (!isHeicFile(file)) return file;
  const bitmap = await decodeHeic(file);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas unavailable");
    ctx.drawImage(bitmap, 0, 0);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    const name = file.name.replace(/\.(heic|heif)$/i, "") + ".png";
    return new File([blob], name, { type: "image/png", lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}
