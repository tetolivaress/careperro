"use client";

import { useTranslations } from "next-intl";
import { Check, Loader, Plus, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/formatBytes";
import { useImageEditor } from "./store";

/** Thumbnail strip for batch mode: original size, new size, status; select, remove, add more. */
export function Filmstrip({ onAdd }: { onAdd: () => void }) {
  const t = useTranslations("image.editor");
  const items = useImageEditor((s) => s.items);
  const selectedId = useImageEditor((s) => s.selectedId);
  const select = useImageEditor((s) => s.select);
  const remove = useImageEditor((s) => s.removeItem);
  if (items.length < 2) return null;

  return (
    <div className="scrollbar-thin flex shrink-0 items-stretch gap-2 overflow-x-auto border-t border-border bg-surface px-3 py-2.5" role="listbox" aria-label={t("filmstrip")}>
      {items.map((it) => {
        const active = it.id === selectedId;
        const after = it.result?.blob.size ?? it.estimate?.bytes;
        return (
          <div
            key={it.id}
            role="option"
            aria-selected={active}
            tabIndex={0}
            onClick={() => select(it.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                select(it.id);
              }
            }}
            className={cn("group relative flex w-[132px] shrink-0 cursor-pointer flex-col gap-1.5 rounded-lg border p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/60", active ? "border-primary bg-primary-soft/40" : "border-border bg-surface-2 hover:border-border-strong")}
          >
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[6px] bg-surface-3">
              {it.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.thumbUrl} alt="" className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center text-fg-subtle">
                  {it.status === "error" ? <TriangleAlert className="size-4 text-danger" aria-hidden /> : <Loader className="size-4 animate-spin" aria-hidden />}
                </div>
              )}
              <span className={cn("absolute top-1 start-1 flex size-4 items-center justify-center rounded-full text-[9px]", it.status === "done" ? "bg-primary text-primary-foreground" : it.status === "error" ? "bg-danger text-danger-fg" : it.status === "rendering" ? "bg-warning text-black" : "bg-surface-3 text-fg-subtle")} title={t(`status.${it.status}`)}>
                {it.status === "done" && <Check className="size-2.5" aria-hidden />}
                {it.status === "rendering" && <Loader className="size-2.5 animate-spin" aria-hidden />}
              </span>
              <button
                type="button"
                aria-label={t("remove", { name: it.file.name })}
                onClick={(e) => {
                  e.stopPropagation();
                  remove(it.id);
                }}
                className="absolute top-1 end-1 flex size-5 items-center justify-center rounded-full bg-[#0A0A0BB3] text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              >
                <X className="size-3" aria-hidden />
              </button>
            </div>
            <div className="flex flex-col gap-px px-0.5">
              <span className="truncate text-[11px] font-medium text-fg">{it.file.name}</span>
              <span className="text-[10px] text-fg-subtle">
                {formatBytes(it.file.size)}
                {after !== undefined && <span className="text-fg-muted"> → {formatBytes(after)}</span>}
              </span>
            </div>
          </div>
        );
      })}
      <button type="button" onClick={onAdd} className="flex w-[72px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg border-[1.5px] border-dashed border-border-strong text-[10px] font-medium text-fg-muted hover:border-fg-subtle hover:text-fg">
        <Plus className="size-4" aria-hidden />
        {t("addFiles")}
      </button>
    </div>
  );
}
