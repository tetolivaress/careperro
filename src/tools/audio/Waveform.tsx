"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Pause, Play, SkipBack } from "lucide-react";
import { useTranslations } from "next-intl";
import type WaveSurfer from "wavesurfer.js";
import type RegionsPluginClass from "wavesurfer.js/dist/plugins/regions.js";
import type { Region } from "wavesurfer.js/dist/plugins/regions.js";

type RegionsPlugin = InstanceType<typeof RegionsPluginClass>;
import { cn } from "@/lib/utils";
import { formatTime } from "./engine";

export interface WaveformHandle {
  play: () => void;
  pause: () => void;
  playRange: (start: number, end: number) => void;
  seek: (seconds: number) => void;
}

interface WaveformProps {
  /** Object URL of the source media for playback. */
  mediaUrl: string | null;
  /** Pre-computed peaks and duration so the file is decoded only once (by the editor). */
  peaks: Float32Array | null;
  duration: number;
  /** Trim range to show as a draggable region; null hides it. */
  trim: { start: number; end: number } | null;
  onTrimChange?: (range: { start: number; end: number }) => void;
  /** Live preview parameters applied to the media element. */
  speed: number;
  volume: number;
  className?: string;
  compact?: boolean;
}

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** wavesurfer.js stage with a trim region and transport controls. */
export const Waveform = forwardRef<WaveformHandle, WaveformProps>(function Waveform(
  { mediaUrl, peaks, duration, trim, onTrimChange, speed, volume, className, compact = false },
  ref,
) {
  const t = useTranslations("audio.player");
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const regionRef = useRef<Region | null>(null);
  const trimRef = useRef(trim);
  const onTrimRef = useRef(onTrimChange);
  trimRef.current = trim;
  onTrimRef.current = onTrimChange;
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !mediaUrl || !peaks) return;
    let cancelled = false;
    let ws: WaveSurfer | null = null;

    (async () => {
      const [{ default: WS }, { default: Regions }] = await Promise.all([
        import("wavesurfer.js"),
        import("wavesurfer.js/dist/plugins/regions.js"),
      ]);
      if (cancelled) return;
      const regions = Regions.create();
      ws = WS.create({
        container: el,
        height: "auto",
        waveColor: cssVar("--fg-subtle", "#6e6e76"),
        progressColor: cssVar("--primary", "#3ddc97"),
        cursorColor: cssVar("--fg", "#f2f2f3"),
        cursorWidth: 1,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        normalize: true,
        dragToSeek: true,
        hideScrollbar: true,
        plugins: [regions],
      });
      wsRef.current = ws;
      regionsRef.current = regions;
      ws.on("play", () => setPlaying(true));
      ws.on("pause", () => setPlaying(false));
      ws.on("finish", () => setPlaying(false));
      ws.on("timeupdate", (time) => setCurrent(time));
      ws.on("ready", () => {
        setReady(true);
        const tr = trimRef.current;
        if (tr) {
          regionRef.current = regions.addRegion({
            start: tr.start,
            end: tr.end,
            drag: true,
            resize: true,
            color: cssVar("--primary-soft", "rgba(61,220,151,0.1)"),
          });
        }
      });
      regions.on("region-updated", (region) => {
        onTrimRef.current?.({ start: region.start, end: region.end });
      });
      await ws.load(mediaUrl, [peaks], duration);
    })().catch(() => {
      /* component unmounted mid-load */
    });

    return () => {
      cancelled = true;
      setReady(false);
      setPlaying(false);
      setCurrent(0);
      regionRef.current = null;
      regionsRef.current = null;
      wsRef.current = null;
      ws?.destroy();
    };
  }, [mediaUrl, peaks, duration]);

  // Keep the region in sync with trim edits made from the inputs.
  useEffect(() => {
    const regions = regionsRef.current;
    if (!regions || !ready) return;
    if (!trim) {
      regionRef.current?.remove();
      regionRef.current = null;
      return;
    }
    const r = regionRef.current;
    if (!r) {
      regionRef.current = regions.addRegion({
        start: trim.start,
        end: trim.end,
        drag: true,
        resize: true,
        color: cssVar("--primary-soft", "rgba(61,220,151,0.1)"),
      });
      return;
    }
    if (Math.abs(r.start - trim.start) > 0.005 || Math.abs(r.end - trim.end) > 0.005) {
      r.setOptions({ start: trim.start, end: trim.end });
    }
  }, [trim, ready]);

  useEffect(() => {
    wsRef.current?.setPlaybackRate(speed, true);
  }, [speed, ready]);

  useEffect(() => {
    wsRef.current?.setVolume(Math.max(0, Math.min(1, volume)));
  }, [volume, ready]);

  useImperativeHandle(ref, () => ({
    play: () => void wsRef.current?.play(),
    pause: () => wsRef.current?.pause(),
    playRange: (start, end) => void wsRef.current?.play(start, end),
    seek: (seconds) => wsRef.current?.setTime(seconds),
  }));

  const total = duration;

  return (
    <div className={cn("flex h-full w-full flex-col", className)}>
      <div className="relative min-h-0 flex-1 px-4 pt-4 md:px-10 md:pt-8">
        <div className="relative h-full w-full rounded-lg border border-border bg-surface/60">
          <div
            className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-border"
            aria-hidden
          />
          <div ref={containerRef} className="h-full w-full [&_::part(region)]:rounded-sm [&_::part(region-handle)]:w-1 [&_::part(region-handle)]:bg-primary" />
        </div>
      </div>
      <div className={cn("flex items-center justify-between gap-3 px-4 md:px-10", compact ? "h-14" : "h-16")}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => wsRef.current?.setTime(trim?.start ?? 0)}
            className="flex size-9 items-center justify-center rounded-full border border-border text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
            aria-label={t("toStart")}
            disabled={!ready}
          >
            <SkipBack className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => void wsRef.current?.playPause()}
            className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none disabled:opacity-50"
            aria-label={playing ? t("pause") : t("play")}
            disabled={!ready}
          >
            {playing ? <Pause className="size-5" aria-hidden /> : <Play className="ms-0.5 size-5" aria-hidden />}
          </button>
        </div>
        <div className="font-mono text-[13px] text-fg-muted tabular-nums">
          <span className="text-fg">{formatTime(current, true)}</span>
          <span className="mx-1.5 text-fg-subtle">/</span>
          {formatTime(total, true)}
        </div>
      </div>
    </div>
  );
});
