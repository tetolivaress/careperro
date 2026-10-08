import type { Metadata } from "next";
import { SITE } from "@/lib/site";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "./locales";

/** Canonical + hreflang alternates for a path such as "/image/compress". */
export function localeAlternates(locale: Locale, path: string): NonNullable<Metadata["alternates"]> {
  const clean = path === "/" ? "" : path.replace(/\/$/, "");
  const languages: Record<string, string> = {};
  for (const l of LOCALES) languages[l] = `${SITE.url}/${l}${clean}/`;
  languages["x-default"] = `${SITE.url}/${DEFAULT_LOCALE}${clean}/`;
  return { canonical: `${SITE.url}/${locale}${clean}/`, languages };
}
