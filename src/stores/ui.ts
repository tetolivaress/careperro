"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UiState {
  /** null = follow the route default (expanded on browse pages, rail on tool pages). */
  sidebarCollapsed: boolean | null;
  announcementDismissed: boolean;
  searchOpen: boolean;
  drawerOpen: boolean;
  setSidebarCollapsed: (collapsed: boolean | null) => void;
  dismissAnnouncement: () => void;
  setSearchOpen: (open: boolean) => void;
  setDrawerOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: null,
      announcementDismissed: false,
      searchOpen: false,
      drawerOpen: false,
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      dismissAnnouncement: () => set({ announcementDismissed: true }),
      setSearchOpen: (searchOpen) => set({ searchOpen }),
      setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
    }),
    {
      name: "lokal-ui",
      partialize: (s) => ({
        sidebarCollapsed: s.sidebarCollapsed,
        announcementDismissed: s.announcementDismissed,
      }),
    },
  ),
);
