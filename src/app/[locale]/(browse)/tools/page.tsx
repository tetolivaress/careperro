import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { localeAlternates } from "@/i18n/seo";
import { ToolCard } from "@/components/home/ToolCard";
import { IconTile } from "@/components/ui/icon-tile";
import { categoryList, categoryPath, toolsIn, tools } from "@/tools/registry";
import { getCategoryCopy } from "@/tools/copy.server";

export async function generateMetadata({ params }: PageProps<"/[locale]/tools">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "home.allToolsPage" });
  return { title: t("title"), description: t("description", { count: tools.length }), alternates: localeAlternates(locale, "/tools") };
}

export default async function AllToolsPage({ params }: PageProps<"/[locale]/tools">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return null;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const tc = await getTranslations("common.nav");
  const cats = await Promise.all(categoryList.map(async (c) => ({ def: c, copy: await getCategoryCopy(locale, c), list: toolsIn(c.slug) })));

  return (
    <div className="flex flex-col gap-7 px-5 pt-4 pb-7 md:px-12 md:pt-8 md:pb-14">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px]">
        <Link href="/" className="text-fg-subtle hover:text-fg">{tc("home")}</Link>
        <ChevronRight className="size-3.5 text-fg-subtle rtl:rotate-180" aria-hidden />
        <span className="font-medium text-fg-muted">{t("allToolsPage.title")}</span>
      </nav>
      <header className="flex flex-col gap-1">
        <h1 className="text-[26px] font-bold tracking-tight text-fg md:text-[30px]">{t("allToolsPage.title")}</h1>
        <p className="text-sm text-fg-muted">{t("allToolsPage.meta", { count: tools.length })}</p>
      </header>
      {cats.map(({ def, copy, list }) => (
        <section key={def.slug} className="flex flex-col gap-4" aria-labelledby={`cat-${def.slug}`}>
          <Link href={categoryPath(def.slug)} className="group flex items-center gap-3">
            <IconTile icon={def.icon} size={36} />
            <h2 id={`cat-${def.slug}`} className="text-[17px] font-semibold text-fg group-hover:underline">{copy.title}</h2>
            <span className="text-xs text-fg-subtle">{t("toolCount", { count: list.length })}</span>
          </Link>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {list.map((tool) => (
              <ToolCard key={tool.slug} category={tool.category} slug={tool.slug} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
