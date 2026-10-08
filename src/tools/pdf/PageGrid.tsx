"use client";

import { memo, useCallback, useRef, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, GripVertical, RotateCw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useThumbnail } from "./thumbnails";
import { useOrganizerStore, type PageItem, type SourceDoc } from "./store";

const THUMB_WIDTH = { sm: 120, md: 164, lg: 230 } as const;

interface GridProps {
  className?: string;
}

/** Overlay approximating the watermark on each thumbnail so settings feel live. */
function WatermarkOverlay() {
  const wm = useOrganizerStore((s) => s.watermark);
  if (!wm.enabled) return null;
  if (wm.kind === "image" && !wm.image) return null;
  const posClass: Record<string, string> = {
    tl: "items-start justify-start",
    tc: "items-start justify-center",
    tr: "items-start justify-end",
    ml: "items-center justify-start",
    mc: "items-center justify-center",
    mr: "items-center justify-end",
    bl: "items-end justify-start",
    bc: "items-end justify-center",
    br: "items-end justify-end",
    tile: "items-center justify-center",
  };
  const style: CSSProperties = { opacity: wm.opacity, transform: `rotate(${-wm.rotation}deg)` };
  return (
    <div className={cn("pointer-events-none absolute inset-0 flex overflow-hidden p-[6%]", posClass[wm.position])} aria-hidden>
      {wm.kind === "text" ? (
        <span className="truncate text-[9px] font-bold tracking-wide uppercase" style={{ ...style, color: wm.color }}>
          {wm.text}
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={wm.image!.url} alt="" style={{ ...style, width: `${Math.round(wm.size * 100)}%` }} />
      )}
    </div>
  );
}

interface CardProps {
  item: PageItem;
  index: number;
  total: number;
  source: SourceDoc | undefined;
  width: number;
  selected: boolean;
  dragging: boolean;
  dropBefore: boolean;
  multiSource: boolean;
  hasSignature: boolean;
  onPointerDown: (e: React.PointerEvent, index: number) => void;
}

const PageCard = memo(function PageCard({ item, index, total, source, width, selected, dragging, dropBefore, multiSource, hasSignature, onPointerDown }: CardProps) {
  const t = useTranslations("pdf.page");
  const { ref, url } = useThumbnail(source?.opened.doc, item.sourceId, item.pageIndex, width);
  const toggle = useOrganizerStore((s) => s.toggleSelected);
  const rotate = useOrganizerStore((s) => s.rotatePage);
  const del = useOrganizerStore((s) => s.deletePages);
  const moveBy = useOrganizerStore((s) => s.movePageBy);
  const size = source?.opened.sizes[item.pageIndex];
  const swap = item.rotation === 90 || item.rotation === 270;
  const ratio = size ? (swap ? size.width / size.height : size.height / size.width) : 1.3;
  const n = index + 1;

  return (
    <div
      ref={ref}
      data-index={index}
      role="listitem"
      aria-label={t("label", { n })}
      className={cn("group relative flex flex-col gap-1.5 select-none", dragging && "opacity-40")}
      onPointerDown={(e) => onPointerDown(e, index)}
    >
      {dropBefore && <span className="absolute top-0 bottom-7 -left-[7px] w-0.5 rounded-full bg-primary" aria-hidden />}
      <button
        type="button"
        onClick={(e) => toggle(item.id, e.metaKey || e.ctrlKey || e.shiftKey || true)}
        aria-pressed={selected}
        aria-label={t("select", { n })}
        className={cn(
          "relative w-full overflow-hidden rounded-sm border bg-white shadow-[0_1px_0_rgba(0,0,0,0.04)] transition-[border-color,box-shadow] focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
          selected ? "border-primary ring-2 ring-primary/40" : "border-border-strong hover:border-fg-subtle",
        )}
        style={{ aspectRatio: `1 / ${ratio}` }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            draggable={false}
            className="absolute inset-0 m-auto max-h-full max-w-full"
            style={swap ? { transform: `rotate(${item.rotation}deg)`, width: "auto", height: "auto", maxWidth: `${(1 / ratio) * 100}%`, maxHeight: `${ratio * 100}%` } : { transform: `rotate(${item.rotation}deg)` }}
          />
        ) : (
          <span className="absolute inset-0 animate-pulse bg-surface-3/60" aria-hidden />
        )}
        <WatermarkOverlay />
        {hasSignature && <span className="absolute right-[10%] bottom-[8%] h-[8%] w-[30%] rounded-xs border border-primary bg-primary/20" aria-hidden />}
        <span className="absolute top-1.5 left-1.5 flex size-5 items-center justify-center rounded-full bg-[#0A0A0BB3] text-[10px] font-semibold text-white tabular-nums">{n}</span>
      </button>

      <div className="flex items-center justify-between px-0.5">
        <span className="truncate text-[11px] text-fg-subtle">{multiSource && source ? source.name : `${item.pageIndex + 1}`}</span>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 md:opacity-0 max-md:opacity-100">
          <button type="button" onClick={() => moveBy(item.id, -1)} disabled={index === 0} aria-label={t("moveLeft", { n })} className="rounded-xs p-1 text-fg-subtle hover:bg-surface-2 hover:text-fg disabled:opacity-30">
            <ChevronLeft className="size-3.5 rtl:rotate-180" aria-hidden />
          </button>
          <button type="button" onClick={() => moveBy(item.id, 1)} disabled={index === total - 1} aria-label={t("moveRight", { n })} className="rounded-xs p-1 text-fg-subtle hover:bg-surface-2 hover:text-fg disabled:opacity-30">
            <ChevronRight className="size-3.5 rtl:rotate-180" aria-hidden />
          </button>
          <button type="button" onClick={() => rotate(item.id)} aria-label={t("rotate", { n })} className="rounded-xs p-1 text-fg-subtle hover:bg-surface-2 hover:text-fg">
            <RotateCw className="size-3.5" aria-hidden />
          </button>
          <button type="button" onClick={() => del([item.id])} aria-label={t("delete", { n })} className="rounded-xs p-1 text-fg-subtle hover:bg-danger-soft hover:text-danger">
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>
      <GripVertical className="pointer-events-none absolute top-1.5 right-1.5 size-4 text-white opacity-0 drop-shadow transition-opacity group-hover:opacity-80" aria-hidden />
    </div>
  );
});

