"use client";

import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { ChevronDown, Globe } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { LOCALE_NAMES, LOCALE_SHORT, LOCALES, type Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";

/**
 * Native <select> styled as the design's globe pill. Native keeps it accessible and works everywhere.
 * Remembers the choice so the root redirect page can honor it next visit.
 */
export function LanguageSwitcher({ variant = "pill", className }: { variant?: "pill" | "row"; className?: string }) {
  const t = useTranslations("common.language");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();

  const onChange = (next: Locale) => {
    try {
      localStorage.setItem("lokal-locale", next);
    } catch {
      /* private mode */
    }
    router.replace(pathname, { locale: next });
  };

  const select = (
    <select
      value={locale}
      onChange={(e) => onChange(e.target.value as Locale)}
      aria-label={t("select")}
      className="absolute inset-0 cursor-pointer opacity-0"
    >
      {LOCALES.map((l) => (
        <option key={l} value={l}>
          {LOCALE_NAMES[l]}
        </option>
      ))}
    </select>
  );

  if (variant === "row") {
    return (
      <div className={cn("relative flex h-10 items-center gap-2.5 rounded-sm px-2.5 text-sm font-medium text-fg-muted hover:bg-surface-2", className)}>
        <Globe className="size-4" aria-hidden />
        <span className="flex-1 text-left">{t("label")}</span>
        <span className="text-fg">{LOCALE_NAMES[locale]}</span>
        <ChevronDown className="size-4 text-fg-subtle" aria-hidden />
        {select}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex h-9 items-center gap-1.5 rounded-sm border border-border px-2.5 text-[13px] font-medium text-fg transition-colors hover:bg-surface-2 focus-within:ring-2 focus-within:ring-ring/60",
        className,
      )}
    >
      <Globe className="size-[15px] text-fg-muted" aria-hidden />
      <span>{LOCALE_SHORT[locale]}</span>
      <ChevronDown className="size-3.5 text-fg-subtle" aria-hidden />
      {select}
    </div>
  );
}
