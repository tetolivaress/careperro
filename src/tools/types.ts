import type { ComponentType } from "react";
import type { IconName } from "@/lib/icons";

export const CATEGORIES = ["image", "audio", "video", "pdf", "text", "dev", "privacy"] as const;

export type Category = (typeof CATEGORIES)[number];

export interface CategoryDefinition {
  slug: Category;
  /** Short nav label, e.g. "Images". */
  name: string;
  /** Page title, e.g. "Image tools". */
  title: string;
  description: string;
  /** Formats line shown under the category title. */
  formats: string;
  icon: IconName;
}

export interface ToolDefinition {
  /** URL segment, e.g. "compress". */
  slug: string;
  category: Category;
  name: string;
  /** One line, used on cards and in meta tags. */
  description: string;
  /** Shorter copy for compact mobile rows. Falls back to description. */
  shortDescription?: string;
  icon: IconName;
  /** MIME types or extensions. Empty for text-only tools. */
  accept: string[];
  /** Supports batch processing. */
  multiple: boolean;
  /** Per-tool file size limit in bytes, enforced by DropZone. */
  maxSize?: number;
  /** Extra search terms. */
  keywords?: string[];
  /** Shown in the "Popular right now" section on the home page. */
  popular?: boolean;
  /** Lazy loaded tool component. */
  component: () => Promise<{ default: ComponentType }>;
}

export type ToolPath = `/${Category}/${string}`;
