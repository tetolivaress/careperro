import type { Locale } from "./locales";

/**
 * One JSON file per namespace per locale under /messages/<locale>/.
 * Each tool category owns its namespace so phases can be built independently.
 * Locales fall back to English key by key, so a missing translation never breaks a page.
 */
export const NAMESPACES = [
  "common",
  "home",
  "shell",
  "tools",
  "image",
  "pdf",
  "audio",
  "video",
  "text",
  "dev",
  "privacy",
  "faq",
] as const;

export type Namespace = (typeof NAMESPACES)[number];
export type Messages = Record<string, unknown>;

const FALLBACK: Locale = "en";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(override)) {
    const b = out[k];
    out[k] = isRecord(b) && isRecord(v) ? deepMerge(b, v) : v;
  }
  return out;
}

async function loadNamespace(locale: Locale, ns: Namespace): Promise<Record<string, unknown>> {
  const mod = (await import(`../../messages/${locale}/${ns}.json`)) as { default: Record<string, unknown> };
  return mod.default;
}

export async function loadMessages(locale: Locale): Promise<Messages> {
  const parts = await Promise.all(
    NAMESPACES.map(async (ns) => {
      const en = await loadNamespace(FALLBACK, ns);
      const own = locale === FALLBACK ? en : await loadNamespace(locale, ns);
      return [ns, deepMerge(en, own)] as const;
    }),
  );
  return Object.fromEntries(parts);
}
