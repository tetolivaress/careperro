"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { marked } from "marked";
import { TwoPaneTool, OptionCheckbox } from "@/components/shell/TwoPaneTool";
import { Segmented } from "@/components/shell/Segmented";

const SAMPLE = `# Caribito

Everything runs **in your browser**. Nothing is uploaded.

## Features

- Compress and convert images
- Trim audio and video
- Merge, split and sign PDFs

| Tool | Status |
| --- | --- |
| Markdown | ✅ |

> Privacy first, always.

\`\`\`ts
const files = "stay on your device";
\`\`\`
`;

/** Strips scripts, event handlers and javascript: URLs from rendered HTML before it reaches the DOM. */
function sanitize(html: string): string {
  // Sanitizing needs a DOM; during static prerender there is none and the preview is empty anyway.
  if (typeof DOMParser === "undefined") return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, iframe, object, embed, style, link, meta, base, form").forEach((el) => el.remove());
  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith("on") || ((name === "href" || name === "src" || name === "xlink:href") && (value.startsWith("javascript:") || value.startsWith("data:text/html")))) {
        el.removeAttribute(attr.name);
      }
    }
    if (el.tagName === "A") {
      el.setAttribute("rel", "noopener noreferrer");
      el.setAttribute("target", "_blank");
    }
  });
  return doc.body.innerHTML;
}

export default function MarkdownTool() {
  const t = useTranslations("text.markdown");
  const [input, setInput] = useState("");
  const [view, setView] = useState<"preview" | "html">("preview");
  const [gfm, setGfm] = useState(true);
  const html = useMemo(() => {
    const raw = marked.parse(input, { gfm, breaks: gfm, async: false });
    return sanitize(raw);
  }, [input, gfm]);

  const fullDoc = `<!doctype html>\n<html><head><meta charset="utf-8"><title>Markdown</title></head><body>\n${html}\n</body></html>`;

  return (
    <TwoPaneTool
      input={input}
      onInputChange={setInput}
      inputPlaceholder={t("placeholder")}
      sample={SAMPLE}
      accept={[".md", ".markdown", ".txt", "text/markdown", "text/plain"]}
      outputText={view === "html" ? html : fullDoc}
      downloadName="document.html"
      downloadMime="text/html"
      outputLabel={view === "preview" ? t("preview") : t("html")}
      options={
        <>
          <OptionCheckbox label={t("gfm")} checked={gfm} onChange={setGfm} />
          <Segmented
            label={t("preview")}
            size="sm"
            className="w-auto"
            value={view}
            onChange={setView}
            options={[
              { value: "preview", label: t("preview") },
              { value: "html", label: t("html") },
            ]}
          />
        </>
      }
      output={
        view === "html" ? (
          <textarea readOnly value={html} aria-label={t("html")} className="scrollbar-thin min-h-0 w-full flex-1 resize-none bg-transparent p-3.5 font-mono text-[13px] leading-relaxed text-fg outline-none" />
        ) : (
          <div
            className="prose-caribito scrollbar-thin flex-1 overflow-auto p-5 text-sm leading-relaxed text-fg"
            // Sanitized above: scripts, handlers and javascript: URLs are removed before rendering.
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )
      }
    />
  );
}
