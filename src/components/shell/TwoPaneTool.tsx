"use client";

import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, ClipboardPaste, Copy, Download, Eraser, FileUp, Sparkles, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconTile } from "@/components/ui/icon-tile";
import { downloadBlob } from "@/lib/download";
import { useCurrentTool } from "@/tools/useCurrentTool";
import { useToolCopy } from "@/tools/copy";

/* ────────────────────────────── small shared pieces ────────────────────────────── */

/** Copies text to the clipboard with a toast; returns a `copied` flag for the button state. */
export function useClipboard(): { copied: boolean; copy: (text: string) => Promise<void> } {
  const t = useTranslations("shell.twoPane");
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success(t("copied"));
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), 1500);
      } catch {
        toast.error(t("copyFailed"));
      }
    },
    [t],
  );
  return { copied, copy };
}

export const toolButton =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm border border-border bg-surface-2 px-2.5 text-xs font-medium text-fg transition-colors hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

export const primaryButton =
  "inline-flex h-10 items-center gap-2 rounded-sm bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

export const secondaryButton =
  "inline-flex h-10 items-center gap-2 rounded-sm border border-border-strong bg-surface-2 px-4 text-sm font-medium text-fg transition-colors hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

export function CopyButton({ text, label, className, disabled }: { text: string; label?: string; className?: string; disabled?: boolean }) {
  const t = useTranslations("shell.twoPane");
  const { copied, copy } = useClipboard();
  return (
    <button type="button" onClick={() => copy(text)} disabled={disabled || !text} className={cn(toolButton, className)}>
      {copied ? <Check className="size-3.5 text-primary" aria-hidden /> : <Copy className="size-3.5 text-fg-muted" aria-hidden />}
      {copied ? t("copied") : (label ?? t("copy"))}
    </button>
  );
}

/** Native select styled like the design's pill. Native keeps keyboard and screen-reader behaviour free. */
export function NativeSelect<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  id,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
  label: string;
  className?: string;
  id?: string;
}) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <label htmlFor={selectId} className={cn("flex items-center gap-2 text-xs text-fg-muted", className)}>
      <span className="font-medium whitespace-nowrap">{label}</span>
      <select
        id={selectId}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-8 rounded-sm border border-border bg-surface-2 px-2 text-xs font-medium text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Label + control pair for the options row. */
export function Option({ label, htmlFor, children, className }: { label: string; htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn("flex items-center gap-2 text-xs font-medium text-fg-muted", className)}>
      <span className="whitespace-nowrap">{label}</span>
      {children}
    </label>
  );
}

export function OptionCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex h-8 cursor-pointer items-center gap-2 rounded-sm border border-border bg-surface-2 px-2.5 text-xs font-medium text-fg">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-3.5 accent-[var(--primary)]" />
      {label}
    </label>
  );
}

/** Tool header shown above text tools: icon tile, localized name and description. */
export function ToolHeader({ className }: { className?: string }) {
  const tool = useCurrentTool();
  const copy = useToolCopy();
  if (!tool) return null;
  const c = copy(tool);
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <IconTile icon={tool.icon} size={40} />
      <div className="flex min-w-0 flex-col">
        <h1 className="truncate text-base font-semibold text-fg">{c.name}</h1>
        <p className="hidden truncate text-xs text-fg-muted sm:block">{c.description}</p>
      </div>
    </div>
  );
}

