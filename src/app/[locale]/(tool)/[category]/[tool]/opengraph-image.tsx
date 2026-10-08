import { ImageResponse } from "next/og";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { SITE } from "@/lib/site";
import { getTool, tools } from "@/tools/registry";
import { getCategoryCopy, getToolCopy } from "@/tools/copy.server";
import { categories } from "@/tools/registry";

export const dynamic = "force-static";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return tools.map((t) => ({ category: t.category, tool: t.slug }));
}

export async function generateImageMetadata({ params }: { params: Promise<{ locale: string; category: string; tool: string }> }) {
  const { locale, category, tool } = await params;
  const def = getTool(category, tool);
  if (!def || !hasLocale(routing.locales, locale)) return [];
  const copy = await getToolCopy(locale, def);
  return [{ id: "og", alt: `${copy.name} · ${SITE.name}`, size, contentType }];
}

export default async function Image({ params }: { params: Promise<{ locale: string; category: string; tool: string }> }) {
  const { locale, category, tool } = await params;
  const def = getTool(category, tool);
  const loc = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
  const copy = def ? await getToolCopy(loc, def) : { name: SITE.name, description: SITE.tagline, short: "" };
  const cat = def ? await getCategoryCopy(loc, categories[def.category]) : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#0a0a0b",
          color: "#f2f2f3",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "#3ddc97", display: "flex" }} />
          <div style={{ fontSize: 36, fontWeight: 700 }}>{SITE.name}</div>
          {cat && (
            <div style={{ marginLeft: 16, fontSize: 24, color: "#a0a0a8", display: "flex" }}>
              / {cat.name}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05 }}>{copy.name}</div>
          <div style={{ fontSize: 32, color: "#a0a0a8", lineHeight: 1.3 }}>{copy.description}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", borderRadius: 999, border: "2px solid #3ddc9740", background: "#3ddc971a", color: "#3ddc97", fontSize: 24, fontWeight: 600 }}>
            ● {loc === "es" ? "Tus archivos no salen de tu dispositivo" : "Your files stay on your device"}
          </div>
          <div style={{ marginLeft: "auto", fontSize: 24, color: "#6e6e76" }}>{SITE.domain}</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
