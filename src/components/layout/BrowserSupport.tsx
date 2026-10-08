"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { TriangleAlert } from "lucide-react";

const subscribeNoop = () => () => {};

function missingFeatures(): string[] {
  if (typeof window === "undefined") return [];
  const missing: string[] = [];
  if (typeof Worker === "undefined") missing.push("Web Workers");
  if (typeof OffscreenCanvas === "undefined") missing.push("OffscreenCanvas");
  if (typeof createImageBitmap === "undefined") missing.push("createImageBitmap");
  if (!("crypto" in window) || !window.crypto?.subtle) missing.push("Web Crypto");
  return missing;
}

/** Shows a one-line warning when the browser lacks APIs the tools depend on. Renders nothing otherwise. */
export function BrowserSupport() {
  const t = useTranslations("common.unsupported");
  const missing = useSyncExternalStore(subscribeNoop, () => missingFeatures().join(", "), () => "");
  if (!missing) return null;
  return (
    <div role="alert" className="flex items-center gap-2.5 border-b border-warning/30 bg-warning-soft px-4 py-2 text-[13px] text-fg">
      <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden />
      <span>{t("body", { features: missing })}</span>
    </div>
  );
}
