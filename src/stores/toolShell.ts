"use client";

import { create } from "zustand";

export type ToolStatus = "empty" | "dragover" | "processing" | "done" | "error";

export interface ActiveFileInfo {
  name: string;
  /** e.g. "4032 × 3024 · JPG · 2.4 MB" */
  meta: string;
  previewUrl?: string;
}

/** Shared state between the tool shell pieces (file toolbar, mobile nav bar, bottom bar). */
interface ToolShellState {
  file: ActiveFileInfo | null;
  status: ToolStatus;
  setFile: (file: ActiveFileInfo | null) => void;
  setStatus: (status: ToolStatus) => void;
  reset: () => void;
}

export const useToolShellStore = create<ToolShellState>()((set) => ({
  file: null,
  status: "empty",
  setFile: (file) => set({ file }),
  setStatus: (status) => set({ status }),
  reset: () => set({ file: null, status: "empty" }),
}));
