import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ToolCard } from "@/components/home/ToolCard";
import { IconTile } from "@/components/ui/icon-tile";
import { categoryList, categoryPath, toolsIn, tools } from "@/tools/registry";

export const metadata: Metadata = {
  title: "All tools",
  description: `Every one of the ${tools.length} on-device tools, grouped by category.`,
};

export default function AllToolsPage() {
  return (
    <div className="flex flex-col gap-7 px-5 pt-4 pb-7 md:px-12 md:pt-8 md:pb-14">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px]">
        <Link href="/" className="text-fg-subtle hover:text-fg">Home</Link>
        <ChevronRight className="size-3.5 text-fg-subtle" aria-hidden />
        <span className="font-medium text-fg-muted">All tools</span>
      </nav>
      <header className="flex flex-col gap-1">
        <h1 className="text-[26px] font-bold tracking-tight text-fg md:text-[30px]">All tools</h1>
        <p className="text-sm text-fg-muted">{tools.length} tools · every one of them processed on your device</p>
      </header>
      {categoryList.map((c) => {
        const list = toolsIn(c.slug);
        return (
          <section key={c.slug} className="flex flex-col gap-4" aria-labelledby={`cat-${c.slug}`}>
            <Link href={categoryPath(c.slug)} className="group flex items-center gap-3">
              <IconTile icon={c.icon} size={36} />
              <h2 id={`cat-${c.slug}`} className="text-[17px] font-semibold text-fg group-hover:underline">
                {c.title}
              </h2>
              <span className="text-xs text-fg-subtle">{list.length} tools</span>
            </Link>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {list.map((t) => (
                <ToolCard key={t.slug} tool={t} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
