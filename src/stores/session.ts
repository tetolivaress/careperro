"use client";

import { create } from "zustand";

/** Lightweight in-memory counters for the "This session" ledger on the home page. */
interface SessionState {
  bytesUploaded: number;
  filesProcessed: number;
  recordProcessed: (count?: number) => void;
}

export const useSessionStore = create<SessionState>()((set) => ({
  bytesUploaded: 0,
  filesProcessed: 0,
  recordProcessed: (count = 1) => set((s) => ({ filesProcessed: s.filesProcessed + count })),
}));
