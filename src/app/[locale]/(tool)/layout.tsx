import { setRequestLocale } from "next-intl/server";
import { AdaptiveSidebar } from "@/components/layout/Sidebar";

/** Tool pages: collapsed rail on desktop by default; mobile gets its own nav bar inside the frame. */
export default async function ToolLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <div className="flex flex-1 flex-row items-stretch">
      <AdaptiveSidebar defaultCollapsed />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
