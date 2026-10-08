import { MonitorDown, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";

/** "Works offline" card at the bottom of the sidebar. Install action lands with the PWA in phase 8. */
export function OfflineCard() {
  const t = useTranslations("common.offline");
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-surface p-3.5">
      <div className="flex items-center gap-2">
        <WifiOff className="size-[15px] text-primary" aria-hidden />
        <span className="text-[13px] font-semibold text-fg">{t("title")}</span>
      </div>
      <p className="text-xs leading-relaxed text-fg-muted">{t("body")}</p>
      <button
        type="button"
        disabled
        title={t("installHint")}
        className="flex h-8 w-full items-center justify-center gap-2 rounded-sm border border-border-strong bg-surface-2 text-[13px] font-medium text-fg disabled:cursor-not-allowed disabled:opacity-60"
      >
        <MonitorDown className="size-4 text-fg-muted" aria-hidden />
        {t("install")}
      </button>
    </div>
  );
}
