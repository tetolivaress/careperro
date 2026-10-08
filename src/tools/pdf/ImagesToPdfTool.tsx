"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, FileImage, Plus, X } from "lucide-react";
import { DropZone, ErrorCard, ExportBar, ProcessingCard, Segmented, SettingsGroup, ToolShell } from "@/components/shell";
import { Slider } from "@/components/ui/slider";
import { IconTile } from "@/components/ui/icon-tile";
import { formatBytes } from "@/lib/formatBytes";
import { downloadBlob } from "@/lib/download";
import { takeFiles } from "@/lib/fileHandoff";
import { useToolShellStore } from "@/stores/toolShell";
import { useSessionStore } from "@/stores/session";
import { useCurrentTool } from "@/tools/useCurrentTool";
import { getPdfWorker, newJobId, progressProxy } from "./worker-client";
import { prepareImage } from "./images";
import type { ImagesToPdfOptions, Progress } from "@/workers/pdf.worker";

interface Item {
  id: string;
  file: File;
  url: string;
}

let n = 0;
const nextId = () => `img${(n += 1)}`;

/** Images → one PDF, one image per page. */
export default function ImagesToPdfTool() {
  const t = useTranslations("pdf.images");
  const te = useTranslations("pdf.export");
  const ts = useTranslations("shell");
  const tool = useCurrentTool();
  const [items, setItems] = useState<Item[]>(() => (takeFiles() ?? []).map((file) => ({ id: nextId(), file, url: URL.createObjectURL(file) })));
  const [pageSize, setPageSize] = useState<ImagesToPdfOptions["pageSize"]>("a4");
  const [orientation, setOrientation] = useState<ImagesToPdfOptions["orientation"]>("auto");
  const [margin, setMargin] = useState(24);
  const [status, setStatus] = useState<"idle" | "processing" | "error">("idle");
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Blob | null>(null);
  const jobRef = useRef<string | null>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const setShellFile = useToolShellStore((s) => s.setFile);
  const recordProcessed = useSessionStore((s) => s.recordProcessed);
  const total = useMemo(() => items.reduce((a, i) => a + i.file.size, 0), [items]);

  useEffect(() => {
    if (items.length === 0) setShellFile(null);
    else setShellFile({ name: items.length === 1 ? items[0].file.name : t("images", { count: items.length }), meta: formatBytes(total) });
  }, [items, total, setShellFile, t]);

  useEffect(() => () => items.forEach((i) => URL.revokeObjectURL(i.url)), [items]);

  const add = (files: File[]) => {
    setItems((list) => [...list, ...files.map((file) => ({ id: nextId(), file, url: URL.createObjectURL(file) }))]);
    setResult(null);
  };
  const remove = (id: string) => {
    setItems((list) => list.filter((i) => i.id !== id));
    setResult(null);
  };
  const move = (id: string, dir: -1 | 1) => {
    setItems((list) => {
      const i = list.findIndex((x) => x.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setResult(null);
  };
  const reset = () => {
    if (jobRef.current) void getPdfWorker().cancel(jobRef.current);
    setItems([]);
    setResult(null);
    setStatus("idle");
    setError(null);
  };

  const run = async () => {
    if (items.length === 0) return;
    setStatus("processing");
    setPercent(0);
    const jobId = newJobId();
    jobRef.current = jobId;
    try {
      const prepared = [];
      for (let i = 0; i < items.length; i++) {
        try {
          prepared.push(await prepareImage(items[i].file, items[i].file.type === "image/jpeg"));
        } catch {
          throw new Error(t("unsupported", { name: items[i].file.name }));
        }
        setPercent(((i + 1) / items.length) * 40);
      }
      const buf = await getPdfWorker().imagesToPdf(
        jobId,
        prepared.map((p) => ({ bytes: p.bytes, type: p.type })),
        { pageSize, orientation, margin },
        progressProxy((p: Progress) => setPercent(40 + (p.done / Math.max(p.total, 1)) * 60)),
      );
      const blob = new Blob([buf], { type: "application/pdf" });
      setResult(blob);
      setStatus("idle");
      recordProcessed();
      downloadBlob(blob, "images.pdf");
      toast.success(ts("export.saved"), { description: "images.pdf" });
    } catch (e) {
      if (e instanceof Error && e.name === "Cancelled") {
        setStatus("idle");
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    } finally {
      jobRef.current = null;
    }
  };

  if (!tool) return null;

  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-5 py-10 md:px-12">
        <div className="flex max-w-[640px] flex-col items-center gap-3 text-center">
          <IconTile icon={tool.icon} size={52} />
          <h1 className="text-2xl font-bold tracking-tight text-fg">{tool.name}</h1>
          <p className="text-sm text-fg-muted">{tool.description}</p>
        </div>
        <DropZone className="w-full max-w-[640px]" accept={tool.accept} multiple maxSize={tool.maxSize} title={t("dropTitle")} subtitle={t("dropSubtitle")} formats={["JPG", "PNG", "WebP", "HEIC"]} onFiles={add} />
      </div>
    );
  }

  const toolbar = (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-8 items-center justify-center rounded-xs bg-surface-2 text-fg-muted">
          <FileImage className="size-4" aria-hidden />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-semibold text-fg">{t("images", { count: items.length })}</span>
          <span className="truncate text-xs text-fg-subtle">{formatBytes(total)}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => addRef.current?.click()}
        className="flex h-9 items-center gap-2 rounded-sm border border-border-strong bg-surface-2 px-3 text-[13px] font-medium text-fg hover:bg-surface-3"
      >
        <Plus className="size-4 text-fg-muted" aria-hidden />
        {ts("toolbar.addFiles")}
        <input
          ref={addRef}
          type="file"
          multiple
          accept={tool.accept.join(",")}
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            if (e.target.files) add(Array.from(e.target.files));
            e.target.value = "";
          }}
        />
      </button>
    </>
  );

  const preview = (
    <div className="relative h-full w-full">
      <div className="scrollbar-thin grid h-full w-full content-start gap-4 overflow-y-auto p-5 md:p-8" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
        {items.map((item, i) => (
          <div key={item.id} className="group relative flex flex-col gap-1.5">
            <div className="relative overflow-hidden rounded-sm border border-border-strong bg-white" style={{ aspectRatio: pageSize === "letter" ? "612 / 792" : pageSize === "a4" ? "595 / 842" : "1 / 1" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.url} alt="" className="absolute inset-0 size-full object-contain" style={{ padding: `${margin / 8}%` }} draggable={false} />
              <span className="absolute top-1.5 left-1.5 flex size-5 items-center justify-center rounded-full bg-[#0A0A0BB3] text-[10px] font-semibold text-white">{i + 1}</span>
            </div>
            <div className="flex items-center justify-between px-0.5">
              <span className="truncate text-[11px] text-fg-subtle">{item.file.name}</span>
              <div className="flex gap-0.5">
                <button type="button" onClick={() => move(item.id, -1)} disabled={i === 0} aria-label={t("moveUp", { name: item.file.name })} className="rounded-xs p-1 text-fg-subtle hover:bg-surface-2 hover:text-fg disabled:opacity-30">
                  <ChevronUp className="size-3.5" aria-hidden />
                </button>
                <button type="button" onClick={() => move(item.id, 1)} disabled={i === items.length - 1} aria-label={t("moveDown", { name: item.file.name })} className="rounded-xs p-1 text-fg-subtle hover:bg-surface-2 hover:text-fg disabled:opacity-30">
                  <ChevronDown className="size-3.5" aria-hidden />
                </button>
                <button type="button" onClick={() => remove(item.id)} aria-label={t("remove", { name: item.file.name })} className="rounded-xs p-1 text-fg-subtle hover:bg-danger-soft hover:text-danger">
                  <X className="size-3.5" aria-hidden />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {status === "processing" && (
        <div className="absolute inset-0 flex items-center justify-center bg-scrim p-4">
          <ProcessingCard title={t("converting")} percent={percent} eta={te("eta")} onCancel={() => jobRef.current && getPdfWorker().cancel(jobRef.current)} />
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-scrim p-4">
          <ErrorCard title={te("errorTitle")} body={error ?? undefined} onChooseAnother={reset} />
        </div>
      )}
    </div>
  );

  const settings = (
    <>
      <SettingsGroup label={t("pageSize")}>
        <Segmented
          label={t("pageSize")}
          value={pageSize}
          onChange={setPageSize}
          options={[
            { value: "a4", label: t("a4") },
            { value: "letter", label: t("letter") },
            { value: "fit", label: t("fit") },
          ]}
        />
      </SettingsGroup>
      {pageSize !== "fit" && (
        <SettingsGroup label={t("orientation")}>
          <Segmented
            label={t("orientation")}
            value={orientation}
            onChange={setOrientation}
            options={[
              { value: "auto", label: t("auto") },
              { value: "portrait", label: t("portrait") },
              { value: "landscape", label: t("landscape") },
            ]}
          />
        </SettingsGroup>
      )}
      <SettingsGroup label={t("margin")} value={`${margin} pt`}>
        <Slider min={0} max={72} step={4} value={[margin]} onValueChange={(v) => setMargin(Array.isArray(v) ? v[0] : v)} aria-label={t("margin")} />
      </SettingsGroup>
    </>
  );

  return (
    <ToolShell
      toolbar={toolbar}
      preview={preview}
      settings={settings}
      footer={
        <ExportBar
          before={total}
          after={result?.size}
          downloadLabel={te("download")}
          downloadDisabled={status === "processing"}
          onDownload={() => (result ? downloadBlob(result, "images.pdf") : run())}
          onReset={reset}
        />
      }
    />
  );
}
