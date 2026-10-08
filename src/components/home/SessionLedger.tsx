"use client";

import { useSessionStore } from "@/stores/session";
import { formatBytes } from "@/lib/formatBytes";

/** "This session" card in the hero: bytes uploaded (always 0) and files processed. */
export function SessionLedger() {
  const uploaded = useSessionStore((s) => s.bytesUploaded);
  const processed = useSessionStore((s) => s.filesProcessed);

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-border bg-surface p-4 lg:w-[300px]">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-fg-muted">This session</span>
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-fg-subtle">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden />
          Network idle
        </span>
      </div>
      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-0.5">
          <span className="text-[22px] leading-tight font-bold text-primary">{formatBytes(uploaded)}</span>
          <span className="text-xs text-fg-subtle">uploaded</span>
        </div>
        <div className="flex flex-1 flex-col gap-0.5">
          <span className="text-[22px] leading-tight font-bold text-fg">{processed}</span>
          <span className="text-xs text-fg-subtle">files processed</span>
        </div>
      </div>
    </div>
  );
}
