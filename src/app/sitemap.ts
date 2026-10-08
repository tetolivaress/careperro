import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { DEFAULT_LOCALE, LOCALES } from "@/i18n/locales";
import { categoryList, tools } from "@/tools/registry";

export const dynamic = "force-static";

function entry(path: string, priority: number, changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]): MetadataRoute.Sitemap {
  const clean = path === "/" ? "" : path;
  const languages: Record<string, string> = {};
  for (const l of LOCALES) languages[l] = `${SITE.url}/${l}${clean}/`;
  languages["x-default"] = `${SITE.url}/${DEFAULT_LOCALE}${clean}/`;
  return LOCALES.map((l) => ({
    url: `${SITE.url}/${l}${clean}/`,
    lastModified: new Date(),
    changeFrequency,
    priority,
    alternates: { languages },
  }));
}

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...entry("/", 1, "weekly"),
    ...entry("/tools", 0.8, "weekly"),
    ...categoryList.flatMap((c) => entry(`/${c.slug}`, 0.8, "weekly")),
    ...tools.flatMap((t) => entry(`/${t.category}/${t.slug}`, 0.7, "monthly")),
  ];
}
