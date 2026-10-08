import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import type { CategoryDefinition, ToolDefinition } from "./types";
import type { CategoryCopy, ToolCopy } from "./copy";

/** Server-side equivalents of useToolCopy / useCategoryCopy for metadata generation. */
export async function getToolCopy(locale: Locale, tool: ToolDefinition): Promise<ToolCopy> {
  const t = await getTranslations({ locale, namespace: "tools" });
  const base = `items.${tool.category}.${tool.slug}`;
  const description = t.has(`${base}.description`) ? t(`${base}.description`) : tool.description;
  return {
    name: t.has(`${base}.name`) ? t(`${base}.name`) : tool.name,
    description,
    short: t.has(`${base}.short`) ? t(`${base}.short`) : (tool.shortDescription ?? description),
  };
}

export async function getCategoryCopy(locale: Locale, c: CategoryDefinition): Promise<CategoryCopy> {
  const t = await getTranslations({ locale, namespace: "tools" });
  const base = `categories.${c.slug}`;
  return {
    name: t.has(`${base}.name`) ? t(`${base}.name`) : c.name,
    title: t.has(`${base}.title`) ? t(`${base}.title`) : c.title,
    description: t.has(`${base}.description`) ? t(`${base}.description`) : c.description,
    formats: t.has(`${base}.formats`) ? t(`${base}.formats`) : c.formats,
  };
}
