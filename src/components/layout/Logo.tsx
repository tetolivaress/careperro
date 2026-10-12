import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { SITE } from "@/lib/site";

export const APP_NAME = SITE.name;

/** Toolbox frame mark: lime rounded square with corner brackets around a dot. Same artwork as public/icons/icon.svg. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("size-7 shrink-0", className)} aria-hidden>
      <rect width="64" height="64" rx="15" fill="#C6F432" />
      <path d="M15 27V15H27M49 37V49H37" stroke="#0E0F11" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="32" cy="32" r="8" fill="#0E0F11" />
    </svg>
  );
}

/** Mark plus the Sora wordmark. */
export function Logo({ className, withWordmark = true }: { className?: string; withWordmark?: boolean }) {
  return (
    <Link
      href="/"
      className={cn("flex items-center gap-2.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60", className)}
      aria-label={APP_NAME}
    >
      <LogoMark />
      {withWordmark && <span className="font-brand text-[17px] font-semibold tracking-[-0.03em] text-fg">{APP_NAME}</span>}
    </Link>
  );
}
