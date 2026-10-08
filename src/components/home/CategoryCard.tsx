import Link from "next/link";
import { IconTile } from "@/components/ui/icon-tile";
import { categoryPath, toolCount } from "@/tools/registry";
import type { CategoryDefinition } from "@/tools/types";

export function CategoryCard({ category, compact = false }: { category: CategoryDefinition; compact?: boolean }) {
  const count = toolCount(category.slug);
  return (
    <Link
      href={categoryPath(category.slug)}
      className="group flex flex-col rounded-lg border border-border bg-surface transition-colors hover:border-border-strong hover:bg-surface-2/40 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none data-[compact=true]:gap-4 data-[compact=true]:p-3.5 data-[compact=false]:gap-7 data-[compact=false]:p-5"
      data-compact={compact}
    >
      <div className="flex items-center justify-between">
        <IconTile icon={category.icon} size={compact ? 36 : 44} />
        <span className="text-xs font-medium text-fg-subtle">
          {count} {count === 1 ? "tool" : "tools"}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className={compact ? "text-[15px] font-semibold text-fg" : "text-[17px] font-semibold text-fg"}>{category.name}</h3>
        {!compact && <p className="text-[13px] leading-snug text-fg-muted">{category.description}</p>}
      </div>
    </Link>
  );
}
