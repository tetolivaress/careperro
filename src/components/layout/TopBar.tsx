"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Kbd } from "@/components/ui/kbd";
import { Logo } from "./Logo";
import { PrivacyBadge } from "./PrivacyBadge";
import { ThemeToggle } from "./ThemeToggle";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useUiStore } from "@/stores/ui";

/** Desktop top bar: logo, tool search trigger, privacy badge, language, theme toggle. */
export function TopBar() {
  const t = useTranslations("common.search");
  const openSearch = useUiStore((s) => s.setSearchOpen);

  return (
    <header className="hidden h-[60px] shrink-0 items-center justify-between border-b border-border bg-background px-5 md:flex">
      <div className="flex w-[228px] items-center gap-3">
        <Logo />
      </div>

      <button
        type="button"
        onClick={() => openSearch(true)}
        className="flex h-[38px] w-full max-w-[460px] items-center gap-2.5 rounded-sm border border-border bg-surface-2 pr-2 pl-3 text-start text-sm text-fg-subtle transition-colors hover:border-border-strong hover:text-fg-muted focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
        aria-label={t("label")}
        aria-keyshortcuts="Meta+K Control+K"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="flex-1">{t("placeholder")}</span>
        <Kbd>⌘K</Kbd>
      </button>

      <div className="flex items-center justify-end gap-2 lg:w-[520px]">
        <PrivacyBadge className="hidden lg:inline-flex" />
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
    </header>
  );
}
