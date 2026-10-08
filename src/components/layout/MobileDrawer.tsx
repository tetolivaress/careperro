"use client";

import { useEffect } from "react";
import { Search, SunMoon, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Logo } from "./Logo";
import { PrivacyBadge } from "./PrivacyBadge";
import { SidebarNav } from "./Sidebar";
import { ThemeSegmented } from "./ThemeToggle";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useUiStore } from "@/stores/ui";

/** Burger-menu drawer on mobile: search, categories, preferences, privacy footer. */
export function MobileDrawer() {
  const t = useTranslations("common");
  const open = useUiStore((s) => s.drawerOpen);
  const setOpen = useUiStore((s) => s.setDrawerOpen);
  const openSearch = useUiStore((s) => s.setSearchOpen);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname, setOpen]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="left"
        showCloseButton={false}
        className="w-[324px] gap-4 rounded-e-[20px] border-border bg-surface px-4 pt-[max(env(safe-area-inset-top),16px)] pb-6"
      >
        <SheetTitle className="sr-only">{t("nav.menu")}</SheetTitle>
        <div className="flex h-11 items-center justify-between ps-1">
          <Logo />
          <SheetClose
            render={
              <button
                type="button"
                className="flex size-[38px] items-center justify-center rounded-sm border border-border text-fg hover:bg-surface-2"
                aria-label={t("nav.closeMenu")}
              />
            }
          >
            <X className="size-[18px]" aria-hidden />
          </SheetClose>
        </div>

        <button
          type="button"
          onClick={() => {
            setOpen(false);
            openSearch(true);
          }}
          className="flex h-10 items-center gap-2.5 rounded-sm border border-border bg-surface-2 px-3 text-sm text-fg-subtle"
        >
          <Search className="size-4" aria-hidden />
          {t("search.placeholder")}
        </button>

        <div className="scrollbar-thin -mx-1 flex-1 overflow-y-auto px-1">
          <SidebarNav itemSize={40} showPrimary={false} />
        </div>

        <div className="h-px bg-border" />

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2.5 ps-2.5 text-sm font-medium text-fg-muted">
              <SunMoon className="size-4" aria-hidden />
              {t("theme.label")}
            </span>
            <ThemeSegmented className="w-[168px]" />
          </div>
          <LanguageSwitcher variant="row" />
        </div>

        <div className="flex flex-col gap-2.5 px-1">
          <PrivacyBadge />
          <p className="text-xs text-fg-subtle">{t("footer.links")}</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
