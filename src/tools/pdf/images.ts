"use client";

import { decodeImage } from "@/lib/heic";
import type { ImageInput } from "@/workers/pdf.worker";

export interface PreparedImage extends ImageInput {
  width: number;
  height: number;
}

/**
 * Normalizes any browser-decodable image (JPG, PNG, WebP, GIF, HEIC on Safari) to PNG or JPEG bytes
 * that pdf-lib can embed. JPEGs pass through untouched to avoid a quality hit.
 */
export async function prepareImage(file: File | Blob, preferJpeg = false): Promise<PreparedImage> {
  const type = file.type || "";
  if (type === "image/jpeg" || type === "image/png") {
    const bitmap = await decodeImage(file);
    const out = { bytes: await file.arrayBuffer(), type: type === "image/png" ? ("png" as const) : ("jpeg" as const), width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return out;
  }
  const bitmap = await decodeImage(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no-2d-context");
    ctx.drawImage(bitmap, 0, 0);
    const mime = preferJpeg ? "image/jpeg" : "image/png";
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode-failed"))), mime, 0.92));
    canvas.width = 0;
    canvas.height = 0;
    return { bytes: await blob.arrayBuffer(), type: preferJpeg ? "jpeg" : "png", width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}
