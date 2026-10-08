"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { zipSync } from "fflate";
import { FileText, Images } from "lucide-react";
import { DropZone, ErrorCard, ExportBar, ProcessingCard, Segmented, SettingsGroup, ToolShell } from "@/components/shell";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { IconTile } from "@/components/ui/icon-tile";
import { formatBytes } from "@/lib/formatBytes";
import { downloadBlob, splitFileName } from "@/lib/download";
import { takeFiles } from "@/lib/fileHandoff";
import { useToolShellStore } from "@/stores/toolShell";
import { useSessionStore } from "@/stores/session";
import { useCurrentTool } from "@/tools/useCurrentTool";
import { openPdf, renderPage, type OpenedPdf } from "./render";
import { parseRanges } from "./ranges";
import { useThumbnail } from "./thumbnails";

type Format = "png" | "jpeg";
const SCALES = [1, 2, 3] as const;

function Thumb({ opened, index }: { opened: OpenedPdf; index: number }) {
  const { ref, url } = useThumbnail(opened.doc, "to-images", index, 160);
  const size = opened.sizes[index];
  return (
    <div ref={ref} className="relative overflow-hidden rounded-sm border border-border-strong bg-white" style={{ aspectRatio: `${size.width} / ${size.height}` }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="absolute inset-0 size-full" draggable={false} />
      ) : (
        <span className="absolute inset-0 animate-pulse bg-surface-3/60" aria-hidden />
      )}
      <span className="absolute top-1.5 left-1.5 flex size-5 items-center justify-center rounded-full bg-[#0A0A0BB3] text-[10px] font-semibold text-white">{index + 1}</span>
    </div>
  );
}

