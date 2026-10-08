"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DropZone } from "@/components/shell/DropZone";
import { kindOf } from "@/lib/fileTypes";
import { toolPath, tools } from "@/tools/registry";
import type { ToolDefinition } from "@/tools/types";
import { useIsDesktop } from "@/hooks/use-media-query";
import { stashFiles } from "@/lib/fileHandoff";

/** Picks the most sensible tool for a dropped file. */
export function suggestTool(file: File): ToolDefinition | undefined {
  const kind = kindOf(file);
  const prefer: Record<string, string> = {
    image: "image/compress",
    audio: "audio/trim",
    video: "video/compress",
    pdf: "pdf/organize",
    text: "dev/json",
    archive: "privacy/zip",
  };
  const key = prefer[kind];
  if (!key) return undefined;
  const [category, slug] = key.split("/");
  return tools.find((t) => t.category === category && t.slug === slug);
}

export function HomeDropZone() {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const [note, setNote] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <DropZone
        multiple
        size={isDesktop ? "default" : "compact"}
        title={isDesktop ? "Drop any file and we'll suggest tools" : "Drop a file or tap to browse"}
        subtitle={isDesktop ? "or click to browse · nothing is uploaded, ever" : "We'll suggest the right tools"}
        moreLabel={`+${Math.max(tools.length - 9, 0)} more`}
        onFiles={(files) => {
          const tool = suggestTool(files[0]);
          if (!tool) {
            setNote(`We don't have a tool for “${files[0].name}” yet. Browse the categories below.`);
            return;
          }
          stashFiles(files);
          router.push(toolPath(tool));
        }}
      />
      {note && (
        <p role="status" className="text-sm text-fg-muted">
          {note}
        </p>
      )}
    </div>
  );
}
