"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  AudioLines,
  Combine,
  FileAudio,
  FolderOpen,
  Gauge,
  Plus,
  Repeat,
  Scissors,
  Volume2,
  Waves,
  X,
} from "lucide-react";
import { DropZone, ErrorCard, ExportBar, ProcessingCard, Segmented, SettingsGroup, SizeReadout, ToggleRow, ToolShell } from "@/components/shell";
import type { ProcessingStep } from "@/components/shell";
import { downloadBlob, outputFileName } from "@/lib/download";
import { formatBytes } from "@/lib/formatBytes";
import { formatLabel } from "@/lib/fileTypes";
import { takeFiles } from "@/lib/fileHandoff";
import { useSessionStore } from "@/stores/session";
import { useToolShellStore } from "@/stores/toolShell";
import { useCurrentTool } from "@/tools/useCurrentTool";
import { useToolCopy } from "@/tools/copy";
import type { Analysis } from "@/workers/audio.worker";
import {
  BITRATES,
  DEFAULT_SETTINGS,
  analyzeBuffer,
  dbToGain,
  decodeFile,
  encodeBuffer,
  estimateBytes,
  formatDb,
  formatTime,
  isFfmpegLoaded,
  loadFfmpeg,
  normalizeGainFor,
  outputDuration,
  parseTime,
  renderPipeline,
  terminateFfmpeg,
  terminateWorker,
  type AudioFormat,
  type AudioSettings,
  type NormalizeMode,
} from "./engine";
import { StatRow, TabStrip, TimeField, ValueSlider, type TabDef } from "./controls";
import { Waveform, type WaveformHandle } from "./Waveform";

type Tab = "trim" | "volume" | "fade" | "speed" | "normalize" | "merge" | "convert";
const TAB_IDS: Tab[] = ["trim", "volume", "fade", "speed", "normalize", "merge", "convert"];
const TAB_ICONS: Record<Tab, TabDef<Tab>["icon"]> = {
  trim: Scissors,
  volume: Volume2,
  fade: Waves,
  speed: Gauge,
  normalize: AudioLines,
  merge: Combine,
  convert: Repeat,
};
const SPEED_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

interface Clip {
  id: string;
  file: File;
  buffer: AudioBuffer | null;
  url: string;
  error?: boolean;
}

type JobPhase = "idle" | "encoder" | "render" | "encode" | "done";
interface Job {
  phase: JobPhase;
  percent: number;
}

/** Wrapped so the React purity lint rule does not mistake an event handler for render. */
const clock = () => performance.now();

let clipCounter = 0;
const newClip = (file: File): Clip => ({ id: `clip-${++clipCounter}`, file, buffer: null, url: URL.createObjectURL(file) });

/** Downsampled mono peaks for the waveform (max of channels per bucket). Cheap enough on the main thread. */
function peaksOf(buffer: AudioBuffer, buckets = 1600): Float32Array {
  const out = new Float32Array(buckets);
  const step = buffer.length / buckets;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const ch = buffer.getChannelData(c);
    for (let b = 0; b < buckets; b++) {
      const start = Math.floor(b * step);
      const end = Math.min(ch.length, Math.floor((b + 1) * step));
      let max = 0;
      for (let i = start; i < end; i++) {
        const v = Math.abs(ch[i]);
        if (v > max) max = v;
      }
      if (max > out[b]) out[b] = max;
    }
  }
  return out;
}

/**
 * One audio editor for trim, volume, fade, speed, normalize, merge and convert.
 * The URL slug picks the initial tab; every tab's settings combine into a single export.
 */
