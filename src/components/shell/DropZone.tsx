"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowDownToLine, TriangleAlert, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/formatBytes";
import { matchesAccept } from "@/lib/fileTypes";

export interface DropZoneProps {
  /** MIME types or extensions. Empty accepts anything. */
  accept?: readonly string[];
  multiple?: boolean;
  /** Per-file size limit in bytes. */
  maxSize?: number;
  onFiles: (files: File[]) => void;
  /** Also accept clipboard paste (images, files). Default true. */
  paste?: boolean;
  title?: string;
  subtitle?: string;
  /** Format chips shown under the copy. */
  formats?: readonly string[];
  moreLabel?: string;
  size?: "default" | "compact";
  className?: string;
  disabled?: boolean;
}

const DEFAULT_FORMATS = ["JPG", "PNG", "WebP", "HEIC", "MP3", "WAV", "MP4", "PDF", "JSON"];

/** Shared drop target: drag and drop, click to browse, paste from clipboard, size and type validation. */
export function DropZone({
  accept = [],
  multiple = false,
  maxSize,
  onFiles,
  paste = true,
  title,
  subtitle,
  formats = DEFAULT_FORMATS,
  moreLabel,
  size = "default",
  className,
  disabled = false,
}: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dragCount, setDragCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const depth = useRef(0);
  const inputId = useId();
  const t = useTranslations("shell.dropzone");
  const resolvedTitle = title ?? (multiple ? t("titleMany") : t("titleOne"));
  const resolvedSubtitle = subtitle ?? t("subtitle");

  const validate = useCallback(
    (list: FileList | File[]): File[] => {
      const files = Array.from(list);
      if (files.length === 0) return [];
      const chosen = multiple ? files : files.slice(0, 1);
      const bad = chosen.find((f) => !matchesAccept(f, accept));
      if (bad) {
        setError(t("unsupported", { name: bad.name }));
        return [];
      }
      const big = maxSize ? chosen.find((f) => f.size > maxSize) : undefined;
      if (big) {
        setError(t("tooLarge", { name: big.name, size: formatBytes(big.size), max: formatBytes(maxSize ?? 0, 0) }));
        return [];
      }
      setError(null);
      return chosen;
    },
    [accept, maxSize, multiple, t],
  );

  const handle = useCallback(
    (list: FileList | File[]) => {
      const ok = validate(list);
      if (ok.length) onFiles(ok);
    },
    [onFiles, validate],
  );

  useEffect(() => {
    if (!paste || disabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const files = e.clipboardData?.files;
      if (files && files.length) {
        e.preventDefault();
        handle(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [handle, paste, disabled]);

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (disabled) return;
    depth.current += 1;
    setDragOver(true);
    setDragCount(e.dataTransfer.items?.length ?? 0);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    depth.current -= 1;
    if (depth.current <= 0) {
      depth.current = 0;
      setDragOver(false);
    }
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    depth.current = 0;
    setDragOver(false);
    if (disabled) return;
    handle(e.dataTransfer.files);
  };

  const compact = size === "compact";
  const Icon = dragOver ? ArrowDownToLine : Upload;
  const count = dragCount || (multiple ? 0 : 1);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        aria-describedby={error ? `${inputId}-error` : undefined}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={onDragEnter}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        data-state={dragOver ? "dragover" : "idle"}
        className={cn(
          "group flex w-full cursor-pointer flex-col items-center justify-center gap-5 rounded-2xl border-[1.5px] border-dashed text-center transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/60",
          compact ? "px-5 py-7" : "px-8 py-14",
          dragOver
            ? "border-primary bg-primary-soft"
            : "border-border-strong bg-surface hover:border-fg-subtle hover:bg-surface-2/40",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <div
          className={cn(
            "flex items-center justify-center rounded-[14px] border transition-colors",
            compact ? "size-11" : "size-13",
            dragOver ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface-2 text-fg",
          )}
          aria-hidden
        >
          <Icon className="size-[22px]" strokeWidth={1.75} />
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <p className={cn("font-semibold", compact ? "text-base" : "text-lg", dragOver ? "text-primary" : "text-fg")}>
            {dragOver ? t("release", { count: Math.max(count, 1) }) : resolvedTitle}
          </p>
          <p className="text-sm text-fg-muted">{resolvedSubtitle}</p>
        </div>
        {formats.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {formats.map((f) => (
              <span key={f} className="rounded-xs bg-surface-2 px-[7px] py-[3px] font-mono text-[11px] font-medium text-fg-muted">
                {f}
              </span>
            ))}
            {moreLabel && <span className="pl-1 text-[11px] text-fg-subtle">{moreLabel}</span>}
          </div>
        )}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          className="sr-only"
          tabIndex={-1}
          accept={accept.join(",") || undefined}
          multiple={multiple}
          disabled={disabled}
          onChange={(e) => {
            if (e.target.files) handle(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {error && (
        <div
          id={`${inputId}-error`}
          role="alert"
          className="flex items-start gap-2.5 rounded-sm border border-danger/20 bg-danger-soft p-3 text-xs text-fg"
        >
          <TriangleAlert className="mt-px size-4 shrink-0 text-danger" aria-hidden />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
