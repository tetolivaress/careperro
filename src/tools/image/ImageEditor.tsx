"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Images, Maximize, Minus, Plus } from "lucide-react";
import { DropZone, ExportBar, Segmented, SizeReadout } from "@/components/shell";
import { ToolShell } from "@/components/shell/ToolShell";
import { ErrorCard } from "@/components/shell/StatusCards";
import { IconTile } from "@/components/ui/icon-tile";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { formatBytes, savingsPercent } from "@/lib/formatBytes";
import { formatLabel } from "@/lib/fileTypes";
import { takeFiles } from "@/lib/fileHandoff";
import { useToolShellStore } from "@/stores/toolShell";
import { useCurrentTool } from "@/tools/useCurrentTool";
import { useToolCopy } from "@/tools/copy";
import { useImageEditor, selectedItem, type ViewMode } from "./store";
import { useImageEngine } from "./useImageEngine";
import { Preview } from "./Preview";
import { Filmstrip } from "./Filmstrip";
import { CompressPanel, ConvertPanel, CropPanel, FiltersPanel, ResizePanel, WatermarkPanel } from "./panels";
import { TABS, formatInfo, tabForSlug, type EditorTab } from "./types";

const TAB_ICONS: Record<EditorTab, Parameters<typeof getIcon>[0]> = {
  compress: "minimize-2",
  resize: "scaling",
  crop: "crop",
  watermark: "stamp",
  filters: "sliders-horizontal",
  convert: "repeat",
};

const PANELS: Record<EditorTab, () => React.JSX.Element> = {
  compress: CompressPanel,
  resize: ResizePanel,
  crop: CropPanel,
  watermark: WatermarkPanel,
  filters: FiltersPanel,
  convert: ConvertPanel,
};

/**
 * One editor for every image tool. The URL slug picks the initial tab; all tabs combine into a
 * single export pipeline (crop → rotate → resize → filters → watermark → encode) in a worker.
 */