export default function AudioEditor() {
  const t = useTranslations("audio");
  const tShell = useTranslations("shell");
  const tool = useCurrentTool();
  const toolCopy = useToolCopy();
  const setShellFile = useToolShellStore((s) => s.setFile);
  const setStatus = useToolShellStore((s) => s.setStatus);
  const recordProcessed = useSessionStore((s) => s.recordProcessed);

  const [clips, setClips] = useState<Clip[]>(() => (takeFiles() ?? []).map(newClip));
  const [activeId, setActiveId] = useState<string | null>(() => null);
  const [tab, setTab] = useState<Tab>(() => (tool && TAB_IDS.includes(tool.slug as Tab) ? (tool.slug as Tab) : "trim"));
  const [settings, setSettings] = useState<AudioSettings>(() => ({
    ...DEFAULT_SETTINGS,
    format: tool?.slug === "convert" ? "mp3" : "mp3",
    normalize: { ...DEFAULT_SETTINGS.normalize, enabled: tool?.slug === "normalize" },
  }));
  const [analysis, setAnalysis] = useState<{ key: string; data: Analysis } | null>(null);
  const [job, setJob] = useState<Job>({ phase: "idle", percent: 0 });
  const [result, setResult] = useState<{ size: number; seconds: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const waveRef = useRef<WaveformHandle>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  const active = clips.find((c) => c.id === activeId) ?? clips[0] ?? null;
  const buffer = active?.buffer ?? null;
  const duration = buffer?.duration ?? 0;
  const merge = tab === "merge" && clips.length > 1;
  const decodedBuffers = useMemo(() => clips.map((c) => c.buffer).filter((b): b is AudioBuffer => b !== null), [clips]);
  const allDecoded = clips.length > 0 && decodedBuffers.length === clips.length;
  const peaks = useMemo(() => (buffer ? peaksOf(buffer) : null), [buffer]);

  const update = useCallback((patch: Partial<AudioSettings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    setResult(null);
  }, []);

  // Decode clips that still lack a buffer (one at a time to bound memory spikes).
  useEffect(() => {
    const pending = clips.find((c) => !c.buffer && !c.error);
    if (!pending) return;
    let cancelled = false;
    decodeFile(pending.file)
      .then((decoded) => {
        if (cancelled) return;
        setClips((list) => list.map((c) => (c.id === pending.id ? { ...c, buffer: decoded } : c)));
      })
      .catch(() => {
        if (cancelled) return;
        setClips((list) => list.map((c) => (c.id === pending.id ? { ...c, error: true } : c)));
      });
    return () => {
      cancelled = true;
    };
  }, [clips]);

  // Release object URLs for clips that disappear, and the worker when the editor unmounts.
  const urlsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const live = new Set(clips.map((c) => c.url));
    for (const url of urlsRef.current) if (!live.has(url)) URL.revokeObjectURL(url);
    urlsRef.current = live;
  }, [clips]);
  useEffect(
    () => () => {
      for (const url of urlsRef.current) URL.revokeObjectURL(url);
      terminateWorker();
    },
    [],
  );

  // Shared shell header (mobile nav bar) + status.
  useEffect(() => {
    if (!active) {
      setShellFile(null);
      setStatus("empty");
      return;
    }
    const meta = buffer
      ? t("meta", {
          duration: formatTime(buffer.duration),
          format: formatLabel(active.file),
          size: formatBytes(active.file.size),
          rate: (buffer.sampleRate / 1000).toFixed(1),
          channels: buffer.numberOfChannels === 1 ? t("mono") : t("stereo"),
        })
      : `${formatLabel(active.file)} · ${formatBytes(active.file.size)}`;
    setShellFile({ name: active.file.name, meta });
    setStatus(job.phase === "idle" ? "done" : job.phase === "done" ? "done" : "processing");
  }, [active, buffer, job.phase, setShellFile, setStatus, t]);

  // Level analysis for the volume and normalize tabs (re-runs when the source range changes).
  const analysisKey = buffer ? `${active?.id}:${settings.trim?.start ?? 0}:${settings.trim?.end ?? duration}:${merge}` : "";
  useEffect(() => {
    if (!buffer || !analysisKey) return;
    if (tab !== "volume" && tab !== "normalize") return;
    let cancelled = false;
    const timer = setTimeout(() => {
      analyzeBuffer(buffer, merge ? null : settings.trim)
        .then((data) => {
          if (!cancelled) setAnalysis({ key: analysisKey, data });
        })
        .catch(() => undefined);
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [buffer, analysisKey, tab, merge, settings.trim]);

  const currentAnalysis = analysis?.key === analysisKey ? analysis.data : null;
  const normalizeGain = normalizeGainFor(currentAnalysis, settings.normalize.mode, settings.normalize.targetDb);
  const outDuration = outputDuration(merge ? decodedBuffers : buffer ? [buffer] : [], settings, merge);
  const estimate = estimateBytes(outDuration, settings, buffer?.numberOfChannels ?? 2, buffer?.sampleRate ?? 44_100);
  const inputBytes = merge ? clips.reduce((n, c) => n + c.file.size, 0) : (active?.file.size ?? 0);
  const formatUpper = settings.format.toUpperCase();
  const previewGain = dbToGain(settings.gainDb) * (settings.normalize.enabled ? normalizeGain : 1);

  const addFiles = (files: File[]) => {
    setClips((list) => [...list, ...files.map(newClip)]);
    setResult(null);
  };

  const removeClip = (id: string) => {
    setClips((list) => list.filter((c) => c.id !== id));
    if (activeId === id) setActiveId(null);
    setResult(null);
  };

  const moveClip = (id: string, dir: -1 | 1) => {
    setClips((list) => {
      const i = list.findIndex((c) => c.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setResult(null);
  };

  const reset = () => {
    abortRef.current?.abort();
    void terminateFfmpeg();
    setClips([]);
    setActiveId(null);
    setSettings({ ...DEFAULT_SETTINGS });
    setAnalysis(null);
    setJob({ phase: "idle", percent: 0 });
    setResult(null);
  };

  const cancel = () => {
    abortRef.current?.abort();
    void terminateFfmpeg();
    setJob({ phase: "idle", percent: 0 });
    toast.info(t("status.cancelled"));
  };

  const exportNow = async () => {
    if (!buffer || !active) return;
    if (merge && !allDecoded) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const started = clock();
    try {
      if (settings.format !== "wav" && !isFfmpegLoaded()) {
        setJob({ phase: "encoder", percent: 0 });
        await loadFfmpeg((ratio) => setJob({ phase: "encoder", percent: ratio * 100 }));
        if (controller.signal.aborted) return;
      }
      setJob({ phase: "render", percent: 5 });
      let normGain = normalizeGain;
      if (settings.normalize.enabled && !currentAnalysis) {
        const data = await analyzeBuffer(buffer, merge ? null : settings.trim);
        normGain = normalizeGainFor(data, settings.normalize.mode, settings.normalize.targetDb);
      }
      const rendered = await renderPipeline({
        buffers: merge ? decodedBuffers : [buffer],
        settings,
        merge,
        normalizeGain: normGain,
      });
      if (controller.signal.aborted) return;
      setJob({ phase: "encode", percent: 10 });
      const blob = await encodeBuffer(rendered, {
        format: settings.format,
        bitrate: settings.bitrate,
        signal: controller.signal,
        onProgress: (ratio) => setJob({ phase: "encode", percent: 10 + ratio * 90 }),
      });
      if (controller.signal.aborted) return;
      const seconds = (clock() - started) / 1000;
      const suffix = merge ? "merged" : tab === "convert" ? "converted" : "edited";
      const name = outputFileName(active.file.name, suffix, settings.format);
      downloadBlob(blob, name);
      setResult({ size: blob.size, seconds });
      setJob({ phase: "done", percent: 100 });
      recordProcessed(merge ? clips.length : 1);
      toast.success(t("export.saved"), { description: name });
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error(err);
      setJob({ phase: "idle", percent: 0 });
      toast.error(settings.format === "wav" ? String(err) : t("status.encoderError"));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  if (!tool) return null;
  const copy = toolCopy(tool);

  // ───────── Empty state ─────────
  if (clips.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-5 py-10 md:px-12">
        <div className="flex max-w-[640px] flex-col items-center gap-3 text-center">
          <span className="flex size-13 items-center justify-center rounded-[14px] border border-border bg-surface-2 text-fg">
            <TabIcon tab={tab} />
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-fg">{copy.name}</h1>
          <p className="text-sm text-fg-muted">{copy.description}</p>
        </div>
        <DropZone
          className="w-full max-w-[640px]"
          accept={tool.accept}
          multiple
          maxSize={tool.maxSize}
          title={tab === "merge" ? t("drop.titleMany") : t("drop.title")}
          subtitle={t("drop.subtitle")}
          formats={["MP3", "WAV", "OGG", "M4A", "FLAC"]}
          onFiles={(files) => {
            setClips(files.map(newClip));
            setActiveId(null);
            setResult(null);
          }}
        />
      </div>
    );
  }

  // ───────── Decode error ─────────
  if (active?.error) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <ErrorCard
          title={t("status.decodeError", { name: active.file.name })}
          body={t("status.decodeErrorBody")}
          onChooseAnother={reset}
        />
      </div>
    );
  }

  const tabs: TabDef<Tab>[] = TAB_IDS.map((id) => ({ id, label: t(`tabs.${id}`), icon: TAB_ICONS[id] }));

  const toolbar = (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-8 items-center justify-center rounded-xs bg-surface-2 text-fg-muted">
          <FileAudio className="size-4" aria-hidden />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-semibold text-fg">{active?.file.name}</span>
          <span className="truncate text-xs text-fg-subtle">
            {buffer
              ? t("meta", {
                  duration: formatTime(buffer.duration),
                  format: formatLabel(active!.file),
                  size: formatBytes(active!.file.size),
                  rate: (buffer.sampleRate / 1000).toFixed(1),
                  channels: buffer.numberOfChannels === 1 ? t("mono") : t("stereo"),
                })
              : tShell("status.processing")}
            {clips.length > 1 ? ` · ${clips.length}` : ""}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => addInputRef.current?.click()}
          className="flex h-9 items-center gap-2 rounded-sm border border-border-strong bg-surface-2 px-3 text-[13px] font-medium text-fg hover:bg-surface-3"
        >
          <Plus className="size-4 text-fg-muted" aria-hidden />
          {t("merge.add")}
        </button>
        <button
          type="button"
          onClick={reset}
          className="flex h-9 items-center gap-2 rounded-sm border border-border px-3 text-[13px] font-medium text-fg-muted hover:bg-surface-2 hover:text-fg"
        >
          <FolderOpen className="size-4" aria-hidden />
          {tShell("toolbar.chooseAnother")}
        </button>
      </div>
    </>
  );

  const busy = job.phase === "encoder" || job.phase === "render" || job.phase === "encode";
  const steps: ProcessingStep[] = [
    { label: t("status.stepDecode"), state: "done" },
    { label: t("status.stepRender"), state: job.phase === "render" ? "active" : job.phase === "encoder" ? "pending" : "done" },
    { label: t("status.stepEncode", { format: formatUpper }), state: job.phase === "encode" ? "active" : job.phase === "done" ? "done" : "pending" },
    { label: t("status.stepWrite"), state: job.phase === "done" ? "done" : "pending" },
  ];

  const preview = (
    <div className="relative h-full w-full">
      {buffer && active ? (
        <Waveform
          ref={waveRef}
          mediaUrl={active.url}
          peaks={peaks}
          duration={duration}
          trim={tab === "merge" ? null : settings.trim}
          onTrimChange={(range) => update({ trim: range })}
          speed={settings.speed}
          volume={previewGain}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-fg-muted">{tShell("status.processing")}</div>
      )}
      {busy && (
        <div className="absolute inset-0 flex items-center justify-center bg-scrim p-4">
          <ProcessingCard
            title={job.phase === "encoder" ? t("status.loadingEncoder") : job.phase === "render" ? t("status.rendering") : t("status.encoding", { format: formatUpper })}
            percent={job.percent}
            steps={steps}
            onCancel={cancel}
            file={active ? { icon: <FileAudio className="size-[18px]" aria-hidden />, name: active.file.name, meta: `${formatLabel(active.file)} · ${formatBytes(active.file.size)}` } : undefined}
          />
        </div>
      )}
    </div>
  );

  const settingsPanel = (
    <>
      {tab === "trim" && buffer && (
        <>
          <SettingsGroup label={t("trim.selection")} value={formatTime(settings.trim ? settings.trim.end - settings.trim.start : duration, true)}>
            <div className="flex gap-3">
              <TimeField
                label={t("trim.start")}
                value={settings.trim?.start ?? 0}
                format={(s) => formatTime(s, true)}
                parse={parseTime}
                onCommit={(s) => {
                  const end = settings.trim?.end ?? duration;
                  update({ trim: { start: Math.max(0, Math.min(s, end - 0.1)), end } });
                }}
              />
              <TimeField
                label={t("trim.end")}
                value={settings.trim?.end ?? duration}
                format={(s) => formatTime(s, true)}
                parse={parseTime}
                onCommit={(e) => {
                  const start = settings.trim?.start ?? 0;
                  update({ trim: { start, end: Math.min(duration, Math.max(e, start + 0.1)) } });
                }}
              />
            </div>
            <p className="text-xs text-fg-subtle">{t("trim.hint")}</p>
          </SettingsGroup>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => (settings.trim ? waveRef.current?.playRange(settings.trim.start, settings.trim.end) : waveRef.current?.play())}
              className="flex h-9 flex-1 items-center justify-center gap-2 rounded-sm border border-border-strong bg-surface-2 px-3 text-[13px] font-medium text-fg hover:bg-surface-3"
            >
              {t("player.playSelection")}
            </button>
            <button
              type="button"
              onClick={() => update({ trim: settings.trim ? null : { start: 0, end: duration } })}
              className="flex h-9 flex-1 items-center justify-center rounded-sm border border-border px-3 text-[13px] font-medium text-fg-muted hover:bg-surface-2 hover:text-fg"
            >
              {settings.trim ? t("trim.reset") : t("trim.selection")}
            </button>
          </div>
        </>
      )}

      {tab === "volume" && (
        <>
          <SettingsGroup label={t("volume.gain")} value={formatDb(settings.gainDb)}>
            <ValueSlider label={t("volume.gain")} value={settings.gainDb} min={-24} max={24} step={0.5} onChange={(v) => update({ gainDb: v })} />
            <p className="text-xs text-fg-subtle">{t("volume.hint")}</p>
          </SettingsGroup>
          <div className="rounded-lg border border-border">
            <StatRow label={t("volume.currentPeak")} value={currentAnalysis ? formatDb(currentAnalysis.peakDb) : t("normalize.analyzing")} />
            <StatRow
              label={t("volume.afterGain")}
              value={currentAnalysis ? formatDb(currentAnalysis.peakDb + settings.gainDb) : "—"}
              tone={currentAnalysis && currentAnalysis.peakDb + settings.gainDb > 0 ? "warn" : "default"}
            />
          </div>
          {currentAnalysis && currentAnalysis.peakDb + settings.gainDb > 0 && !settings.normalize.enabled && (
            <p className="rounded-sm border border-warning/30 bg-warning-soft p-3 text-xs text-fg">{t("volume.clipWarning")}</p>
          )}
        </>
      )}

      {tab === "fade" && (
        <>
          <SettingsGroup label={t("fade.in")} value={t("fade.seconds", { value: settings.fadeIn.toFixed(1) })}>
            <ValueSlider label={t("fade.in")} value={settings.fadeIn} min={0} max={Math.max(1, Math.min(30, outDuration / 2))} step={0.1} onChange={(v) => update({ fadeIn: v })} />
          </SettingsGroup>
          <SettingsGroup label={t("fade.out")} value={t("fade.seconds", { value: settings.fadeOut.toFixed(1) })}>
            <ValueSlider label={t("fade.out")} value={settings.fadeOut} min={0} max={Math.max(1, Math.min(30, outDuration / 2))} step={0.1} onChange={(v) => update({ fadeOut: v })} />
            <p className="text-xs text-fg-subtle">{t("fade.hint")}</p>
          </SettingsGroup>
        </>
      )}

      {tab === "speed" && (
        <>
          <SettingsGroup label={t("speed.rate")} value={`${settings.speed.toFixed(2)}×`}>
            <ValueSlider label={t("speed.rate")} value={settings.speed} min={0.5} max={3} step={0.05} onChange={(v) => update({ speed: v })} />
            <div role="group" aria-label={t("speed.presets")} className="flex flex-wrap gap-1.5">
              {SPEED_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => update({ speed: p })}
                  aria-pressed={settings.speed === p}
                  className="h-7 rounded-sm border border-border bg-surface-2 px-2.5 text-xs font-medium text-fg-muted hover:text-fg aria-pressed:border-primary-line aria-pressed:bg-primary-soft aria-pressed:text-primary"
                >
                  {p}×
                </button>
              ))}
            </div>
            <p className="text-xs text-fg-subtle">{t("speed.hint")}</p>
          </SettingsGroup>
          <div className="rounded-lg border border-border">
            <StatRow label={t("speed.newDuration")} value={formatTime(outDuration, true)} tone="primary" />
          </div>
        </>
      )}

      {tab === "normalize" && (
        <>
          <ToggleRow
            label={t("normalize.enable")}
            hint={t("normalize.enableHint")}
            checked={settings.normalize.enabled}
            onCheckedChange={(enabled) => update({ normalize: { ...settings.normalize, enabled } })}
          />
          <SettingsGroup label={t("normalize.mode")}>
            <Segmented<NormalizeMode>
              label={t("normalize.mode")}
              value={settings.normalize.mode}
              onChange={(mode) =>
                update({ normalize: { ...settings.normalize, mode, targetDb: mode === "peak" ? Math.min(settings.normalize.targetDb, 0) : Math.min(settings.normalize.targetDb, -6) } })
              }
              options={[
                { value: "peak", label: t("normalize.peak") },
                { value: "rms", label: t("normalize.rms") },
              ]}
            />
          </SettingsGroup>
          <SettingsGroup label={t("normalize.target")} value={formatDb(settings.normalize.targetDb)}>
            <ValueSlider
              label={t("normalize.target")}
              value={settings.normalize.targetDb}
              min={settings.normalize.mode === "peak" ? -12 : -30}
              max={settings.normalize.mode === "peak" ? 0 : -6}
              step={0.5}
              disabled={!settings.normalize.enabled}
              onChange={(v) => update({ normalize: { ...settings.normalize, targetDb: v } })}
            />
          </SettingsGroup>
          <div className="rounded-lg border border-border">
            <StatRow
              label={t("normalize.measured")}
              value={currentAnalysis ? formatDb(settings.normalize.mode === "peak" ? currentAnalysis.peakDb : currentAnalysis.rmsDb) : t("normalize.analyzing")}
            />
            <StatRow label={t("normalize.gainApplied")} value={settings.normalize.enabled && currentAnalysis ? formatDb(20 * Math.log10(normalizeGain)) : "—"} tone="primary" />
          </div>
        </>
      )}

      {tab === "merge" && (
        <>
          <SettingsGroup label={t("merge.clips")} value={`${clips.length}`}>
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {clips.map((c, i) => (
                <li key={c.id} className="flex items-center gap-2 px-2.5 py-2 text-[13px]">
                  <button
                    type="button"
                    onClick={() => setActiveId(c.id)}
                    aria-current={c.id === active?.id || undefined}
                    className="flex min-w-0 flex-1 flex-col text-start"
                  >
                    <span className="truncate font-medium text-fg">{c.file.name}</span>
                    <span className="text-xs text-fg-subtle">{c.buffer ? formatTime(c.buffer.duration) : c.error ? "!" : "…"}</span>
                  </button>
                  <button type="button" onClick={() => moveClip(c.id, -1)} disabled={i === 0} aria-label={t("merge.moveUp")} className="rounded-xs p-1 text-fg-subtle hover:text-fg disabled:opacity-30">
                    <ArrowUp className="size-3.5" aria-hidden />
                  </button>
                  <button type="button" onClick={() => moveClip(c.id, 1)} disabled={i === clips.length - 1} aria-label={t("merge.moveDown")} className="rounded-xs p-1 text-fg-subtle hover:text-fg disabled:opacity-30">
                    <ArrowDown className="size-3.5" aria-hidden />
                  </button>
                  <button type="button" onClick={() => removeClip(c.id)} aria-label={t("merge.remove")} className="rounded-xs p-1 text-fg-subtle hover:text-danger">
                    <X className="size-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => addInputRef.current?.click()}
              className="flex h-9 items-center justify-center gap-2 rounded-sm border border-dashed border-border-strong text-[13px] font-medium text-fg-muted hover:border-fg-subtle hover:text-fg"
            >
              <Plus className="size-4" aria-hidden />
              {t("merge.add")}
            </button>
            <p className="text-xs text-fg-subtle">{clips.length < 2 ? t("merge.needMore") : t("merge.hint")}</p>
          </SettingsGroup>
          <div className="rounded-lg border border-border">
            <StatRow label={t("merge.total")} value={formatTime(outDuration, true)} tone="primary" />
          </div>
        </>
      )}

      {tab === "convert" && (
        <>
          <SettingsGroup label={t("convert.format")}>
            <Segmented<AudioFormat>
              label={t("convert.format")}
              value={settings.format}
              onChange={(format) => update({ format })}
              options={[
                { value: "mp3", label: "MP3" },
                { value: "wav", label: "WAV" },
                { value: "ogg", label: "OGG" },
                { value: "m4a", label: "M4A" },
              ]}
            />
          </SettingsGroup>
          {settings.format === "wav" ? (
            <p className="text-xs text-fg-subtle">{t("convert.wavHint")}</p>
          ) : (
            <SettingsGroup label={t("convert.bitrate")} value={`${settings.bitrate} kbps`}>
              <Segmented<string>
                label={t("convert.bitrate")}
                size="sm"
                value={String(settings.bitrate)}
                onChange={(v) => update({ bitrate: Number(v) })}
                options={BITRATES.map((b) => ({ value: String(b), label: String(b) }))}
              />
              <p className="text-xs text-fg-subtle">{t("convert.bitrateHint")}</p>
            </SettingsGroup>
          )}
          <p className="text-xs text-fg-subtle">{t("convert.ffmpegNote")}</p>
        </>
      )}

      <div className="mt-auto">
        <SizeReadout before={inputBytes} after={result?.size ?? estimate} caption={result ? tShell("readout.result") : t("convert.estimated")} />
      </div>

      <input
        ref={addInputRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        multiple
        accept={tool.accept.join(",")}
        onChange={(e) => {
          if (e.target.files?.length) addFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
    </>
  );

  return (
    <ToolShell
      toolbar={toolbar}
      preview={preview}
      tabs={<TabStrip tabs={tabs} value={tab} onChange={setTab} />}
      settings={settingsPanel}
      footer={
        <ExportBar
          before={inputBytes}
          after={result?.size ?? estimate}
          status={result ? <span>{t("status.processedIn", { seconds: result.seconds.toFixed(1) })}</span> : undefined}
          downloadLabel={t("export.download", { format: formatUpper })}
          downloadDisabled={!buffer || busy || (merge && !allDecoded)}
          onDownload={() => void exportNow()}
          onReset={reset}
        />
      }
    />
  );
}

function TabIcon({ tab }: { tab: Tab }) {
  const Icon = TAB_ICONS[tab];
  return <Icon className="size-[22px]" strokeWidth={1.75} aria-hidden />;
}
