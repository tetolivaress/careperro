"use client";

import { useRef, useState } from "react";
import { ImagePlus, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { stashFiles } from "@/lib/fileHandoff";
import { matchesAccept } from "@/lib/fileTypes";
import { categories, toolPath, toolsIn } from "@/tools/registry";
import { useCategoryCopy, useToolCopy } from "@/tools/copy";
import type { Category } from "@/tools/types";

/** Compact dashed drop target in a category header. Opens the category's first file tool. */
export function CategoryQuickDrop({ category }: { category: Category }) {
  const t = useTranslations("home.category");
  const toolCopy = useToolCopy();
  const catCopy = useCategoryCopy();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = toolsIn(category).find((tool) => tool.accept.length > 0);
  if (!target) return null;

  const handle = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    const bad = files.find((f) => !matchesAccept(f, target.accept));
    if (bad) {
      setError(t("notAFile", { name: bad.name, category: catCopy(categories[category]).name.toLowerCase() }));
      return;
    }
    setError(null);
    stashFiles(files);
    router.push(toolPath(target));
  };

  return (
    <div className="hidden flex-col items-end gap-2 lg:flex">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          handle(e.dataTransfer.files);
        }}
        className={cn(
          "flex h-14 items-center gap-3 rounded-lg border-[1.5px] border-dashed px-5 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
          over ? "border-primary bg-primary-soft text-primary" : "border-border-strong bg-surface text-fg-muted hover:border-fg-subtle hover:text-fg",
        )}
      >
        <ImagePlus className="size-[18px]" aria-hidden />
        {t("quickDrop", { tool: toolCopy(target).name.toLowerCase() })}
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          tabIndex={-1}
          aria-label={t("quickDrop", { tool: toolCopy(target).name.toLowerCase() })}
          multiple={target.multiple}
          accept={target.accept.join(",")}
          onChange={(e) => {
            handle(e.target.files);
            e.target.value = "";
          }}
        />
      </button>
      {error && (
        <span role="alert" className="flex items-center gap-1.5 text-xs text-danger">
          <TriangleAlert className="size-3.5" aria-hidden />
          {error}
        </span>
      )}
    </div>
  );
}
