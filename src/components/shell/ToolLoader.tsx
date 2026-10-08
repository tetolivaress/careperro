"use client";

import { Suspense, lazy, type ComponentType, type LazyExoticComponent } from "react";
import { Loader } from "lucide-react";
import { getTool, tools } from "@/tools/registry";
import type { Category } from "@/tools/types";

/**
 * One lazy wrapper per registry entry, created once at module scope so React keeps a stable
 * component identity. Nothing is fetched until a tool page actually renders it.
 */
const lazyComponents: ReadonlyMap<string, LazyExoticComponent<ComponentType>> = new Map(
  tools.map((t) => [`${t.category}/${t.slug}`, lazy(t.component)]),
);

/** Lazily loads a tool's component from the registry so heavy code ships only when its page opens. */
export function ToolLoader({ category, slug }: { category: Category; slug: string }) {
  const tool = getTool(category, slug);
  const Component = lazyComponents.get(`${category}/${slug}`);
  if (!tool || !Component) return null;

  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-fg-muted" role="status">
          <Loader className="size-4 animate-spin" aria-hidden />
          Loading {tool.name.toLowerCase()}…
        </div>
      }
    >
      {/* The lazy wrapper was created once at module scope; this only reads the cache. */}
      {/* eslint-disable-next-line react-hooks/static-components */}
      <Component />
    </Suspense>
  );
}
