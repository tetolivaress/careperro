"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Circle, Download, Mic, Monitor, Scissors, Square, Trash2, Video as VideoIcon } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Segmented, ToggleRow, ErrorCard } from "@/components/shell";
import { IconTile } from "@/components/ui/icon-tile";
import { downloadBlob } from "@/lib/download";
import { formatBytes } from "@/lib/formatBytes";
import { stashFiles } from "@/lib/fileHandoff";
import { useSessionStore } from "@/stores/session";
import { useToolShellStore } from "@/stores/toolShell";
import { cn } from "@/lib/utils";
import { formatTime } from "./estimate";

type Source = "screen" | "camera";
type Phase = "idle" | "requesting" | "recording" | "ready" | "error";

function pickMimeType(): string {
  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4;codecs=avc1,mp4a.40.2", "video/mp4"];
  return candidates.find((c) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) ?? "";
}

/** Mixes every audio track of the given streams into one track so MediaRecorder captures both system and mic audio. */
function mixAudio(streams: MediaStream[]): { track: MediaStreamTrack | null; close: () => void } {
  const audioTracks = streams.flatMap((s) => s.getAudioTracks());
  if (audioTracks.length <= 1) return { track: audioTracks[0] ?? null, close: () => {} };
  const ctx = new AudioContext();
  const dest = ctx.createMediaStreamDestination();
  for (const s of streams) {
    if (s.getAudioTracks().length) ctx.createMediaStreamSource(new MediaStream(s.getAudioTracks())).connect(dest);
  }
  return { track: dest.stream.getAudioTracks()[0] ?? null, close: () => void ctx.close() };
}

