"use client";

import type { LucideIcon } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

/** Single-thumb slider that always hands back a number (the shadcn wrapper expects arrays). */
export function ValueSlider({
  value,
  onChange,
  min,
  max,
  step,
  label,
  disabled,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Slider
      aria-label={label}
      value={[value]}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      className={className}
      onValueChange={(v) => onChange(Array.isArray(v) ? Number(v[0]) : Number(v))}
    />
  );
}

export interface TabDef<T extends string> {
  id: T;
  label: string;
  icon: LucideIcon;
}

/** Icon-over-label tab strip from the design's settings panel. */
export function TabStrip<T extends string>({ tabs, value, onChange }: { tabs: TabDef<T>[]; value: T; onChange: (id: T) => void }) {
  return (
    <div role="tablist" className="scrollbar-thin flex overflow-x-auto">
      {tabs.map((tab) => {
        const active = tab.id === value;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              "flex min-w-[58px] flex-1 flex-col items-center gap-1.5 border-b-2 px-1 pt-3 pb-2.5 text-[11px] transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
              active ? "border-primary font-semibold text-fg" : "border-transparent font-medium text-fg-muted hover:text-fg",
            )}
          >
            <Icon className={cn("size-[18px]", active ? "text-primary" : "text-fg-subtle")} aria-hidden />
            <span className="truncate">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Small key/value row used in the settings column (e.g. "Current peak  −3.2 dB"). */
export function StatRow({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warn" | "primary" }) {
  return (
    <div className="flex h-10 items-center justify-between border-b border-border px-3.5 text-[13px] last:border-b-0">
      <span className="text-fg-subtle">{label}</span>
      <span className={cn("font-medium tabular-nums", tone === "warn" ? "text-warning" : tone === "primary" ? "text-primary" : "text-fg")}>{value}</span>
    </div>
  );
}

/** Time input accepting m:ss(.t) or plain seconds. Commits on blur / Enter. */
export function TimeField({
  label,
  value,
  onCommit,
  format,
  parse,
}: {
  label: string;
  value: number;
  onCommit: (seconds: number) => void;
  format: (s: number) => string;
  parse: (text: string) => number | null;
}) {
  return (
    <label className="flex flex-1 flex-col gap-1.5">
      <span className="text-xs font-medium text-fg-muted">{label}</span>
      <input
        key={value}
        defaultValue={format(value)}
        inputMode="decimal"
        onBlur={(e) => {
          const parsed = parse(e.target.value);
          if (parsed !== null) onCommit(parsed);
          else e.target.value = format(value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="h-9 rounded-sm border border-border bg-surface-2 px-3 font-mono text-[13px] text-fg tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      />
    </label>
  );
}
