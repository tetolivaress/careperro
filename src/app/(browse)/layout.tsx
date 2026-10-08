import { AdaptiveSidebar } from "@/components/layout/Sidebar";
import { MobileHeader } from "@/components/layout/MobileHeader";
import { MobileTabBar } from "@/components/layout/MobileTabBar";

/** Browse pages (home, category grids): full sidebar on desktop, header + tab bar on mobile. */
export default function BrowseLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <MobileHeader />
      <AdaptiveSidebar defaultCollapsed={false} />
      <main className="flex min-w-0 flex-1 flex-col pb-28 md:pb-0">{children}</main>
      <MobileTabBar />
    </div>
  );
}