/** Screen and webcam recorder: preview, timer, stop, then download or continue to the editor. */
export default function RecorderTool() {
  const t = useTranslations("video.recorder");
  const te = useTranslations("video.export");
  const router = useRouter();
  const recordProcessed = useSessionStore((s) => s.recordProcessed);
  const setShellFile = useToolShellStore((s) => s.setFile);

  const [source, setSource] = useState<Source>("screen");
  const [mic, setMic] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<{ blob: Blob; url: string; duration: number } | null>(null);

  const previewRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamsRef = useRef<MediaStream[]>([]);
  const closeMixRef = useRef<() => void>(() => {});
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const supported = typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices;

  useEffect(() => {
    return () => {
      if (result) URL.revokeObjectURL(result.url);
    };
  }, [result]);

  useEffect(() => {
    if (phase !== "recording") return;
    const id = setInterval(() => setElapsed((performance.now() - startedAtRef.current) / 1000), 250);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    setShellFile(result ? { name: `recording.${result.blob.type.includes("mp4") ? "mp4" : "webm"}`, meta: `${formatTime(result.duration)} · ${formatBytes(result.blob.size)}` } : null);
  }, [result, setShellFile]);

  const stopTracks = () => {
    for (const s of streamsRef.current) s.getTracks().forEach((tr) => tr.stop());
    streamsRef.current = [];
    closeMixRef.current();
    closeMixRef.current = () => {};
  };

  useEffect(() => () => stopTracks(), []);

  const start = async () => {
    setError(null);
    setPhase("requesting");
    try {
      const media =
        source === "screen"
          ? await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true })
          : await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: mic });
      const streams = [media];
      if (mic && source === "screen") {
        try {
          streams.push(await navigator.mediaDevices.getUserMedia({ audio: true }));
        } catch {
          /* mic optional */
        }
      }
      streamsRef.current = streams;
      const { track: audioTrack, close } = mixAudio(streams);
      closeMixRef.current = close;
      const recordStream = new MediaStream([...media.getVideoTracks(), ...(audioTrack ? [audioTrack] : [])]);
      if (previewRef.current) {
        previewRef.current.srcObject = new MediaStream(media.getVideoTracks());
        void previewRef.current.play().catch(() => {});
      }
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(recordStream, mimeType ? { mimeType, videoBitsPerSecond: 6_000_000 } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "video/webm" });
        const duration = (performance.now() - startedAtRef.current) / 1000;
        if (previewRef.current) previewRef.current.srcObject = null;
        stopTracks();
        setResult({ blob, url: URL.createObjectURL(blob), duration });
        setPhase("ready");
      };
      media.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (rec.state === "recording") rec.stop();
      });
      recorderRef.current = rec;
      startedAtRef.current = performance.now();
      setElapsed(0);
      rec.start(1000);
      setPhase("recording");
    } catch (e) {
      stopTracks();
      setError(e instanceof Error && e.name === "NotAllowedError" ? t("permission") : e instanceof Error ? e.message : t("permission"));
      setPhase("error");
    }
  };

  const stop = () => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  };

  const discard = () => {
    if (result) URL.revokeObjectURL(result.url);
    setResult(null);
    setPhase("idle");
    setElapsed(0);
  };

  const fileName = () => `recording-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${result?.blob.type.includes("mp4") ? "mp4" : "webm"}`;

  const download = () => {
    if (!result) return;
    downloadBlob(result.blob, fileName());
    recordProcessed();
    toast.success(t("ready", { duration: formatTime(result.duration), size: formatBytes(result.blob.size) }));
  };

  const openInEditor = () => {
    if (!result) return;
    stashFiles([new File([result.blob], fileName(), { type: result.blob.type })]);
    router.push("/video/trim");
  };

  return (
    <div className="flex flex-1 flex-col items-center gap-6 px-5 py-8 md:px-12">
      <div className="flex max-w-[640px] flex-col items-center gap-3 text-center">
        <IconTile icon="video" size={52} />
        <h1 className="text-2xl font-bold tracking-tight text-fg">{t("title")}</h1>
        <p className="text-sm text-fg-muted">{t("subtitle")}</p>
      </div>

      {!supported ? (
        <ErrorCard title={t("unsupported")} />
      ) : (
        <div className="flex w-full max-w-[860px] flex-col gap-5 lg:flex-row">
          <div className="relative flex aspect-video min-h-[220px] flex-1 items-center justify-center overflow-hidden rounded-2xl border border-border bg-canvas">
            {phase === "ready" && result ? (
              <video src={result.url} controls playsInline className="size-full object-contain" />
            ) : (
              <video ref={previewRef} muted playsInline className={cn("size-full object-contain", phase === "recording" || phase === "requesting" ? "" : "hidden")} />
            )}
            {(phase === "idle" || phase === "error") && (
              <div className="flex flex-col items-center gap-2 text-fg-subtle">
                {source === "screen" ? <Monitor className="size-10" aria-hidden /> : <VideoIcon className="size-10" aria-hidden />}
                <span className="text-sm">{t("preview")}</span>
              </div>
            )}
            {phase === "recording" && (
              <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-[#0A0A0BB3] px-3 py-1 text-xs font-medium text-white">
                <Circle className="size-2.5 animate-pulse fill-danger text-danger" aria-hidden />
                {t("recording")} · {formatTime(elapsed)}
              </div>
            )}
          </div>

          <div className="flex w-full flex-col gap-5 rounded-2xl border border-border bg-surface p-5 lg:w-[320px]">
            {phase === "ready" && result ? (
              <>
                <p className="text-sm text-fg-muted">{t("ready", { duration: formatTime(result.duration), size: formatBytes(result.blob.size) })}</p>
                <button type="button" onClick={download} className="flex h-10 items-center justify-center gap-2 rounded-sm bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                  <Download className="size-4" aria-hidden />
                  {te("download", { ext: result.blob.type.includes("mp4") ? "MP4" : "WebM" })}
                </button>
                <button type="button" onClick={openInEditor} className="flex h-10 items-center justify-center gap-2 rounded-sm border border-border-strong bg-surface-2 px-4 text-sm font-medium text-fg hover:bg-surface-3">
                  <Scissors className="size-4 text-fg-muted" aria-hidden />
                  {te("openEditor")}
                </button>
                <button type="button" onClick={discard} className="flex h-10 items-center justify-center gap-2 rounded-sm px-4 text-sm font-medium text-fg-muted hover:bg-surface-2 hover:text-danger">
                  <Trash2 className="size-4" aria-hidden />
                  {t("discard")}
                </button>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-2.5">
                  <span className="text-[13px] font-medium text-fg-muted">{t("source")}</span>
                  <Segmented
                    label={t("source")}
                    value={source}
                    onChange={setSource}
                    options={[
                      { value: "screen", label: t("screen") },
                      { value: "camera", label: t("camera") },
                    ]}
                  />
                </div>
                <ToggleRow label={t("mic")} hint={t("micHint")} checked={mic} onCheckedChange={setMic} disabled={phase === "recording"} />
                {error && <p role="alert" className="text-xs text-danger">{error}</p>}
                {phase === "recording" ? (
                  <button type="button" onClick={stop} className="flex h-11 items-center justify-center gap-2 rounded-sm bg-danger px-4 text-sm font-semibold text-danger-fg hover:bg-danger/90">
                    <Square className="size-4 fill-current" aria-hidden />
                    {t("stop")} · {formatTime(elapsed)}
                  </button>
                ) : (
                  <button type="button" onClick={start} disabled={phase === "requesting"} className="flex h-11 items-center justify-center gap-2 rounded-sm bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                    {source === "camera" ? <Mic className="size-4" aria-hidden /> : <Circle className="size-4 fill-current" aria-hidden />}
                    {t("start")}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
