"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { zipSync } from "fflate";
import { ChevronDown, ChevronUp, FileText, Files, Hash, LayoutGrid, Minimize2, Plus, RotateCw, Signature, SplitSquareHorizontal, Stamp, Trash2, Undo2, X, type LucideIcon } from "lucide-react";
import { DoneCard, DropZone, ErrorCard, ExportBar, ProcessingCard, Segmented, SettingsGroup, SizeReadout, ToggleRow, ToolShell } from "@/components/shell";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { IconTile } from "@/components/ui/icon-tile";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/formatBytes";
import { downloadBlob, splitFileName } from "@/lib/download";
import { takeFiles } from "@/lib/fileHandoff";
import { useToolShellStore } from "@/stores/toolShell";
import { useSessionStore } from "@/stores/session";
import { useCurrentTool } from "@/tools/useCurrentTool";
import { useToolCopy } from "@/tools/copy";
import type { AssembleOptions, Position9, Progress, SourceInput } from "@/workers/pdf.worker";
import { openPdf } from "./render";
import { getPdfWorker, newJobId, progressProxy } from "./worker-client";
import { prepareImage } from "./images";
import { chunkPages, parseRanges } from "./ranges";
import { clearSourceThumbnails, clearThumbnailCache } from "./thumbnails";
import { ORGANIZER_TABS, uid, useOrganizerStore, type OrganizerTab, type SourceDoc } from "./store";
import { PageGrid } from "./PageGrid";
import { PagePlacer } from "./PagePlacer";
import { SignaturePad } from "./SignaturePad";
import { ConfirmDialog } from "./ConfirmDialog";

const TAB_ICONS: Record<OrganizerTab, LucideIcon> = {
  organize: LayoutGrid,
  merge: Files,
  split: SplitSquareHorizontal,
  watermark: Stamp,
  "page-numbers": Hash,
  sign: Signature,
  compress: Minimize2,
};

const POSITIONS: Position9[] = ["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"];

function isTab(v: string | undefined): v is OrganizerTab {
  return !!v && (ORGANIZER_TABS as string[]).includes(v);
}

async function openSource(file: File): Promise<SourceDoc> {
  const bytes = await file.arrayBuffer();
  const opened = await openPdf(bytes);
  return { id: uid("s"), name: file.name, size: file.size, bytes, pageCount: opened.pageCount, opened };
}

const btn = "flex h-9 items-center gap-2 rounded-sm border border-border-strong bg-surface-2 px-3 text-[13px] font-medium text-fg hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";
const btnIcon = "size-4 text-fg-muted";

function PositionGrid({ value, onChange, rows = 3, label }: { value: string; onChange: (p: Position9) => void; rows?: 2 | 3; label: string }) {
  const list = rows === 3 ? POSITIONS : POSITIONS.filter((p) => p[0] !== "m");
  return (
    <div role="radiogroup" aria-label={label} className="grid w-[88px] grid-cols-3 gap-1 rounded-sm border border-border bg-surface-2 p-1">
      {list.map((p) => (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={value === p}
          aria-label={p}
          onClick={() => onChange(p)}
          className={cn("flex h-6 items-center justify-center rounded-xs", value === p ? "bg-primary text-primary-foreground" : "hover:bg-surface-3")}
        >
          <span className={cn("size-1.5 rounded-full", value === p ? "bg-primary-foreground" : "bg-fg-subtle")} aria-hidden />
        </button>
      ))}
    </div>
  );
}

/**
 * One editor for merge, split, organize, compress, watermark, page numbers and signing.
 * The initial tab comes from the route slug; all edits are applied as one pipeline on export.
 */
