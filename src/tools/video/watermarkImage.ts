"use client";

import type { Watermark, WatermarkPosition } from "./types";

/** Renders a watermark (text or logo) to a transparent PNG sized for the output frame. Used by the ffmpeg path. */
export async function renderWatermarkPng(wm: Watermark, frameW: number, frameH: number): Promise<{ blob: Blob; x: number; y: number; w: number; h: number }> {
  const pad = Math.round(Math.min(frameW, frameH) * 0.03);
  let w: number;
  let h: number;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  if (wm.kind === "text") {
    const size = Math.max(10, Math.round(frameH * wm.size));
    ctx.font = `600 ${size}px Inter, system-ui, sans-serif`;
    w = Math.ceil(ctx.measureText(wm.text).width) + size;
    h = Math.ceil(size * 1.4);
    canvas.width = w;
    canvas.height = h;
    ctx.font = `600 ${size}px Inter, system-ui, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.globalAlpha = wm.opacity;
    ctx.lineWidth = Math.max(1, size / 12);
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.strokeText(wm.text, size / 2, h / 2);
    ctx.fillStyle = "#fff";
    ctx.fillText(wm.text, size / 2, h / 2);
  } else {
    w = Math.max(8, Math.round(frameW * wm.size));
    h = Math.round((w * wm.bitmap.height) / wm.bitmap.width);
    canvas.width = w;
    canvas.height = h;
    ctx.globalAlpha = wm.opacity;
    ctx.drawImage(wm.bitmap, 0, 0, w, h);
  }
  const { x, y } = anchorFor(wm.position, frameW, frameH, w, h, pad);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("watermark render failed");
  return { blob, x: Math.round(x), y: Math.round(y), w, h };
}

export function anchorFor(position: WatermarkPosition, w: number, h: number, bw: number, bh: number, pad: number) {
  const col = position[1];
  const row = position[0];
  const x = col === "l" ? pad : col === "c" ? (w - bw) / 2 : w - bw - pad;
  const y = row === "t" ? pad : row === "m" ? (h - bh) / 2 : h - bh - pad;
  return { x, y };
}

/** CSS placement for the live preview overlay (percentages of the frame box). */
export function previewStyle(position: WatermarkPosition): React.CSSProperties {
  const col = position[1];
  const row = position[0];
  const style: React.CSSProperties = { position: "absolute" };
  if (col === "l") style.left = "3%";
  else if (col === "r") style.right = "3%";
  else {
    style.left = "50%";
    style.transform = "translateX(-50%)";
  }
  if (row === "t") style.top = "3%";
  else if (row === "b") style.bottom = "3%";
  else {
    style.top = "50%";
    style.transform = `${style.transform ?? ""} translateY(-50%)`.trim();
  }
  return style;
}
