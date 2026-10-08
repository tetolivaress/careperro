import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 items-center rounded-[5px] bg-surface-3 px-1.5 font-sans text-[11px] font-medium text-fg-muted",
        className,
      )}
      {...props}
    />
  );
}
