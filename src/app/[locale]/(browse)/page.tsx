import { ArrowRight, Plus } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PrivacyBadge } from "@/components/layout/PrivacyBadge";
import { CategoryCard } from "@/components/home/CategoryCard";
import { ToolCard, ToolRow } from "@/components/home/ToolCard";
import { SessionLedger } from "@/components/home/SessionLedger";
import { HomeDropZone } from "@/components/home/HomeDropZone";
import { categoryList, popularTools, tools } from "@/tools/registry";

function SectionHeader({ title, href, label }: { title: string; href: string; label: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-[17px] font-semibold text-fg md:text-lg">{title}</h2>
      <Link href={href} className="flex items-center gap-1 text-[13px] font-medium text-fg-muted hover:text-fg">
        {label}
        <ArrowRight className="hidden size-3.5 md:inline rtl:rotate-180" aria-hidden />
      </Link>
    </div>
  );
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");

  return (
    <div className="flex flex-col gap-8 px-5 pt-3 pb-7 md:gap-12 md:px-12 md:pt-11 md:pb-14">
      <section className="flex flex-col gap-3.5 md:gap-6" aria-labelledby="hero-title">
        <div className="flex flex-col gap-3.5 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
          <div className="flex max-w-[640px] flex-col gap-3.5">
            <PrivacyBadge className="self-start md:hidden" />
            <h1 id="hero-title" className="text-[30px] leading-tight font-bold tracking-tight text-fg md:text-[44px]">
              {t("headline")}
            </h1>
            <p className="hidden text-[15px] text-fg-muted md:block md:text-base">{t("subhead", { count: tools.length })}</p>
            <p className="text-[15px] text-fg-muted md:hidden">{t("subheadMobile", { count: tools.length })}</p>
          </div>
          <div className="hidden lg:block">
            <SessionLedger />
          </div>
        </div>
        <HomeDropZone />
      </section>

      <section className="flex flex-col gap-3 md:gap-4" aria-labelledby="categories-title">
        <SectionHeader title={t("browseByCategory")} href="/tools" label={t("allTools", { count: tools.length })} />
        <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
          {categoryList.map((c) => (
            <CategoryCard key={c.slug} slug={c.slug} compact />
          ))}
          <Link
            href="/tools"
            className="hidden flex-col items-center justify-center gap-2 rounded-lg border-[1.5px] border-dashed border-border-strong text-[13px] font-medium text-fg-muted hover:border-fg-subtle hover:text-fg md:flex"
          >
            <Plus className="size-[18px]" aria-hidden />
            {t("suggestTool")}
          </Link>
        </div>
      </section>

      <section className="flex flex-col gap-3 md:gap-4" aria-labelledby="popular-title">
        <SectionHeader title={t("popular")} href="/tools" label={t("seeAll")} />
        <div className="hidden grid-cols-2 gap-4 md:grid lg:grid-cols-4">
          {popularTools.map((tool) => (
            <ToolCard key={`${tool.category}/${tool.slug}`} category={tool.category} slug={tool.slug} />
          ))}
        </div>
        <div className="flex flex-col gap-3 md:hidden">
          {popularTools.slice(0, 4).map((tool) => (
            <ToolRow key={`${tool.category}/${tool.slug}`} category={tool.category} slug={tool.slug} />
          ))}
        </div>
      </section>
    </div>
  );
}
