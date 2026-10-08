"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Download, Mic, Pause, Play, Scissors, Square, Trash2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { downloadBlob } from "@/lib/download";
import { formatBytes } from "@/lib/formatBytes";
import { stashFiles } from "@/lib/fileHandoff";
import { useSessionStore } from "@/stores/session";
import { useToolShellStore } from "@/stores/toolShell";
import { useCurrentTool } from "@/tools/useCurrentTool";
import { useToolCopy } from "@/tools/copy";
import { cn } from "@/lib/utils";
import { formatTime } from "./engine";

type RecState = "idle" | "requesting" | "recording" | "paused" | "stopped" | "denied" | "unsupported";

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c));
}

function extFor(mime: string): string {
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

/** Voice recorder: MediaRecorder + live level meter. The take can be downloaded or opened in the audio editor. */
export default function RecorderTool() {
  const t = useTranslations("audio.recorder");
  const router = useRouter();
  const tool = useCurrentTool();
  const toolCopy = useToolCopy();
  const setShellFile = useToolShellStore((s) => s.setFile);
  const recordProcessed = useSessionStore((s) => s.recordProcessed);

  const [state, setState] = useState<RecState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [take, setTake] = useState<{ file: File; url: string; n: number } | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const meterRef = useRef<HTMLDivElement>(null);
  const startedAtRef = useRef(0);
  const accumulatedRef = useRef(0);
  const takeCountRef = useRef(0);

  const stopStream = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;
    if (meterRef.current) meterRef.current.style.setProperty("--level", "0");
  };

  useEffect(() => {
    return () => {
      stopStream();
      if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    };
  }, []);

  useEffect(() => {
    if (take) {
      setShellFile({ name: take.file.name, meta: `${formatTime(elapsed)} · ${formatBytes(take.file.size)}` });
      return () => URL.revokeObjectURL(take.url);
    }
    setShellFile(null);
  }, [take, elapsed, setShellFile]);

  // Elapsed timer while recording.
  useEffect(() => {
    if (state !== "recording") return;
    const id = setInterval(() => setElapsed(accumulatedRef.current + (performance.now() - startedAtRef.current) / 1000), 200);
    return () => clearInterval(id);
  }, [state]);

  const start = async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setState("unsupported");
      return;
    }
    setState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true } : { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      navigator.mediaDevices
        .enumerateDevices()
        .then((list) => setDevices(list.filter((d) => d.kind === "audioinput")))
        .catch(() => undefined);

      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        meterRef.current?.style.setProperty("--level", Math.min(1, rms * 3).toFixed(3));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();

      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const type = rec.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        const n = ++takeCountRef.current;
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
        const file = new File([blob], `recording-${stamp}.${extFor(type)}`, { type });
        setTake({ file, url: URL.createObjectURL(blob), n });
        setState("stopped");
        stopStream();
      };
      recorderRef.current = rec;
      accumulatedRef.current = 0;
      startedAtRef.current = performance.now();
      setElapsed(0);
      rec.start(250);
      setState("recording");
    } catch (err) {
      stopStream();
      setState(err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError") ? "denied" : "idle");
      if (!(err instanceof DOMException && err.name === "NotAllowedError")) toast.error(String(err));
    }
  };

  const pause = () => {
    const rec = recorderRef.current;
    if (!rec || rec.state !== "recording") return;
    rec.pause();
    accumulatedRef.current += (performance.now() - startedAtRef.current) / 1000;
    setState("paused");
  };

  const resume = () => {
    const rec = recorderRef.current;
    if (!rec || rec.state !== "paused") return;
    rec.resume();
    startedAtRef.current = performance.now();
    setState("recording");
  };

  const stop = () => {
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") return;
    if (rec.state === "recording") accumulatedRef.current += (performance.now() - startedAtRef.current) / 1000;
    setElapsed(accumulatedRef.current);
    rec.stop();
  };

  const discard = () => {
    setTake(null);
    setElapsed(0);
    setState("idle");
  };

  if (!tool) return null;
  const copy = toolCopy(tool);
  const recording = state === "recording";
  const paused = state === "paused";

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-5 py-10 md:px-12">
      <div className="flex max-w-[560px] flex-col items-center gap-3 text-center">
        <span className="flex size-13 items-center justify-center rounded-[14px] border border-border bg-surface-2 text-fg">
          <Mic className="size-[22px]" strokeWidth={1.75} aria-hidden />
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-fg">{copy.name}</h1>
        <p className="text-sm text-fg-muted">{t("subtitle")}</p>
      </div>

      <div className="flex w-full max-w-[560px] flex-col gap-5 rounded-2xl border border-border bg-surface p-6">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-[13px] font-medium text-fg-muted">
            <span className={cn("size-2 rounded-full", recording ? "animate-pulse bg-danger" : paused ? "bg-warning" : "bg-fg-subtle")} aria-hidden />
            {recording ? t("recording") : paused ? t("paused") : t("ready")}
          </span>
          <span className="font-mono text-2xl font-bold text-fg tabular-nums">{formatTime(elapsed, true)}</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-fg-subtle">{t("level")}</span>
          <div ref={meterRef} aria-hidden className="relative h-2.5 w-full overflow-hidden rounded-full bg-surface-3 [--level:0]">
            <div className="absolute inset-y-0 start-0 rounded-full bg-primary transition-[width] duration-75" style={{ width: "calc(var(--level) * 100%)" }} />
          </div>
        </div>

        {devices.length > 1 && !recording && !paused && (
          <label className="flex flex-col gap-1.5 text-xs text-fg-subtle">
            {t("mic")}
            <select
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              className="h-9 rounded-sm border border-border bg-surface-2 px-3 text-[13px] text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <option value="">{t("defaultMic")}</option>
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || d.deviceId.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
        )}

        {state === "denied" && <p className="rounded-sm border border-danger/20 bg-danger-soft p-3 text-xs text-fg">{t("denied")}</p>}
        {state === "unsupported" && <p className="rounded-sm border border-danger/20 bg-danger-soft p-3 text-xs text-fg">{t("unsupported")}</p>}
        {state === "requesting" && <p className="text-xs text-fg-subtle">{t("permission")}</p>}

        {take && state === "stopped" && (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-3">
            <div className="flex items-center justify-between text-[13px]">
              <span className="font-medium text-fg">{t("take", { n: take.n })}</span>
              <span className="text-fg-subtle">{formatBytes(take.file.size)}</span>
            </div>
            <audio controls src={take.url} className="w-full" preload="metadata" />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-2">
          {(state === "idle" || state === "denied" || state === "requesting") && (
            <button
              type="button"
              onClick={() => void start()}
              disabled={state === "requesting"}
              className="flex h-11 items-center gap-2 rounded-full bg-danger px-5 text-sm font-semibold text-danger-fg hover:bg-danger/90 disabled:opacity-60"
            >
              <Mic className="size-4" aria-hidden />
              {t("start")}
            </button>
          )}
          {(recording || paused) && (
            <>
              <button
                type="button"
                onClick={recording ? pause : resume}
                className="flex h-11 items-center gap-2 rounded-full border border-border-strong bg-surface-2 px-5 text-sm font-medium text-fg hover:bg-surface-3"
              >
                {recording ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
                {recording ? t("pause") : t("resume")}
              </button>
              <button type="button" onClick={stop} className="flex h-11 items-center gap-2 rounded-full bg-fg px-5 text-sm font-semibold text-background hover:bg-fg/90">
                <Square className="size-4" aria-hidden />
                {t("stop")}
              </button>
            </>
          )}
          {take && state === "stopped" && (
            <>
              <button
                type="button"
                onClick={discard}
                className="flex h-10 items-center gap-2 rounded-sm border border-border px-3 text-[13px] font-medium text-fg-muted hover:bg-surface-2 hover:text-fg"
              >
                <Trash2 className="size-4" aria-hidden />
                {t("discard")}
              </button>
              <button
                type="button"
                onClick={() => void start()}
                className="flex h-10 items-center gap-2 rounded-sm border border-border-strong bg-surface-2 px-3 text-[13px] font-medium text-fg hover:bg-surface-3"
              >
                <Mic className="size-4 text-fg-muted" aria-hidden />
                {t("newTake")}
              </button>
              <button
                type="button"
                onClick={() => {
                  stashFiles([take.file]);
                  router.push("/audio/trim");
                }}
                className="flex h-10 items-center gap-2 rounded-sm border border-border-strong bg-surface-2 px-3 text-[13px] font-medium text-fg hover:bg-surface-3"
              >
                <Scissors className="size-4 text-fg-muted" aria-hidden />
                {t("openInEditor")}
              </button>
              <button
                type="button"
                onClick={() => {
                  downloadBlob(take.file, take.file.name);
                  recordProcessed();
                  toast.success(t("download"), { description: take.file.name });
                }}
                className="flex h-10 items-center gap-2 rounded-sm bg-primary px-4 text-[13px] font-semibold text-primary-foreground hover:bg-primary/90"
              >
                <Download className="size-4" aria-hidden />
                {t("download")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
