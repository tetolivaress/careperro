"use client";

import type { ReactNode } from "react";
import { Check, Circle, FileX2, Loader, Plus, TriangleAlert, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export interface ProcessingStep {
  label: string;
  state: "done" | "active" | "pending";
}

interface ProcessingCardProps {
  title: string;
  /** 0..100 */
  percent: number;
  steps?: ProcessingStep[];
  eta?: string;
  onCancel?: () => void;
  /** Icon tile + file name + meta at the top. */
  file?: { icon: ReactNode; name: string; meta: string };
  className?: string;
}

/** "03 PROCESSING" card from the design: file row, labeled progress bar, step list, ETA + Cancel. */
export function ProcessingCard({ title, percent, steps, eta, onCancel, file, className }: ProcessingCardProps) {
  const t = useTranslations("shell.status");
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex w-full max-w-[421px] flex-col gap-5 rounded-2xl border border-border bg-surface p-6", className)}
    >
      {file && (
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-surface-2 text-fg-muted" aria-hidden>
            {file.icon}
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-sm font-semibold text-fg">{file.name}</span>
            <span className="truncate text-xs text-fg-subtle">{file.meta}</span>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between text-[13px]">
          <span className="font-medium text-fg">{title}</span>
          <span className="font-semibold text-fg-muted tabular-nums">{pct}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${pct}%` }} />
        </div>
      </div>
      {steps && steps.length > 0 && (
        <ul className="flex flex-col gap-2">
          {steps.map((s) => (
            <li key={s.label} className="flex items-center gap-2 text-xs">
              {s.state === "done" && <Check className="size-3.5 text-primary" aria-hidden />}
              {s.state === "active" && <Loader className="size-3.5 animate-spin text-warning" aria-hidden />}
              {s.state === "pending" && <Circle className="size-3.5 text-fg-subtle" aria-hidden />}
              <span className={s.state === "pending" ? "text-fg-subtle" : "text-fg-muted"}>{s.label}</span>
            </li>
          ))}
        </ul>
      )}
      {(eta || onCancel) && (
        <div className="mt-auto flex items-center justify-between gap-3">
          <span className="text-xs text-fg-subtle">{eta}</span>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex h-9 items-center gap-2 rounded-sm border border-border-strong bg-surface-2 px-4 text-[13px] font-medium text-fg hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
            >
              <X className="size-4 text-fg-muted" aria-hidden />
              {t("cancel")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface DoneCardProps {
  title: string;
  meta?: string;
  children?: ReactNode;
  onAnother?: () => void;
  anotherLabel?: string;
  onDownload?: () => void;
  downloadLabel?: string;
  className?: string;
}

/** "04 DONE" card: green check, title, optional readout, Another file + Download. */
export function DoneCard({ title, meta, children, onAnother, anotherLabel, onDownload, downloadLabel, className }: DoneCardProps) {
  const t = useTranslations("shell");
  return (
    <div className={cn("flex w-full max-w-[421px] flex-col gap-5 rounded-2xl border border-border bg-surface p-6", className)}>
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-5" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-fg">{title}</span>
          {meta && <span className="truncate text-xs text-fg-subtle">{meta}</span>}
        </div>
      </div>
      {children}
      {(onAnother || onDownload) && (
        <div className="mt-auto flex gap-2">
          {onAnother && (
            <button
              type="button"
              onClick={onAnother}
              className="flex h-10 flex-1 items-center justify-center gap-2 rounded-sm border border-border-strong bg-surface-2 px-4 text-[13px] font-medium text-fg hover:bg-surface-3"
            >
              <Plus className="size-4 text-fg-muted" aria-hidden />
              {anotherLabel ?? t("status.anotherFile")}
            </button>
          )}
          {onDownload && (
            <button
              type="button"
              onClick={onDownload}
              className="flex h-10 flex-1 items-center justify-center gap-2 rounded-sm bg-primary px-4 text-[13px] font-semibold text-primary-foreground hover:bg-primary/90"
            >
              {downloadLabel ?? t("export.download")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface ErrorCardProps {
  title: string;
  body?: string;
  /** Inline warning strip (e.g. file too large). */
  warning?: string;
  onChooseAnother?: () => void;
  secondary?: { label: string; onClick: () => void; icon?: ReactNode };
  className?: string;
}

/** "05 ERROR" card: unsupported file, optional too-large strip, actions. */
export function ErrorCard({ title, body, warning, onChooseAnother, secondary, className }: ErrorCardProps) {
  const t = useTranslations("shell.status");
  return (
    <div role="alert" className={cn("flex w-full max-w-[421px] flex-col gap-5 rounded-2xl border border-border bg-surface p-6", className)}>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
          <FileX2 className="size-[18px]" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[15px] font-semibold text-fg">{title}</span>
          {body && <span className="text-xs leading-relaxed text-fg-muted">{body}</span>}
        </div>
      </div>
      {warning && (
        <div className="flex items-start gap-2.5 rounded-sm border border-danger/20 bg-danger-soft p-3 text-xs text-fg">
          <TriangleAlert className="mt-px size-4 shrink-0 text-danger" aria-hidden />
          <span>{warning}</span>
        </div>
      )}
      {(onChooseAnother || secondary) && (
        <div className="mt-auto flex justify-end gap-2">
          {secondary && (
            <button
              type="button"
              onClick={secondary.onClick}
              className="flex h-10 items-center gap-2 rounded-sm px-3 text-[13px] font-medium text-fg-muted hover:bg-surface-2 hover:text-fg"
            >
              {secondary.icon}
              {secondary.label}
            </button>
          )}
          {onChooseAnother && (
            <button
              type="button"
              onClick={onChooseAnother}
              className="flex h-10 items-center gap-2 rounded-sm border border-border-strong bg-surface-2 px-4 text-[13px] font-medium text-fg hover:bg-surface-3"
            >
              {t("chooseAnother")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
