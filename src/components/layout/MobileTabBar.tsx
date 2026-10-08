"use client";

import { Clapperboard, FileText, House, Image, LayoutGrid, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { useCategoryCopy } from "@/tools/copy";
import { categories } from "@/tools/registry";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui";

interface Tab {
  label: string;
  icon: LucideIcon;
  href?: string;
  match: (pathname: string) => boolean;
}

/** Floating glass tab bar at the bottom of mobile browse pages. */
export function MobileTabBar() {
  const t = useTranslations("common.nav");
  const catCopy = useCategoryCopy();
  const pathname = usePathname();
  const openDrawer = useUiStore((s) => s.setDrawerOpen);

  const tabs: Tab[] = [
    { label: t("home"), icon: House, href: "/", match: (p) => p === "/" },
    { label: catCopy(categories.image).name, icon: Image, href: "/image", match: (p) => p.startsWith("/image") },
    { label: t("media"), icon: Clapperboard, href: "/video", match: (p) => p.startsWith("/video") || p.startsWith("/audio") },
    { label: catCopy(categories.pdf).name, icon: FileText, href: "/pdf", match: (p) => p.startsWith("/pdf") },
    { label: t("more"), icon: LayoutGrid, match: () => false },
  ];

  return (
    <div className="safe-bottom pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-3 md:hidden">
      <nav
        aria-label={t("primary")}
        className="pointer-events-auto flex h-[58px] items-center justify-between rounded-full border border-border-strong bg-glass p-1.5 backdrop-blur-md"
      >
        {tabs.map((tab) => {
          const active = tab.match(pathname);
          const Icon = tab.icon;
          const cls = cn(
            "flex h-[46px] w-[62px] flex-col items-center justify-center gap-0.5 rounded-full text-[10px] transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
            active ? "bg-primary-soft font-semibold text-primary" : "font-medium text-fg-muted hover:text-fg",
          );
          const content = (
            <>
              <Icon className="size-5" aria-hidden />
              <span className="max-w-full truncate px-1">{tab.label}</span>
            </>
          );
          return tab.href ? (
            <Link key={tab.label} href={tab.href} aria-current={active ? "page" : undefined} className={cls}>
              {content}
            </Link>
          ) : (
            <button key={tab.label} type="button" onClick={() => openDrawer(true)} className={cls} aria-label={t("more")}>
              {content}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
