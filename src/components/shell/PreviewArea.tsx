import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PreviewAreaProps {
  children: ReactNode;
  /** Optional toolbar above the canvas (file info, view controls). */
  toolbar?: ReactNode;
  className?: string;
}

/** The stage: a toolbar strip plus a dark canvas that centers whatever preview the tool supplies. */
export function PreviewArea({ children, toolbar, className }: PreviewAreaProps) {
  return (
    <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", className)}>
      {toolbar && (
        <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4 md:px-5">
          {toolbar}
        </div>
      )}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-canvas">{children}</div>
    </div>
  );
}