/** Responsive page grid with pointer drag-to-reorder, selection, rotate and delete per page. */
export function PageGrid({ className }: GridProps) {
  const t = useTranslations("pdf.page");
  const pages = useOrganizerStore((s) => s.pages);
  const sources = useOrganizerStore((s) => s.sources);
  const selected = useOrganizerStore((s) => s.selected);
  const thumbSize = useOrganizerStore((s) => s.thumbSize);
  const movePage = useOrganizerStore((s) => s.movePage);
  const signaturePage = useOrganizerStore((s) => s.signature?.pageId ?? null);
  const width = THUMB_WIDTH[thumbSize];
  const gridRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ from: number; over: number | null } | null>(null);
  const start = useRef<{ x: number; y: number; index: number; pointerId: number } | null>(null);
  const sourceMap = new Map(sources.map((s) => [s.id, s]));

  const onPointerDown = useCallback((e: React.PointerEvent, index: number) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button[aria-label]:not([aria-pressed])")) return;
    start.current = { x: e.clientX, y: e.clientY, index, pointerId: e.pointerId };
  }, []);

  const indexAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-index]");
    if (!el || !gridRef.current?.contains(el)) return null;
    const i = Number(el.dataset.index);
    const r = el.getBoundingClientRect();
    return x > r.left + r.width / 2 ? i + 1 : i;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    if (!drag) {
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) < 6) return;
      gridRef.current?.setPointerCapture(s.pointerId);
      setDrag({ from: s.index, over: null });
    }
    setDrag((d) => (d ? { ...d, over: indexAt(e.clientX, e.clientY) } : d));
  };

  const finish = () => {
    if (drag && drag.over !== null) {
      const to = drag.over > drag.from ? drag.over - 1 : drag.over;
      movePage(drag.from, to);
    }
    setDrag(null);
    start.current = null;
  };

  return (
    <div
      ref={gridRef}
      role="list"
      aria-label={t("dragHint")}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      className={cn("scrollbar-thin grid h-full w-full content-start gap-x-4 gap-y-5 overflow-y-auto p-5 md:p-8", drag && "cursor-grabbing", className)}
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${width}px, 1fr))`, touchAction: drag ? "none" : "pan-y" }}
    >
      {pages.map((item, i) => (
        <PageCard
          key={item.id}
          item={item}
          index={i}
          total={pages.length}
          source={sourceMap.get(item.sourceId)}
          width={width}
          selected={selected.has(item.id)}
          dragging={drag?.from === i}
          dropBefore={drag?.over === i && drag.from !== i && drag.from !== i - 1}
          multiSource={sources.length > 1}
          hasSignature={signaturePage === item.id}
          onPointerDown={onPointerDown}
        />
      ))}
    </div>
  );
}
