/** Spanish first (default), then the ten most-used languages on the internet. */
export const LOCALES = ["es", "en", "zh", "ar", "pt", "fr", "id", "ja", "ru", "de", "hi"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "es";
export const RTL_LOCALES: readonly Locale[] = ["ar"];

export const LOCALE_NAMES: Record<Locale, string> = {
  es: "Español",
  en: "English",
  zh: "中文",
  ar: "العربية",
  pt: "Português",
  fr: "Français",
  id: "Bahasa Indonesia",
  ja: "日本語",
  ru: "Русский",
  de: "Deutsch",
  hi: "हिन्दी",
};

/** Short code shown in the top bar pill. */
export const LOCALE_SHORT: Record<Locale, string> = {
  es: "ES",
  en: "EN",
  zh: "中文",
  ar: "AR",
  pt: "PT",
  fr: "FR",
  id: "ID",
  ja: "日本",
  ru: "RU",
  de: "DE",
  hi: "HI",
};

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function dirFor(locale: Locale): "ltr" | "rtl" {
  return RTL_LOCALES.includes(locale) ? "rtl" : "ltr";
}
