import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AnnouncementBar } from "@/components/layout/AnnouncementBar";
import { TopBar } from "@/components/layout/TopBar";
import { ToolSearch } from "@/components/layout/ToolSearch";
import { MobileDrawer } from "@/components/layout/MobileDrawer";
import { APP_NAME } from "@/components/layout/Logo";
import { tools } from "@/tools/registry";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — Edit any file. Upload nothing.`,
    template: `%s · ${APP_NAME}`,
  },
  description: `${tools.length} tools for images, audio, video, PDFs and code that run entirely in your browser. No uploads, no sign-up, no ads.`,
  applicationName: APP_NAME,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0b" },
    { media: "(prefers-color-scheme: light)", color: "#f7f7f8" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} h-full`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <TooltipProvider>
            <div className="flex min-h-dvh flex-col">
              <AnnouncementBar />
              <TopBar />
              {children}
            </div>
            <ToolSearch />
            <MobileDrawer />
            <Toaster position="bottom-right" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
