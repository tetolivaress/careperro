"use client";

import { Globe, Search } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { Logo } from "./Logo";
import { PrivacyBadge } from "./PrivacyBadge";
import { ThemeToggle } from "./ThemeToggle";
import { useUiStore } from "@/stores/ui";

/** Desktop top bar: logo, tool search trigger, privacy badge, language, theme toggle. */
export function TopBar() {
  const openSearch = useUiStore((s) => s.setSearchOpen);

  return (
    <header className="hidden h-[60px] shrink-0 items-center justify-between border-b border-border bg-background px-5 md:flex">
      <div className="flex w-[228px] items-center gap-3">
        <Logo />
      </div>

      <button
        type="button"
        onClick={() => openSearch(true)}
        className="flex h-[38px] w-full max-w-[460px] items-center gap-2.5 rounded-sm border border-border bg-surface-2 pr-2 pl-3 text-left text-sm text-fg-subtle transition-colors hover:border-border-strong hover:text-fg-muted focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
        aria-label="Find a tool"
        aria-keyshortcuts="Meta+K Control+K"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="flex-1">Find a tool...</span>
        <Kbd>⌘K</Kbd>
      </button>

      <div className="flex items-center justify-end gap-2 lg:w-[520px]">
        <PrivacyBadge className="hidden lg:inline-flex" />
        <button
          type="button"
          className="flex h-9 items-center gap-1.5 rounded-sm border border-border px-2.5 text-[13px] font-medium text-fg transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
          aria-label="Language: English"
          title="Spanish arrives in a later release"
        >
          <Globe className="size-[15px] text-fg-muted" aria-hidden />
          EN
        </button>
        <ThemeToggle />
      </div>
    </header>
  );
}
