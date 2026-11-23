"use client";

import { useEffect, useEffectEvent, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowDownToLine,
  AudioLines,
  Camera,
  Captions,
  CirclePlay,
  Film,
  FolderOpen,
  Gauge,
  Maximize,
  Minimize,
  Minus,
  Pause,
  PictureInPicture2,
  Play,
  Plus,
  Repeat1,
  RotateCcw,
  RotateCw,
  Scissors,
  ShieldCheck,
  SkipBack,
  SkipForward,
  TriangleAlert,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { DropZone, Segmented, SettingsGroup, ToggleRow, ToolShell } from "@/components/shell";
import { primaryButton, secondaryButton } from "@/components/shell/TwoPaneTool";
import { IconTile } from "@/components/ui/icon-tile";
import { Kbd } from "@/components/ui/kbd";
import { useIsDesktop } from "@/hooks/use-media-query";
import { useRouter } from "@/i18n/navigation";
import { downloadBlob, splitFileName } from "@/lib/download";
import { stashFiles, takeFiles } from "@/lib/fileHandoff";
import { formatBytes } from "@/lib/formatBytes";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/stores/session";
import { useToolShellStore } from "@/stores/toolShell";
import { useToolCopy } from "@/tools/copy";
import { useCurrentTool } from "@/tools/useCurrentTool";
import { probeVideo } from "./engine";
import { fitRect } from "./useElementSize";
import type { VideoInfo } from "./types";
import { ScrubBar, VolumeBar } from "./player/PlayerBars";
import {
  baseName,
  clearPositions,
  clock,
  codecLabel,
  isVideoFile,
  probeMedia,
  readResumePref,
  savePosition,
  savedPosition,
  speedLabel,
  writeResumePref,
} from "./player/media";
import { activeCueText, isSubtitleFile, readSubtitleFile, type SubtitleTrack } from "./player/subtitles";

interface QueueItem {
  id: string;
  file: File;
  url: string;
  /** From the off-screen probe; the playing element's own duration wins once it is loaded. */
  duration: number | null;
  thumb: string | null;
  probed: boolean;
  failed: boolean;
  subs: SubtitleTrack | null;
}

interface LoopPoints {
  a: number | null;
  b: number | null;
}

interface AudioGraph {
  el: HTMLVideoElement;
  ctx: AudioContext;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
}

const SPEED_PRESETS = [0.5, 1, 1.5, 2];
const SPEED_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const NO_LOOP: LoopPoints = { a: null, b: null };
const SUBTITLE_ACCEPT = ".srt,.vtt";
const FALLBACK_ACCEPT = ["video/*", ".mov", ".mkv", ".srt", ".vtt"];

function makeItem(file: File): QueueItem {
  const url = URL.createObjectURL(file);
  // The blob URL is already unique per item, so it doubles as the id.
  return { id: url, file, url, duration: null, thumb: null, probed: false, failed: false, subs: null };
}

function releaseItem(item: QueueItem): void {
  URL.revokeObjectURL(item.url);
  if (item.thumb) URL.revokeObjectURL(item.thumb);
}

/** Gives each subtitle track to the video whose file name it starts with, else to `fallbackId`. */
function attachSubtitles(items: QueueItem[], tracks: SubtitleTrack[], fallbackId: string | null): QueueItem[] {
  let out = items;
  for (const track of tracks) {
    const name = track.name.toLowerCase();
    const match = out
      .filter((i) => name.startsWith(baseName(i.file.name).toLowerCase()))
      .sort((a, b) => b.file.name.length - a.file.name.length)[0];
    const targetId = match?.id ?? fallbackId;
    out = out.map((i) => (i.id === targetId ? { ...i, subs: track } : i));
  }
  return out;
}

function shuffled<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

const overlayButton =
  "pointer-events-auto flex shrink-0 items-center justify-center rounded-sm text-white outline-none transition-opacity hover:opacity-75 focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-default disabled:opacity-35";
/** The brand green from the dark theme: these controls sit on the video in both themes. */
const overlayActive = "text-[#3ddc97]";
const linkButton =
  "rounded-xs text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60 disabled:text-fg-subtle disabled:no-underline";
const roundButton =
  "flex size-11 items-center justify-center rounded-full text-fg-muted outline-none transition-colors hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-35 disabled:hover:bg-transparent";

export default function PlayerTool() {
  const t = useTranslations("video.playerTool");
  const tv = useTranslations("video");
  const ts = useTranslations("shell");
  const locale = useLocale();
  const router = useRouter();
  const toolCopy = useToolCopy();
  const tool = useCurrentTool();
  const isDesktop = useIsDesktop();
  const recordProcessed = useSessionStore((s) => s.recordProcessed);
  const setShellFile = useToolShellStore((s) => s.setFile);

  // Queue
  const [items, setItems] = useState<QueueItem[]>(() => (takeFiles() ?? []).filter(isVideoFile).map(makeItem));
  const [currentId, setCurrentId] = useState<string | null>(() => items[0]?.id ?? null);
  const [infos, setInfos] = useState<Record<string, VideoInfo | null>>({});
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const itemsRef = useRef(items);
  const probing = useRef(false);
  const infoRequested = useRef(new Set<string>());
  const mounted = useRef(false);
  const videoInput = useRef<HTMLInputElement>(null);
  const subtitleInput = useRef<HTMLInputElement>(null);

  // Playback
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const wantPlaying = useRef(false);
  const lastPos = useRef<{ id: string; time: number } | null>(null);
  const lastSaved = useRef(0);
  const lastUi = useRef(0);
  const fixingDuration = useRef(false);
  const pointerType = useRef("mouse");
  const hideTimer = useRef<number | null>(null);
  const audio = useRef<AudioGraph | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [elementDuration, setElementDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [playError, setPlayError] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState<LoopPoints>(NO_LOOP);
  const [repeatOne, setRepeatOne] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [resume, setResume] = useState(readResumePref);
  const [boost, setBoost] = useState(false);
  const [controls, setControls] = useState(true);
  const [scrubbing, setScrubbing] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [pip, setPip] = useState(false);
  const [box, setBox] = useState({ width: 0, height: 0 });

  const index = items.findIndex((i) => i.id === currentId);
  const current = index >= 0 ? items[index] : null;
  const info = current ? infos[current.id] : undefined;
  const duration = elementDuration || current?.duration || 0;
  const prevItem = index > 0 ? items[index - 1] : null;
  const nextItem = index >= 0 ? (items[index + 1] ?? null) : null;
  const fps = info?.fps && Number.isFinite(info.fps) && info.fps > 0 ? info.fps : 30;
  const loopActive = loop.a !== null && loop.b !== null && loop.b - loop.a > 0.1;
  const pipSupported = typeof document !== "undefined" && !!document.pictureInPictureEnabled;

  /* ───────── queue ───────── */

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Object URLs are released on unmount. Deferred a tick so Strict Mode's dev-only remount keeps them.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      window.setTimeout(() => {
        if (mounted.current) return;
        itemsRef.current.forEach(releaseItem);
        void audio.current?.ctx.close();
        audio.current = null;
      }, 0);
    };
  }, []);

  // Poster frame and duration for each queued video, one at a time.
  useEffect(() => {
    if (probing.current) return;
    const next = items.find((i) => !i.probed);
    if (!next) return;
    probing.current = true;
    void probeMedia(next.url).then(({ duration: d, thumb }) => {
      probing.current = false;
      if (thumb && !itemsRef.current.some((i) => i.id === next.id)) URL.revokeObjectURL(thumb);
      setItems((prev) => prev.map((i) => (i.id === next.id ? { ...i, probed: true, duration: d, thumb } : i)));
    });
  }, [items]);

  // Frame rate and codecs for the toolbar line; the player works without them.
  useEffect(() => {
    if (!current || infoRequested.current.has(current.id)) return;
    const { id, file } = current;
    infoRequested.current.add(id);
    probeVideo(file)
      .catch(() => null)
      .then((result) => setInfos((prev) => ({ ...prev, [id]: result })));
  }, [current]);

  const persistPosition = () => {
    const v = videoRef.current;
    if (!resume || !current || !v) return;
    const end = Number.isFinite(v.duration) ? v.duration : 0;
    if (v.currentTime > 3 && (!end || v.currentTime < end - 3)) savePosition(current.file, v.currentTime);
    else if (end && v.currentTime >= end - 3) savePosition(current.file, null);
  };

  const switchTo = (id: string | null, autoplay: boolean) => {
    persistPosition();
    lastPos.current = null;
    wantPlaying.current = autoplay && id !== null;
    setCurrentId(id);
    setTime(0);
    setElementDuration(0);
    setBuffered(0);
    setDims(null);
    setLoop(NO_LOOP);
    setPlayError(false);
    if (id === null) setPlaying(false);
  };

  const play = () => {
    const v = videoRef.current;
    if (!v) return;
    wantPlaying.current = true;
    v.play().catch(() => {
      wantPlaying.current = false;
    });
  };

  const select = (id: string) => {
    if (id !== currentId) return switchTo(id, true);
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    play();
  };

  const addFiles = async (files: File[]) => {
    const videos = files.filter(isVideoFile);
    const subtitleFiles = files.filter(isSubtitleFile);
    const bad = files.find((f) => !isVideoFile(f) && !isSubtitleFile(f));
    if (bad) toast.error(t("unsupported", { name: bad.name }));
    const added = videos.map(makeItem);
    const targetId = currentId ?? added[0]?.id ?? null;
    if (added.length && !currentId) switchTo(added[0].id, true);
    if (added.length) setItems((prev) => [...prev, ...added]);

    if (!subtitleFiles.length) return;
    if (!targetId) {
      toast.error(t("subtitles.needVideo"));
      return;
    }
    const tracks = await Promise.all(subtitleFiles.map((f) => readSubtitleFile(f, locale)));
    const usable = tracks.filter((track) => track.cues.length > 0);
    const empty = tracks.find((track) => track.cues.length === 0);
    if (empty) toast.error(t("subtitles.empty", { name: empty.name }));
    if (!usable.length) return;
    setItems((prev) => attachSubtitles(prev, usable, targetId));
    setCaptionsOn(true);
  };

  const removeItem = (id: string) => {
    const at = items.findIndex((i) => i.id === id);
    if (at < 0) return;
    const rest = items.filter((i) => i.id !== id);
    if (id === currentId) switchTo((rest[at] ?? rest[at - 1])?.id ?? null, playing);
    setItems(rest);
    releaseItem(items[at]);
  };

  const shuffleQueue = () => {
    setItems((prev) => {
      const playingItem = prev.find((i) => i.id === currentId);
      const others = shuffled(prev.filter((i) => i.id !== currentId));
      return playingItem ? [playingItem, ...others] : others;
    });
  };

  const updateSubs = (patch: (subs: SubtitleTrack) => SubtitleTrack | null) => {
    if (!current) return;
    const { id } = current;
    setItems((prev) => prev.map((i) => (i.id === id && i.subs ? { ...i, subs: patch(i.subs) } : i)));
  };

  /* ───────── playback ───────── */

  const applyBoost = (on: boolean) => {
    const v = videoRef.current;
    if (!v) return;
    let graph = audio.current;
    if (graph && graph.el !== v) {
      void graph.ctx.close();
      graph = audio.current = null;
    }
    if (!graph) {
      if (!on) return;
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const source = ctx.createMediaElementSource(v);
      const gain = ctx.createGain();
      gain.gain.value = 2;
      // A limiter after the gain keeps loud passages from clipping.
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -3;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;
      gain.connect(limiter);
      limiter.connect(ctx.destination);
      graph = audio.current = { el: v, ctx, source, gain };
    }
    graph.source.disconnect();
    graph.source.connect(on ? graph.gain : graph.ctx.destination);
    void graph.ctx.resume();
  };

  const enforceLoop = (v: HTMLVideoElement) => {
    if (loop.a !== null && loop.b !== null && loop.b - loop.a > 0.1 && v.currentTime >= loop.b) v.currentTime = loop.a;
  };

  const syncTime = (v: HTMLVideoElement) => {
    enforceLoop(v);
    setTime(v.currentTime);
    if (current) lastPos.current = { id: current.id, time: v.currentTime };
    for (let i = 0; i < v.buffered.length; i++) {
      if (v.buffered.start(i) <= v.currentTime + 0.5 && v.buffered.end(i) >= v.currentTime) setBuffered(v.buffered.end(i));
    }
  };

  const seek = (to: number) => {
    const v = videoRef.current;
    if (!v) return;
    const end = Number.isFinite(v.duration) ? v.duration : duration;
    const clamped = Math.min(Math.max(to, 0), end || 0);
    v.currentTime = clamped;
    setTime(clamped);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) play();
    else {
      wantPlaying.current = false;
      v.pause();
    }
  };

  const stepFrame = (direction: 1 | -1) => {
    const v = videoRef.current;
    if (!v) return;
    wantPlaying.current = false;
    v.pause();
    seek(v.currentTime + direction / fps);
  };

  const changeSpeed = (next: number) => {
    setSpeed(next);
    const v = videoRef.current;
    if (v) {
      v.defaultPlaybackRate = next;
      v.playbackRate = next;
    }
  };

  const bumpSpeed = (direction: 1 | -1) => {
    const at = SPEED_STEPS.reduce((best, s, i) => (Math.abs(s - speed) < Math.abs(SPEED_STEPS[best] - speed) ? i : best), 0);
    changeSpeed(SPEED_STEPS[Math.min(Math.max(at + direction, 0), SPEED_STEPS.length - 1)]);
  };

  const changeVolume = (next: number) => {
    setVolume(next);
    setMuted(next === 0);
    const v = videoRef.current;
    if (v) {
      v.volume = next;
      v.muted = next === 0;
    }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (videoRef.current) videoRef.current.muted = next;
    if (!next && volume === 0) changeVolume(0.5);
  };

  const setPoint = (which: "a" | "b") => {
    const v = videoRef.current;
    if (!v) return;
    const at = v.currentTime;
    setLoop((prev) => {
      if (which === "a") return { a: at, b: prev.b !== null && prev.b > at + 0.1 ? prev.b : null };
      if (prev.a === null) return { a: 0, b: at };
      return at > prev.a ? { a: prev.a, b: at } : { a: at, b: prev.a };
    });
  };

  const toggleCaptions = () => {
    if (current?.subs) setCaptionsOn((on) => !on);
    else subtitleInput.current?.click();
  };

  const toggleFullscreen = () => {
    const el = playerRef.current;
    const v = videoRef.current;
    if (!el || !v) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen().catch(() => undefined);
    else (v as HTMLVideoElement & { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen?.(); // iPhone
  };

  const togglePip = () => {
    const v = videoRef.current;
    if (!v || !pipSupported) return;
    if (document.pictureInPictureElement) void document.exitPictureInPicture();
    else v.requestPictureInPicture().catch(() => undefined);
  };

  const poke = () => {
    setControls(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setControls(false), 2600);
  };

  const onLoadedMetadata = (v: HTMLVideoElement) => {
    if (!current) return;
    v.defaultPlaybackRate = speed;
    v.playbackRate = speed;
    v.volume = volume;
    v.muted = muted;
    setDims(v.videoWidth ? { w: v.videoWidth, h: v.videoHeight } : null);
    setPlayError(false);
    if (boost) applyBoost(true);
    const finite = Number.isFinite(v.duration) && v.duration > 0;
    if (finite) setElementDuration(v.duration);
    else {
      // MediaRecorder WebM files report Infinity until the element is seeked past the end.
      fixingDuration.current = true;
      v.currentTime = 1e101;
    }
    const last = lastPos.current;
    if (last && last.id === current.id && last.time > 0) {
      // Same video on a fresh element (the layout switched between desktop and mobile): carry on.
      if (finite) v.currentTime = last.time;
    } else if (resume && finite) {
      const saved = savedPosition(current.file);
      if (saved !== null && saved > 3 && saved < v.duration - 3) {
        v.currentTime = saved;
        toast(t("resume.resumed", { time: clock(saved) }));
      }
    }
    if (wantPlaying.current) play();
  };

  const onDurationChange = (v: HTMLVideoElement) => {
    if (!Number.isFinite(v.duration) || v.duration <= 0) return;
    setElementDuration(v.duration);
    if (fixingDuration.current) {
      fixingDuration.current = false;
      v.currentTime = 0;
    }
  };

  const onEnded = (v: HTMLVideoElement) => {
    if (current) savePosition(current.file, null);
    if (repeatOne) {
      v.currentTime = 0;
      play();
    } else if (nextItem) switchTo(nextItem.id, true);
    else wantPlaying.current = false;
  };

  const onTimeUpdate = (v: HTMLVideoElement) => {
    syncTime(v);
    const now = performance.now();
    if (!v.paused && now - lastSaved.current > 5000) {
      lastSaved.current = now;
      persistPosition();
    }
  };

  // Between `timeupdate` events (~4 per second) this keeps the A–B loop tight and the scrub bar moving.
  const onFrame = useEffectEvent((now: number) => {
    const v = videoRef.current;
    if (!v) return;
    enforceLoop(v);
    if (now - lastUi.current > 80) {
      lastUi.current = now;
      setTime(v.currentTime);
    }
  });
  useEffect(() => {
    if (!playing) return;
    let id = requestAnimationFrame(function loopFrame(now) {
      onFrame(now);
      id = requestAnimationFrame(loopFrame);
    });
    return () => cancelAnimationFrame(id);
  }, [playing]);

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (!current || e.metaKey || e.ctrlKey) return;
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
    // "[" and "]" need Alt on several keyboard layouts, so Alt only blocks the letter shortcuts.
    if (e.altKey && e.key !== "[" && e.key !== "]") return;
    switch (e.key.length === 1 ? e.key.toLowerCase() : e.key) {
      case " ":
        if (target?.closest("button, a, [role='radio'], [role='switch']")) return; // let the focused control act
        togglePlay();
        break;
      case "k":
        togglePlay();
        break;
      case "j":
        seek((videoRef.current?.currentTime ?? 0) - 10);
        break;
      case "l":
        seek((videoRef.current?.currentTime ?? 0) + 10);
        break;
      case "ArrowLeft":
        seek((videoRef.current?.currentTime ?? 0) - 5);
        break;
      case "ArrowRight":
        seek((videoRef.current?.currentTime ?? 0) + 5);
        break;
      case ",":
        stepFrame(-1);
        break;
      case ".":
        stepFrame(1);
        break;
      case "[":
        bumpSpeed(-1);
        break;
      case "]":
        bumpSpeed(1);
        break;
      case "a":
        setPoint("a");
        break;
      case "b":
        setPoint("b");
        break;
      case "c":
        if (current.subs) setCaptionsOn((on) => !on);
        break;
      case "p":
        togglePip();
        break;
      case "f":
        toggleFullscreen();
        break;
      case "m":
        toggleMute();
        break;
      default:
        return;
    }
    e.preventDefault();
    poke();
  });

  const onPageHide = useEffectEvent(() => persistPosition());

  useEffect(() => {
    const key = (e: KeyboardEvent) => onKey(e);
    const hide = () => onPageHide();
    const fs = () => setFullscreen(!!document.fullscreenElement);
    const pipChange = () => setPip(!!document.pictureInPictureElement);
    window.addEventListener("keydown", key);
    window.addEventListener("pagehide", hide);
    document.addEventListener("fullscreenchange", fs);
    document.addEventListener("enterpictureinpicture", pipChange);
    document.addEventListener("leavepictureinpicture", pipChange);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("pagehide", hide);
      document.removeEventListener("fullscreenchange", fs);
      document.removeEventListener("enterpictureinpicture", pipChange);
      document.removeEventListener("leavepictureinpicture", pipChange);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, []);

  /* ───────── actions ───────── */

  const captureFrame = async () => {
    const v = videoRef.current;
    if (!v || !current || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")?.drawImage(v, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;
    downloadBlob(blob, `${splitFileName(current.file.name).base}-${clock(v.currentTime).replace(/:/g, "-")}.png`);
    recordProcessed();
    toast.success(tv("frame.saved"));
  };

  const openInTrim = () => {
    if (!current) return;
    persistPosition();
    stashFiles([current.file]);
    router.push("/video/trim");
  };

  const changeResume = (on: boolean) => {
    setResume(on);
    writeResumePref(on);
    if (!on) clearPositions();
  };

  const changeBoost = (on: boolean) => {
    setBoost(on);
    applyBoost(on);
  };

  /* ───────── derived copy ───────── */

  const size = current ? formatBytes(current.file.size) : "";
  const width = dims?.w ?? info?.width ?? 0;
  const height = dims?.h ?? info?.height ?? 0;
  const codecs = [codecLabel(info?.videoCodec ?? null), info?.hasAudio ? codecLabel(info.audioCodec) : null].filter(Boolean).join(" + ");
  const toolbarMeta = [
    width ? `${width} × ${height}` : null,
    info?.fps ? t("fps", { fps: Math.round(info.fps * 100) / 100 }) : null,
    duration ? clock(duration) : null,
    codecs || null,
    size,
  ]
    .filter(Boolean)
    .join(" · ");
  const navMeta = [duration ? clock(duration) : null, height ? `${Math.min(width, height)}p` : null, size].filter(Boolean).join(" · ");
  const fileName = current?.file.name ?? null;

  useEffect(() => {
    setShellFile(fileName ? { name: fileName, meta: navMeta } : null);
  }, [fileName, navMeta, setShellFile]);

  const dropHandlers = {
    onDragEnter: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    },
    onDragOver: (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    },
    onDragLeave: () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    },
    onDrop: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      void addFiles(Array.from(e.dataTransfer.files));
    },
  };

  const inputs = (
    <>
      <input
        ref={videoInput}
        type="file"
        multiple
        accept={(tool?.accept ?? FALLBACK_ACCEPT).join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-label={t("addVideos")}
        onChange={(e) => {
          if (e.target.files) void addFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
      <input
        ref={subtitleInput}
        type="file"
        accept={SUBTITLE_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-label={t("subtitles.add")}
        onChange={(e) => {
          if (e.target.files) void addFiles(Array.from(e.target.files).filter(isSubtitleFile));
          e.target.value = "";
        }}
      />
    </>
  );

  /* ───────── empty state ───────── */

  if (!current) {
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
          accept={tool?.accept ?? FALLBACK_ACCEPT}
          multiple
          paste={false}
          title={t("dropzone.title")}
          subtitle={t("dropzone.subtitle")}
          formats={["MP4", "WebM", "MOV", "MKV", "SRT", "VTT"]}
          onFiles={(files) => void addFiles(files)}
        />
        <p className="max-w-[640px] text-center text-xs text-fg-subtle">{t("dropzone.hint")}</p>
      </div>
    );
  }

  /* ───────── player ───────── */

  const compact = !isDesktop;
  const visible = controls || !playing || scrubbing;
  const caption = captionsOn && current.subs ? activeCueText(current.subs, time) : null;
  const aspect = dims && dims.h ? dims.w / dims.h : 16 / 9;
  const frame: CSSProperties | undefined = isDesktop && !fullscreen ? fitRect(aspect, box) : undefined;
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const iconSize = "size-[18px]";
  const timeLabel = `${clock(time)} / ${clock(duration)}`;

  const player = (
    <div
      ref={playerRef}
      dir="ltr"
      className={cn(
        "@container relative overflow-hidden bg-black",
        fullscreen ? "size-full" : isDesktop ? "absolute rounded-[10px] shadow-[0_12px_40px_#00000066]" : "aspect-video w-full",
        !visible && "cursor-none",
      )}
      style={frame}
      onPointerMove={poke}
      onPointerLeave={() => {
        if (playing) setControls(false);
      }}
    >
      <video
        ref={videoRef}
        src={current.url}
        playsInline
        preload="auto"
        className="absolute inset-0 size-full object-contain"
        onLoadedMetadata={(e) => onLoadedMetadata(e.currentTarget)}
        onDurationChange={(e) => onDurationChange(e.currentTarget)}
        onTimeUpdate={(e) => onTimeUpdate(e.currentTarget)}
        onSeeked={(e) => syncTime(e.currentTarget)}
        onProgress={(e) => syncTime(e.currentTarget)}
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false);
          persistPosition();
        }}
        onEnded={(e) => onEnded(e.currentTarget)}
        onError={() => {
          setPlayError(true);
          setPlaying(false);
          setItems((prev) => prev.map((i) => (i.id === current.id ? { ...i, failed: true } : i)));
        }}
        onPointerDown={(e) => {
          pointerType.current = e.pointerType;
        }}
        onClick={() => {
          // On touch, the first tap only brings the controls back.
          if (pointerType.current === "touch" && playing && !controls) return poke();
          togglePlay();
          poke();
        }}
        onDoubleClick={() => {
          if (pointerType.current === "mouse") toggleFullscreen();
        }}
      />

      {caption && (
        <div className="pointer-events-none absolute inset-x-0 flex justify-center px-4 transition-[bottom] duration-200" style={{ bottom: visible ? (compact ? 76 : 122) : compact ? 14 : 28 }}>
          <span className="max-w-[88%] rounded bg-black/72 px-[0.65em] py-[0.3em] text-center leading-snug font-medium whitespace-pre-line text-white" style={{ fontSize: "max(13px, 1.9cqw)" }}>
            {caption}
          </span>
        </div>
      )}

      {speed !== 1 && (
        <div className={cn("pointer-events-none absolute flex items-center gap-1.5 rounded-full bg-black/65 font-mono font-semibold text-white", compact ? "top-3 right-3 px-2 py-1 text-[11px]" : "top-5 right-3.5 px-2.5 py-[5px] text-xs")}>
          <Gauge className={compact ? "size-3" : "size-[13px]"} aria-hidden />
          {speedLabel(speed)}
        </div>
      )}

      {playError && (
        <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-6 text-center">
          <TriangleAlert className="size-6 text-warning" aria-hidden />
          <p className="max-w-[420px] text-sm text-white">{t("cantPlay")}</p>
          {nextItem && (
            <button type="button" onClick={() => select(nextItem.id)} className="rounded-sm border border-white/35 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-white/10">
              {t("controls.next")}
            </button>
          )}
        </div>
      )}

      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 flex flex-col justify-end bg-linear-to-t from-black/78 to-transparent transition-opacity duration-200 focus-within:opacity-100",
          compact ? "h-[70px] gap-2 px-3.5 pb-2.5" : "h-[120px] gap-2.5 px-4 pb-3.5",
          visible ? "opacity-100" : "opacity-0",
        )}
      >
        <ScrubBar
          className={visible ? "pointer-events-auto" : undefined}
          duration={duration}
          current={time}
          buffered={buffered}
          loopA={loop.a}
          loopB={loop.b}
          previewSrc={compact || playError ? undefined : current.url}
          aspect={aspect}
          label={t("controls.seek")}
          onSeek={seek}
          onScrubbing={setScrubbing}
        />
        <div className={cn("flex items-center", compact ? "gap-3.5" : "gap-4", !visible && "[&_*]:pointer-events-none!")}>
          {!compact && (
            <button type="button" className={overlayButton} onClick={() => prevItem && select(prevItem.id)} disabled={!prevItem} aria-label={t("controls.previous")}>
              <SkipBack className={iconSize} aria-hidden />
            </button>
          )}
          <button type="button" className={overlayButton} onClick={togglePlay} aria-label={playing ? t("controls.pause") : t("controls.play")}>
            {playing ? <Pause className={compact ? iconSize : "size-[22px]"} aria-hidden /> : <Play className={compact ? iconSize : "size-[22px]"} aria-hidden />}
          </button>
          {!compact && (
            <button type="button" className={overlayButton} onClick={() => nextItem && select(nextItem.id)} disabled={!nextItem} aria-label={t("controls.next")}>
              <SkipForward className={iconSize} aria-hidden />
            </button>
          )}
          <div className="flex items-center gap-2">
            <button type="button" className={overlayButton} onClick={toggleMute} aria-label={muted ? t("controls.unmute") : t("controls.mute")} aria-pressed={muted}>
              <VolumeIcon className={iconSize} aria-hidden />
            </button>
            {!compact && (
              <div className={visible ? "pointer-events-auto" : undefined}>
                <VolumeBar value={muted ? 0 : volume} label={t("controls.volume")} onChange={changeVolume} />
              </div>
            )}
          </div>
          <span className={cn("font-mono whitespace-nowrap text-white tabular-nums", compact ? "text-[11px]" : "text-xs")}>{timeLabel}</span>
          <span className="flex-1" />
          {!compact && (
            <button
              type="button"
              className={cn(overlayButton, "rounded-[5px] border border-white/35 px-2 py-[3px] font-mono text-xs font-semibold")}
              onClick={() => changeSpeed(SPEED_PRESETS[(SPEED_PRESETS.indexOf(speed) + 1) % SPEED_PRESETS.length])}
              aria-label={`${t("controls.speed")}: ${speedLabel(speed)}`}
            >
              {speedLabel(speed)}
            </button>
          )}
          <button
            type="button"
            className={cn(overlayButton, current.subs && captionsOn && overlayActive, !current.subs && "opacity-60")}
            onClick={toggleCaptions}
            aria-label={current.subs ? t("controls.captions") : t("subtitles.add")}
            aria-pressed={current.subs ? captionsOn : undefined}
          >
            <Captions className={iconSize} aria-hidden />
          </button>
          {!compact && (
            <button type="button" className={cn(overlayButton, (repeatOne || loopActive) && overlayActive)} onClick={() => setRepeatOne((on) => !on)} aria-label={t("controls.repeat")} aria-pressed={repeatOne}>
              <Repeat1 className={iconSize} aria-hidden />
            </button>
          )}
          {pipSupported && (
            <button type="button" className={cn(overlayButton, pip && overlayActive)} onClick={togglePip} aria-label={t("controls.pip")} aria-pressed={pip}>
              <PictureInPicture2 className={iconSize} aria-hidden />
            </button>
          )}
          <button type="button" className={overlayButton} onClick={toggleFullscreen} aria-label={fullscreen ? t("controls.exitFullscreen") : t("controls.fullscreen")}>
            {fullscreen ? <Minimize className={iconSize} aria-hidden /> : <Maximize className={iconSize} aria-hidden />}
          </button>
        </div>
      </div>
    </div>
  );

  const shortcuts: { keys: string[]; label: string }[] = [
    { keys: [t("shortcuts.space")], label: t("shortcuts.playPause") },
    { keys: ["J", "L"], label: t("shortcuts.skip") },
    { keys: [",", "."], label: t("shortcuts.frame") },
    { keys: ["[", "]"], label: t("shortcuts.speed") },
    { keys: ["A", "B"], label: t("shortcuts.loop") },
    { keys: ["C"], label: t("shortcuts.captions") },
    ...(pipSupported ? [{ keys: ["P"], label: t("shortcuts.pip") }] : []),
  ];

  const preview = isDesktop ? (
    <div className="flex size-full flex-col items-center gap-5 px-8 py-7">
      <div
        className="relative min-h-[240px] w-full flex-1"
        ref={(el) => {
          if (!el) return;
          const observer = new ResizeObserver(([entry]) => setBox({ width: entry.contentRect.width, height: entry.contentRect.height }));
          observer.observe(el);
          return () => observer.disconnect();
        }}
      >
        {player}
      </div>
      <ul className="flex shrink-0 flex-wrap items-center justify-center gap-x-[22px] gap-y-2">
        {shortcuts.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5">
            {s.keys.map((k) => (
              <Kbd key={k}>{k}</Kbd>
            ))}
            <span className="text-xs text-fg-subtle">{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  ) : (
    <div className="flex w-full flex-col gap-3 pb-4">
      {player}
      <div className="flex items-center justify-between px-6 py-1" dir="ltr">
        <button type="button" className={roundButton} onClick={() => prevItem && select(prevItem.id)} disabled={!prevItem} aria-label={t("controls.previous")}>
          <SkipBack className="size-5" aria-hidden />
        </button>
        <button type="button" className={roundButton} onClick={() => seek(time - 10)} aria-label={t("controls.back10")}>
          <RotateCcw className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? t("controls.pause") : t("controls.play")}
          className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          {playing ? <Pause className="size-6" aria-hidden /> : <Play className="size-6 translate-x-px" aria-hidden />}
        </button>
        <button type="button" className={roundButton} onClick={() => seek(time + 10)} aria-label={t("controls.forward10")}>
          <RotateCw className="size-5" aria-hidden />
        </button>
        <button type="button" className={roundButton} onClick={() => nextItem && select(nextItem.id)} disabled={!nextItem} aria-label={t("controls.next")}>
          <SkipForward className="size-5" aria-hidden />
        </button>
      </div>
    </div>
  );

  /* ───────── chrome around the player ───────── */

  const toolbar = (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-xs bg-surface-3">
          {current.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current.thumb} alt="" className="size-full object-cover" />
          ) : (
            <CirclePlay className="size-4 text-primary" aria-hidden />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-semibold text-fg">{current.file.name}</span>
          <span className="truncate text-xs text-fg-subtle">{toolbarMeta}</span>
        </div>
      </div>
      <button type="button" onClick={() => videoInput.current?.click()} className="flex h-9 shrink-0 items-center gap-2 rounded-sm border border-border-strong bg-surface-2 px-3 text-[13px] font-medium text-fg hover:bg-surface-3">
        <FolderOpen className="size-4 text-fg-muted" aria-hidden />
        {t("addVideos")}
      </button>
    </>
  );

  const panelHeader = (
    <div className="flex h-14 items-center justify-between px-3">
      <span className="text-sm font-semibold text-fg">{t("panel.title")}</span>
      <span className="text-xs text-fg-subtle">{t("panel.note")}</span>
    </div>
  );

  const offset = current.subs?.offset ?? 0;
  const offsetLabel = `${offset > 0 ? "+" : offset < 0 ? "−" : ""}${Math.abs(offset).toFixed(1)} s`;
  const shiftSubs = (by: number) => updateSubs((subs) => ({ ...subs, offset: Math.round((subs.offset + by) * 10) / 10 }));

  const settings = (
    <>
      <SettingsGroup label={t("speed.label")} value={<span className="font-mono text-xs">{speedLabel(speed)}</span>}>
        <Segmented label={t("speed.label")} value={String(speed)} onChange={(v) => changeSpeed(Number(v))} options={SPEED_PRESETS.map((s) => ({ value: String(s), label: speedLabel(s) }))} />
      </SettingsGroup>

      <SettingsGroup
        label={t("loop.label")}
        value={
          <button type="button" className={linkButton} onClick={() => setLoop(NO_LOOP)} disabled={loop.a === null && loop.b === null}>
            {t("loop.clear")}
          </button>
        }
      >
        <div className="flex items-center gap-2" dir="ltr">
          {(["a", "b"] as const).map((point) => (
            <button
              key={point}
              type="button"
              onClick={() => setPoint(point)}
              aria-label={t(point === "a" ? "loop.setA" : "loop.setB")}
              className="flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-sm border border-border bg-surface-2 px-2.5 outline-none transition-colors hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <span className="flex size-5 shrink-0 items-center justify-center rounded-[5px] bg-primary-soft text-[11px] font-bold text-primary">{point.toUpperCase()}</span>
              <span className={cn("font-mono text-[13px] font-medium", loop[point] === null ? "text-fg-subtle" : "text-fg")}>{loop[point] === null ? "--:--.-" : clock(loop[point], true)}</span>
            </button>
          ))}
        </div>
        <p className="text-xs leading-normal text-fg-subtle">
          {loopActive && loop.a !== null && loop.b !== null ? t("loop.hint", { seconds: (loop.b - loop.a).toFixed(1), speed: speedLabel(speed) }) : t("loop.empty")}
        </p>
      </SettingsGroup>

      <SettingsGroup
        label={t("subtitles.label")}
        value={
          <button type="button" className={linkButton} onClick={() => subtitleInput.current?.click()}>
            {t("subtitles.add")}
          </button>
        }
      >
        {current.subs ? (
          <div className="flex items-center gap-2.5 rounded-sm border border-border bg-surface-2 py-2.5 ps-3 pe-2">
            <Captions className={cn("size-4 shrink-0", captionsOn ? "text-primary" : "text-fg-subtle")} aria-hidden />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-[13px] font-medium text-fg">{current.subs.name}</span>
              <span className="truncate text-xs text-fg-subtle">
                {[current.subs.language, t("subtitles.cues", { count: current.subs.cues.length })].filter(Boolean).join(" · ")}
              </span>
            </div>
            <div className="flex h-7 shrink-0 items-center rounded-sm border border-border px-0.5" dir="ltr">
              <button type="button" onClick={() => shiftSubs(-0.1)} aria-label={t("subtitles.earlier")} className="flex h-full w-6 items-center justify-center rounded-xs text-fg-muted hover:text-fg">
                <Minus className="size-3.5" aria-hidden />
              </button>
              <span className="w-11 text-center font-mono text-xs font-medium text-fg">{offsetLabel}</span>
              <button type="button" onClick={() => shiftSubs(0.1)} aria-label={t("subtitles.later")} className="flex h-full w-6 items-center justify-center rounded-xs text-fg-muted hover:text-fg">
                <Plus className="size-3.5" aria-hidden />
              </button>
            </div>
            <button type="button" onClick={() => updateSubs(() => null)} aria-label={t("subtitles.remove")} className="flex size-7 shrink-0 items-center justify-center rounded-xs text-fg-subtle hover:bg-surface-3 hover:text-fg">
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        ) : (
          <p className="text-xs leading-normal text-fg-subtle">{t("subtitles.none")}</p>
        )}
      </SettingsGroup>

      <div className="flex flex-col gap-4">
        <ToggleRow label={t("resume.label")} hint={t("resume.hint")} checked={resume} onCheckedChange={changeResume} />
        <ToggleRow label={t("boost.label")} hint={t("boost.hint")} checked={boost} onCheckedChange={changeBoost} />
      </div>

      <SettingsGroup
        label={t("queue.label", { count: items.length })}
        value={
          <span className="flex items-center gap-3">
            {items.length > 2 && (
              <button type="button" className={cn(linkButton, "text-fg-subtle hover:text-fg")} onClick={shuffleQueue}>
                {t("queue.shuffle")}
              </button>
            )}
            <button type="button" className={linkButton} onClick={() => videoInput.current?.click()}>
              {t("addVideos")}
            </button>
          </span>
        }
      >
        <ul className="scrollbar-thin flex max-h-[262px] flex-col gap-1 overflow-y-auto">
          {items.map((item) => {
            const active = item.id === current.id;
            return (
              <li key={item.id} className={cn("group/item flex shrink-0 items-center rounded-sm border", active ? "border-primary-line bg-primary-soft" : "border-transparent hover:bg-surface-2")}>
                <button type="button" onClick={() => select(item.id)} aria-current={active || undefined} className="flex min-w-0 flex-1 items-center gap-3 rounded-sm p-2 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
                  <span className="flex h-8 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-surface-3">
                    {item.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.thumb} alt="" className="size-full object-cover" />
                    ) : (
                      <Film className="size-3.5 text-fg-subtle" aria-hidden />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-[13px] font-medium text-fg">{item.file.name}</span>
                    {item.failed ? (
                      <span className="text-xs text-danger">{t("queue.error")}</span>
                    ) : active ? (
                      <span className="text-xs font-semibold text-primary">{t("queue.playing")}</span>
                    ) : (
                      <span className="text-xs text-fg-subtle">{item.duration ? clock(item.duration) : formatBytes(item.file.size)}</span>
                    )}
                  </span>
                </button>
                {active && !item.failed && <AudioLines className="size-4 shrink-0 text-primary" aria-hidden />}
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  aria-label={t("queue.remove", { name: item.file.name })}
                  className="mx-1 flex size-7 shrink-0 items-center justify-center rounded-xs text-fg-subtle outline-none hover:bg-surface-3 hover:text-fg focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/60 md:opacity-0 md:group-hover/item:opacity-100"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      </SettingsGroup>
    </>
  );

  const footer = (
    <div className="safe-bottom flex shrink-0 items-center justify-between gap-3 border-t border-border bg-surface px-5 py-3 md:h-16 md:py-0">
      <div className="hidden min-w-0 items-center gap-2 text-[13px] text-fg-muted lg:flex">
        <ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="truncate">{t("status.local")}</span>
        <span className="size-[3px] shrink-0 rounded-full bg-fg-subtle" aria-hidden />
        <span className="whitespace-nowrap">{ts("export.bytesSent")}</span>
      </div>
      <div className="flex flex-1 items-center justify-end gap-3">
        <button type="button" onClick={() => void captureFrame()} disabled={playError} className={cn(secondaryButton, "h-12 justify-center px-0 max-md:w-11 md:h-10 md:px-4")} aria-label={t("actions.capture")}>
          <Camera className="size-[18px] text-fg-muted md:size-4" aria-hidden />
          <span className="hidden md:inline">{t("actions.capture")}</span>
        </button>
        <button type="button" onClick={openInTrim} disabled={playError} className={cn(primaryButton, "h-12 flex-1 justify-center text-[15px] md:h-10 md:flex-none md:text-sm")}>
          <Scissors className="size-4" aria-hidden />
          {t("actions.trim")}
        </button>
      </div>
    </div>
  );

  return (
    // Capped to the viewport on desktop so the player never scrolls out of view; the settings column scrolls instead.
    <div className="relative flex min-h-0 flex-1 flex-col md:max-h-[calc(100dvh-100px)]" {...dropHandlers}>
      <ToolShell toolbar={toolbar} preview={preview} tabs={isDesktop ? panelHeader : undefined} settings={settings} footer={footer} mobilePreviewClassName="h-auto flex-col bg-background" />
      {inputs}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-scrim p-6">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-[1.5px] border-dashed border-primary bg-surface px-10 py-8 text-center">
            <div className="flex size-11 items-center justify-center rounded-[14px] bg-primary text-primary-foreground">
              <ArrowDownToLine className="size-[22px]" strokeWidth={1.75} aria-hidden />
            </div>
            <p className="text-base font-semibold text-primary">{t("releaseToAdd")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