/** PDF → PNG/JPG per page, zipped. Rendering happens through pdfjs' own worker; the zip is built with fflate. */
export default function PdfToImagesTool() {
  const t = useTranslations("pdf");
  const ts = useTranslations("shell");
  const tool = useCurrentTool();
  const [file, setFile] = useState<File | null>(() => takeFiles()?.[0] ?? null);
  const [opened, setOpened] = useState<OpenedPdf | null>(null);
  const [format, setFormat] = useState<Format>("png");
  const [scale, setScale] = useState<(typeof SCALES)[number]>(2);
  const [quality, setQuality] = useState(90);
  const [range, setRange] = useState("");
  const [status, setStatus] = useState<"idle" | "processing" | "error">("idle");
  const [progress, setProgress] = useState({ n: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ blob: Blob; count: number } | null>(null);
  const cancelRef = useRef(false);
  const setShellFile = useToolShellStore((s) => s.setFile);
  const recordProcessed = useSessionStore((s) => s.recordProcessed);

  useEffect(() => {
    if (!file) {
      setShellFile(null);
      return;
    }
    let active = true;
    let doc: OpenedPdf | null = null;
    file
      .arrayBuffer()
      .then(openPdf)
      .then((o) => {
        if (!active) return void o.destroy();
        doc = o;
        setOpened(o);
        setShellFile({ name: file.name, meta: `${t("toolbar.pages", { count: o.pageCount })} · ${formatBytes(file.size)}` });
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(e instanceof Error && /password|encrypt/i.test(e.message) ? t("export.encrypted") : t("export.corrupt"));
        setStatus("error");
      });
    return () => {
      active = false;
      void doc?.destroy();
      setShellFile(null);
    };
  }, [file, setShellFile, t]);

  const reset = () => {
    cancelRef.current = true;
    setFile(null);
    setOpened(null);
    setResult(null);
    setError(null);
    setStatus("idle");
    setRange("");
  };

  const pageIndices = (): number[] | null => {
    if (!opened) return null;
    if (!range.trim()) return Array.from({ length: opened.pageCount }, (_, i) => i);
    const groups = parseRanges(range, opened.pageCount);
    return groups ? [...new Set(groups.flat())].sort((a, b) => a - b) : null;
  };

  const run = async () => {
    if (!opened || !file) return;
    const indices = pageIndices();
    if (!indices) {
      toast.error(t("split.invalid", { max: opened.pageCount }));
      return;
    }
    cancelRef.current = false;
    setStatus("processing");
    setResult(null);
    const files: Record<string, Uint8Array> = {};
    const { base } = splitFileName(file.name);
    const ext = format === "png" ? "png" : "jpg";
    const pad = String(opened.pageCount).length;
    try {
      for (let i = 0; i < indices.length; i++) {
        if (cancelRef.current) throw new Error("cancelled");
        setProgress({ n: i + 1, total: indices.length });
        const blob = await renderPage(opened.doc, indices[i] + 1, { scale, type: format === "png" ? "image/png" : "image/jpeg", quality: quality / 100 }).promise;
        files[`${base}-${String(indices[i] + 1).padStart(pad, "0")}.${ext}`] = new Uint8Array(await blob.arrayBuffer());
      }
      const zipped = zipSync(files, { level: 0 });
      const blob = new Blob([zipped as BlobPart], { type: "application/zip" });
      setResult({ blob, count: indices.length });
      setStatus("idle");
      recordProcessed();
      downloadBlob(blob, `${base}-images.zip`);
      toast.success(ts("export.saved"), { description: `${base}-images.zip` });
    } catch (e) {
      if (e instanceof Error && e.message === "cancelled") {
        setStatus("idle");
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  };

  if (!tool) return null;

  if (!file) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-5 py-10 md:px-12">
        <div className="flex max-w-[640px] flex-col items-center gap-3 text-center">
          <IconTile icon={tool.icon} size={52} />
          <h1 className="text-2xl font-bold tracking-tight text-fg">{tool.name}</h1>
          <p className="text-sm text-fg-muted">{tool.description}</p>
        </div>
        <DropZone className="w-full max-w-[640px]" accept={tool.accept} maxSize={tool.maxSize} title={t("drop.title")} subtitle={t("drop.subtitle")} formats={["PDF"]} onFiles={(f) => setFile(f[0])} />
      </div>
    );
  }

  const count = pageIndices()?.length ?? 0;
  const dpi = 72 * scale;

  const toolbar = (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-8 items-center justify-center rounded-xs bg-surface-2 text-fg-muted">
          <FileText className="size-4" aria-hidden />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-semibold text-fg">{file.name}</span>
          <span className="truncate text-xs text-fg-subtle">
            {opened ? t("toolbar.pages", { count: opened.pageCount }) : "…"} · {formatBytes(file.size)}
          </span>
        </div>
      </div>
    </>
  );

  const preview = (
    <div className="relative h-full w-full">
      {opened && (
        <div className="scrollbar-thin grid h-full w-full content-start gap-4 overflow-y-auto p-5 md:p-8" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
          {Array.from({ length: opened.pageCount }, (_, i) => (
            <Thumb key={i} opened={opened} index={i} />
          ))}
        </div>
      )}
      {status === "processing" && (
        <div className="absolute inset-0 flex items-center justify-center bg-scrim p-4">
          <ProcessingCard
            title={t("toImages.rendering", { n: progress.n, total: progress.total })}
            percent={progress.total ? (progress.n / progress.total) * 100 : 0}
            eta={t("export.eta")}
            onCancel={() => {
              cancelRef.current = true;
            }}
            file={{ icon: <Images className="size-[18px]" aria-hidden />, name: file.name, meta: formatBytes(file.size) }}
          />
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-scrim p-4">
          <ErrorCard title={t("export.errorTitle")} body={error ?? undefined} onChooseAnother={reset} />
        </div>
      )}
    </div>
  );

  const settings = (
    <>
      <SettingsGroup label={t("toImages.format")}>
        <Segmented
          label={t("toImages.format")}
          value={format}
          onChange={setFormat}
          options={[
            { value: "png", label: "PNG" },
            { value: "jpeg", label: "JPG" },
          ]}
        />
      </SettingsGroup>
      <SettingsGroup label={t("toImages.scale")} value={t("toImages.scaleHint", { dpi })}>
        <Segmented
          label={t("toImages.scale")}
          value={String(scale) as "1" | "2" | "3"}
          onChange={(v) => setScale(Number(v) as 1 | 2 | 3)}
          options={SCALES.map((s) => ({ value: String(s) as "1" | "2" | "3", label: `${s}×` }))}
        />
      </SettingsGroup>
      {format === "jpeg" && (
        <SettingsGroup label={t("toImages.quality")} value={`${quality}%`}>
          <Slider min={30} max={100} step={1} value={[quality]} onValueChange={(v) => setQuality(Array.isArray(v) ? v[0] : v)} aria-label={t("toImages.quality")} />
        </SettingsGroup>
      )}
      <SettingsGroup label={t("toImages.pages")}>
        <Input value={range} onChange={(e) => setRange(e.target.value)} placeholder={`${t("toImages.allPages")} · ${t("toImages.rangePlaceholder")}`} aria-label={t("toImages.pages")} />
        <p className="text-xs text-fg-subtle">{t("toImages.estimate", { count, format: format.toUpperCase() })}</p>
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
          before={file.size}
          after={result?.blob.size}
          downloadLabel={t("toImages.download")}
          downloadDisabled={!opened || status === "processing"}
          onDownload={() => (result ? downloadBlob(result.blob, `${splitFileName(file.name).base}-images.zip`) : run())}
          onReset={reset}
        />
      }
    />
  );
}
