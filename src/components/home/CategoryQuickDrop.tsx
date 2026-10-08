"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ImagePlus, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { stashFiles } from "@/lib/fileHandoff";
import { matchesAccept } from "@/lib/fileTypes";
import { toolPath, toolsIn } from "@/tools/registry";
import type { Category } from "@/tools/types";

/** Compact dashed drop target in a category header. Opens the category's first file tool. */
export function CategoryQuickDrop({ category }: { category: Category }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = toolsIn(category).find((t) => t.accept.length > 0);
  if (!target) return null;

  const handle = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    const bad = files.find((f) => !matchesAccept(f, target.accept));
    if (bad) {
      setError(`“${bad.name}” isn't a ${category} file.`);
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
        Drop files to open in {target.name.toLowerCase()}
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          tabIndex={-1}
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
