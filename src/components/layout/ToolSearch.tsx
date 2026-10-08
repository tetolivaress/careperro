"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { IconTile } from "@/components/ui/icon-tile";
import { categories, toolPath, tools } from "@/tools/registry";
import { useUiStore } from "@/stores/ui";
import { cn } from "@/lib/utils";

function score(query: string, haystack: string[]): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  let best = 0;
  for (const h of haystack) {
    const v = h.toLowerCase();
    if (v === q) best = Math.max(best, 100);
    else if (v.startsWith(q)) best = Math.max(best, 60);
    else if (v.includes(q)) best = Math.max(best, 30);
  }
  return best;
}

/** ⌘K / Ctrl+K command palette over the tool registry. */
export function ToolSearch() {
  const open = useUiStore((s) => s.searchOpen);
  const setOpen = useUiStore((s) => s.setSearchOpen);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const router = useRouter();
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!useUiStore.getState().searchOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setQuery("");
      setActive(0);
    }
  };

  const results = useMemo(() => {
    const scored = tools
      .map((t) => ({
        tool: t,
        score: score(query, [t.name, t.description, categories[t.category].name, ...(t.keywords ?? [])]),
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name));
    return scored.slice(0, query.trim() ? 12 : 8).map((r) => r.tool);
  }, [query]);

  const go = (index: number) => {
    const tool = results[index];
    if (!tool) return;
    close(false);
    router.push(toolPath(tool));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(active);
    }
  };

  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        showCloseButton={false}
        className="top-[12%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Find a tool</DialogTitle>
        <div className="flex h-14 items-center gap-3 border-b border-border px-4">
          <Search className="size-4 shrink-0 text-fg-subtle" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Find a tool..."
            aria-label="Find a tool"
            aria-activedescendant={results[active] ? `search-${results[active].category}-${results[active].slug}` : undefined}
            className="h-full flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-subtle"
          />
          <Kbd>esc</Kbd>
        </div>
        <ul ref={listRef} role="listbox" aria-label="Tools" className="scrollbar-thin max-h-[min(60vh,420px)] overflow-y-auto p-2">
          {results.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-fg-muted">No tools match “{query}”.</li>
          )}
          {results.map((tool, i) => (
            <li
              key={`${tool.category}/${tool.slug}`}
              id={`search-${tool.category}-${tool.slug}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(i)}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-sm px-2.5 py-2",
                i === active ? "bg-surface-2" : "hover:bg-surface-2/60",
              )}
            >
              <IconTile icon={tool.icon} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-fg">{tool.name}</div>
                <div className="truncate text-xs text-fg-muted">{tool.description}</div>
              </div>
              <span className="hidden text-xs text-fg-subtle sm:inline">{categories[tool.category].name}</span>
              <ArrowRight className={cn("size-4 text-fg-subtle", i === active ? "opacity-100" : "opacity-0")} aria-hidden />
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[11px] text-fg-subtle">
          <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
          <span className="flex items-center gap-1"><Kbd>↵</Kbd> open</span>
          <span className="ml-auto">{tools.length} tools · all on-device</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
