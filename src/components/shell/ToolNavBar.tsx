"use client";

import Link from "next/link";
import { ChevronLeft, Search } from "lucide-react";
import { categoryPath, categories, getTool } from "@/tools/registry";
import { useToolShellStore } from "@/stores/toolShell";
import { useUiStore } from "@/stores/ui";
import type { Category } from "@/tools/types";

const iconButton =
  "flex size-[38px] items-center justify-center rounded-sm text-fg hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none";

/** Mobile-only header on tool pages: back to category, file or tool title, search. */
export function ToolNavBar({ categorySlug, toolSlug }: { categorySlug: Category; toolSlug: string }) {
  const file = useToolShellStore((s) => s.file);
  const openSearch = useUiStore((s) => s.setSearchOpen);
  const tool = getTool(categorySlug, toolSlug);
  const category = categories[categorySlug];

  return (
    <header className="flex h-[52px] shrink-0 items-center justify-between px-3 md:hidden">
      <Link href={categoryPath(categorySlug)} className={iconButton} aria-label={`Back to ${category.title}`}>
        <ChevronLeft className="size-5" aria-hidden />
      </Link>
      <div className="flex min-w-0 flex-col items-center gap-px">
        <span className="max-w-[220px] truncate text-[15px] font-semibold text-fg">{file?.name ?? tool?.name}</span>
        <span className="text-[11px] text-fg-subtle">{file?.meta ?? category.title}</span>
      </div>
      <button type="button" onClick={() => openSearch(true)} className={`${iconButton} text-fg-muted`} aria-label="Find a tool">
        <Search className="size-[18px]" aria-hidden />
      </button>
    </header>
  );
}
