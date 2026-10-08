import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { SITE } from "@/lib/site";

export const APP_NAME = SITE.name;

export function Logo({ className, withWordmark = true }: { className?: string; withWordmark?: boolean }) {
  return (
    <Link
      href="/"
      className={cn("flex items-center gap-2.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60", className)}
      aria-label={APP_NAME}
    >
      <Image src="/icons/icon-192.png" alt="" width={28} height={28} priority className="size-7 rounded-lg" />
      {withWordmark && <span className="text-[17px] font-bold tracking-tight text-fg">{APP_NAME}</span>}
    </Link>
  );
}
