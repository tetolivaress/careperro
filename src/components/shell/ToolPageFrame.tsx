"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { ToolNavBar } from "./ToolNavBar";
import { useToolShellStore } from "@/stores/toolShell";
import type { Category } from "@/tools/types";

/**
 * Client wrapper around a tool page. Resets shared shell state when the tool changes and
 * renders the mobile nav bar (back, title, more) above the tool.
 */
export function ToolPageFrame({
  categorySlug,
  toolSlug,
  children,
}: {
  categorySlug: Category;
  toolSlug: string;
  children: ReactNode;
}) {
  const reset = useToolShellStore((s) => s.reset);
  useEffect(() => {
    reset();
    return () => reset();
  }, [categorySlug, toolSlug, reset]);

  return (
    <>
      <ToolNavBar categorySlug={categorySlug} toolSlug={toolSlug} />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </>
  );
}
