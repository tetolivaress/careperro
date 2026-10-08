import Link from "next/link";
import { HardDrive } from "lucide-react";
import { cn } from "@/lib/utils";

export const APP_NAME = "Lokal";

export function Logo({ className, withWordmark = true }: { className?: string; withWordmark?: boolean }) {
  return (
    <Link
      href="/"
      className={cn(
        "flex items-center gap-2.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        className,
      )}
      aria-label={`${APP_NAME} home`}
    >
      <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <HardDrive className="size-4" strokeWidth={2} aria-hidden />
      </span>
      {withWordmark && <span className="text-[17px] font-bold tracking-tight text-fg">{APP_NAME}</span>}
    </Link>
  );
}
