import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import "../globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AnnouncementBar } from "@/components/layout/AnnouncementBar";
import { TopBar } from "@/components/layout/TopBar";
import { ToolSearch } from "@/components/layout/ToolSearch";
import { MobileDrawer } from "@/components/layout/MobileDrawer";
import { BrowserSupport } from "@/components/layout/BrowserSupport";
import { ServiceWorker } from "@/components/layout/ServiceWorker";
import { Analytics } from "@vercel/analytics/next";
import { SITE } from "@/lib/site";
import { routing } from "@/i18n/routing";
import { dirFor, LOCALES, type Locale } from "@/i18n/locales";
import { localeAlternates } from "@/i18n/seo";
import { tools } from "@/tools/registry";

const inter = Inter({ variable: "--font-inter", subsets: ["latin", "latin-ext", "cyrillic"], display: "optional" });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"], display: "swap" });

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "home" });
  const title = `${SITE.name} — ${t("headline")}`;
  const description = t("subhead", { count: tools.length });
  return {
    metadataBase: new URL(SITE.url),
    title: { default: title, template: `%s · ${SITE.name}` },
    description,
    applicationName: SITE.name,
    alternates: localeAlternates(locale, "/"),
    icons: {
      icon: [
        { url: "/icons/icon.svg", type: "image/svg+xml" },
        { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
        { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
        { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      ],
      apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
    openGraph: { type: "website", siteName: SITE.name, url: `${SITE.url}/${locale}/`, title, description, locale, images: [{ url: "/og.png", width: 1200, height: 630, alt: SITE.name }] },
    twitter: { card: "summary_large_image", images: ["/og.png"] },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0b" },
    { media: "(prefers-color-scheme: light)", color: "#f7f7f8" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const LOCALE_FONT_CLASS: Partial<Record<Locale, string>> = {
  ar: "font-arabic",
  hi: "font-devanagari",
  ja: "font-jp",
  zh: "font-sc",
};

export default async function RootLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const fontVars = [inter.variable, jetbrainsMono.variable].join(" ");

  return (
    <html lang={locale} dir={dirFor(locale)} className={`${fontVars} ${LOCALE_FONT_CLASS[locale] ?? ""} h-full`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
          <ThemeProvider>
            <TooltipProvider>
              <div className="flex min-h-dvh flex-col">
                <BrowserSupport />
                <AnnouncementBar />
                <TopBar />
                {children}
              </div>
              <ToolSearch />
              <MobileDrawer />
              <Toaster position="bottom-right" />
              <ServiceWorker />
              <Analytics />
            </TooltipProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
