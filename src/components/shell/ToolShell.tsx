"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { PreviewArea } from "./PreviewArea";
import { SettingsPanel } from "./SettingsPanel";
import { useIsDesktop } from "@/hooks/use-media-query";

interface ToolShellProps {
  /** Toolbar above the canvas (file info, view controls). */
  toolbar?: ReactNode;
  /** The tool's own preview (image, waveform, player, page grid). */
  preview: ReactNode;
  /** Optional tab strip at the top of the settings column / sheet. */
  tabs?: ReactNode;
  /** The tool's controls. */
  settings: ReactNode;
  /** Export bar across the bottom. */
  footer?: ReactNode;
  /** Height of the mobile preview area. */
  mobilePreviewClassName?: string;
}

/**
 * Standard file-tool layout from the design:
 *  - desktop: stage (toolbar + canvas) on the left, 372px settings column on the right, export bar below
 *  - mobile (<768px): preview on top, settings in a bottom sheet with a grabber, export bar pinned under it
 */
export function ToolShell({ toolbar, preview, tabs, settings, footer, mobilePreviewClassName }: ToolShellProps) {
  const isDesktop = useIsDesktop();
  const [expanded, setExpanded] = useState(false);

  if (isDesktop) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          <PreviewArea toolbar={toolbar}>{preview}</PreviewArea>
          <SettingsPanel tabs={tabs}>{settings}</SettingsPanel>
        </div>
        {footer}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={cn(
          "relative flex shrink-0 items-center justify-center overflow-hidden bg-canvas transition-[height] duration-200",
          expanded ? "h-[160px]" : "h-[292px]",
          mobilePreviewClassName,
        )}
      >
        {preview}
      </div>
      <section
        aria-label="Settings"
        className="flex min-h-0 flex-1 flex-col rounded-t-[20px] border-t border-border bg-surface"
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex h-[22px] w-full items-center justify-center"
          aria-label={expanded ? "Shrink settings" : "Expand settings"}
          aria-expanded={expanded}
        >
          <span className="h-[5px] w-9 rounded-full bg-border-strong" aria-hidden />
          <ChevronUp className="sr-only" />
        </button>
        {tabs && <div className="shrink-0 border-b border-border px-2">{tabs}</div>}
        <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pt-5 pb-2">{settings}</div>
        {footer}
      </section>
    </div>
  );
}
