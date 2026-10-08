"use client";

import { useEffect } from "react";
import { Check, MonitorDown, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useInstallStore } from "@/stores/install";

/** "Works offline" card at the bottom of the sidebar with the PWA install prompt. */
export function OfflineCard() {
  const t = useTranslations("common.offline");
  const deferred = useInstallStore((s) => s.deferred);
  const installed = useInstallStore((s) => s.installed);
  const listen = useInstallStore((s) => s.listen);
  const prompt = useInstallStore((s) => s.prompt);
  useEffect(() => listen(), [listen]);
  const canInstall = !!deferred && !installed;

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-surface p-3.5">
      <div className="flex items-center gap-2">
        <WifiOff className="size-[15px] text-primary" aria-hidden />
        <span className="text-[13px] font-semibold text-fg">{t("title")}</span>
      </div>
      <p className="text-xs leading-relaxed text-fg-muted">{t("body")}</p>
      <button
        type="button"
        onClick={() => void prompt()}
        disabled={!canInstall}
        title={installed ? t("installed") : canInstall ? undefined : t("installHint")}
        className="flex h-8 w-full items-center justify-center gap-2 rounded-sm border border-border-strong bg-surface-2 text-[13px] font-medium text-fg hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {installed ? <Check className="size-4 text-primary" aria-hidden /> : <MonitorDown className="size-4 text-fg-muted" aria-hidden />}
        {installed ? t("installed") : t("install")}
      </button>
    </div>
  );
}
