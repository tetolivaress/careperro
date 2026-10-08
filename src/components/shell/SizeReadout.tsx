"use client";

import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatBytes, savingsPercent } from "@/lib/formatBytes";
import { cn } from "@/lib/utils";

interface SizeReadoutProps {
  before: number;
  after?: number;
  caption?: string;
  className?: string;
}

/** Card showing "2.4 MB → 310 KB" with a savings pill and bar. */
export function SizeReadout({ before, after, caption, className }: SizeReadoutProps) {
  const t = useTranslations("shell.readout");
  const hasAfter = after !== undefined;
  const pct = hasAfter ? savingsPercent(before, after) : 0;
  const ratio = hasAfter && before > 0 ? Math.min(after / before, 1) : 1;

  return (
    <div className={cn("flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-4", className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-fg-muted">{caption ?? t("estimated")}</span>
        {hasAfter && <SavingsPill percent={pct} />}
      </div>
      <div className="flex items-center gap-2.5">
        <span className="text-base font-medium text-fg-subtle">{formatBytes(before)}</span>
        <ArrowRight className="size-4 text-fg-subtle rtl:rotate-180" aria-hidden />
        <span className="text-2xl font-bold text-fg">{hasAfter ? formatBytes(after) : "—"}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden>
        <div
          className={cn("h-full rounded-full transition-[width] duration-300", pct < 0 ? "bg-warning" : "bg-primary")}
          style={{ width: `${Math.max(ratio * 100, 2)}%` }}
        />
      </div>
    </div>
  );
}

export function SavingsPill({ percent, className }: { percent: number; className?: string }) {
  const t = useTranslations("shell.readout");
  const grew = percent < 0;
  const Icon = grew ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1 rounded-full px-2 text-[11px] font-semibold",
        grew ? "bg-warning-soft text-warning" : "bg-primary-soft text-primary",
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {grew ? t("larger", { percent: Math.abs(percent) }) : t("smaller", { percent })}
    </span>
  );
}

/** Compact inline readout for the export bar: "2.4 MB → 310 KB −87%". */
export function MiniReadout({ before, after }: { before: number; after?: number }) {
  const pct = after !== undefined ? savingsPercent(before, after) : null;
  return (
    <div className="flex items-center gap-2 text-[13px]">
      <span className="text-fg-subtle">{formatBytes(before)}</span>
      <ArrowRight className="size-3.5 text-fg-subtle rtl:rotate-180" aria-hidden />
      <span className="text-sm font-bold text-fg">{after !== undefined ? formatBytes(after) : "—"}</span>
      {pct !== null && (
        <span
          className={cn(
            "inline-flex h-[22px] items-center gap-1 rounded-full px-2 text-[11px] font-semibold",
            pct < 0 ? "bg-warning-soft text-warning" : "bg-primary-soft text-primary",
          )}
        >
          {pct < 0 ? <TrendingUp className="size-3" aria-hidden /> : <TrendingDown className="size-3" aria-hidden />}
          {pct < 0 ? `+${Math.abs(pct)}%` : `−${pct}%`}
        </span>
      )}
    </div>
  );
}
