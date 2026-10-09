"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AudioLines,
  Camera,
  Crop as CropIcon,
  Film,
  FolderOpen,
  ImagePlus,
  Minimize2,
  Pause,
  Play,
  Repeat,
  Scissors,
  Stamp,
  type LucideIcon,
} from "lucide-react";
import { DropZone, ErrorCard, ExportBar, ProcessingCard, Segmented, SettingsGroup, SizeReadout, ToggleRow, ToolShell } from "@/components/shell";
import { Slider } from "@/components/ui/slider";
import { IconTile } from "@/components/ui/icon-tile";
import { downloadBlob, splitFileName } from "@/lib/download";
import { formatBytes } from "@/lib/formatBytes";
import { formatLabel } from "@/lib/fileTypes";
import { takeFiles } from "@/lib/fileHandoff";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/stores/session";
import { useToolShellStore } from "@/stores/toolShell";
import { useCurrentTool } from "@/tools/useCurrentTool";
import { useToolCopy } from "@/tools/copy";
import { exportWithWebCodecs, extractWavWithWebCodecs, probeVideo, webCodecsAvailable, type RunningJob } from "./engine";
import { cancelFfmpeg, runFfmpeg } from "./ffmpegEngine";
import { bitrateFor, estimateAudioSize, estimateCopySize, estimateGifSize, estimateTranscodeSize, formatTime, outputDimensions, targetHeightFor } from "./estimate";
import { Timeline } from "./Timeline";
import { CropOverlay } from "./CropOverlay";
import { useVideoThumbnails } from "./useVideoThumbnails";
import { fitRect, useElementSize } from "./useElementSize";
import { previewStyle, renderWatermarkPng } from "./watermarkImage";
import {
  EngineUnsupportedError,
  JobCanceledError,
  type Container,
  type CropFraction,
  type Engine,
  type ExportOptions,
  type ExportResult,
  type QualityLevel,
  type Resolution,
  type VideoInfo,
  type Watermark,
  type WatermarkPosition,
} from "./types";

type Tab = "trim" | "compress" | "convert" | "gif" | "audio" | "crop" | "watermark" | "frame";
const TABS: { id: Tab; icon: LucideIcon }[] = [
  { id: "trim", icon: Scissors },
  { id: "compress", icon: Minimize2 },
  { id: "convert", icon: Repeat },
  { id: "gif", icon: Film },
  { id: "audio", icon: AudioLines },
  { id: "crop", icon: CropIcon },
  { id: "watermark", icon: Stamp },
  { id: "frame", icon: Camera },
];
const SLUG_TO_TAB: Record<string, Tab> = {
  trim: "trim",
  compress: "compress",
  convert: "convert",
  "to-gif": "gif",
  "extract-audio": "audio",
  "remove-audio": "audio",
  crop: "crop",
  watermark: "watermark",
  "capture-frame": "frame",
};
const GIF_MAX_SECONDS = 15;
const POSITIONS: WatermarkPosition[] = ["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"];
const FULL_CROP: CropFraction = { x: 0, y: 0, w: 1, h: 1 };

type JobPhase = "idle" | "loading" | "running" | "done" | "error";
interface JobState {
  phase: JobPhase;
  progress: number;
  engine: Engine | null;
  label: string;
  error?: string;
  seconds?: number;
}
interface Result {
  blob: Blob;
  url: string;
  ext: string;
  engine: Engine;
  isVideo: boolean;
}

function useObjectUrl(blob: Blob | null): string | null {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);
  return url;
}

