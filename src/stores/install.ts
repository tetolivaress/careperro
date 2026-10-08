"use client";

import { create } from "zustand";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface InstallState {
  deferred: BeforeInstallPromptEvent | null;
  installed: boolean;
  listening: boolean;
  listen: () => void;
  prompt: () => Promise<void>;
}

/** Captures the browser's install prompt so the "Install app" button can trigger it. */
export const useInstallStore = create<InstallState>()((set, get) => ({
  deferred: null,
  installed: false,
  listening: false,
  listen: () => {
    if (get().listening || typeof window === "undefined") return;
    set({ listening: true, installed: window.matchMedia("(display-mode: standalone)").matches });
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      set({ deferred: e as BeforeInstallPromptEvent });
    });
    window.addEventListener("appinstalled", () => set({ installed: true, deferred: null }));
  },
  prompt: async () => {
    const d = get().deferred;
    if (!d) return;
    await d.prompt();
    const choice = await d.userChoice;
    if (choice.outcome === "accepted") set({ installed: true });
    set({ deferred: null });
  },
}));
