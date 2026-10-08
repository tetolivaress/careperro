"use client";

import { useSyncExternalStore } from "react";

function subscribe(query: string, cb: () => void) {
  const mql = window.matchMedia(query);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}

/** SSR-safe media query hook. Returns `fallback` during server render and hydration. */
export function useMediaQuery(query: string, fallback = false): boolean {
  return useSyncExternalStore(
    (cb) => subscribe(query, cb),
    () => window.matchMedia(query).matches,
    () => fallback,
  );
}

/** Tailwind `md` breakpoint: the settings panel becomes a bottom sheet below this. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 768px)", true);
}
