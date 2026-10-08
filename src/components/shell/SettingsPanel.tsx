"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SettingsPanelProps {
  children: ReactNode;
  /** Optional tab strip rendered above the content. */
  tabs?: ReactNode;
  className?: string;
}

/**
 * Right-hand settings column on desktop (372px). On mobile, ToolShell renders the same
 * children inside a bottom sheet, so this component only handles the desktop frame.
 */
export function SettingsPanel({ children, tabs, className }: SettingsPanelProps) {
  return (
    <aside
      aria-label="Settings"
      className={cn("hidden w-[372px] shrink-0 flex-col border-l border-border bg-surface md:flex", className)}
    >
      {tabs && <div className="shrink-0 border-b border-border px-2">{tabs}</div>}
      <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-6">{children}</div>
    </aside>
  );
}

/** Labeled block inside the settings panel: a header row and the control below it. */
export function SettingsGroup({
  label,
  value,
  children,
  className,
}: {
  label: string;
  value?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-fg-muted">{label}</span>
        {value !== undefined && <span className="text-[13px] font-semibold text-fg">{value}</span>}
      </div>
      {children}
    </div>
  );
}
