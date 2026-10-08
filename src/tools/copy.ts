"use client";

import { useTranslations } from "next-intl";
import type { CategoryDefinition, ToolDefinition } from "./types";

export interface ToolCopy {
  name: string;
  description: string;
  short: string;
}

/** Localized name and description for a registry tool, falling back to the English registry copy. */
export function useToolCopy(): (tool: ToolDefinition) => ToolCopy {
  const t = useTranslations("tools");
  return (tool) => {
    const base = `items.${tool.category}.${tool.slug}`;
    const name = t.has(`${base}.name`) ? t(`${base}.name`) : tool.name;
    const description = t.has(`${base}.description`) ? t(`${base}.description`) : tool.description;
    const short = t.has(`${base}.short`) ? t(`${base}.short`) : (tool.shortDescription ?? description);
    return { name, description, short };
  };
}

export interface CategoryCopy {
  name: string;
  title: string;
  description: string;
  formats: string;
}

export function useCategoryCopy(): (category: CategoryDefinition) => CategoryCopy {
  const t = useTranslations("tools");
  return (c) => {
    const base = `categories.${c.slug}`;
    return {
      name: t.has(`${base}.name`) ? t(`${base}.name`) : c.name,
      title: t.has(`${base}.title`) ? t(`${base}.title`) : c.title,
      description: t.has(`${base}.description`) ? t(`${base}.description`) : c.description,
      formats: t.has(`${base}.formats`) ? t(`${base}.formats`) : c.formats,
    };
  };
}
