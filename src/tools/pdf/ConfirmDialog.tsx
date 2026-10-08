"use client";

import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
}

/** Confirm dialog from the design ("10 Confirm Dialog"): warning tile, title, body, Keep / destructive action. */
export function ConfirmDialog({ open, onOpenChange, title, body, confirmLabel, cancelLabel, onConfirm }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="w-[440px] gap-5 rounded-2xl border border-border bg-surface p-6 sm:max-w-[440px]">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
            <TriangleAlert className="size-5" aria-hidden />
          </span>
          <div className="flex flex-col gap-1.5">
            <DialogTitle className="text-[17px] font-semibold text-fg">{title}</DialogTitle>
            <DialogDescription className="text-[13px] leading-relaxed text-fg-muted">{body}</DialogDescription>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex h-10 items-center rounded-sm border border-border-strong bg-surface-2 px-4 text-sm font-medium text-fg hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
            className="flex h-10 items-center rounded-sm bg-danger px-4 text-sm font-semibold text-danger-fg hover:bg-danger/90 focus-visible:ring-2 focus-visible:ring-danger/50 focus-visible:outline-none"
          >
            {confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
