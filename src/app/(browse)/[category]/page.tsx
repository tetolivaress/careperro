import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { ToolCard } from "@/components/home/ToolCard";
import { IconTile } from "@/components/ui/icon-tile";
import { CategoryQuickDrop } from "@/components/home/CategoryQuickDrop";
import { CATEGORIES } from "@/tools/types";
import { getCategory, toolsIn } from "@/tools/registry";

export const dynamicParams = false;

export function generateStaticParams() {
  return CATEGORIES.map((category) => ({ category }));
}

export async function generateMetadata({ params }: PageProps<"/[category]">): Promise<Metadata> {
  const { category } = await params;
  const def = getCategory(category);
  if (!def) return {};
  return {
    title: def.title,
    description: `${def.description}. ${toolsIn(def.slug).length} tools for ${def.formats}, processed on your device.`,
  };
}

export default async function CategoryPage({ params }: PageProps<"/[category]">) {
  const { category } = await params;
  const def = getCategory(category);
  if (!def) notFound();
  const list = toolsIn(def.slug);

  return (
    <div className="flex flex-col gap-6 px-5 pt-4 pb-7 md:gap-7 md:px-12 md:pt-8 md:pb-14">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px]">
        <Link href="/" className="text-fg-subtle hover:text-fg">Home</Link>
        <ChevronRight className="size-3.5 text-fg-subtle" aria-hidden />
        <span className="font-medium text-fg-muted">{def.name}</span>
      </nav>

      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-4">
          <IconTile icon={def.icon} size={56} className="hidden md:flex" />
          <div className="flex flex-col gap-1">
            <h1 className="text-[26px] font-bold tracking-tight text-fg md:text-[30px]">{def.title}</h1>
            <p className="text-sm text-fg-muted">
              {list.length} tools · {def.formats} · processed on your device
            </p>
          </div>
        </div>
        <CategoryQuickDrop category={def.slug} />
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {list.map((t) => (
          <ToolCard key={t.slug} tool={t} />
        ))}
      </div>
    </div>
  );
}
