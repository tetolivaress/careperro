import type { Category, CategoryDefinition } from "./types";

export const categories: Record<Category, CategoryDefinition> = {
  image: {
    slug: "image",
    name: "Images",
    title: "Image tools",
    description: "Compress, resize, crop, convert, watermark",
    formats: "JPG, PNG, WebP, AVIF, HEIC, GIF, SVG",
    icon: "image",
  },
  audio: {
    slug: "audio",
    name: "Audio",
    title: "Audio tools",
    description: "Trim, convert, normalize, change speed",
    formats: "MP3, WAV, OGG, M4A, FLAC",
    icon: "audio-lines",
  },
  video: {
    slug: "video",
    name: "Video",
    title: "Video tools",
    description: "Trim, compress, crop, extract audio, GIF",
    formats: "MP4, WebM, MOV",
    icon: "clapperboard",
  },
  pdf: {
    slug: "pdf",
    name: "PDF",
    title: "PDF tools",
    description: "Merge, split, compress, sign, reorder",
    formats: "PDF",
    icon: "file-text",
  },
  text: {
    slug: "text",
    name: "Text",
    title: "Text tools",
    description: "Count, compare, change case, clean up",
    formats: "Plain text, Markdown",
    icon: "type",
  },
  dev: {
    slug: "dev",
    name: "Developer",
    title: "Developer tools",
    description: "JSON, Base64, hashes, regex, JWT, UUID",
    formats: "JSON, CSV, XLSX",
    icon: "code-xml",
  },
  privacy: {
    slug: "privacy",
    name: "Privacy",
    title: "Privacy tools",
    description: "Strip metadata, redact, encrypt files",
    formats: "Any file",
    icon: "shield",
  },
};

export const categoryList: CategoryDefinition[] = Object.values(categories);
