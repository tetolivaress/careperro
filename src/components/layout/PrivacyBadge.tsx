import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/** Persistent "Your files stay on your device" badge from the design. */
export function PrivacyBadge({ className }: { className?: string }) {
  const t = useTranslations("common");
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-primary-line bg-primary-soft pr-3 pl-2.5 text-xs font-medium whitespace-nowrap text-primary",
        className,
      )}
    >
      <ShieldCheck className="size-3.5" aria-hidden />
      {t("privacyBadge")}
    </span>
  );
}
