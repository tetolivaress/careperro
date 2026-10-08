"use client";

import type { ReactNode } from "react";
import { Cpu, Download, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { MiniReadout } from "./SizeReadout";

interface ExportBarProps {
  /** Original file size in bytes. Hidden when undefined. */
  before?: number;
  /** Output size in bytes once processing completes. */
  after?: number;
  /** Status copy on the left, e.g. "Processed on this device in 0.4 s". */
  status?: ReactNode;
  downloadLabel?: string;
  onDownload?: () => void;
  onReset?: () => void;
  downloadDisabled?: boolean;
  className?: string;
}

/** Bottom bar: status on the left; readout, Reset and the primary Download on the right. */
export function ExportBar({
  before,
  after,
  status,
  downloadLabel,
  onDownload,
  onReset,
  downloadDisabled,
  className,
}: ExportBarProps) {
  const t = useTranslations("shell.export");
  return (
    <div
      className={cn(
        "safe-bottom flex shrink-0 items-center justify-between gap-3 border-t border-border bg-surface px-4 py-3 md:h-16 md:px-5 md:py-0",
        className,
      )}
    >
      <div className="hidden items-center gap-2 text-[13px] text-fg-muted md:flex">
        <Cpu className="size-4 text-primary" aria-hidden />
        {status ?? (
          <>
            <span>{t("processedOnDevice")}</span>
            <span className="size-[3px] rounded-full bg-fg-subtle" aria-hidden />
            <span>{t("bytesSent")}</span>
          </>
        )}
      </div>
      <div className="flex flex-1 items-center justify-end gap-3">
        {before !== undefined && (
          <div className="mr-auto md:mr-0">
            <MiniReadout before={before} after={after} />
          </div>
        )}
        <button
          type="button"
          onClick={onReset}
          className="flex h-10 items-center gap-2 rounded-sm border border-border-strong bg-surface-2 px-3 text-sm font-medium text-fg transition-colors hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none md:px-4"
        >
          <RotateCcw className="size-4 text-fg-muted" aria-hidden />
          <span className="hidden md:inline">{t("reset")}</span>
          <span className="sr-only md:hidden">{t("reset")}</span>
        </button>
        <button
          type="button"
          onClick={onDownload}
          disabled={downloadDisabled}
          className="flex h-10 items-center gap-2 rounded-sm bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="size-4" aria-hidden />
          {downloadLabel ?? t("download")}
        </button>
      </div>
    </div>
  );
}
