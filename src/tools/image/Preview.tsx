"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import ReactCrop, { centerCrop, makeAspectCrop, type Crop, type PercentCrop } from "react-image-crop";
import { ChevronsLeftRight, Loader } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/formatBytes";
import { useImageEditor, selectedItem } from "./store";
import { formatInfo, type AspectPreset } from "./types";

function aspectValue(a: AspectPreset): number | undefined {
  if (a === "free") return undefined;
  const [w, h] = a.split(":").map(Number);
  return w / h;
}

/** Before/after stage. In the Crop tab it swaps to a react-image-crop overlay over the original. */
export function Preview({ originalUrl }: { originalUrl: string | null }) {
  const t = useTranslations("image.editor");
  const item = useImageEditor(selectedItem);
  const tab = useImageEditor((s) => s.tab);
  const view = useImageEditor((s) => s.view);
  const split = useImageEditor((s) => s.split);
  const setSplit = useImageEditor((s) => s.setSplit);
  const zoom = useImageEditor((s) => s.zoom);
  const crop = useImageEditor((s) => s.settings.crop);
  const update = useImageEditor((s) => s.update);
  const format = useImageEditor((s) => s.settings.compress.format);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging.current || !frameRef.current) return;
      const r = frameRef.current.getBoundingClientRect();
      setSplit((e.clientX - r.left) / r.width);
    },
    [setSplit],
  );

  useEffect(() => {
    const up = () => {
      dragging.current = false;
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", up);
    };
  }, [onPointerMove]);

  if (!item) return null;
  const after = item.previewUrl;
  const busy = item.status === "loading" || item.status === "rendering";
  const afterLabel = item.estimate ? t("after", { format: formatInfo(format).label, size: formatBytes(item.estimate.bytes) }) : formatInfo(format).label;

  if (tab === "crop" && originalUrl) {
    return <CropStage originalUrl={originalUrl} aspect={aspectValue(crop.aspect)} rect={crop.rect} onRect={(rect) => update("crop", { rect })} />;
  }

  const img = (src: string | null, alt: string, extra?: string) =>
    src ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt} draggable={false} className={cn("block max-h-full max-w-full object-contain select-none", extra)} style={{ transform: `scale(${zoom})`, transformOrigin: "center" }} />
    ) : null;

  if (view === "side") {
    return (
      <div className="relative flex size-full items-center justify-center gap-3 p-4 md:p-8">
        <figure className="relative flex min-w-0 flex-1 items-center justify-center overflow-hidden rounded-xs bg-surface-3/40 h-full">
          {img(originalUrl, t("before"))}
          <Label className="absolute top-3 start-3">{t("before")}</Label>
        </figure>
        <figure className="relative flex min-w-0 flex-1 items-center justify-center overflow-hidden rounded-xs bg-surface-3/40 h-full">
          {img(after ?? originalUrl, afterLabel)}
          <Label className="absolute top-3 start-3" accent>{afterLabel}</Label>
          {busy && <Spinner />}
        </figure>
      </div>
    );
  }

  if (view === "original") {
    return (
      <div className="relative flex size-full items-center justify-center overflow-hidden p-4 md:p-12">
        {img(originalUrl, t("before"))}
        <Label className="absolute top-4 start-4">{t("before")}</Label>
      </div>
    );
  }

  // Split compare
  return (
    <div className="relative flex size-full items-center justify-center overflow-hidden p-4 md:p-12">
      <div ref={frameRef} className="relative inline-flex max-h-full max-w-full overflow-hidden rounded-[6px] bg-surface-3">
        {img(after ?? originalUrl, afterLabel)}
        <div className="absolute inset-0 overflow-hidden" style={{ width: `${split * 100}%` }} aria-hidden>
          {img(originalUrl, "", "h-full w-auto max-w-none")}
        </div>
        <Label className="absolute top-3 start-3">{t("before")}</Label>
        <Label className="absolute top-3 end-3" accent>{afterLabel}</Label>
        <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]" style={{ left: `${split * 100}%` }} aria-hidden />
        <button
          type="button"
          role="slider"
          aria-label={t("compareHandle")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(split * 100)}
          onPointerDown={(e) => {
            dragging.current = true;
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setSplit(split - 0.02);
            if (e.key === "ArrowRight") setSplit(split + 0.02);
          }}
          className="absolute top-1/2 flex size-10 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full bg-white text-[#111113] shadow-md focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
          style={{ left: `${split * 100}%` }}
        >
          <ChevronsLeftRight className="size-4" aria-hidden />
        </button>
        {busy && <Spinner />}
      </div>
    </div>
  );
}

function Label({ children, className, accent }: { children: React.ReactNode; className?: string; accent?: boolean }) {
  return (
    <span className={cn("pointer-events-none z-10 inline-flex h-7 items-center gap-1.5 rounded-full bg-[#0A0A0BB3] px-2.5 text-[11px] font-medium text-white backdrop-blur-sm", className)}>
      <span className={cn("size-[5px] rounded-full", accent ? "bg-primary" : "bg-white/70")} aria-hidden />
      {children}
    </span>
  );
}

function Spinner() {
  return (
    <span className="absolute end-3 bottom-3 z-10 flex size-7 items-center justify-center rounded-full bg-[#0A0A0BB3] text-white" role="status">
      <Loader className="size-3.5 animate-spin" aria-hidden />
    </span>
  );
}

function CropStage({
  originalUrl,
  aspect,
  rect,
  onRect,
}: {
  originalUrl: string;
  aspect: number | undefined;
  rect: { x: number; y: number; width: number; height: number } | null;
  onRect: (rect: { x: number; y: number; width: number; height: number } | null) => void;
}) {
  const [local, setLocal] = useState<Crop | undefined>(
    rect ? { unit: "%", x: rect.x * 100, y: rect.y * 100, width: rect.width * 100, height: rect.height * 100 } : undefined,
  );

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    if (local || !aspect) return;
    const { width, height } = e.currentTarget;
    const c = centerCrop(makeAspectCrop({ unit: "%", width: 80 }, aspect, width, height), width, height);
    setLocal(c);
    onRect({ x: c.x / 100, y: c.y / 100, width: c.width / 100, height: c.height / 100 });
  };

  return (
    <div className="flex size-full items-center justify-center p-4 md:p-12">
      <ReactCrop
        crop={local}
        aspect={aspect}
        keepSelection
        ruleOfThirds
        onChange={(_px: Crop, pct: PercentCrop) => setLocal(pct)}
        onComplete={(_px: Crop, pct: PercentCrop) => {
          if (pct.width < 1 || pct.height < 1) onRect(null);
          else onRect({ x: pct.x / 100, y: pct.y / 100, width: pct.width / 100, height: pct.height / 100 });
        }}
        className="max-h-full max-w-full"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={originalUrl} alt="" onLoad={onImageLoad} className="max-h-[70vh] max-w-full object-contain" />
      </ReactCrop>
    </div>
  );
}
