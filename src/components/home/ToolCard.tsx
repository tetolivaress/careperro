"use client";

import { ArrowUpRight, ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { IconTile } from "@/components/ui/icon-tile";
import { getTool, toolPath } from "@/tools/registry";
import { useToolCopy } from "@/tools/copy";
import type { Category } from "@/tools/types";

/** Serializable reference to a registry entry (safe to pass from server components). */
export interface ToolRef {
  category: Category;
  slug: string;
}

/** Grid card used on the home page and category pages. */
export function ToolCard({ category, slug }: ToolRef) {
  const toolCopy = useToolCopy();
  const tool = getTool(category, slug);
  if (!tool) return null;
  const copy = toolCopy(tool);
  return (
    <Link
      href={toolPath(tool)}
      className="group flex flex-col gap-3.5 rounded-lg border border-border bg-surface p-[18px] transition-colors hover:border-border-strong hover:bg-surface-2/40 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
    >
      <div className="flex items-start justify-between">
        <IconTile icon={tool.icon} size={40} />
        <ArrowUpRight
          className="size-4 text-fg-subtle transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-fg rtl:-scale-x-100"
          aria-hidden
        />
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-[15px] font-semibold text-fg">{copy.name}</h3>
        <p className="text-[13px] leading-snug text-fg-muted">{copy.description}</p>
      </div>
    </Link>
  );
}

/** Compact row used in mobile lists. */
export function ToolRow({ category, slug }: ToolRef) {
  const toolCopy = useToolCopy();
  const tool = getTool(category, slug);
  if (!tool) return null;
  const copy = toolCopy(tool);
  return (
    <Link
      href={toolPath(tool)}
      className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3.5 py-3 transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
    >
      <IconTile icon={tool.icon} size={36} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold text-fg">{copy.name}</span>
        <span className="truncate text-xs text-fg-muted">{copy.short}</span>
      </div>
      <ChevronRight className="size-4 shrink-0 text-fg-subtle rtl:rotate-180" aria-hidden />
    </Link>
  );
}
