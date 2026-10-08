"use client";

import { ArrowRight, Tag, X } from "lucide-react";
import { useUiStore } from "@/stores/ui";

/** Dismissible announcement strip above the top bar ("Domain For Sale" in the design). */
export function AnnouncementBar() {
  const dismissed = useUiStore((s) => s.announcementDismissed);
  const dismiss = useUiStore((s) => s.dismissAnnouncement);
  if (dismissed) return null;

  return (
    <div className="flex min-h-10 items-center border-b border-primary-line bg-primary-soft px-3 py-2 text-[13px] md:py-0">
      <div className="hidden flex-1 md:block" />
      <div className="flex flex-1 flex-wrap items-center gap-x-2.5 gap-y-1 md:flex-none md:justify-center">
        <Tag className="size-[15px] shrink-0 text-primary" aria-hidden />
        <span className="font-semibold text-fg">This domain is for sale.</span>
        <span className="hidden text-fg-muted lg:inline">Interested in owning it? We&apos;re open to offers.</span>
        <a
          href="mailto:hello@example.com?subject=Domain%20offer"
          className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
        >
          Make an offer
          <ArrowRight className="size-3.5" aria-hidden />
        </a>
      </div>
      <div className="flex flex-1 justify-end">
        <button
          type="button"
          onClick={dismiss}
          className="flex size-7 items-center justify-center rounded-md text-fg-muted hover:bg-primary-line/40 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
          aria-label="Dismiss announcement"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
