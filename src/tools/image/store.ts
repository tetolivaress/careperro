"use client";

import { create } from "zustand";
import { DEFAULT_SETTINGS, type EditSettings, type EditorTab, type OutputFormat, type RenderResult, type SourceInfo } from "./types";

export type ItemStatus = "loading" | "ready" | "rendering" | "done" | "error";

export interface EditorItem {
  id: string;
  file: File;
  info: SourceInfo | null;
  thumbUrl: string | null;
  /** Latest preview render for the selected item (object URL). */
  previewUrl: string | null;
  /** Full-size result from export (not preview). */
  result: RenderResult | null;
  /** Live estimate of output size from the latest full-resolution preview render. */
  estimate: { bytes: number; width: number; height: number; quality: number; ms: number } | null;
  status: ItemStatus;
  error: string | null;
  progress: number;
}

export type ViewMode = "original" | "split" | "side";

interface ImageEditorState {
  items: EditorItem[];
  selectedId: string | null;
  tab: EditorTab;
  settings: EditSettings;
  view: ViewMode;
  /** 0..1 position of the compare divider */
  split: number;
  zoom: number;
  exporting: { done: number; total: number } | null;
  showConfirmClear: boolean;

  addItems: (files: File[]) => string[];
  removeItem: (id: string) => void;
  clear: () => void;
  select: (id: string) => void;
  setTab: (tab: EditorTab) => void;
  patchItem: (id: string, patch: Partial<EditorItem>) => void;
  setSettings: (fn: (s: EditSettings) => EditSettings) => void;
  update: <K extends keyof EditSettings>(key: K, patch: Partial<EditSettings[K]>) => void;
  resetSettings: () => void;
  setView: (view: ViewMode) => void;
  setSplit: (split: number) => void;
  setZoom: (zoom: number) => void;
  setExporting: (e: ImageEditorState["exporting"]) => void;
  setShowConfirmClear: (v: boolean) => void;
}

let seq = 0;
const newId = () => `img-${Date.now().toString(36)}-${(seq++).toString(36)}`;

function revoke(url: string | null) {
  if (url) URL.revokeObjectURL(url);
}

export const useImageEditor = create<ImageEditorState>()((set, get) => ({
  items: [],
  selectedId: null,
  tab: "compress",
  settings: DEFAULT_SETTINGS,
  view: "split",
  split: 0.5,
  zoom: 1,
  exporting: null,
  showConfirmClear: false,

  addItems: (files) => {
    const created = files.map<EditorItem>((file) => ({
      id: newId(),
      file,
      info: null,
      thumbUrl: null,
      previewUrl: null,
      result: null,
      estimate: null,
      status: "loading",
      error: null,
      progress: 0,
    }));
    set((s) => ({ items: [...s.items, ...created], selectedId: s.selectedId ?? created[0]?.id ?? null }));
    return created.map((c) => c.id);
  },

  removeItem: (id) =>
    set((s) => {
      const item = s.items.find((i) => i.id === id);
      revoke(item?.thumbUrl ?? null);
      revoke(item?.previewUrl ?? null);
      const items = s.items.filter((i) => i.id !== id);
      const selectedId = s.selectedId === id ? (items[0]?.id ?? null) : s.selectedId;
      return { items, selectedId };
    }),

  clear: () => {
    for (const i of get().items) {
      revoke(i.thumbUrl);
      revoke(i.previewUrl);
    }
    set({ items: [], selectedId: null, exporting: null, showConfirmClear: false });
  },

  select: (id) => set({ selectedId: id }),
  setTab: (tab) => set({ tab }),

  patchItem: (id, patch) =>
    set((s) => ({
      items: s.items.map((i) => {
        if (i.id !== id) return i;
        if (patch.previewUrl !== undefined && patch.previewUrl !== i.previewUrl) revoke(i.previewUrl);
        if (patch.thumbUrl !== undefined && patch.thumbUrl !== i.thumbUrl) revoke(i.thumbUrl);
        return { ...i, ...patch };
      }),
    })),

  setSettings: (fn) => set((s) => ({ settings: fn(s.settings) })),
  update: (key, patch) => set((s) => ({ settings: { ...s.settings, [key]: { ...s.settings[key], ...patch } } })),
  resetSettings: () => set({ settings: DEFAULT_SETTINGS }),
  setView: (view) => set({ view }),
  setSplit: (split) => set({ split: Math.min(1, Math.max(0, split)) }),
  setZoom: (zoom) => set({ zoom: Math.min(4, Math.max(0.1, zoom)) }),
  setExporting: (exporting) => set({ exporting }),
  setShowConfirmClear: (showConfirmClear) => set({ showConfirmClear }),
}));

export function selectedItem(s: ImageEditorState): EditorItem | null {
  return s.items.find((i) => i.id === s.selectedId) ?? null;
}

export function outputExt(format: OutputFormat): string {
  return format === "jpeg" ? "jpg" : format;
}
