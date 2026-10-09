import { HardDrive } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { SITE } from "@/lib/site";

export const APP_NAME = SITE.name;

/** Lokal mark from the design: green rounded square with a hard-drive glyph, plus the wordmark. */
export function Logo({ className, withWordmark = true }: { className?: string; withWordmark?: boolean }) {
  return (
    <Link
      href="/"
      className={cn("flex items-center gap-2.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60", className)}
      aria-label={APP_NAME}
    >
      <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <HardDrive className="size-4" strokeWidth={2} aria-hidden />
      </span>
      {withWordmark && <span className="text-[17px] font-bold tracking-tight text-fg">{APP_NAME}</span>}
    </Link>
  );
}
