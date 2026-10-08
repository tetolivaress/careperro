"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, LayoutGrid, PanelLeftClose, PanelLeftOpen, type LucideIcon } from "lucide-react";
import { categoryList, categoryPath, toolCount, tools } from "@/tools/registry";
import { getIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { OfflineCard } from "./OfflineCard";

interface NavEntry {
  href: string;
  label: string;
  icon: LucideIcon;
  count?: number;
}

function useNav(): { primary: NavEntry[]; categories: NavEntry[]; isActive: (href: string) => boolean } {
  const pathname = usePathname();
  const primary: NavEntry[] = [
    { href: "/", label: "Home", icon: House },
    { href: "/tools", label: "All tools", icon: LayoutGrid, count: tools.length },
  ];
  const categories: NavEntry[] = categoryList.map((c) => ({
    href: categoryPath(c.slug),
    label: c.name,
    icon: getIcon(c.icon),
    count: toolCount(c.slug),
  }));
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  return { primary, categories, isActive };
}

function NavItem({ entry, active, size = 36 }: { entry: NavEntry; active: boolean; size?: 36 | 40 }) {
  const Icon = entry.icon;
  return (
    <Link
      href={entry.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-sm border px-2.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
        size === 36 ? "h-9" : "h-10",
        active
          ? "border-border bg-surface-2 font-semibold text-fg"
          : "border-transparent font-medium text-fg-muted hover:bg-surface-2/70 hover:text-fg",
      )}
    >
      <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-fg-muted")} aria-hidden />
      <span className="flex-1 truncate">{entry.label}</span>
      {entry.count !== undefined && <span className="text-xs font-normal text-fg-subtle">{entry.count}</span>}
    </Link>
  );
}

/** Full navigation list, shared between the desktop sidebar and the mobile drawer. */
export function SidebarNav({ itemSize = 36, showPrimary = true }: { itemSize?: 36 | 40; showPrimary?: boolean }) {
  const { primary, categories, isActive } = useNav();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {showPrimary && primary.map((e) => <NavItem key={e.href} entry={e} active={isActive(e.href)} size={itemSize} />)}
      <div className={cn("px-2.5 pb-1.5 text-[11px] font-semibold tracking-wide text-fg-subtle uppercase", showPrimary ? "pt-4" : "pt-0")}>
        Categories
      </div>
      {categories.map((e) => <NavItem key={e.href} entry={e} active={isActive(e.href)} size={itemSize} />)}
    </nav>
  );
}

/** Expanded desktop sidebar (248px). */
export function Sidebar() {
  const collapse = useUiStore((s) => s.setSidebarCollapsed);
  return (
    <aside className="hidden w-[248px] shrink-0 flex-col gap-0.5 border-r border-border bg-background px-3 pt-3 pb-4 md:flex">
      <div className="flex items-center justify-between px-2.5 pt-1 pb-2">
        <span className="text-[11px] font-semibold text-fg-subtle">Workspace</span>
        <button
          type="button"
          onClick={() => collapse(true)}
          className="rounded-xs text-fg-subtle hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
          aria-label="Collapse sidebar"
        >
          <PanelLeftClose className="size-4" aria-hidden />
        </button>
      </div>
      <SidebarNav />
      <div className="flex-1" />
      <OfflineCard />
    </aside>
  );
}

/** Collapsed rail (64px) used on tool pages or when the user collapses the sidebar. */
export function SidebarRail() {
  const { primary, categories, isActive } = useNav();
  const expand = useUiStore((s) => s.setSidebarCollapsed);
  const entries = [primary[0], ...categories];

  return (
    <aside className="hidden w-16 shrink-0 flex-col items-center gap-1 border-r border-border bg-background py-3 md:flex">
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={() => expand(false)}
              className="flex size-10 items-center justify-center rounded-sm text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
              aria-label="Expand sidebar"
            />
          }
        >
          <PanelLeftOpen className="size-[18px]" aria-hidden />
        </TooltipTrigger>
        <TooltipContent side="right">Expand sidebar</TooltipContent>
      </Tooltip>
      <div className="my-1 h-px w-6 bg-border" />
      <nav aria-label="Main" className="flex flex-col gap-1">
        {entries.map((e) => {
          const active = isActive(e.href);
          const Icon = e.icon;
          return (
            <Tooltip key={e.href}>
              <TooltipTrigger
                render={
                  <Link
                    href={e.href}
                    aria-label={e.label}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex size-10 items-center justify-center rounded-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
                      active ? "bg-surface-2 text-primary" : "text-fg-muted hover:bg-surface-2/70 hover:text-fg",
                    )}
                  />
                }
              >
                <Icon className="size-[18px]" aria-hidden />
              </TooltipTrigger>
              <TooltipContent side="right">{e.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
    </aside>
  );
}

/** Picks the sidebar variant: user preference wins, otherwise `defaultCollapsed`. */
export function AdaptiveSidebar({ defaultCollapsed }: { defaultCollapsed: boolean }) {
  const pref = useUiStore((s) => s.sidebarCollapsed);
  const collapsed = pref ?? defaultCollapsed;
  return collapsed ? <SidebarRail /> : <Sidebar />;
}
