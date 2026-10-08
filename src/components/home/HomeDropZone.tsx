"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
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
  const t = useTranslations("home.drop");
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const [note, setNote] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <DropZone
        multiple
        size={isDesktop ? "default" : "compact"}
        title={isDesktop ? t("title") : t("titleMobile")}
        subtitle={isDesktop ? t("subtitle") : t("subtitleMobile")}
        moreLabel={t("more", { count: Math.max(tools.length - 9, 0) })}
        onFiles={(files) => {
          const tool = suggestTool(files[0]);
          if (!tool) {
            setNote(t("noTool", { name: files[0].name }));
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
