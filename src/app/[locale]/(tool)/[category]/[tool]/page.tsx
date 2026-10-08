import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { localeAlternates } from "@/i18n/seo";
import { ToolLoader } from "@/components/shell/ToolLoader";
import { ToolPageFrame } from "@/components/shell/ToolPageFrame";
import { getCategory, getTool, tools } from "@/tools/registry";
import { getToolCopy } from "@/tools/copy.server";

export const dynamicParams = false;

export function generateStaticParams() {
  return tools.map((t) => ({ category: t.category, tool: t.slug }));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/[category]/[tool]">): Promise<Metadata> {
  const { locale, category, tool } = await params;
  const def = getTool(category, tool);
  if (!def || !hasLocale(routing.locales, locale)) return {};
  const copy = await getToolCopy(locale, def);
  return { title: copy.name, description: copy.description, alternates: localeAlternates(locale, `/${def.category}/${def.slug}`) };
}

export default async function ToolPage({ params }: PageProps<"/[locale]/[category]/[tool]">) {
  const { locale, category, tool } = await params;
  const def = getTool(category, tool);
  const cat = getCategory(category);
  if (!def || !cat || !hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <ToolPageFrame categorySlug={cat.slug} toolSlug={def.slug}>
      <ToolLoader category={cat.slug} slug={def.slug} />
    </ToolPageFrame>
  );
}
