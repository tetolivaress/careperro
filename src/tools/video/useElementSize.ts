"use client";

import { useEffect, useState, type RefObject } from "react";

export interface Size {
  width: number;
  height: number;
}

/** Tracks an element's content box with ResizeObserver. */
export function useElementSize<T extends HTMLElement>(ref: RefObject<T | null>): Size {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ width: r.width, height: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** Fits an aspect ratio inside a box (object-fit: contain), returning the displayed rect. */
export function fitRect(aspect: number, box: Size): { left: number; top: number; width: number; height: number } {
  if (!box.width || !box.height || !aspect) return { left: 0, top: 0, width: box.width, height: box.height };
  let width = box.width;
  let height = width / aspect;
  if (height > box.height) {
    height = box.height;
    width = height * aspect;
  }
  return { left: (box.width - width) / 2, top: (box.height - height) / 2, width, height };
}