export default function PdfOrganizer() {
  const t = useTranslations("pdf");
  const ts = useTranslations("shell");
  const tool = useCurrentTool();
  const toolCopy = useToolCopy();
  const s = useOrganizerStore();
  const setShellFile = useToolShellStore((st) => st.setFile);
  const recordProcessed = useSessionStore((st) => st.recordProcessed);
  const addRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const sigUploadRef = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState<"clear" | "delete" | null>(null);
  const [sigMode, setSigMode] = useState<"draw" | "upload">("draw");
  const [handed] = useState(() => takeFiles());
  // Route slug → initial tab (captured once per mount).
  const [initialTab] = useState<OrganizerTab>(() => (tool && isTab(tool.slug) ? tool.slug : "organize"));

  useEffect(() => {
    useOrganizerStore.getState().setTab(initialTab);
    return () => {
      useOrganizerStore.getState().reset();
      clearThumbnailCache();
    };
  }, [initialTab]);

  const addFiles = async (files: File[]) => {
    const pdfs = files.filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    if (pdfs.length === 0) return;
    const docs: SourceDoc[] = [];
    for (const f of pdfs) {
      try {
        docs.push(await openSource(f));
      } catch (e) {
        const msg = e instanceof Error && /password|encrypt/i.test(e.message) ? t("export.encrypted") : t("export.corrupt");
        toast.error(`${f.name}: ${msg}`);
      }
    }
    if (docs.length) s.addSources(docs);
  };

  // Files handed over from the home drop zone.
  useEffect(() => {
    if (handed?.length) void addFiles(handed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handed]);

  const totalSize = s.sources.reduce((a, d) => a + d.size, 0);
  useEffect(() => {
    if (s.sources.length === 0) {
      setShellFile(null);
      return;
    }
    setShellFile({
      name: s.sources.length === 1 ? s.sources[0].name : t("toolbar.files", { count: s.sources.length }),
      meta: `${t("toolbar.pages", { count: s.pages.length })} · ${formatBytes(totalSize)}`,
    });
  }, [s.sources, s.pages.length, totalSize, setShellFile, t]);

  const cancel = () => {
    if (s.jobId) void getPdfWorker().cancel(s.jobId);
  };

  const run = async (download: boolean, override?: Partial<AssembleOptions>) => {
    if (s.pages.length === 0) return;
    const jobId = newJobId();
    s.setStatus("processing", { progress: { phase: "copy", percent: 0 }, jobId, result: null });
    const onProgress = progressProxy((p: Progress) => {
      const weights: Record<Progress["phase"], [number, number]> = { copy: [0, 50], watermark: [50, 65], numbers: [65, 72], signature: [72, 75], compress: [75, 95], save: [95, 100] };
      const [a, b] = weights[p.phase];
      const percent = a + (p.total ? p.done / p.total : 0) * (b - a);
      useOrganizerStore.getState().setStatus("processing", { progress: { phase: p.phase, percent } });
    });
    try {
      const api = getPdfWorker();
      const sources: SourceInput[] = s.sources.map((d) => ({ id: d.id, bytes: d.bytes.slice(0) }));
      const options: AssembleOptions = {
        watermark: s.watermark.enabled ? { ...s.watermark, image: s.watermark.image ? { bytes: s.watermark.image.bytes.slice(0), type: s.watermark.image.type } : undefined } : undefined,
        pageNumbers: s.numbers.enabled ? s.numbers : undefined,
        signature:
          s.signature && s.signature.pageId
            ? { image: { bytes: s.signature.bytes.slice(0), type: "png" }, pageIndex: s.pages.findIndex((p) => p.id === s.signature!.pageId), x: s.signature.x, y: s.signature.y, width: s.signature.width, aspect: s.signature.aspect }
            : undefined,
        compress: s.compress.enabled ? { quality: s.compress.quality, maxDimension: s.compress.maxDimension } : undefined,
        ...override,
      };
      const baseName = s.sources.length === 1 ? splitFileName(s.sources[0].name).base : "merged";
      const pages = s.pages.map((p) => ({ sourceId: p.sourceId, pageIndex: p.pageIndex, rotation: p.rotation }));

      let result: NonNullable<typeof s.result>;
      const splitActive = s.tab === "split";
      const groups = splitActive ? resolveGroups() : null;
      if (splitActive && !groups) {
        toast.error(t("split.invalid", { max: s.pages.length }));
        s.setStatus("ready", { jobId: null });
        return;
      }
      if (splitActive && groups && s.split.output === "single") {
        const subset = [...new Set(groups.flat())].sort((a, b) => a - b).map((i) => pages[i]);
        const out = await api.assemble(jobId, sources, subset, options, onProgress);
        const blob = new Blob([out.bytes], { type: "application/pdf" });
        result = { blob, name: `${baseName}-pages.pdf`, size: blob.size, kind: "pdf", imagesTouched: out.imagesTouched };
      } else if (splitActive && groups) {
        const out = await api.assemble(jobId, sources, pages, options, onProgress);
        const parts = await api.splitGroups(jobId, out.bytes, groups, onProgress);
        const files: Record<string, Uint8Array> = {};
        const pad = String(parts.length).length;
        parts.forEach((buf, i) => {
          files[`${baseName}-${String(i + 1).padStart(pad, "0")}.pdf`] = new Uint8Array(buf);
        });
        const blob = new Blob([zipSync(files, { level: 0 }) as BlobPart], { type: "application/zip" });
        result = { blob, name: `${baseName}-split.zip`, size: blob.size, kind: "zip", files: parts.length };
      } else {
        const out = await api.assemble(jobId, sources, pages, options, onProgress);
        const blob = new Blob([out.bytes], { type: "application/pdf" });
        const suffix = s.tab === "compress" || options.compress ? "compressed" : s.tab === "merge" ? "merged" : "edited";
        result = { blob, name: `${baseName}-${suffix}.pdf`, size: blob.size, kind: "pdf", imagesTouched: out.imagesTouched };
      }
      s.setStatus(download ? "done" : "ready", { result, jobId: null, progress: null });
      if (download) {
        downloadBlob(result.blob, result.name);
        recordProcessed();
        toast.success(ts("export.saved"), { description: result.name });
      }
    } catch (e) {
      if (e instanceof Error && (e.name === "Cancelled" || e.message === "cancelled")) {
        s.setStatus("ready", { jobId: null, progress: null });
        return;
      }
      const msg = e instanceof Error && e.message === "offscreen-canvas-unsupported" ? t("compress.unsupported") : e instanceof Error ? e.message : String(e);
      s.setStatus("error", { error: msg, jobId: null, progress: null });
    }
  };

  function resolveGroups(): number[][] | null {
    const n = s.pages.length;
    if (s.split.mode === "every") return chunkPages(n, 1);
    if (s.split.mode === "everyN") return chunkPages(n, s.split.chunk);
    return parseRanges(s.split.ranges, n);
  }

  const onLogo = async (file: File) => {
    try {
      const prep = await prepareImage(file);
      s.setWatermark({ kind: "image", image: { url: URL.createObjectURL(file), bytes: prep.bytes, type: prep.type, aspect: prep.height / prep.width, name: file.name } });
    } catch {
      toast.error(t("images.unsupported", { name: file.name }));
    }
  };

  const applySignature = async (blob: Blob, aspect: number) => {
    const prep = await prepareImage(blob);
    const pageId = [...s.selected][0] ?? s.pages[0]?.id ?? null;
    s.setSignature({ url: URL.createObjectURL(blob), bytes: prep.bytes, aspect, pageId, x: 0.6, y: 0.78, width: 0.3 });
  };

  if (!tool) return null;
  const copy = toolCopy(tool);

  // ───────── Empty state ─────────
  if (s.sources.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-5 py-10 md:px-12">
        <div className="flex max-w-[640px] flex-col items-center gap-3 text-center">
          <IconTile icon={tool.icon} size={52} />
          <h1 className="text-2xl font-bold tracking-tight text-fg">{copy.name}</h1>
          <p className="text-sm text-fg-muted">{copy.description}</p>
        </div>
        <DropZone
          className="w-full max-w-[640px]"
          accept={["application/pdf", ".pdf"]}
          multiple
          maxSize={tool.maxSize}
          title={s.tab === "merge" ? t("drop.titleMany") : t("drop.title")}
          subtitle={t("drop.subtitle")}
          formats={["PDF"]}
          onFiles={(files) => void addFiles(files)}
        />
      </div>
    );
  }

  // ───────── Toolbar ─────────
  const toolbar = (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-xs bg-surface-2 text-fg-muted">
          <FileText className="size-4" aria-hidden />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-semibold text-fg">{s.sources.length === 1 ? s.sources[0].name : t("toolbar.files", { count: s.sources.length })}</span>
          <span className="truncate text-xs text-fg-subtle">
            {t("toolbar.pages", { count: s.pages.length })} · {formatBytes(totalSize)}
            {s.selected.size > 0 ? ` · ${t("toolbar.selected", { count: s.selected.size })}` : ""}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="hidden lg:block">
          <Segmented
            size="sm"
            label={t("toolbar.zoom")}
            value={s.thumbSize}
            onChange={s.setThumbSize}
            options={[
              { value: "sm", label: "S" },
              { value: "md", label: "M" },
              { value: "lg", label: "L" },
            ]}
            className="w-[120px]"
          />
        </div>
        <button type="button" onClick={() => (s.selected.size === s.pages.length ? s.clearSelection() : s.selectAll())} className={cn(btn, "hidden md:flex")}>
          {s.selected.size === s.pages.length ? t("toolbar.clearSelection") : t("toolbar.selectAll")}
        </button>
        <button type="button" onClick={() => addRef.current?.click()} className={btn}>
          <Plus className={btnIcon} aria-hidden />
          <span className="hidden sm:inline">{t("toolbar.addFiles")}</span>
          <input
            ref={addRef}
            type="file"
            multiple
            accept="application/pdf,.pdf"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              if (e.target.files) void addFiles(Array.from(e.target.files));
              e.target.value = "";
            }}
          />
        </button>
      </div>
    </>
  );

  // ───────── Preview ─────────
  const phaseLabel = s.progress ? t(`export.phase.${s.progress.phase}` as Parameters<typeof t>[0]) : t("export.processing");
  const preview = (
    <div className="relative h-full w-full">
      {s.tab === "sign" && s.signature ? <PagePlacer /> : <PageGrid />}
      {s.status === "processing" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-scrim p-4">
          <ProcessingCard title={phaseLabel} percent={s.progress?.percent ?? 0} eta={t("export.eta")} onCancel={cancel} />
        </div>
      )}
      {s.status === "done" && s.result && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-scrim p-4">
          <DoneCard
            title={s.result.kind === "zip" ? t("export.doneSplit", { count: s.result.files ?? 0 }) : t("export.doneTitle")}
            meta={`${s.result.name} · ${formatBytes(s.result.size)}`}
            onAnother={s.clearResult}
            anotherLabel={t("export.back")}
            onDownload={() => downloadBlob(s.result!.blob, s.result!.name)}
          >
            {s.result.kind === "pdf" && <SizeReadout before={totalSize} after={s.result.size} caption={ts("readout.result")} />}
          </DoneCard>
        </div>
      )}
      {s.status === "error" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-scrim p-4">
          <ErrorCard title={t("export.errorTitle")} body={s.error ?? undefined} onChooseAnother={() => s.setStatus("ready", { error: null })} />
        </div>
      )}
    </div>
  );

  // ───────── Tabs ─────────
  const tabs = (
    <div role="tablist" aria-label={ts("toolbar.settings")} className="scrollbar-thin flex overflow-x-auto">
      {ORGANIZER_TABS.map((tab) => {
        const Icon = TAB_ICONS[tab];
        const active = s.tab === tab;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => s.setTab(tab)}
            className={cn(
              "flex min-w-[59px] flex-1 flex-col items-center gap-1.5 border-b-2 px-1 pt-3 pb-2.5 text-[11px] whitespace-nowrap focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
              active ? "border-primary font-semibold text-fg" : "border-transparent font-medium text-fg-muted hover:text-fg",
            )}
          >
            <Icon className={cn("size-[18px]", active ? "text-primary" : "text-fg-subtle")} aria-hidden />
            {t(`tabs.${tab}`)}
          </button>
        );
      })}
    </div>
  );

  // ───────── Settings per tab ─────────
  let settings: ReactNode;
  switch (s.tab) {
    case "organize":
      settings = (
        <>
          <p className="text-xs text-fg-subtle">{t("organize.hint")}</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => s.rotateMany("all")} className={btn}><RotateCw className={btnIcon} aria-hidden />{t("organize.rotateAll")}</button>
            <button type="button" onClick={s.reverse} className={btn}><Undo2 className={btnIcon} aria-hidden />{t("organize.reverse")}</button>
            <button type="button" disabled={s.selected.size === 0} onClick={() => s.rotateMany([...s.selected])} className={btn}><RotateCw className={btnIcon} aria-hidden />{t("organize.rotateSelected")}</button>
            <button type="button" disabled={s.selected.size === 0} onClick={() => setConfirm("delete")} className={cn(btn, "text-danger hover:bg-danger-soft")}><Trash2 className="size-4" aria-hidden />{t("organize.deleteSelected")}</button>
          </div>
          <button type="button" onClick={s.restore} className={btn}>{t("organize.restore")}</button>
        </>
      );
      break;
    case "merge":
      settings = (
        <>
          <p className="text-xs text-fg-subtle">{t("merge.hint")}</p>
          <SettingsGroup label={t("merge.files")} value={String(s.sources.length)}>
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {s.sources.map((d, i) => (
                <li key={d.id} className="flex items-center gap-2 px-3 py-2 text-[13px]">
                  <FileText className="size-4 shrink-0 text-fg-muted" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-fg">{d.name}</span>
                  <span className="shrink-0 text-xs text-fg-subtle">{t("toolbar.pages", { count: d.pageCount })}</span>
                  <button type="button" onClick={() => s.moveSource(d.id, -1)} disabled={i === 0} aria-label={t("merge.moveUp", { name: d.name })} className="rounded-xs p-1 text-fg-subtle hover:text-fg disabled:opacity-30"><ChevronUp className="size-3.5" aria-hidden /></button>
                  <button type="button" onClick={() => s.moveSource(d.id, 1)} disabled={i === s.sources.length - 1} aria-label={t("merge.moveDown", { name: d.name })} className="rounded-xs p-1 text-fg-subtle hover:text-fg disabled:opacity-30"><ChevronDown className="size-3.5" aria-hidden /></button>
                  <button type="button" onClick={() => { clearSourceThumbnails(d.id); s.removeSource(d.id); }} aria-label={t("merge.remove", { name: d.name })} className="rounded-xs p-1 text-fg-subtle hover:text-danger"><X className="size-3.5" aria-hidden /></button>
                </li>
              ))}
            </ul>
          </SettingsGroup>
          <button type="button" onClick={() => addRef.current?.click()} className={btn}><Plus className={btnIcon} aria-hidden />{t("toolbar.addFiles")}</button>
        </>
      );
      break;
    case "split": {
      const groups = resolveGroups();
      settings = (
        <>
          <SettingsGroup label={t("split.mode")}>
            <Segmented label={t("split.mode")} value={s.split.mode} onChange={(mode) => s.setSplit({ mode })} options={[{ value: "ranges", label: t("split.ranges") }, { value: "every", label: t("split.every") }, { value: "everyN", label: t("split.everyN") }]} />
          </SettingsGroup>
          {s.split.mode === "ranges" && (
            <SettingsGroup label={t("split.ranges")}>
              <Input value={s.split.ranges} onChange={(e) => s.setSplit({ ranges: e.target.value })} placeholder={t("split.rangesPlaceholder")} aria-label={t("split.ranges")} aria-invalid={s.split.ranges.trim() !== "" && !groups} />
              <p className={cn("text-xs", s.split.ranges.trim() && !groups ? "text-danger" : "text-fg-subtle")}>{s.split.ranges.trim() && !groups ? t("split.invalid", { max: s.pages.length }) : t("split.rangesHint")}</p>
            </SettingsGroup>
          )}
          {s.split.mode === "everyN" && (
            <SettingsGroup label={t("split.chunk")} value={String(s.split.chunk)}>
              <Slider min={1} max={Math.max(2, s.pages.length)} step={1} value={[s.split.chunk]} onValueChange={(v) => s.setSplit({ chunk: Array.isArray(v) ? v[0] : v })} aria-label={t("split.chunk")} />
            </SettingsGroup>
          )}
          <SettingsGroup label={t("split.zip")}>
            <Segmented label={t("split.zip")} value={s.split.output} onChange={(output) => s.setSplit({ output })} options={[{ value: "zip", label: ".zip" }, { value: "single", label: "PDF" }]} />
            <p className="text-xs text-fg-subtle">{s.split.output === "single" ? t("split.single") : groups ? t("split.preview", { count: groups.length }) : t("split.zip")}</p>
          </SettingsGroup>
        </>
      );
      break;
    }
    case "watermark": {
      const wm = s.watermark;
      settings = (
        <>
          <ToggleRow label={t("watermark.enable")} checked={wm.enabled} onCheckedChange={(enabled) => s.setWatermark({ enabled })} />
          <SettingsGroup label={t("watermark.kind")}>
            <Segmented label={t("watermark.kind")} value={wm.kind} onChange={(kind) => s.setWatermark({ kind, enabled: true })} options={[{ value: "text", label: t("watermark.text") }, { value: "image", label: t("watermark.image") }]} />
          </SettingsGroup>
          {wm.kind === "text" ? (
            <SettingsGroup label={t("watermark.text")}>
              <div className="flex gap-2">
                <Input value={wm.text ?? ""} onChange={(e) => s.setWatermark({ text: e.target.value, enabled: true })} placeholder={t("watermark.textPlaceholder")} aria-label={t("watermark.text")} className="flex-1" />
                <input type="color" value={wm.color} onChange={(e) => s.setWatermark({ color: e.target.value })} aria-label={t("watermark.color")} className="size-9 cursor-pointer rounded-sm border border-border bg-surface-2 p-1" />
              </div>
            </SettingsGroup>
          ) : (
            <SettingsGroup label={t("watermark.image")}>
              <div className="flex items-center gap-3">
                {wm.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={wm.image.url} alt="" className="size-12 rounded-sm border border-border object-contain" />
                )}
                <button type="button" onClick={() => logoRef.current?.click()} className={btn}>{wm.image ? t("watermark.replaceImage") : t("watermark.uploadImage")}</button>
                <input ref={logoRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={(e) => { const f = e.target.files?.[0]; if (f) void onLogo(f); e.target.value = ""; }} />
              </div>
            </SettingsGroup>
          )}
          <div className="flex items-start justify-between gap-4">
            <SettingsGroup label={t("watermark.position")}>
              <PositionGrid label={t("watermark.position")} value={wm.position} onChange={(position) => s.setWatermark({ position })} />
            </SettingsGroup>
            <div className="pt-6">
              <ToggleRow label={t("watermark.tile")} checked={wm.position === "tile"} onCheckedChange={(tile) => s.setWatermark({ position: tile ? "tile" : "mc" })} />
            </div>
          </div>
          <SettingsGroup label={t("watermark.opacity")} value={`${Math.round(wm.opacity * 100)}%`}>
            <Slider min={5} max={100} step={1} value={[Math.round(wm.opacity * 100)]} onValueChange={(v) => s.setWatermark({ opacity: (Array.isArray(v) ? v[0] : v) / 100 })} aria-label={t("watermark.opacity")} />
          </SettingsGroup>
          <SettingsGroup label={t("watermark.size")} value={wm.kind === "text" ? `${wm.size} pt` : `${Math.round(wm.size * 100)}%`}>
            {wm.kind === "text" ? (
              <Slider min={8} max={200} step={1} value={[wm.size]} onValueChange={(v) => s.setWatermark({ size: Array.isArray(v) ? v[0] : v })} aria-label={t("watermark.size")} />
            ) : (
              <Slider min={5} max={100} step={1} value={[Math.round(Math.min(wm.size, 1) * 100)]} onValueChange={(v) => s.setWatermark({ size: (Array.isArray(v) ? v[0] : v) / 100 })} aria-label={t("watermark.size")} />
            )}
          </SettingsGroup>
          <SettingsGroup label={t("watermark.rotation")} value={`${wm.rotation}°`}>
            <Slider min={-90} max={90} step={5} value={[wm.rotation]} onValueChange={(v) => s.setWatermark({ rotation: Array.isArray(v) ? v[0] : v })} aria-label={t("watermark.rotation")} />
          </SettingsGroup>
        </>
      );
      break;
    }
    case "page-numbers": {
      const pn = s.numbers;
      settings = (
        <>
          <ToggleRow label={t("numbers.enable")} checked={pn.enabled} onCheckedChange={(enabled) => s.setNumbers({ enabled })} />
          <SettingsGroup label={t("numbers.position")}>
            <PositionGrid rows={2} label={t("numbers.position")} value={pn.position} onChange={(position) => s.setNumbers({ position: position as typeof pn.position, enabled: true })} />
          </SettingsGroup>
          <SettingsGroup label={t("numbers.format")}>
            <Segmented label={t("numbers.format")} value={pn.format} onChange={(format) => s.setNumbers({ format, enabled: true })} options={[{ value: "n", label: t("numbers.formatN") }, { value: "n-of-total", label: t("numbers.formatTotal") }, { value: "page-n", label: t("numbers.formatPage") }]} />
          </SettingsGroup>
          <div className="grid grid-cols-2 gap-4">
            <SettingsGroup label={t("numbers.start")}>
              <Input type="number" min={0} value={pn.start} onChange={(e) => s.setNumbers({ start: Math.max(0, parseInt(e.target.value || "0", 10)) })} aria-label={t("numbers.start")} />
            </SettingsGroup>
            <SettingsGroup label={t("numbers.size")} value={`${pn.size} pt`}>
              <Slider min={7} max={24} step={1} value={[pn.size]} onValueChange={(v) => s.setNumbers({ size: Array.isArray(v) ? v[0] : v })} aria-label={t("numbers.size")} />
            </SettingsGroup>
          </div>
        </>
      );
      break;
    }
    case "sign": {
      const sig = s.signature;
      settings = (
        <>
          {!sig ? (
            <>
              <Segmented label={t("tabs.sign")} value={sigMode} onChange={setSigMode} options={[{ value: "draw", label: t("sign.draw") }, { value: "upload", label: t("sign.upload") }]} />
              {sigMode === "draw" ? (
                <SignaturePad onUse={(blob, aspect) => void applySignature(blob, aspect)} />
              ) : (
                <div className="flex flex-col gap-2.5">
                  <p className="text-xs text-fg-subtle">{t("sign.uploadHint")}</p>
                  <button type="button" onClick={() => sigUploadRef.current?.click()} className={btn}>{t("sign.chooseImage")}</button>
                  <input
                    ref={sigUploadRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    tabIndex={-1}
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!f) return;
                      try {
                        const prep = await prepareImage(f);
                        await applySignature(new Blob([prep.bytes], { type: "image/png" }), prep.height / prep.width);
                      } catch {
                        toast.error(t("images.unsupported", { name: f.name }));
                      }
                    }}
                  />
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={sig.url} alt="" className="h-10 max-w-[120px] rounded-xs bg-white object-contain px-1" />
                <span className="flex-1 text-xs text-fg-muted">{sig.pageId ? t("sign.placed", { n: s.pages.findIndex((p) => p.id === sig.pageId) + 1 }) : t("sign.none")}</span>
                <button type="button" onClick={() => s.setSignature(null)} aria-label={t("sign.remove")} className="rounded-xs p-1 text-fg-subtle hover:text-danger"><X className="size-4" aria-hidden /></button>
              </div>
              <SettingsGroup label={t("sign.page")}>
                <select
                  value={sig.pageId ?? ""}
                  onChange={(e) => s.patchSignature({ pageId: e.target.value || null })}
                  aria-label={t("sign.page")}
                  className="h-9 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] text-fg"
                >
                  {s.pages.map((p, i) => (
                    <option key={p.id} value={p.id}>{t("page.label", { n: i + 1 })}</option>
                  ))}
                </select>
              </SettingsGroup>
              <SettingsGroup label={t("sign.size")} value={`${Math.round(sig.width * 100)}%`}>
                <Slider min={5} max={80} step={1} value={[Math.round(sig.width * 100)]} onValueChange={(v) => s.patchSignature({ width: (Array.isArray(v) ? v[0] : v) / 100 })} aria-label={t("sign.size")} />
              </SettingsGroup>
            </>
          )}
        </>
      );
      break;
    }
    case "compress": {
      const c = s.compress;
      settings = (
        <>
          <ToggleRow label={t("compress.enable")} hint={t("compress.hint")} checked={c.enabled} onCheckedChange={(enabled) => s.setCompress({ enabled })} />
          <SettingsGroup label={t("compress.quality")} value={`${Math.round(c.quality * 100)}%`}>
            <Slider min={30} max={95} step={1} value={[Math.round(c.quality * 100)]} onValueChange={(v) => s.setCompress({ quality: (Array.isArray(v) ? v[0] : v) / 100, enabled: true })} aria-label={t("compress.quality")} />
          </SettingsGroup>
          <SettingsGroup label={t("compress.maxDimension")} value={`${c.maxDimension} px`}>
            <Slider min={600} max={4000} step={100} value={[c.maxDimension]} onValueChange={(v) => s.setCompress({ maxDimension: Array.isArray(v) ? v[0] : v, enabled: true })} aria-label={t("compress.maxDimension")} />
          </SettingsGroup>
          <button type="button" disabled={s.status === "processing"} onClick={() => void run(false, { compress: { quality: c.quality, maxDimension: c.maxDimension } })} className={btn}>
            {s.status === "processing" ? t("compress.estimating") : t("compress.estimate")}
          </button>
          <div className="mt-auto flex flex-col gap-2">
            <SizeReadout before={totalSize} after={s.result?.kind === "pdf" ? s.result.size : undefined} />
            {s.result?.imagesTouched !== undefined && <p className="text-xs text-fg-subtle">{t("compress.result", { count: s.result.imagesTouched })}</p>}
          </div>
        </>
      );
      break;
    }
  }

  const downloadLabel = s.tab === "split" && s.split.output === "zip" ? t("export.downloadZip") : t("export.download");

  return (
    <>
      <ToolShell
        toolbar={toolbar}
        preview={preview}
        tabs={tabs}
        settings={settings}
        footer={
          <ExportBar
            before={totalSize}
            after={s.result?.kind === "pdf" ? s.result.size : undefined}
            downloadLabel={downloadLabel}
            downloadDisabled={s.status === "processing" || s.pages.length === 0}
            onDownload={() => (s.result && s.status !== "done" ? (downloadBlob(s.result.blob, s.result.name), recordProcessed()) : void run(true))}
            onReset={() => setConfirm("clear")}
          />
        }
      />
      <ConfirmDialog
        open={confirm === "clear"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t("confirm.clearTitle")}
        body={t("confirm.clearBody")}
        confirmLabel={t("confirm.clear")}
        cancelLabel={t("confirm.cancel")}
        onConfirm={() => {
          cancel();
          clearThumbnailCache();
          s.reset();
        }}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t("confirm.deleteTitle", { count: s.selected.size })}
        body={t("confirm.deleteBody")}
        confirmLabel={t("confirm.delete")}
        cancelLabel={t("confirm.cancel")}
        onConfirm={() => s.deletePages([...s.selected])}
      />
    </>
  );
}
