"use client";

import { useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { formatTime } from "./estimate";
import type { Thumb } from "./useVideoThumbnails";

interface TimelineProps {
  duration: number;
  thumbs: Thumb[];
  start: number;
  end: number;
  current: number;
  onChange: (start: number, end: number) => void;
  onSeek: (time: number) => void;
  disabled?: boolean;
}

const MIN_RANGE = 0.1;

/** Filmstrip with draggable trim handles and a playhead, like the design's video timeline. */
export function Timeline({ duration, thumbs, start, end, current, onChange, onSeek, disabled }: TimelineProps) {
  const t = useTranslations("video.timeline");
  const trackRef = useRef<HTMLDivElement>(null);

  const timeAt = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      const ratio = Math.min(Math.max((clientX - r.left) / r.width, 0), 1);
      return ratio * duration;
    },
    [duration],
  );

  const drag = (which: "start" | "end" | "seek") => (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const time = timeAt(ev.clientX);
      if (which === "seek") onSeek(Math.min(Math.max(time, start), end));
      else if (which === "start") onChange(Math.min(time, end - MIN_RANGE), end);
      else onChange(start, Math.max(time, start + MIN_RANGE));
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
    move(e.nativeEvent);
  };

  const keyAdjust = (which: "start" | "end") => (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 1 : 0.1;
    let delta = 0;
    if (e.key === "ArrowLeft") delta = -step;
    if (e.key === "ArrowRight") delta = step;
    if (!delta) return;
    e.preventDefault();
    if (which === "start") onChange(Math.max(0, Math.min(start + delta, end - MIN_RANGE)), end);
    else onChange(start, Math.min(duration, Math.max(end + delta, start + MIN_RANGE)));
  };

  const pct = (v: number) => `${(duration ? v / duration : 0) * 100}%`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-[11px] font-medium text-fg-subtle tabular-nums">
        <span>{t("start")}: {formatTime(start, true)}</span>
        <span className="text-fg-muted">{t("selected", { time: formatTime(end - start, true) })}</span>
        <span>{t("end")}: {formatTime(end, true)}</span>
      </div>
      <div
        ref={trackRef}
        className={cn("relative h-16 select-none overflow-hidden rounded-sm border border-border bg-surface-2", disabled && "opacity-60")}
        onPointerDown={drag("seek")}
      >
        <div className="absolute inset-0 flex" aria-hidden>
          {thumbs.map((th) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={th.time} src={th.url} alt="" className="h-full min-w-0 flex-1 object-cover" draggable={false} />
          ))}
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 bg-scrim" style={{ width: pct(start) }} aria-hidden />
        <div className="pointer-events-none absolute inset-y-0 right-0 bg-scrim" style={{ width: pct(duration - end) }} aria-hidden />
        <div className="pointer-events-none absolute inset-y-0 border-y-2 border-primary" style={{ left: pct(start), width: pct(end - start) }} aria-hidden />
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]" style={{ left: pct(current) }} aria-hidden />
        <div
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={t("trimStart")}
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={start}
          aria-valuetext={formatTime(start, true)}
          onPointerDown={drag("start")}
          onKeyDown={keyAdjust("start")}
          className="absolute inset-y-0 flex w-4 -translate-x-1/2 cursor-ew-resize items-center justify-center rounded-s-sm bg-primary text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
          style={{ left: pct(start) }}
        >
          <span className="h-5 w-0.5 rounded-full bg-primary-foreground/70" aria-hidden />
        </div>
        <div
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={t("trimEnd")}
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={end}
          aria-valuetext={formatTime(end, true)}
          onPointerDown={drag("end")}
          onKeyDown={keyAdjust("end")}
          className="absolute inset-y-0 flex w-4 -translate-x-1/2 cursor-ew-resize items-center justify-center rounded-e-sm bg-primary text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
          style={{ left: pct(end) }}
        >
          <span className="h-5 w-0.5 rounded-full bg-primary-foreground/70" aria-hidden />
        </div>
      </div>
    </div>
  );
}
