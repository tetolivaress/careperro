"use client";

import { cn } from "@/lib/utils";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/** Segmented control from the design (Original / Split / Side by side, JPG / WebP / PNG / AVIF). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  size = "md",
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly SegmentOption<T>[];
  label: string;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("flex w-full gap-0.5 rounded-[10px] border border-border bg-surface-2 p-[3px]", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex-1 rounded-[7px] px-2 transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
              size === "sm" ? "h-7 text-xs" : "h-[30px] text-[13px]",
              active ? "bg-surface-3 font-semibold text-fg" : "font-medium text-fg-muted hover:text-fg",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
