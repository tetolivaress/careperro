"use client";

import { useTranslations } from "next-intl";
import type { CropFraction } from "./types";

interface CropOverlayProps {
  /** Displayed frame box inside the stage, in CSS px (left/top relative to the overlay's parent). */
  frame: { left: number; top: number; width: number; height: number };
  crop: CropFraction;
  /** Locked aspect ratio (w/h) or null for free. */
  ratio: number | null;
  onChange: (crop: CropFraction) => void;
}

type Handle = "move" | "nw" | "ne" | "sw" | "se";

/** Draggable, resizable crop box drawn over the player. Crop is stored as fractions of the frame. */
export function CropOverlay({ frame, crop, ratio, onChange }: CropOverlayProps) {
  const t = useTranslations("video.crop");

  const begin = (handle: Handle) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const s = { x: e.clientX, y: e.clientY, crop };
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - s.x) / frame.width;
      const dy = (ev.clientY - s.y) / frame.height;
      let { x, y, w, h } = s.crop;
      if (handle === "move") {
        x = Math.min(Math.max(x + dx, 0), 1 - w);
        y = Math.min(Math.max(y + dy, 0), 1 - h);
      } else {
        const right = s.crop.x + s.crop.w;
        const bottom = s.crop.y + s.crop.h;
        if (handle.includes("e")) w = Math.max(0.05, Math.min(s.crop.w + dx, 1 - s.crop.x));
        if (handle.includes("s")) h = Math.max(0.05, Math.min(s.crop.h + dy, 1 - s.crop.y));
        if (handle.includes("w")) {
          x = Math.min(Math.max(s.crop.x + dx, 0), right - 0.05);
          w = right - x;
        }
        if (handle.includes("n")) {
          y = Math.min(Math.max(s.crop.y + dy, 0), bottom - 0.05);
          h = bottom - y;
        }
        if (ratio) {
          // Keep the locked ratio in display pixels: w*frame.width / (h*frame.height) = ratio.
          const targetH = (w * frame.width) / ratio / frame.height;
          if (handle.includes("n")) y = bottom - targetH;
          h = targetH;
          if (y < 0) {
            y = 0;
            h = handle.includes("n") ? bottom : h;
          }
          if (y + h > 1) {
            h = 1 - y;
            w = (h * frame.height * ratio) / frame.width;
            if (handle.includes("w")) x = right - w;
          }
        }
      }
      onChange({ x, y, w, h });
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  const box = {
    left: frame.left + crop.x * frame.width,
    top: frame.top + crop.y * frame.height,
    width: crop.w * frame.width,
    height: crop.h * frame.height,
  };
  const corner = "absolute size-4 rounded-full border-2 border-primary bg-white";

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden={false}>
      <div className="absolute bg-scrim" style={{ left: frame.left, top: frame.top, width: frame.width, height: box.top - frame.top }} />
      <div className="absolute bg-scrim" style={{ left: frame.left, top: box.top + box.height, width: frame.width, height: frame.top + frame.height - box.top - box.height }} />
      <div className="absolute bg-scrim" style={{ left: frame.left, top: box.top, width: box.left - frame.left, height: box.height }} />
      <div className="absolute bg-scrim" style={{ left: box.left + box.width, top: box.top, width: frame.left + frame.width - box.left - box.width, height: box.height }} />
      <div
        role="group"
        aria-label={t("region")}
        className="pointer-events-auto absolute cursor-move border-2 border-primary"
        style={box}
        onPointerDown={begin("move")}
      >
        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-40" aria-hidden>
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="border border-white/50" />
          ))}
        </div>
        <div className={`${corner} -top-2 -left-2 cursor-nwse-resize`} onPointerDown={begin("nw")} />
        <div className={`${corner} -top-2 -right-2 cursor-nesw-resize`} onPointerDown={begin("ne")} />
        <div className={`${corner} -bottom-2 -left-2 cursor-nesw-resize`} onPointerDown={begin("sw")} />
        <div className={`${corner} -right-2 -bottom-2 cursor-nwse-resize`} onPointerDown={begin("se")} />
      </div>
    </div>
  );
}
