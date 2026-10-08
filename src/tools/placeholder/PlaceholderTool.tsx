"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Files, FolderOpen, Image as ImageIcon, X } from "lucide-react";
import { DropZone, ExportBar, SettingsGroup, SizeReadout, ToolShell } from "@/components/shell";
import { IconTile } from "@/components/ui/icon-tile";
import { formatBytes } from "@/lib/formatBytes";
import { formatLabel, kindOf } from "@/lib/fileTypes";
import { takeFiles } from "@/lib/fileHandoff";
import { downloadBlob } from "@/lib/download";
import { useToolShellStore } from "@/stores/toolShell";
import { useSessionStore } from "@/stores/session";
import { useCurrentTool } from "@/tools/useCurrentTool";
import { useToolCopy } from "@/tools/copy";

/** Object URL for image previews, revoked when the file changes or the component unmounts. */
function useObjectUrl(file: File | null): string | null {
  const url = useMemo(() => (file && kindOf(file) === "image" ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);
  return url;
}

/**
 * Phase 1 placeholder: proves the shared shell end to end.
 * Accepts files per the registry entry, shows name and size, and lets you download the untouched file.
 * Real tools replace this component in later phases.
 */
export default function PlaceholderTool() {
  const t = useTranslations("shell");
  const toolCopy = useToolCopy();
  const tool = useCurrentTool();
  const [files, setFiles] = useState<File[]>(() => takeFiles() ?? []);
  const [selected, setSelected] = useState(0);
  const file = files[selected] ?? null;
  const previewUrl = useObjectUrl(file);
  const setShellFile = useToolShellStore((s) => s.setFile);
  const setStatus = useToolShellStore((s) => s.setStatus);
  const recordProcessed = useSessionStore((s) => s.recordProcessed);

  useEffect(() => {
    if (!file) {
      setShellFile(null);
      setStatus("empty");
      return;
    }
    setShellFile({ name: file.name, meta: `${formatLabel(file)} · ${formatBytes(file.size)}` });
    setStatus("done");
  }, [file, setShellFile, setStatus]);

  if (!tool) return null;
  const copy = toolCopy(tool);

  const isTextTool = tool.accept.length === 0;

  if (!file) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-5 py-10 md:px-12">
        <div className="flex max-w-[640px] flex-col items-center gap-3 text-center">
          <IconTile icon={tool.icon} size={52} />
          <h1 className="text-2xl font-bold tracking-tight text-fg">{copy.name}</h1>
          <p className="text-sm text-fg-muted">{copy.description}</p>
        </div>
        {isTextTool ? (
          <div className="w-full max-w-[640px] rounded-2xl border-[1.5px] border-dashed border-border-strong bg-surface p-8 text-center text-sm text-fg-muted">
            {t("placeholder.comingSoon")}
          </div>
        ) : (
          <DropZone
            className="w-full max-w-[640px]"
            accept={tool.accept}
            multiple={tool.multiple}
            maxSize={tool.maxSize}
            formats={tool.accept.filter((a) => !a.startsWith(".") && !a.endsWith("/*")).map((a) => a.split("/")[1]?.toUpperCase() ?? a).slice(0, 8)}
            onFiles={(f) => {
              setFiles(f);
              setSelected(0);
            }}
          />
        )}
      </div>
    );
  }

  const total = files.reduce((n, f) => n + f.size, 0);

  const toolbar = (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-8 items-center justify-center overflow-hidden rounded-xs bg-surface-2">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="" className="size-full object-cover" />
          ) : (
            <ImageIcon className="size-4 text-fg-muted" aria-hidden />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-semibold text-fg">{file.name}</span>
          <span className="truncate text-xs text-fg-subtle">
            {formatLabel(file)} · {formatBytes(file.size)}
            {files.length > 1 ? ` · ${files.length} files` : ""}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setFiles([])}
        className="flex h-9 items-center gap-2 rounded-sm border border-border-strong bg-surface-2 px-3 text-[13px] font-medium text-fg hover:bg-surface-3"
      >
        <FolderOpen className="size-4 text-fg-muted" aria-hidden />
        {t("toolbar.chooseAnother")}
      </button>
    </>
  );

  const preview = previewUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={previewUrl} alt={file.name} className="max-h-full max-w-full object-contain p-4 md:p-12" />
  ) : (
    <div className="flex flex-col items-center gap-3 text-center">
      <IconTile icon={tool.icon} size={56} />
      <span className="text-sm font-medium text-fg">{file.name}</span>
      <span className="text-xs text-fg-subtle">{formatLabel(file)} · {formatBytes(file.size)}</span>
    </div>
  );

  const settings = (
    <>
      <div className="flex items-start gap-3 rounded-lg border border-border p-3.5">
        <span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-4" aria-hidden />
        </span>
        <div className="flex flex-col gap-0.5 text-[13px]">
          <span className="font-semibold text-fg">{t("placeholder.loaded")}</span>
          <span className="text-fg-muted">{t("placeholder.loadedBody", { tool: copy.name })}</span>
        </div>
      </div>

      {files.length > 1 && (
        <SettingsGroup label={t("placeholder.files")} value={`${files.length}`}>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`}>
                <button
                  type="button"
                  onClick={() => setSelected(i)}
                  aria-current={i === selected || undefined}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-surface-2 aria-[current]:bg-surface-2"
                >
                  <Files className="size-4 shrink-0 text-fg-muted" aria-hidden />
                  <span className="flex-1 truncate text-fg">{f.name}</span>
                  <span className="shrink-0 text-xs text-fg-subtle">{formatBytes(f.size)}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={t("placeholder.remove", { name: f.name })}
                    onClick={(e) => {
                      e.stopPropagation();
                      setFiles((list) => list.filter((_, j) => j !== i));
                      setSelected(0);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        setFiles((list) => list.filter((_, j) => j !== i));
                        setSelected(0);
                      }
                    }}
                    className="rounded-xs p-0.5 text-fg-subtle hover:text-danger"
                  >
                    <X className="size-3.5" aria-hidden />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </SettingsGroup>
      )}

      <div className="flex flex-col divide-y divide-border rounded-lg border border-border text-[13px]">
        <Row label={t("placeholder.name")} value={file.name} />
        <Row label={t("placeholder.format")} value={formatLabel(file)} />
        <Row label={t("placeholder.size")} value={formatBytes(file.size)} />
        <Row label={t("placeholder.modified")} value={new Date(file.lastModified).toLocaleDateString()} />
      </div>

      <div className="mt-auto">
        <SizeReadout before={total} after={total} caption={t("placeholder.unchanged")} />
      </div>
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
          after={total}
          downloadLabel={files.length > 1 ? t("placeholder.downloadFirst") : undefined}
          onReset={() => setFiles([])}
          onDownload={() => {
            downloadBlob(file, file.name);
            recordProcessed();
            toast.success(t("export.saved"), { description: file.name });
          }}
        />
      }
    />
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-10 items-center gap-2 px-3.5">
      <span className="w-20 shrink-0 text-fg-subtle">{label}</span>
      <span className="truncate font-medium text-fg">{value}</span>
    </div>
  );
}