export default function VideoEditor() {
  const t = useTranslations("video");
  const ts = useTranslations("shell");
  const toolCopy = useToolCopy();
  const tool = useCurrentTool();
  const recordProcessed = useSessionStore((s) => s.recordProcessed);
  const setShellFile = useToolShellStore((s) => s.setFile);
  const setShellStatus = useToolShellStore((s) => s.setStatus);

  const [file, setFile] = useState<File | null>(() => takeFiles()?.[0] ?? null);
  const [tab, setTab] = useState<Tab>(() => SLUG_TO_TAB[tool?.slug ?? ""] ?? "trim");
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [probeError, setProbeError] = useState(false);
  const srcUrl = useObjectUrl(file);

  // Player
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const stageSize = useElementSize(stageRef);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [view, setView] = useState<"original" | "result">("original");

  // Settings
  const [range, setRange] = useState<[number, number] | null>(null);
  const [resolution, setResolution] = useState<Resolution>("original");
  const [quality, setQuality] = useState<QualityLevel>("medium");
  const [container, setContainer] = useState<Container | null>(null);
  const [gifFps, setGifFps] = useState(12);
  const [gifWidth, setGifWidth] = useState(480);
  const [audioMode, setAudioMode] = useState<"extract" | "remove">("extract");
  const [audioFormat, setAudioFormat] = useState<"mp3" | "wav">("mp3");
  const [crop, setCrop] = useState<CropFraction | null>(null);
  const [cropRatio, setCropRatio] = useState<"free" | "9:16" | "1:1" | "16:9">("free");
  const [wmType, setWmType] = useState<"text" | "image">("text");
  const [wmText, setWmText] = useState("");
  const [wmLogo, setWmLogo] = useState<File | null>(null);
  const wmLogoUrl = useObjectUrl(wmLogo);
  const [wmPosition, setWmPosition] = useState<WatermarkPosition>("br");
  const [wmOpacity, setWmOpacity] = useState(70);
  const [wmSize, setWmSize] = useState(20);
  const [frameFormat, setFrameFormat] = useState<"png" | "jpg">("png");

  // Job
  const [job, setJob] = useState<JobState>({ phase: "idle", progress: 0, engine: null, label: "" });
  const [result, setResult] = useState<Result | null>(null);
  const runningRef = useRef<RunningJob<ExportResult> | null>(null);
  const ffmpegRunningRef = useRef(false);

  const duration = info?.duration ?? 0;
  const [start, end] = range ?? [0, duration];
  const trimmed = range !== null && (start > 0.01 || end < duration - 0.01);
  const thumbs = useVideoThumbnails(srcUrl, duration, 14);

  // Probe when the file changes (worker first, <video> metadata as fallback).
  useEffect(() => {
    if (!file) return;
    let alive = true;
    probeVideo(file)
      .then((i) => {
        if (!alive) return;
        const el = videoRef.current;
        const fromEl = el && Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
        setInfo(!Number.isFinite(i.duration) || i.duration <= 0 ? { ...i, duration: fromEl } : i);
      })
      .catch(() => {
        if (alive) setProbeError(true);
      });
    return () => {
      alive = false;
    };
  }, [file]);

  useEffect(() => {
    if (!file) {
      setShellFile(null);
      setShellStatus("empty");
      return;
    }
    setShellFile({ name: file.name, meta: info ? t("info.meta", { width: info.width, height: info.height, format: formatLabel(file), size: formatBytes(file.size) }) : formatBytes(file.size) });
    setShellStatus(job.phase === "running" || job.phase === "loading" ? "processing" : result ? "done" : "empty");
  }, [file, info, job.phase, result, setShellFile, setShellStatus, t]);

  useEffect(() => {
    return () => {
      if (result) URL.revokeObjectURL(result.url);
    };
  }, [result]);

  const invalidate = useCallback(() => {
    setResult((r) => {
      if (r) URL.revokeObjectURL(r.url);
      return null;
    });
    setView("original");
    setJob((j) => (j.phase === "done" || j.phase === "error" ? { phase: "idle", progress: 0, engine: null, label: "" } : j));
  }, []);

  const resetAll = () => {
    if (runningRef.current) void runningRef.current.cancel();
    if (ffmpegRunningRef.current) cancelFfmpeg();
    invalidate();
    setFile(null);
    setInfo(null);
    setProbeError(false);
    setRange(null);
    setCrop(null);
    setCurrent(0);
    setPlaying(false);
  };

  const onMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    // MediaRecorder WebM files report Infinity until the element is seeked past the end.
    if (!Number.isFinite(v.duration) || v.duration === 0) {
      const onChange = () => {
        if (Number.isFinite(v.duration) && v.duration > 0) {
          v.removeEventListener("durationchange", onChange);
          v.currentTime = 0;
          setInfo((prev) => (prev && (!Number.isFinite(prev.duration) || prev.duration === 0) ? { ...prev, duration: v.duration } : prev));
          if (!info) onMetadata();
        }
      };
      v.addEventListener("durationchange", onChange);
      v.currentTime = 1e101;
      return;
    }
    if (!info && v.duration && Number.isFinite(v.duration)) {
      setInfo({
        duration: v.duration,
        width: v.videoWidth,
        height: v.videoHeight,
        rotation: 0,
        fps: 30,
        hasAudio: true,
        hasVideo: v.videoWidth > 0,
        videoCodec: null,
        audioCodec: null,
        mimeType: file?.type ?? "",
      });
      setProbeError(false);
    }
  };

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    setCurrent(v.currentTime);
    if (view === "original" && range && v.currentTime >= end) {
      v.pause();
      v.currentTime = start;
    }
  };

  const seek = (time: number) => {
    const v = videoRef.current;
    if (v && view === "original") {
      v.currentTime = time;
      setCurrent(time);
    }
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      if (view === "original" && (v.currentTime < start || v.currentTime >= end)) v.currentTime = start;
      void v.play();
    } else v.pause();
  };

  const changeRange = (s: number, e: number) => {
    setRange([Math.max(0, s), Math.min(duration, e)]);
    invalidate();
  };

  const aspect = info && info.height ? info.width / info.height : 16 / 9;
  const frameBox = fitRect(aspect, stageSize);
  const outDims = info ? outputDimensions(info, targetHeightFor(resolution, info)) : null;
  const effectiveCrop = crop ?? FULL_CROP;
  const cropDims = info
    ? { width: Math.round((info.width * effectiveCrop.w) / 2) * 2, height: Math.round((info.height * effectiveCrop.h) / 2) * 2 }
    : null;
  const sourceContainer: Container = file && (file.type.includes("webm") || file.name.toLowerCase().endsWith(".webm")) ? "webm" : "mp4";
  const outContainer = container ?? sourceContainer;
  const trimDuration = Math.max(0, end - start) || duration;
  const gifDuration = Math.min(trimDuration, GIF_MAX_SECONDS);

  const videoBitrate = info && outDims ? bitrateFor(quality, outDims.width, outDims.height, info.fps) : 0;
  const needsTranscode = tab === "compress" || tab === "crop" || tab === "watermark" || (tab === "convert" && outContainer !== sourceContainer);

  const estimate = (() => {
    if (!file || !info) return undefined;
    switch (tab) {
      case "gif":
        return estimateGifSize(gifWidth, aspect, gifFps, gifDuration);
      case "audio":
        return audioMode === "extract" ? estimateAudioSize(audioFormat, trimDuration) : estimateCopySize(file.size * 0.85, duration, trimDuration);
      case "frame":
        return undefined;
      default:
        return needsTranscode ? estimateTranscodeSize(videoBitrate, trimDuration, info.hasAudio) : estimateCopySize(file.size, duration, trimDuration);
    }
  })();

  // ───────── Export pipeline ─────────
  const buildWatermark = async (): Promise<Watermark | undefined> => {
    if (tab !== "watermark") return undefined;
    if (wmType === "text") {
      if (!wmText.trim()) return undefined;
      return { kind: "text", text: wmText.trim(), position: wmPosition, opacity: wmOpacity / 100, size: 0.03 + (wmSize / 100) * 0.12 };
    }
    if (!wmLogo) return undefined;
    const bitmap = await createImageBitmap(wmLogo);
    return { kind: "image", bitmap, position: wmPosition, opacity: wmOpacity / 100, size: 0.08 + (wmSize / 100) * 0.4 };
  };

  const ffmpegFallback = async (opts: ExportOptions, onProgress: (p: number) => void, onStatus: (phase: "downloading" | "ready", ratio?: number) => void): Promise<ExportResult> => {
    if (!file || !info) throw new Error("no file");
    const args: string[] = [];
    if (opts.trim) args.push("-ss", opts.trim.start.toFixed(3), "-to", opts.trim.end.toFixed(3));
    const filters: string[] = [];
    let w = info.width;
    let h = info.height;
    if (opts.crop && (opts.crop.w < 0.999 || opts.crop.h < 0.999)) {
      const cw = Math.round((info.width * opts.crop.w) / 2) * 2;
      const ch = Math.round((info.height * opts.crop.h) / 2) * 2;
      filters.push(`crop=${cw}:${ch}:${Math.round(info.width * opts.crop.x)}:${Math.round(info.height * opts.crop.y)}`);
      w = cw;
      h = ch;
    }
    if (opts.targetHeight && opts.targetHeight < Math.min(w, h)) {
      const scale = opts.targetHeight / Math.min(w, h);
      w = Math.round((w * scale) / 2) * 2;
      h = Math.round((h * scale) / 2) * 2;
      filters.push(`scale=${w}:${h}`);
    }
    const extraInputs: { name: string; data: Blob }[] = [];
    let filterComplex: string | null = null;
    if (opts.watermark) {
      const wm = await renderWatermarkPng(opts.watermark, w, h);
      extraInputs.push({ name: "wm.png", data: wm.blob });
      const chain = filters.length ? `[0:v]${filters.join(",")}[v];[v][1:v]overlay=${wm.x}:${wm.y}[out]` : `[0:v][1:v]overlay=${wm.x}:${wm.y}[out]`;
      filterComplex = chain;
      if (opts.watermark.kind === "image") opts.watermark.bitmap.close();
    }
    if (filterComplex) args.push("-i", "wm.png", "-filter_complex", filterComplex, "-map", "[out]", "-map", "0:a?");
    else if (filters.length) args.push("-vf", filters.join(","));
    const transcode = opts.forceTranscode || filters.length > 0 || !!filterComplex || !!opts.videoBitrate;
    if (transcode) {
      if (opts.container === "mp4") args.push("-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-movflags", "+faststart");
      else args.push("-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "8", "-row-mt", "1");
      args.push("-b:v", String(opts.videoBitrate ?? bitrateFor("medium", w, h, info.fps)));
    } else args.push("-c:v", "copy");
    if (opts.removeAudio) args.push("-an");
    else if (transcode || opts.container !== sourceContainer) args.push("-c:a", opts.container === "mp4" ? "aac" : "libopus", "-b:a", "128k");
    else args.push("-c:a", "copy");
    const ext = opts.container;
    return runFfmpeg({ input: file, output: `out.${ext}`, args, mimeType: ext === "mp4" ? "video/mp4" : "video/webm", duration: opts.trim ? opts.trim.end - opts.trim.start : info.duration, extraInputs }, onProgress, onStatus);
  };

  const runExport = async () => {
    if (!file || !info) return;
    invalidate();
    const t0 = performance.now();
    const trim = trimmed ? { start, end } : undefined;
    const onProgress = (p: number) => setJob((j) => ({ ...j, progress: p * 100 }));
    const onStatus = (phase: "downloading" | "ready", ratio?: number) =>
      setJob((j) => (phase === "downloading" ? { ...j, phase: "loading", label: t("engine.loadingFfmpeg", { percent: Math.round((ratio ?? 0) * 100) }) } : { ...j, phase: "running" }));
    const finish = (res: ExportResult, isVideo: boolean) => {
      const blob = new Blob([res.buffer], { type: res.mimeType });
      setResult({ blob, url: URL.createObjectURL(blob), ext: res.extension, engine: res.engine, isVideo });
      setView(isVideo ? "result" : "original");
      setJob({ phase: "done", progress: 100, engine: res.engine, label: "", seconds: Math.round(((performance.now() - t0) / 1000) * 10) / 10 });
      recordProcessed();
    };
    const fail = (e: unknown) => {
      if (e instanceof JobCanceledError) {
        setJob({ phase: "idle", progress: 0, engine: null, label: "" });
        toast(t("status.canceled"));
        return;
      }
      const message = e instanceof Error ? e.message : String(e);
      setJob({ phase: "error", progress: 0, engine: null, label: "", error: message });
    };

    try {
      if (tab === "gif") {
        setJob({ phase: "running", progress: 0, engine: "ffmpeg", label: t("status.gif") });
        ffmpegRunningRef.current = true;
        const s = trim?.start ?? 0;
        const vf = `fps=${gifFps},scale=${gifWidth}:-2:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=192[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4`;
        const res = await runFfmpeg(
          { input: file, output: "out.gif", args: ["-ss", s.toFixed(3), "-t", gifDuration.toFixed(3), "-vf", vf, "-loop", "0"], mimeType: "image/gif", duration: gifDuration },
          onProgress,
          onStatus,
        );
        finish(res, false);
        return;
      }
      if (tab === "audio" && audioMode === "extract") {
        setJob({ phase: "running", progress: 0, engine: audioFormat === "wav" && webCodecsAvailable() ? "webcodecs" : "ffmpeg", label: t("status.audio") });
        if (audioFormat === "wav" && webCodecsAvailable()) {
          try {
            const running = extractWavWithWebCodecs(file, trim, onProgress);
            runningRef.current = running;
            finish(await running.result, false);
            return;
          } catch (e) {
            if (!(e instanceof EngineUnsupportedError)) throw e;
          } finally {
            runningRef.current = null;
          }
        }
        ffmpegRunningRef.current = true;
        const args = [...(trim ? ["-ss", trim.start.toFixed(3), "-to", trim.end.toFixed(3)] : []), "-vn", ...(audioFormat === "mp3" ? ["-c:a", "libmp3lame", "-b:a", "192k"] : ["-c:a", "pcm_s16le"])];
        const res = await runFfmpeg({ input: file, output: `out.${audioFormat}`, args, mimeType: audioFormat === "mp3" ? "audio/mpeg" : "audio/wav", duration: trimDuration }, onProgress, onStatus);
        finish(res, false);
        return;
      }

      const watermark = await buildWatermark();
      const opts: ExportOptions = {
        container: outContainer,
        trim,
        crop: tab === "crop" && crop ? crop : undefined,
        targetHeight: tab === "compress" && info ? targetHeightFor(resolution, info) : undefined,
        videoBitrate: tab === "compress" ? videoBitrate : undefined,
        removeAudio: tab === "audio" && audioMode === "remove",
        watermark,
        forceTranscode: tab === "compress",
      };
      const label = tab === "trim" && !needsTranscode ? t("status.trimming") : t("status.encoding", { container: outContainer.toUpperCase() });
      if (webCodecsAvailable()) {
        setJob({ phase: "running", progress: 0, engine: "webcodecs", label });
        try {
          const running = exportWithWebCodecs(file, opts, onProgress);
          runningRef.current = running;
          finish(await running.result, true);
          return;
        } catch (e) {
          if (!(e instanceof EngineUnsupportedError)) throw e;
          toast(t("engine.fallbackNote"));
          if (opts.watermark) opts.watermark = await buildWatermark();
        } finally {
          runningRef.current = null;
        }
      }
      setJob({ phase: "running", progress: 0, engine: "ffmpeg", label });
      ffmpegRunningRef.current = true;
      finish(await ffmpegFallback(opts, onProgress, onStatus), true);
    } catch (e) {
      fail(e);
    } finally {
      runningRef.current = null;
      ffmpegRunningRef.current = false;
    }
  };

  const cancelJob = () => {
    if (runningRef.current) void runningRef.current.cancel();
    if (ffmpegRunningRef.current) {
      cancelFfmpeg();
      ffmpegRunningRef.current = false;
      setJob({ phase: "idle", progress: 0, engine: null, label: "" });
      toast(t("status.canceled"));
    }
  };

  const download = () => {
    if (!result || !file) return;
    const { base } = splitFileName(file.name);
    const suffix = tab === "gif" ? "" : tab === "audio" && audioMode === "extract" ? "-audio" : "-edited";
    downloadBlob(result.blob, `${base}${suffix}.${result.ext}`);
    toast.success(ts("export.saved"));
  };

  const captureFrame = async () => {
    const v = videoRef.current;
    if (!v || !file) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")?.drawImage(v, 0, 0);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, frameFormat === "png" ? "image/png" : "image/jpeg", 0.92));
    if (!blob) return;
    const { base } = splitFileName(file.name);
    downloadBlob(blob, `${base}-${formatTime(v.currentTime).replace(":", "m")}s.${frameFormat}`);
    recordProcessed();
    toast.success(t("frame.saved"));
  };

  // ───────── Empty state ─────────
  if (!file || !tool) {
    const copy = tool ? toolCopy(tool) : null;
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-5 py-10 md:px-12">
        {tool && copy && (
          <div className="flex max-w-[640px] flex-col items-center gap-3 text-center">
            <IconTile icon={tool.icon} size={52} />
            <h1 className="text-2xl font-bold tracking-tight text-fg">{copy.name}</h1>
            <p className="text-sm text-fg-muted">{copy.description}</p>
          </div>
        )}
        <DropZone
          className="w-full max-w-[640px]"
          accept={tool?.accept ?? ["video/*"]}
          multiple={false}
          maxSize={tool?.maxSize}
          title={t("dropzone.title")}
          subtitle={t("dropzone.subtitle")}
          formats={["MP4", "WebM", "MOV"]}
          onFiles={(f) => {
            setFile(f[0]);
            setInfo(null);
            setRange(null);
            setCrop(null);
          }}
        />
        {tool?.maxSize && <p className="text-xs text-fg-subtle">{t("dropzone.sizeHint", { max: formatBytes(tool.maxSize, 0) })}</p>}
      </div>
    );
  }

  if (probeError && !info) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <ErrorCard title={ts("status.cannotOpen", { name: file.name })} body={t("info.unreadable")} onChooseAnother={resetAll} />
        <video ref={videoRef} src={srcUrl ?? undefined} className="hidden" onLoadedMetadata={onMetadata} />
      </div>
    );
  }

  // ───────── Stage ─────────
  const playerSrc = view === "result" && result?.isVideo ? result.url : (srcUrl ?? undefined);
  const busy = job.phase === "running" || job.phase === "loading";

  const toolbar = (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-8 items-center justify-center overflow-hidden rounded-xs bg-surface-2">
          {thumbs[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbs[0].url} alt="" className="size-full object-cover" />
          ) : (
            <Film className="size-4 text-fg-muted" aria-hidden />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-semibold text-fg">{file.name}</span>
          <span className="truncate text-xs text-fg-subtle">
            {info ? t("info.meta", { width: info.width, height: info.height, format: formatLabel(file), size: formatBytes(file.size) }) : formatBytes(file.size)}
            {info ? ` · ${formatTime(info.duration)} · ${t("info.fps", { fps: info.fps })}` : ""}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {result?.isVideo && (
          <Segmented
            label={t("player.result")}
            size="sm"
            className="w-[180px]"
            value={view}
            onChange={(v) => {
              setView(v);
              setPlaying(false);
            }}
            options={[
              { value: "original", label: t("player.original") },
              { value: "result", label: t("player.result") },
            ]}
          />
        )}
        <button type="button" onClick={resetAll} className="flex h-9 items-center gap-2 rounded-sm border border-border-strong bg-surface-2 px-3 text-[13px] font-medium text-fg hover:bg-surface-3">
          <FolderOpen className="size-4 text-fg-muted" aria-hidden />
          <span className="hidden lg:inline">{ts("toolbar.chooseAnother")}</span>
        </button>
      </div>
    </>
  );

  const wmPreview =
    tab === "watermark" && ((wmType === "text" && wmText.trim()) || (wmType === "image" && wmLogoUrl)) ? (
      <div className="pointer-events-none absolute" style={{ left: frameBox.left, top: frameBox.top, width: frameBox.width, height: frameBox.height }} aria-hidden>
        <div style={{ ...previewStyle(wmPosition), opacity: wmOpacity / 100 }}>
          {wmType === "text" ? (
            <span className="font-semibold whitespace-nowrap text-white [text-shadow:0_0_2px_rgba(0,0,0,.8)]" style={{ fontSize: `${frameBox.height * (0.03 + (wmSize / 100) * 0.12)}px` }}>
              {wmText}
            </span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={wmLogoUrl ?? ""} alt="" style={{ width: `${frameBox.width * (0.08 + (wmSize / 100) * 0.4)}px` }} />
          )}
        </div>
      </div>
    ) : null;

  const preview = (
    <div className="flex size-full flex-col">
      <div ref={stageRef} className="relative min-h-0 flex-1 overflow-hidden">
        <video
          key={playerSrc}
          ref={videoRef}
          src={playerSrc}
          playsInline
          preload="metadata"
          className="absolute inset-0 size-full object-contain"
          onLoadedMetadata={onMetadata}
          onTimeUpdate={onTimeUpdate}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onClick={togglePlay}
        />
        {tab === "crop" && info && view === "original" && (
          <CropOverlay frame={frameBox} crop={effectiveCrop} ratio={cropRatio === "free" ? null : cropRatio === "1:1" ? 1 : cropRatio === "16:9" ? 16 / 9 : 9 / 16} onChange={(c) => {
            setCrop(c);
            invalidate();
          }} />
        )}
        {wmPreview}
        {result && !result.isVideo && result.ext === "gif" && view === "result" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={result.url} alt="" className="absolute inset-0 size-full object-contain" />
        )}
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? t("player.pause") : t("player.play")}
          className={cn("absolute bottom-3 left-3 flex size-10 items-center justify-center rounded-full bg-[#0A0A0BB3] text-white backdrop-blur-sm hover:bg-[#0A0A0BD9]", tab === "crop" && "hidden")}
        >
          {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4 translate-x-px" aria-hidden />}
        </button>
        <span className="absolute right-3 bottom-3 rounded-full bg-[#0A0A0BB3] px-2.5 py-1 text-[11px] font-medium text-white tabular-nums">
          {formatTime(current, true)} / {formatTime(duration)}
        </span>
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-scrim p-4">
            <ProcessingCard
              title={job.label || t("status.preparing")}
              percent={job.progress}
              file={{ icon: <Film className="size-[18px]" aria-hidden />, name: file.name, meta: `${job.engine ? t(`engine.${job.engine}`) : ""}` }}
              steps={[
                { label: t("status.steps.decode"), state: job.progress > 0 ? "done" : "active" },
                { label: t("status.steps.process"), state: job.progress > 0 ? "active" : "pending" },
                { label: t("status.steps.encode"), state: job.progress > 0 ? "active" : "pending" },
                { label: t("status.steps.write"), state: job.progress >= 99 ? "active" : "pending" },
              ]}
              eta={job.phase === "loading" ? job.label : undefined}
              onCancel={cancelJob}
            />
          </div>
        )}
      </div>
      {info && (
        <div className="shrink-0 border-t border-border bg-surface px-4 py-3 md:px-5">
          <Timeline duration={duration} thumbs={thumbs} start={start} end={end} current={current} onChange={changeRange} onSeek={seek} disabled={busy || view === "result"} />
        </div>
      )}
    </div>
  );

  // ───────── Settings ─────────
  const tabs = (
    <div role="tablist" aria-label={ts("toolbar.settings")} className="scrollbar-thin flex overflow-x-auto">
      {TABS.map(({ id, icon: Icon }) => {
        const active = id === tab;
        return (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => {
              setTab(id);
              invalidate();
            }}
            className={cn(
              "flex min-w-[58px] flex-1 flex-col items-center gap-1.5 border-b-2 px-1 pt-3 pb-2.5 text-[10px] md:text-[11px]",
              active ? "border-primary font-semibold text-fg" : "border-transparent font-medium text-fg-muted hover:text-fg",
            )}
          >
            <Icon className={cn("size-[18px]", active ? "text-primary" : "text-fg-subtle")} aria-hidden />
            {t(`tabs.${id}`)}
          </button>
        );
      })}
    </div>
  );

  const engineNote = (
    <p className="text-xs text-fg-subtle">{webCodecsAvailable() ? t("engine.webcodecs") : t("engine.fallbackNote")}</p>
  );

  const settings = (
    <>
      {tab === "trim" && (
        <>
          <SettingsGroup label={t("trim.label")} value={formatTime(trimDuration, true)}>
            <p className="text-xs text-fg-subtle">{t("trim.hint")}</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs text-fg-muted">
                {t("trim.start")}
                <input type="number" min={0} max={end} step={0.1} value={start.toFixed(1)} onChange={(e) => changeRange(Number(e.target.value), end)} className="h-9 rounded-sm border border-border bg-surface-2 px-2.5 text-sm text-fg tabular-nums" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-fg-muted">
                {t("trim.end")}
                <input type="number" min={start} max={duration} step={0.1} value={end.toFixed(1)} onChange={(e) => changeRange(start, Number(e.target.value))} className="h-9 rounded-sm border border-border bg-surface-2 px-2.5 text-sm text-fg tabular-nums" />
              </label>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => changeRange(current, Math.max(end, current + 0.1))} className="h-8 flex-1 rounded-sm border border-border bg-surface-2 text-xs font-medium text-fg hover:bg-surface-3">{t("player.setStart")}</button>
              <button type="button" onClick={() => changeRange(Math.min(start, current - 0.1), current)} className="h-8 flex-1 rounded-sm border border-border bg-surface-2 text-xs font-medium text-fg hover:bg-surface-3">{t("player.setEnd")}</button>
              <button type="button" onClick={() => { setRange(null); invalidate(); }} className="h-8 rounded-sm px-2 text-xs font-medium text-fg-muted hover:text-fg">{t("player.reset")}</button>
            </div>
          </SettingsGroup>
          <p className="text-xs text-fg-subtle">{t("trim.copyHint")}</p>
        </>
      )}

      {tab === "compress" && info && outDims && (
        <>
          <SettingsGroup label={t("compress.resolution")} value={`${outDims.width} × ${outDims.height}`}>
            <Segmented label={t("compress.resolution")} value={resolution} onChange={(v) => { setResolution(v); invalidate(); }} options={[
              { value: "original", label: t("compress.original") },
              { value: "1080", label: "1080p" },
              { value: "720", label: "720p" },
              { value: "480", label: "480p" },
            ]} />
          </SettingsGroup>
          <SettingsGroup label={t("compress.quality")} value={t("compress.bitrate", { mbps: (videoBitrate / 1_000_000).toFixed(1) })}>
            <Segmented label={t("compress.quality")} value={quality} onChange={(v) => { setQuality(v); invalidate(); }} options={[
              { value: "low", label: t("compress.low") },
              { value: "medium", label: t("compress.medium") },
              { value: "high", label: t("compress.high") },
            ]} />
          </SettingsGroup>
          {engineNote}
        </>
      )}

      {tab === "convert" && (
        <>
          <SettingsGroup label={t("convert.format")}>
            <Segmented label={t("convert.format")} value={outContainer} onChange={(v) => { setContainer(v); invalidate(); }} options={[
              { value: "mp4", label: "MP4" },
              { value: "webm", label: "WebM" },
            ]} />
          </SettingsGroup>
          <p className="text-xs text-fg-subtle">{outContainer === sourceContainer ? t("convert.copyNote") : t("convert.transcodeNote", { codec: outContainer === "mp4" ? "H.264" : "VP9" })}</p>
          {engineNote}
        </>
      )}

      {tab === "gif" && (
        <>
          <SettingsGroup label={t("gif.fps")} value={`${gifFps}`}>
            <Slider min={5} max={24} step={1} value={[gifFps]} onValueChange={(v) => { setGifFps(Array.isArray(v) ? v[0] : v); invalidate(); }} />
          </SettingsGroup>
          <SettingsGroup label={t("gif.width")} value={`${gifWidth}px`}>
            <Segmented label={t("gif.width")} value={String(gifWidth)} onChange={(v) => { setGifWidth(Number(v)); invalidate(); }} options={[
              { value: "320", label: "320" },
              { value: "480", label: "480" },
              { value: "640", label: "640" },
              { value: "800", label: "800" },
            ]} />
          </SettingsGroup>
          <SettingsGroup label={t("gif.duration")} value={formatTime(gifDuration, true)}>
            <p className="text-xs text-fg-subtle">{t("gif.maxNote", { seconds: GIF_MAX_SECONDS })}</p>
          </SettingsGroup>
          <p className="text-xs text-fg-subtle">{t("engine.ffmpeg")}</p>
        </>
      )}

      {tab === "audio" && (
        <>
          <SettingsGroup label={t("audio.mode")}>
            <Segmented label={t("audio.mode")} value={audioMode} onChange={(v) => { setAudioMode(v); invalidate(); }} options={[
              { value: "extract", label: t("audio.extract") },
              { value: "remove", label: t("audio.remove") },
            ]} />
          </SettingsGroup>
          {audioMode === "extract" ? (
            <SettingsGroup label={t("audio.format")}>
              <Segmented label={t("audio.format")} value={audioFormat} onChange={(v) => { setAudioFormat(v); invalidate(); }} options={[
                { value: "mp3", label: "MP3" },
                { value: "wav", label: "WAV" },
              ]} />
              <p className="text-xs text-fg-subtle">{audioFormat === "mp3" ? t("audio.mp3Note") : t("audio.wavNote")}</p>
            </SettingsGroup>
          ) : (
            <p className="text-xs text-fg-subtle">{t("audio.removeNote")}</p>
          )}
          {info && !info.hasAudio && <p className="text-xs text-warning">{t("info.noAudio")}</p>}
        </>
      )}

      {tab === "crop" && info && cropDims && (
        <>
          <SettingsGroup label={t("crop.ratio")} value={t("crop.output", { width: cropDims.width, height: cropDims.height })}>
            <Segmented label={t("crop.ratio")} value={cropRatio} onChange={(v) => {
              setCropRatio(v);
              if (v === "free") return;
              const target = v === "1:1" ? 1 : v === "16:9" ? 16 / 9 : 9 / 16;
              const src = info.width / info.height;
              const next: CropFraction = target >= src ? { x: 0, y: (1 - src / target) / 2, w: 1, h: src / target } : { x: (1 - target / src) / 2, y: 0, w: target / src, h: 1 };
              setCrop(next);
              invalidate();
            }} options={[
              { value: "free", label: t("crop.free") },
              { value: "9:16", label: "9:16" },
              { value: "1:1", label: "1:1" },
              { value: "16:9", label: "16:9" },
            ]} />
            <p className="text-xs text-fg-subtle">{t("crop.hint")}</p>
            <button type="button" onClick={() => { setCrop(null); setCropRatio("free"); invalidate(); }} className="h-8 self-start rounded-sm px-2 text-xs font-medium text-fg-muted hover:text-fg">{t("crop.reset")}</button>
          </SettingsGroup>
          {engineNote}
        </>
      )}

      {tab === "watermark" && (
        <>
          <SettingsGroup label={t("watermark.type")}>
            <Segmented label={t("watermark.type")} value={wmType} onChange={(v) => { setWmType(v); invalidate(); }} options={[
              { value: "text", label: t("watermark.text") },
              { value: "image", label: t("watermark.logo") },
            ]} />
          </SettingsGroup>
          {wmType === "text" ? (
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-fg-muted">
              {t("watermark.textLabel")}
              <input value={wmText} onChange={(e) => { setWmText(e.target.value); invalidate(); }} placeholder={t("watermark.placeholder")} className="h-9 rounded-sm border border-border bg-surface-2 px-2.5 text-sm text-fg placeholder:text-fg-subtle" />
            </label>
          ) : (
            <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-sm border border-border-strong bg-surface-2 text-[13px] font-medium text-fg hover:bg-surface-3">
              <ImagePlus className="size-4 text-fg-muted" aria-hidden />
              {wmLogo ? t("watermark.change") : t("watermark.upload")}
              <input type="file" accept="image/png,image/webp,image/svg+xml,image/jpeg" className="sr-only" onChange={(e) => { setWmLogo(e.target.files?.[0] ?? null); invalidate(); }} />
            </label>
          )}
          <SettingsGroup label={t("watermark.position")}>
            <div className="grid w-[120px] grid-cols-3 gap-1" role="radiogroup" aria-label={t("watermark.position")}>
              {POSITIONS.map((p) => (
                <button key={p} type="button" role="radio" aria-checked={wmPosition === p} aria-label={t(`watermark.positions.${p}`)} onClick={() => { setWmPosition(p); invalidate(); }} className={cn("flex size-9 items-center justify-center rounded-xs border", wmPosition === p ? "border-primary bg-primary-soft" : "border-border bg-surface-2 hover:bg-surface-3")}>
                  <span className={cn("size-2 rounded-full", wmPosition === p ? "bg-primary" : "bg-fg-subtle")} />
                </button>
              ))}
            </div>
          </SettingsGroup>
          <SettingsGroup label={t("watermark.opacity")} value={`${wmOpacity}%`}>
            <Slider min={10} max={100} step={5} value={[wmOpacity]} onValueChange={(v) => { setWmOpacity(Array.isArray(v) ? v[0] : v); invalidate(); }} />
          </SettingsGroup>
          <SettingsGroup label={t("watermark.size")} value={`${wmSize}%`}>
            <Slider min={0} max={100} step={5} value={[wmSize]} onValueChange={(v) => { setWmSize(Array.isArray(v) ? v[0] : v); invalidate(); }} />
          </SettingsGroup>
          {engineNote}
        </>
      )}

      {tab === "frame" && (
        <>
          <SettingsGroup label={t("frame.time")} value={formatTime(current, true)}>
            <p className="text-xs text-fg-subtle">{t("frame.hint")}</p>
          </SettingsGroup>
          <SettingsGroup label={t("frame.format")}>
            <Segmented label={t("frame.format")} value={frameFormat} onChange={setFrameFormat} options={[
              { value: "png", label: "PNG" },
              { value: "jpg", label: "JPG" },
            ]} />
          </SettingsGroup>
          <button type="button" onClick={captureFrame} className="flex h-10 items-center justify-center gap-2 rounded-sm bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <Camera className="size-4" aria-hidden />
            {t("frame.capture")}
          </button>
        </>
      )}

      {tab !== "frame" && (
        <div className="mt-auto flex flex-col gap-3">
          {tab === "audio" && audioMode === "remove" ? (
            <ToggleRow label={t("audio.remove")} hint={t("audio.removeNote")} checked onCheckedChange={() => {}} disabled />
          ) : null}
          {job.phase === "error" && <p role="alert" className="text-xs text-danger">{t("status.failed", { message: job.error ?? "" })}</p>}
          <SizeReadout before={file.size} after={result ? result.blob.size : estimate} caption={result ? ts("readout.result") : tab === "gif" ? t("gif.estimated") : ts("readout.estimated")} />
        </div>
      )}
    </>
  );

  const footer =
    tab === "frame" ? undefined : (
      <ExportBar
        before={file.size}
        after={result?.blob.size}
        status={
          job.phase === "done" && job.seconds !== undefined ? (
            <>
              <span>{t("status.processedIn", { seconds: job.seconds })}</span>
              <span className="size-[3px] rounded-full bg-fg-subtle" aria-hidden />
              <span>{result ? t(`engine.${result.engine}`) : ""}</span>
            </>
          ) : undefined
        }
        downloadLabel={result ? t("export.download", { ext: result.ext.toUpperCase() }) : t("export.export")}
        downloadDisabled={busy || !info}
        onDownload={result ? download : runExport}
        onReset={resetAll}
      />
    );

  return <ToolShell toolbar={toolbar} preview={preview} tabs={tabs} settings={settings} footer={footer} mobilePreviewClassName="h-[332px]" />;
}
