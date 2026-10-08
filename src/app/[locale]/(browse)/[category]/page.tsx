import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { localeAlternates } from "@/i18n/seo";
import { ToolCard } from "@/components/home/ToolCard";
import { IconTile } from "@/components/ui/icon-tile";
import { CategoryQuickDrop } from "@/components/home/CategoryQuickDrop";
import { CATEGORIES } from "@/tools/types";
import { getCategory, toolsIn } from "@/tools/registry";
import { getCategoryCopy } from "@/tools/copy.server";

export const dynamicParams = false;

export function generateStaticParams() {
  return CATEGORIES.map((category) => ({ category }));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/[category]">): Promise<Metadata> {
  const { locale, category } = await params;
  const def = getCategory(category);
  if (!def || !hasLocale(routing.locales, locale)) return {};
  const copy = await getCategoryCopy(locale, def);
  const t = await getTranslations({ locale, namespace: "home.category" });
  return {
    title: copy.title,
    description: t("description", { description: copy.description, count: toolsIn(def.slug).length, formats: copy.formats }),
    alternates: localeAlternates(locale, `/${def.slug}`),
  };
}

export default async function CategoryPage({ params }: PageProps<"/[locale]/[category]">) {
  const { locale, category } = await params;
  const def = getCategory(category);
  if (!def || !hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const copy = await getCategoryCopy(locale, def);
  const t = await getTranslations("home");
  const tc = await getTranslations("common.nav");
  const list = toolsIn(def.slug);

  return (
    <div className="flex flex-col gap-6 px-5 pt-4 pb-7 md:gap-7 md:px-12 md:pt-8 md:pb-14">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px]">
        <Link href="/" className="text-fg-subtle hover:text-fg">{tc("home")}</Link>
        <ChevronRight className="size-3.5 text-fg-subtle rtl:rotate-180" aria-hidden />
        <span className="font-medium text-fg-muted">{copy.name}</span>
      </nav>

      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-4">
          <IconTile icon={def.icon} size={56} className="hidden md:flex" />
          <div className="flex flex-col gap-1">
            <h1 className="text-[26px] font-bold tracking-tight text-fg md:text-[30px]">{copy.title}</h1>
            <p className="text-sm text-fg-muted">{t("category.meta", { count: list.length, formats: copy.formats })}</p>
          </div>
        </div>
        <CategoryQuickDrop category={def.slug} />
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {list.map((tool) => (
          <ToolCard key={tool.slug} category={tool.category} slug={tool.slug} />
        ))}
      </div>
    </div>
  );
}
