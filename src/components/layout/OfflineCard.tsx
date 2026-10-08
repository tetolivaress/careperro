import { MonitorDown, WifiOff } from "lucide-react";

/** "Works offline" card at the bottom of the sidebar. Install action lands with the PWA in phase 8. */
export function OfflineCard() {
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-surface p-3.5">
      <div className="flex items-center gap-2">
        <WifiOff className="size-[15px] text-primary" aria-hidden />
        <span className="text-[13px] font-semibold text-fg">Works offline</span>
      </div>
      <p className="text-xs leading-relaxed text-fg-muted">
        No uploads, no accounts, no tracking. Install it like a desktop app.
      </p>
      <button
        type="button"
        disabled
        title="Install becomes available once the app ships as a PWA"
        className="flex h-8 w-full items-center justify-center gap-2 rounded-sm border border-border-strong bg-surface-2 text-[13px] font-medium text-fg disabled:cursor-not-allowed disabled:opacity-60"
      >
        <MonitorDown className="size-4 text-fg-muted" aria-hidden />
        Install app
      </button>
    </div>
  );
}
