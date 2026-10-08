import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import { getCategoryCopy, getToolCopy } from "@/tools/copy.server";
import { categories } from "@/tools/registry";
import type { ToolDefinition } from "@/tools/types";

/** "How it works" steps plus FAQ under each tool page, with FAQPage JSON-LD for search engines. */
export async function ToolFaq({ locale, tool }: { locale: Locale; tool: ToolDefinition }) {
  const t = await getTranslations({ locale, namespace: "faq" });
  const copy = await getToolCopy(locale, tool);
  const cat = await getCategoryCopy(locale, categories[tool.category]);
  const items = (["privacy", "offline", "limits", "cost", "formats"] as const).map((k) => ({
    q: t(`items.${k}.q`, { tool: copy.name, formats: cat.formats }),
    a: t(`items.${k}.a`, { tool: copy.name, formats: cat.formats }),
  }));
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
  };

  return (
    <section className="border-t border-border bg-background px-5 py-10 md:px-12" aria-labelledby="how-title">
      <div className="mx-auto flex max-w-[1096px] flex-col gap-10 lg:flex-row lg:gap-16">
        <div className="flex flex-1 flex-col gap-5">
          <h2 id="how-title" className="text-lg font-semibold text-fg">{t("howItWorks")}</h2>
          <ol className="flex flex-col gap-4">
            {(["1", "2", "3"] as const).map((n) => (
              <li key={n} className="flex gap-3.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">{n}</span>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-fg">{t(`steps.${n}.title`)}</span>
                  <p className="text-[13px] leading-relaxed text-fg-muted">{t(`steps.${n}.body`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex flex-1 flex-col gap-5">
          <h2 className="text-lg font-semibold text-fg">{t("faq")}</h2>
          <dl className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {items.map((i) => (
              <div key={i.q} className="flex flex-col gap-1.5 p-4">
                <dt className="text-sm font-semibold text-fg">{i.q}</dt>
                <dd className="text-[13px] leading-relaxed text-fg-muted">{i.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </section>
  );
}
