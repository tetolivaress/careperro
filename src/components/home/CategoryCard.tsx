"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { IconTile } from "@/components/ui/icon-tile";
import { categories, categoryPath, toolCount } from "@/tools/registry";
import { useCategoryCopy } from "@/tools/copy";
import type { Category } from "@/tools/types";

export function CategoryCard({ slug, compact = false }: { slug: Category; compact?: boolean }) {
  const t = useTranslations("home");
  const category = categories[slug];
  const copy = useCategoryCopy()(category);
  const count = toolCount(slug);
  return (
    <Link
      href={categoryPath(category.slug)}
      className="group flex flex-col rounded-lg border border-border bg-surface transition-colors hover:border-border-strong hover:bg-surface-2/40 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none data-[compact=true]:gap-4 data-[compact=true]:p-3.5 data-[compact=false]:gap-7 data-[compact=false]:p-5"
      data-compact={compact}
    >
      <div className="flex items-center justify-between">
        <IconTile icon={category.icon} size={compact ? 36 : 44} />
        <span className="text-xs font-medium text-fg-subtle">{t("toolCount", { count })}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className={compact ? "text-[15px] font-semibold text-fg" : "text-[17px] font-semibold text-fg"}>{copy.name}</h3>
        {!compact && <p className="text-[13px] leading-snug text-fg-muted">{copy.description}</p>}
      </div>
    </Link>
  );
}
