"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { TriangleAlert } from "lucide-react";

/** Route error boundary: friendly recovery without losing the shell. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("common.error");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main role="alert" className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-24 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger">
        <TriangleAlert className="size-5" aria-hidden />
      </span>
      <div className="flex max-w-md flex-col gap-1.5">
        <h1 className="text-xl font-semibold text-fg">{t("title")}</h1>
        <p className="text-sm text-fg-muted">{t("body")}</p>
        {error.message && <code className="mt-2 rounded-sm bg-surface-2 px-2 py-1 font-mono text-[11px] text-fg-subtle">{error.message}</code>}
      </div>
      <button type="button" onClick={reset} className="flex h-10 items-center rounded-sm bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
        {t("retry")}
      </button>
    </main>
  );
}