/** Bordered pane with a header row; used for the input/output boxes and custom panes. */
export function Pane({
  title,
  meta,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section aria-label={title} className={cn("flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-surface", className)}>
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">{title}</span>
          {meta && <span className="truncate text-[11px] text-fg-subtle">{meta}</span>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>
      <div className={cn("flex min-h-0 flex-1 flex-col", bodyClassName)}>{children}</div>
    </section>
  );
}

export const textareaClass =
  "scrollbar-thin min-h-0 w-full flex-1 resize-none bg-transparent p-3.5 text-[13px] leading-relaxed text-fg outline-none placeholder:text-fg-subtle";

/* ────────────────────────────── the template ────────────────────────────── */

export interface TwoPaneToolProps {
  input: string;
  onInputChange: (value: string) => void;
  /** String output renders in a read-only textarea; a node renders as-is. */
  output: string | ReactNode;
  /** Plain-text version of a node output, used by Copy / Download. */
  outputText?: string;
  /** Controls rendered in the options row above the panes. */
  options?: ReactNode;
  inputLabel?: string;
  outputLabel?: string;
  inputPlaceholder?: string;
  /** Sample text for "Load sample". */
  sample?: string;
  /** Accept list for "Open a file"; the file is read as text unless `onFile` is given. */
  accept?: readonly string[];
  onFile?: (file: File) => void;
  /** Output download. */
  downloadName?: string;
  downloadMime?: string;
  /** Status line in the action bar (e.g. "Valid JSON · 1.2 KB"). */
  status?: ReactNode;
  error?: string | null;
  /** Monospace panes (code). */
  mono?: boolean;
  /** Extra buttons in the output pane header. */
  outputActions?: ReactNode;
  /** Extra primary actions in the action bar. */
  actions?: ReactNode;
  /** Hide the input pane (generator tools). */
  hideInput?: boolean;
  /** Meta next to the input title (defaults to character count). */
  inputMeta?: ReactNode;
  outputMeta?: ReactNode;
  /** Height of panes on mobile. */
  className?: string;
}

/**
 * Text-tool template: options above, input left, output right (stacked under md), action bar below.
 * Everything runs on the main thread unless a tool brings its own worker.
 */
export function TwoPaneTool({
  input,
  onInputChange,
  output,
  outputText,
  options,
  inputLabel,
  outputLabel,
  inputPlaceholder,
  sample,
  accept,
  onFile,
  downloadName,
  downloadMime = "text/plain",
  status,
  error,
  mono = true,
  outputActions,
  actions,
  hideInput = false,
  inputMeta,
  outputMeta,
  className,
}: TwoPaneToolProps) {
  const t = useTranslations("shell.twoPane");
  const fileRef = useRef<HTMLInputElement>(null);
  const outText = typeof output === "string" ? output : (outputText ?? "");

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      onInputChange(text);
    } catch {
      toast.error(t("pasteFailed"));
    }
  };

  const openFile = (file: File) => {
    if (onFile) return onFile(file);
    file.text().then(onInputChange);
  };

  const download = () => {
    if (!outText) return;
    downloadBlob(new Blob([outText], { type: downloadMime }), downloadName ?? "output.txt");
  };

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="flex shrink-0 flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6">
        <ToolHeader />
        {options && <div className="flex flex-wrap items-center gap-2">{options}</div>}
      </div>

      <div className={cn("grid min-h-0 flex-1 gap-3 p-4 md:p-6", hideInput ? "grid-cols-1" : "md:grid-cols-2")}>
        {!hideInput && (
          <Pane
            title={inputLabel ?? t("input")}
            meta={inputMeta ?? t("characters", { count: input.length })}
            className="min-h-[220px] md:min-h-0"
            actions={
              <>
                {sample !== undefined && (
                  <button type="button" onClick={() => onInputChange(sample)} className={toolButton}>
                    <Sparkles className="size-3.5 text-fg-muted" aria-hidden />
                    <span className="hidden sm:inline">{t("sample")}</span>
                  </button>
                )}
                {accept && (
                  <>
                    <button type="button" onClick={() => fileRef.current?.click()} className={toolButton}>
                      <FileUp className="size-3.5 text-fg-muted" aria-hidden />
                      <span className="hidden sm:inline">{t("uploadFile")}</span>
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept={accept.join(",")}
                      className="sr-only"
                      tabIndex={-1}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) openFile(f);
                        e.target.value = "";
                      }}
                    />
                  </>
                )}
                <button type="button" onClick={paste} className={toolButton} aria-label={t("paste")}>
                  <ClipboardPaste className="size-3.5 text-fg-muted" aria-hidden />
                </button>
                <button type="button" onClick={() => onInputChange("")} className={toolButton} aria-label={t("clear")} disabled={!input}>
                  <Eraser className="size-3.5 text-fg-muted" aria-hidden />
                </button>
              </>
            }
          >
            <textarea
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              placeholder={inputPlaceholder}
              spellCheck={false}
              aria-label={inputLabel ?? t("input")}
              className={cn(textareaClass, mono && "font-mono")}
            />
          </Pane>
        )}

        <Pane
          title={outputLabel ?? t("output")}
          meta={outputMeta ?? (outText ? t("characters", { count: outText.length }) : undefined)}
          className="min-h-[220px] md:min-h-0"
          actions={
            <>
              {outputActions}
              {downloadName && (
                <button type="button" onClick={download} className={toolButton} disabled={!outText}>
                  <Download className="size-3.5 text-fg-muted" aria-hidden />
                  <span className="hidden sm:inline">{t("download")}</span>
                </button>
              )}
              <CopyButton text={outText} />
            </>
          }
        >
          {error ? (
            <div role="alert" className="m-3.5 flex items-start gap-2.5 rounded-sm border border-danger/20 bg-danger-soft p-3 text-xs text-fg">
              <TriangleAlert className="mt-px size-4 shrink-0 text-danger" aria-hidden />
              <span className="font-mono whitespace-pre-wrap">{error}</span>
            </div>
          ) : typeof output === "string" ? (
            <textarea readOnly value={output} aria-label={outputLabel ?? t("output")} className={cn(textareaClass, mono && "font-mono")} />
          ) : (
            output
          )}
        </Pane>
      </div>

      {(status || actions) && (
        <div className="safe-bottom flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-surface px-4 py-3 md:px-6">
          <div className="flex min-w-0 items-center gap-2 text-[13px] text-fg-muted">{status}</div>
          <div className="flex items-center gap-2">{actions}</div>
        </div>
      )}
    </div>
  );
}
