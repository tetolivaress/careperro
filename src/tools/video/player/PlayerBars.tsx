"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { clock } from "./media";

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

interface ScrubBarProps {
  duration: number;
  current: number;
  /** End of the buffered range around the playhead, in seconds. */
  buffered: number;
  loopA: number | null;
  loopB: number | null;
  /** Video URL used to render hover thumbnails. Omit to show only the time tag. */
  previewSrc?: string;
  /** Width / height of the video, for the thumbnail box. */
  aspect: number;
  label: string;
  onSeek: (time: number) => void;
  onScrubbing: (active: boolean) => void;
  className?: string;
}

const PREVIEW_W = 144;

/** Timeline from the design: track, buffered, played, A–B loop region, knob, and a hover thumbnail. */
export function ScrubBar({ duration, current, buffered, loopA, loopB, previewSrc, aspect, label, onSeek, onScrubbing, className }: ScrubBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewVideo = useRef<HTMLVideoElement | null>(null);
  const wanted = useRef<number | null>(null);
  const seeking = useRef(false);
  const dragging = useRef(false);
  const [hover, setHover] = useState<{ x: number; width: number; time: number } | null>(null);

  const thumbW = aspect >= 1 ? PREVIEW_W : Math.round(108 * aspect);
  const thumbH = aspect >= 1 ? Math.round(PREVIEW_W / aspect) : 108;

  // A second, muted <video> seeks to the hovered time and is painted into the tooltip canvas.
  useEffect(() => {
    if (!previewSrc) return;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    const pump = () => {
      if (seeking.current || wanted.current === null || video.readyState < 1) return;
      seeking.current = true;
      video.currentTime = wanted.current;
      wanted.current = null;
    };
    const onSeeked = () => {
      seeking.current = false;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      pump();
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("loadedmetadata", pump);
    video.src = previewSrc;
    previewVideo.current = video;
    return () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("loadedmetadata", pump);
      video.removeAttribute("src");
      video.load();
      previewVideo.current = null;
      seeking.current = false;
      wanted.current = null;
    };
  }, [previewSrc]);

  const requestThumb = (time: number) => {
    const video = previewVideo.current;
    if (!video) return;
    wanted.current = time;
    if (!seeking.current && video.readyState >= 1) {
      seeking.current = true;
      video.currentTime = time;
      wanted.current = null;
    }
  };

  const locate = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || !rect.width) return null;
    const f = clamp01((clientX - rect.left) / rect.width);
    return { x: f * rect.width, width: rect.width, time: f * duration };
  };

  const pct = (time: number) => `${duration > 0 ? clamp01(time / duration) * 100 : 0}%`;
  const hasLoop = loopA !== null && loopB !== null && loopB > loopA;

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(current)}
      aria-valuetext={`${clock(current)} / ${clock(duration)}`}
      className={cn("relative h-3.5 cursor-pointer touch-none rounded-sm outline-none select-none focus-visible:ring-2 focus-visible:ring-white/70", className)}
      onPointerDown={(e) => {
        const p = locate(e.clientX);
        if (!p || !duration) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging.current = true;
        onScrubbing(true);
        onSeek(p.time);
        setHover(p);
        requestThumb(p.time);
      }}
      onPointerMove={(e) => {
        const p = locate(e.clientX);
        if (!p || !duration) return;
        if (dragging.current) onSeek(p.time);
        if (dragging.current || e.pointerType === "mouse") {
          setHover(p);
          requestThumb(p.time);
        }
      }}
      onPointerUp={(e) => {
        if (!dragging.current) return;
        dragging.current = false;
        onScrubbing(false);
        if (e.pointerType !== "mouse") setHover(null);
      }}
      onPointerCancel={() => {
        dragging.current = false;
        onScrubbing(false);
        setHover(null);
      }}
      onPointerLeave={() => {
        if (!dragging.current) setHover(null);
      }}
    >
      <div className="absolute inset-x-0 top-[5px] h-1 rounded-sm bg-white/20" />
      <div className="absolute top-[5px] left-0 h-1 rounded-sm bg-white/30" style={{ width: pct(buffered) }} />
      <div className="absolute top-[5px] left-0 h-1 rounded-sm bg-white" style={{ width: pct(current) }} />
      {hasLoop && <div className="absolute top-[3px] h-2 rounded-sm border border-[#3ddc97] bg-[#3ddc97]/35" style={{ left: pct(loopA), width: `calc(${pct(loopB)} - ${pct(loopA)})` }} />}
      {loopA !== null && <div className="absolute top-0 h-3.5 w-0.5 -translate-x-1/2 rounded-[1px] bg-[#3ddc97]" style={{ left: pct(loopA) }} />}
      {loopB !== null && <div className="absolute top-0 h-3.5 w-0.5 -translate-x-1/2 rounded-[1px] bg-[#3ddc97]" style={{ left: pct(loopB) }} />}
      <div className="absolute top-px size-3 -translate-x-1/2 rounded-full bg-white shadow-[0_1px_3px_#00000066]" style={{ left: pct(current) }} />

      {hover && (
        <div
          className="pointer-events-none absolute bottom-full mb-2.5 flex flex-col items-center gap-1.5"
          style={{ left: Math.min(Math.max(hover.x - (previewSrc ? thumbW : 48) / 2, 0), Math.max(hover.width - (previewSrc ? thumbW : 48), 0)), width: previewSrc ? thumbW : 48 }}
          aria-hidden
        >
          {previewSrc && <canvas ref={canvasRef} width={thumbW * 2} height={thumbH * 2} className="rounded-md border border-white/80 bg-black" style={{ width: thumbW, height: thumbH }} />}
          <span className="rounded bg-black/80 px-[7px] py-[3px] font-mono text-[11px] font-semibold text-white">{clock(hover.time)}</span>
        </div>
      )}
    </div>
  );
}

/** Small volume track (64px in the design). Arrow keys adjust it when focused. */
export function VolumeBar({ value, label, onChange }: { value: number; label: string; onChange: (value: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const set = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (rect?.width) onChange(clamp01((clientX - rect.left) / rect.width));
  };
  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      className="relative flex h-[18px] w-16 cursor-pointer touch-none items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging.current = true;
        set(e.clientX);
      }}
      onPointerMove={(e) => {
        if (dragging.current) set(e.clientX);
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
      onKeyDown={(e) => {
        const step = e.key === "ArrowRight" || e.key === "ArrowUp" ? 0.05 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -0.05 : 0;
        if (!step) return;
        e.preventDefault();
        e.stopPropagation();
        onChange(clamp01(value + step));
      }}
    >
      <div className="h-1 w-full overflow-hidden rounded-sm bg-white/25">
        <div className="h-full rounded-sm bg-white" style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  );
}