export default function ImageEditor() {
  const t = useTranslations("image");
  const tool = useCurrentTool();
  const toolCopy = useToolCopy();
  const items = useImageEditor((s) => s.items);
  const item = useImageEditor(selectedItem);
  const tab = useImageEditor((s) => s.tab);
  const setTab = useImageEditor((s) => s.setTab);
  const addItems = useImageEditor((s) => s.addItems);
  const clear = useImageEditor((s) => s.clear);
  const resetSettings = useImageEditor((s) => s.resetSettings);
  const settings = useImageEditor((s) => s.settings);
  const exporting = useImageEditor((s) => s.exporting);
  const showConfirm = useImageEditor((s) => s.showConfirmClear);
  const setShowConfirm = useImageEditor((s) => s.setShowConfirmClear);
  const setShellFile = useToolShellStore((s) => s.setFile);
  const { originalUrl, exportSelected, exportAll } = useImageEngine();
  const addRef = useRef<HTMLInputElement>(null);
  const [initialised] = useState(() => {
    const handed = takeFiles();
    if (handed?.length) addItems(handed);
    if (tool) setTab(tabForSlug(tool.slug));
    return true;
  });
  const [exportError, setExportError] = useState<string | null>(null);

  // Mobile nav bar title/meta.
  useEffect(() => {
    if (!item) {
      setShellFile(null);
      return;
    }
    const dims = item.info ? `${item.info.width} × ${item.info.height} · ` : "";
    setShellFile({ name: item.file.name, meta: `${dims}${formatBytes(item.file.size)}` });
  }, [item, setShellFile]);

  // Fresh settings when the editor is left.
  useEffect(() => () => {
    clear();
    resetSettings();
  }, [clear, resetSettings]);

  if (!tool || !initialised) return null;
  const copy = toolCopy(tool);

  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-5 py-10 md:px-12">
        <div className="flex max-w-[640px] flex-col items-center gap-3 text-center">
          <IconTile icon={tool.icon} size={52} />
          <h1 className="text-2xl font-bold tracking-tight text-fg">{copy.name}</h1>
          <p className="text-sm text-fg-muted">{copy.description}</p>
        </div>
        <DropZone
          className="w-full max-w-[640px]"
          accept={tool.accept}
          multiple
          maxSize={tool.maxSize}
          title={t("editor.dropTitle")}
          subtitle={t("editor.dropSubtitle")}
          formats={["JPG", "PNG", "WebP", "AVIF", "GIF", "HEIC"]}
          onFiles={(files) => addItems(files)}
        />
      </div>
    );
  }

  const fmt = formatInfo(settings.compress.format);
  const before = items.reduce((n, i) => n + i.file.size, 0);
  const estimateAfter = item?.estimate?.bytes;
  const Panel = PANELS[tab];

  const tabs = (
    <div role="tablist" aria-label={t("editor.title")} className="flex">
      {TABS.map((id) => {
        const Icon = getIcon(TAB_ICONS[id]);
        const active = id === tab;
        return (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => setTab(id)}
            className={cn(
              "flex flex-1 flex-col items-center gap-1.5 border-b-2 px-1 pt-3 pb-2.5 text-[10px] font-medium md:text-[11px]",
              active ? "border-primary text-fg" : "border-transparent text-fg-muted hover:text-fg",
            )}
          >
            <Icon className={cn("size-[18px]", active ? "text-primary" : "text-fg-subtle")} aria-hidden />
            {t(`tabs.${id}`)}
          </button>
        );
      })}
    </div>
  );

  const toolbar = item && (
    <>
      <div className="flex min-w-0 items-center gap-3">
        {item.thumbUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.thumbUrl} alt="" className="size-8 shrink-0 rounded-[6px] object-cover" />
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-semibold text-fg">{item.file.name}</span>
          <span className="truncate text-xs text-fg-subtle">
            {item.info ? `${item.info.width} × ${item.info.height} · ` : ""}
            {formatLabel(item.file)} · {formatBytes(item.file.size)}
          </span>
        </div>
      </div>
      <ViewControls onAdd={() => addRef.current?.click()} />
    </>
  );

  const changes = item && (
    <div className="flex flex-col divide-y divide-border rounded-lg border border-border text-[13px]">
      <ChangeRow label={t("editor.dimensions")} from={item.info ? `${item.info.width} × ${item.info.height}` : "—"} to={item.estimate ? `${item.estimate.width} × ${item.estimate.height}` : undefined} unchanged={t("editor.unchanged")} />
      <ChangeRow label={t("editor.format")} from={formatLabel(item.file)} to={fmt.label} unchanged={t("editor.unchanged")} />
      <ChangeRow label={t("editor.metadata")} from="EXIF" to={settings.compress.stripMetadata || fmt.value !== "jpeg" || !item.info?.hasExif ? t("editor.metadataStripped") : t("editor.metadataKept")} unchanged={t("editor.unchanged")} />
    </div>
  );

  const settingsPane = (
    <>
      {item?.status === "error" ? (
        <ErrorCard title={t("editor.errorDecode", { name: item.file.name })} body={t("editor.errorDecodeBody")} onChooseAnother={() => useImageEditor.getState().removeItem(item.id)} className="max-w-none" />
      ) : (
        <Panel />
      )}
      <div className="mt-auto flex flex-col gap-4 pt-2">
        {changes}
        {item && <SizeReadout before={item.file.size} after={estimateAfter} caption={t("editor.estimatedOutput")} />}
      </div>
    </>
  );

  const doExport = async () => {
    setExportError(null);
    try {
      if (items.length > 1) {
        const r = await exportAll();
        if (r) toast.success(t("editor.totalSavings", { count: r.count, before: formatBytes(r.before), after: formatBytes(r.after), percent: savingsPercent(r.before, r.after) }));
      } else {
        const out = await exportSelected();
        if (out) toast.success(out.name, { description: `${formatBytes(out.blob.size)} · ${t("editor.processedIn", { seconds: (out.result.ms / 1000).toFixed(1) })}` });
      }
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    }
  };

  const footer = (
    <ExportBar
      before={items.length > 1 ? before : item?.file.size}
      after={items.length > 1 ? undefined : estimateAfter}
      status={
        exporting
          ? t("editor.exporting", { done: exporting.done, total: exporting.total })
          : item?.estimate
            ? t("editor.processedIn", { seconds: (item.estimate.ms / 1000).toFixed(1) })
            : undefined
      }
      downloadLabel={items.length > 1 ? t("editor.downloadAll") : t("editor.downloadFormat", { format: fmt.label })}
      downloadDisabled={!!exporting || !item || item.status === "loading" || item.status === "error"}
      onDownload={doExport}
      onReset={() => (items.length > 1 ? setShowConfirm(true) : clear())}
    />
  );

  return (
    <>
      <ToolShell
        toolbar={toolbar}
        preview={
          <div className="flex size-full flex-col">
            <div className="relative min-h-0 flex-1">
              <Preview originalUrl={item ? originalUrl(item.id) : null} />
            </div>
            <Filmstrip onAdd={() => addRef.current?.click()} />
          </div>
        }
        tabs={tabs}
        settings={settingsPane}
        footer={
          <>
            {exportError && (
              <div role="alert" className="border-t border-danger/20 bg-danger-soft px-5 py-2 text-xs text-fg">
                {exportError}
              </div>
            )}
            {footer}
          </>
        }
      />
      <input
        ref={addRef}
        type="file"
        accept={tool.accept.join(",")}
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          if (e.target.files?.length) addItems(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{t("editor.confirmClearTitle", { count: items.length })}</DialogTitle>
            <DialogDescription>{t("editor.confirmClearBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button type="button" onClick={() => setShowConfirm(false)} className="h-9 rounded-sm border border-border-strong bg-surface-2 px-4 text-[13px] font-medium text-fg hover:bg-surface-3">
              {t("editor.cancel")}
            </button>
            <button type="button" onClick={clear} className="h-9 rounded-sm bg-danger px-4 text-[13px] font-semibold text-danger-fg hover:bg-danger/90">
              {t("editor.confirmClearAction")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ChangeRow({ label, from, to, unchanged }: { label: string; from: string; to?: string; unchanged: string }) {
  const same = !to || to === from;
  return (
    <div className="flex h-10 items-center gap-2 px-3.5">
      <span className="w-24 shrink-0 text-fg-subtle">{label}</span>
      <span className="truncate text-fg-muted">{from}</span>
      {!same && (
        <>
          <span className="text-fg-subtle">→</span>
          <span className="truncate font-medium text-fg">{to}</span>
        </>
      )}
      {same && <span className="ms-auto text-xs text-fg-subtle">{unchanged}</span>}
    </div>
  );
}

function ViewControls({ onAdd }: { onAdd: () => void }) {
  const t = useTranslations("shell.toolbar");
  const ti = useTranslations("image.editor");
  const view = useImageEditor((s) => s.view);
  const setView = useImageEditor((s) => s.setView);
  const zoom = useImageEditor((s) => s.zoom);
  const setZoom = useImageEditor((s) => s.setZoom);
  const btn = "flex h-9 items-center justify-center rounded-sm border border-border text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none";
  return (
    <div className="hidden items-center gap-2 lg:flex">
      <Segmented<ViewMode>
        label={ti("zoom")}
        value={view}
        onChange={setView}
        className="w-[250px]"
        options={[
          { value: "original", label: t("original") },
          { value: "split", label: t("split") },
          { value: "side", label: t("sideBySide") },
        ]}
      />
      <div className="flex h-9 items-center gap-0.5 rounded-sm border border-border px-1">
        <button type="button" onClick={() => setZoom(zoom - 0.1)} aria-label={t("zoomOut")} className="flex size-7 items-center justify-center rounded-xs text-fg-muted hover:text-fg">
          <Minus className="size-4" aria-hidden />
        </button>
        <span className="w-10 text-center text-[13px] font-medium text-fg tabular-nums">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom(zoom + 0.1)} aria-label={t("zoomIn")} className="flex size-7 items-center justify-center rounded-xs text-fg-muted hover:text-fg">
          <Plus className="size-4" aria-hidden />
        </button>
      </div>
      <button type="button" onClick={() => setZoom(1)} aria-label={t("fit")} className={cn(btn, "w-9")}>
        <Maximize className="size-4" aria-hidden />
      </button>
      <button type="button" onClick={onAdd} className={cn(btn, "gap-2 border-border-strong bg-surface-2 px-4 text-[13px] font-medium text-fg")}>
        <Images className="size-4 text-fg-muted" aria-hidden />
        {t("addFiles")}
      </button>
    </div>
  );
}
