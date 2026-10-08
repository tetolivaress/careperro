"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { renderPage } from "./render";
import { useOrganizerStore } from "./store";

/**
 * Single-page view used by the Sign tab: renders the chosen page large and lets the user drag
 * the signature into place. Coordinates are stored normalized to the displayed page.
 */
export function PagePlacer() {
  const t = useTranslations("pdf.sign");
  const pages = useOrganizerStore((s) => s.pages);
  const sources = useOrganizerStore((s) => s.sources);
  const signature = useOrganizerStore((s) => s.signature);
  const patch = useOrganizerStore((s) => s.patchSignature);
  const item = pages.find((p) => p.id === signature?.pageId) ?? pages[0];
  const source = sources.find((s) => s.id === item?.sourceId);
  const [url, setUrl] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ dx: number; dy: number } | null>(null);

  const key = item ? `${item.sourceId}:${item.pageIndex}:${item.rotation}` : null;
  useEffect(() => {
    if (!item || !source) return;
    let cancelled = false;
    let current: string | null = null;
    const handle = renderPage(source.opened.doc, item.pageIndex + 1, { width: 900, type: "image/jpeg", quality: 0.85, extraRotation: item.rotation });
    handle.promise.then(
      (blob) => {
        if (cancelled) return;
        current = URL.createObjectURL(blob);
        setUrl(current);
      },
      () => {},
    );
    return () => {
      cancelled = true;
      handle.cancel();
      if (current) URL.revokeObjectURL(current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, source]);

  if (!item || !source) return null;
  const size = source.opened.sizes[item.pageIndex];
  const swap = item.rotation === 90 || item.rotation === 270;
  const W = swap ? size.height : size.width;
  const H = swap ? size.width : size.height;

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!signature || !boxRef.current) return;
    const rect = boxRef.current.getBoundingClientRect();
    dragging.current = { dx: e.clientX - rect.left - signature.x * rect.width, dy: e.clientY - rect.top - signature.y * rect.height };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current || !signature || !boxRef.current) return;
    const rect = boxRef.current.getBoundingClientRect();
    const w = signature.width;
    const h = signature.width * signature.aspect * (rect.width / rect.height);
    const x = Math.min(1 - w, Math.max(0, (e.clientX - rect.left - dragging.current.dx) / rect.width));
    const y = Math.min(1 - h, Math.max(0, (e.clientY - rect.top - dragging.current.dy) / rect.height));
    patch({ x, y });
  };
  const onUp = () => {
    dragging.current = null;
  };

  return (
    <div className="flex h-full w-full items-center justify-center p-4 md:p-8">
      <div
        ref={boxRef}
        className="relative max-h-full max-w-full overflow-hidden rounded-sm bg-white shadow-lg"
        style={{ aspectRatio: `${W} / ${H}`, height: "100%" }}
      >
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="absolute inset-0 size-full" draggable={false} />
        )}
        {signature && signature.pageId === item.id && (
          <div
            role="button"
            tabIndex={0}
            aria-label={t("placed", { n: pages.indexOf(item) + 1 })}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onKeyDown={(e) => {
              const step = 0.01;
              if (e.key === "ArrowLeft") patch({ x: Math.max(0, signature.x - step) });
              if (e.key === "ArrowRight") patch({ x: Math.min(1 - signature.width, signature.x + step) });
              if (e.key === "ArrowUp") patch({ y: Math.max(0, signature.y - step) });
              if (e.key === "ArrowDown") patch({ y: Math.min(1, signature.y + step) });
            }}
            className="absolute cursor-grab touch-none rounded-xs border-2 border-dashed border-primary bg-primary/5 active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
            style={{ left: `${signature.x * 100}%`, top: `${signature.y * 100}%`, width: `${signature.width * 100}%` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={signature.url} alt="" className="block w-full" draggable={false} />
          </div>
        )}
      </div>
    </div>
  );
}
