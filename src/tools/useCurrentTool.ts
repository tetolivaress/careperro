"use client";

import { useMemo } from "react";
import { usePathname } from "@/i18n/navigation";
import { getTool } from "./registry";
import type { ToolDefinition } from "./types";

/** Resolves the registry entry for the tool page currently rendered, from the locale-stripped URL. */
export function useCurrentTool(): ToolDefinition | undefined {
  const pathname = usePathname();
  return useMemo(() => {
    const [, category = "", slug = ""] = pathname.split("/");
    return getTool(category, slug);
  }, [pathname]);
}
