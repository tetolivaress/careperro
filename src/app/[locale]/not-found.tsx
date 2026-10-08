import { FileX2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("common.notFound");
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-24 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger">
        <FileX2 className="size-5" aria-hidden />
      </span>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold text-fg">{t("title")}</h1>
        <p className="text-sm text-fg-muted">{t("body")}</p>
      </div>
      <Link href="/" className="flex h-10 items-center rounded-sm border border-border-strong bg-surface-2 px-4 text-sm font-medium text-fg hover:bg-surface-3">
        {t("back")}
      </Link>
    </main>
  );
}
