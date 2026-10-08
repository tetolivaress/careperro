"use client";

import { Menu, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Logo } from "./Logo";
import { useUiStore } from "@/stores/ui";

const iconButton =
  "flex size-[38px] items-center justify-center rounded-sm border border-border text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none";

/** Mobile header for browse pages: logo, search, burger menu. */
export function MobileHeader() {
  const t = useTranslations("common");
  const openSearch = useUiStore((s) => s.setSearchOpen);
  const openDrawer = useUiStore((s) => s.setDrawerOpen);
  return (
    <header className="flex h-[52px] shrink-0 items-center justify-between px-4 md:hidden">
      <Logo />
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => openSearch(true)} className={iconButton} aria-label={t("search.label")}>
          <Search className="size-[18px]" aria-hidden />
        </button>
        <button type="button" onClick={() => openDrawer(true)} className={iconButton} aria-label={t("nav.openMenu")}>
          <Menu className="size-[18px]" aria-hidden />
        </button>
      </div>
    </header>
  );
}
