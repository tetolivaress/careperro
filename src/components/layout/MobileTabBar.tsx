"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clapperboard, FileText, House, Image, LayoutGrid, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui";

interface Tab {
  label: string;
  icon: LucideIcon;
  href?: string;
  match: (pathname: string) => boolean;
  action?: "menu";
}

const TABS: Tab[] = [
  { label: "Home", icon: House, href: "/", match: (p) => p === "/" },
  { label: "Images", icon: Image, href: "/image", match: (p) => p.startsWith("/image") },
  { label: "Media", icon: Clapperboard, href: "/video", match: (p) => p.startsWith("/video") || p.startsWith("/audio") },
  { label: "PDF", icon: FileText, href: "/pdf", match: (p) => p.startsWith("/pdf") },
  { label: "More", icon: LayoutGrid, match: () => false, action: "menu" },
];

/** Floating glass tab bar at the bottom of mobile browse pages. */
export function MobileTabBar() {
  const pathname = usePathname();
  const openDrawer = useUiStore((s) => s.setDrawerOpen);

  return (
    <div className="safe-bottom pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-3 md:hidden">
      <nav
        aria-label="Primary"
        className="pointer-events-auto flex h-[58px] items-center justify-between rounded-full border border-border-strong bg-glass p-1.5 backdrop-blur-md"
      >
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          const Icon = tab.icon;
          const cls = cn(
            "flex h-[46px] w-[62px] flex-col items-center justify-center gap-0.5 rounded-full text-[10px] transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
            active ? "bg-primary-soft font-semibold text-primary" : "font-medium text-fg-muted hover:text-fg",
          );
          const content = (
            <>
              <Icon className="size-5" aria-hidden />
              {tab.label}
            </>
          );
          return tab.href ? (
            <Link key={tab.label} href={tab.href} aria-current={active ? "page" : undefined} className={cls}>
              {content}
            </Link>
          ) : (
            <button key={tab.label} type="button" onClick={() => openDrawer(true)} className={cls} aria-label="More">
              {content}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
