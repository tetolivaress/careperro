"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Check, Loader, TriangleAlert } from "lucide-react";
import { ToolHeader } from "@/components/shell/TwoPaneTool";
import type { SaveStatus } from "./WhiteboardBoard";

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string | string[];
  }
}

function BoardLoading() {
  const t = useTranslations("productivity.whiteboard");
  return (
    <div className="flex size-full items-center justify-center gap-2 text-sm text-fg-muted" role="status">
      <Loader className="size-4 animate-spin" aria-hidden />
      {t("loading")}
    </div>
  );
}

// Excalidraw touches window on import, so it only loads in the browser. Fonts come from our own
// /excalidraw-assets/ (copied at build time) instead of Excalidraw's CDN.
const Board = dynamic(
  async () => {
    window.EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/";
    return import("./WhiteboardBoard");
  },
  { ssr: false, loading: BoardLoading },
);

export default function WhiteboardTool() {
  const t = useTranslations("productivity.whiteboard");
  const locale = useLocale();
  const { resolvedTheme } = useTheme();
  const [status, setStatus] = useState<SaveStatus>("idle");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-2 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6">
        <ToolHeader />
        <p className="flex items-center gap-1.5 text-xs text-fg-muted" aria-live="polite">
          {status === "saving" && <Loader className="size-3.5 animate-spin" aria-hidden />}
          {status === "saved" && <Check className="size-3.5 text-primary" aria-hidden />}
          {status === "error" && <TriangleAlert className="size-3.5 text-warning" aria-hidden />}
          {status === "saving" ? t("saving") : status === "saved" ? t("saved") : status === "error" ? t("storageError") : t("hint")}
        </p>
      </div>
      {/* Excalidraw fills its parent, so the parent needs a real height. */}
      <div className="relative min-h-[560px] flex-1">
        <div className="absolute inset-0">
          <Board locale={locale} theme={resolvedTheme === "light" ? "light" : "dark"} welcome={t("welcome")} onStatus={setStatus} />
        </div>
      </div>
    </div>
  );
}
