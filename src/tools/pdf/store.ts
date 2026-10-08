"use client";

import { create } from "zustand";
import type { CompressOptions, PageNumberOptions, Position9, Rotation, WatermarkOptions } from "@/workers/pdf.worker";
import type { OpenedPdf } from "./render";

export type OrganizerTab = "organize" | "merge" | "split" | "watermark" | "page-numbers" | "sign" | "compress";
export const ORGANIZER_TABS: OrganizerTab[] = ["organize", "merge", "split", "watermark", "page-numbers", "sign", "compress"];

export interface SourceDoc {
  id: string;
  name: string;
  size: number;
  bytes: ArrayBuffer;
  pageCount: number;
  opened: OpenedPdf;
}

export interface PageItem {
  id: string;
  sourceId: string;
  pageIndex: number;
  rotation: Rotation;
}

export interface WatermarkState extends Omit<WatermarkOptions, "image"> {
  enabled: boolean;
  image?: { url: string; bytes: ArrayBuffer; type: "png" | "jpeg"; aspect: number; name: string };
}

export interface NumbersState extends PageNumberOptions {
  enabled: boolean;
}

export interface SignatureState {
  url: string;
  bytes: ArrayBuffer;
  aspect: number;
  /** Page item id the signature sits on. */
  pageId: string | null;
  x: number;
  y: number;
  width: number;
}

export interface CompressState extends CompressOptions {
  enabled: boolean;
}

export interface SplitState {
  mode: "ranges" | "every" | "everyN";
  ranges: string;
  chunk: number;
  output: "zip" | "single";
}

export type Status = "empty" | "ready" | "processing" | "done" | "error";

export interface ExportResult {
  blob: Blob;
  name: string;
  size: number;
  kind: "pdf" | "zip";
  imagesTouched?: number;
  files?: number;
}

interface OrganizerState {
  tab: OrganizerTab;
  sources: SourceDoc[];
  pages: PageItem[];
  original: PageItem[];
  selected: Set<string>;
  thumbSize: "sm" | "md" | "lg";
  watermark: WatermarkState;
  numbers: NumbersState;
  signature: SignatureState | null;
  compress: CompressState;
  split: SplitState;
  status: Status;
  progress: { phase: string; percent: number } | null;
  error: string | null;
  result: ExportResult | null;
  jobId: string | null;

  setTab: (tab: OrganizerTab) => void;
  addSources: (docs: SourceDoc[]) => void;
  removeSource: (id: string) => void;
  moveSource: (id: string, dir: -1 | 1) => void;
  movePage: (from: number, to: number) => void;
  movePageBy: (id: string, dir: -1 | 1) => void;
  rotatePage: (id: string, by?: Rotation) => void;
  rotateMany: (ids: string[] | "all") => void;
  deletePages: (ids: string[]) => void;
  reverse: () => void;
  restore: () => void;
  toggleSelected: (id: string, additive?: boolean) => void;
  selectAll: () => void;
  clearSelection: () => void;
  setThumbSize: (s: "sm" | "md" | "lg") => void;
  setWatermark: (patch: Partial<WatermarkState>) => void;
  setNumbers: (patch: Partial<NumbersState>) => void;
  setSignature: (sig: SignatureState | null) => void;
  patchSignature: (patch: Partial<SignatureState>) => void;
  setCompress: (patch: Partial<CompressState>) => void;
  setSplit: (patch: Partial<SplitState>) => void;
  setStatus: (status: Status, extra?: { progress?: OrganizerState["progress"]; error?: string | null; result?: ExportResult | null; jobId?: string | null }) => void;
  clearResult: () => void;
  reset: () => void;
}

const DEFAULT_WATERMARK: WatermarkState = {
  enabled: false,
  kind: "text",
  text: "CONFIDENTIAL",
  position: "mc" as Position9,
  opacity: 0.25,
  size: 48,
  rotation: 30,
  color: "#6E6E76",
};
const DEFAULT_NUMBERS: NumbersState = { enabled: false, position: "bc", start: 1, format: "n", size: 11, margin: 28 };
const DEFAULT_COMPRESS: CompressState = { enabled: false, quality: 0.72, maxDimension: 1600 };
const DEFAULT_SPLIT: SplitState = { mode: "ranges", ranges: "", chunk: 1, output: "zip" };

let counter = 0;
export function uid(prefix = "p"): string {
  counter += 1;
  return `${prefix}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function releaseSources(sources: SourceDoc[]) {
  for (const s of sources) void s.opened.destroy().catch(() => {});
}

export const useOrganizerStore = create<OrganizerState>()((set, get) => ({
  tab: "organize",
  sources: [],
  pages: [],
  original: [],
  selected: new Set(),
  thumbSize: "md",
  watermark: DEFAULT_WATERMARK,
  numbers: DEFAULT_NUMBERS,
  signature: null,
  compress: DEFAULT_COMPRESS,
  split: DEFAULT_SPLIT,
  status: "empty",
  progress: null,
  error: null,
  result: null,
  jobId: null,

  setTab: (tab) => set({ tab }),

  addSources: (docs) =>
    set((s) => {
      const added: PageItem[] = docs.flatMap((d) =>
        Array.from({ length: d.pageCount }, (_, i) => ({ id: uid(), sourceId: d.id, pageIndex: i, rotation: 0 as Rotation })),
      );
      const pages = [...s.pages, ...added];
      return { sources: [...s.sources, ...docs], pages, original: [...s.original, ...added], status: "ready", result: null, error: null };
    }),

  removeSource: (id) =>
    set((s) => {
      const gone = s.sources.find((x) => x.id === id);
      if (gone) releaseSources([gone]);
      const pages = s.pages.filter((p) => p.sourceId !== id);
      const selected = new Set([...s.selected].filter((pid) => pages.some((p) => p.id === pid)));
      const sources = s.sources.filter((x) => x.id !== id);
      return {
        sources,
        pages,
        original: s.original.filter((p) => p.sourceId !== id),
        selected,
        signature: s.signature && pages.some((p) => p.id === s.signature?.pageId) ? s.signature : s.signature ? { ...s.signature, pageId: null } : null,
        status: sources.length ? "ready" : "empty",
        result: null,
      };
    }),

  moveSource: (id, dir) =>
    set((s) => {
      const order = s.sources.map((x) => x.id);
      const i = order.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= order.length) return {};
      [order[i], order[j]] = [order[j], order[i]];
      const rank = new Map(order.map((sid, k) => [sid, k]));
      const sources = [...s.sources].sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
      // Stable sort pages by their source order, preserving within-source order.
      const pages = [...s.pages].sort((a, b) => rank.get(a.sourceId)! - rank.get(b.sourceId)!);
      return { sources, pages, result: null };
    }),

  movePage: (from, to) =>
    set((s) => {
      if (from === to || from < 0 || to < 0 || from >= s.pages.length || to >= s.pages.length) return {};
      const pages = [...s.pages];
      const [item] = pages.splice(from, 1);
      pages.splice(to, 0, item);
      return { pages, result: null };
    }),

  movePageBy: (id, dir) => {
    const i = get().pages.findIndex((p) => p.id === id);
    if (i >= 0) get().movePage(i, Math.max(0, Math.min(get().pages.length - 1, i + dir)));
  },

  rotatePage: (id, by = 90) =>
    set((s) => ({ pages: s.pages.map((p) => (p.id === id ? { ...p, rotation: ((p.rotation + by) % 360) as Rotation } : p)), result: null })),

  rotateMany: (ids) =>
    set((s) => {
      const target = ids === "all" ? null : new Set(ids);
      return { pages: s.pages.map((p) => (!target || target.has(p.id) ? { ...p, rotation: ((p.rotation + 90) % 360) as Rotation } : p)), result: null };
    }),

  deletePages: (ids) =>
    set((s) => {
      const gone = new Set(ids);
      const pages = s.pages.filter((p) => !gone.has(p.id));
      const selected = new Set([...s.selected].filter((id) => !gone.has(id)));
      const signature = s.signature && s.signature.pageId && gone.has(s.signature.pageId) ? { ...s.signature, pageId: null } : s.signature;
      return { pages, selected, signature, result: null };
    }),

  reverse: () => set((s) => ({ pages: [...s.pages].reverse(), result: null })),
  restore: () => set((s) => ({ pages: s.original.map((p) => ({ ...p })), selected: new Set(), result: null })),

  toggleSelected: (id, additive = true) =>
    set((s) => {
      const next = additive ? new Set(s.selected) : new Set<string>();
      if (s.selected.has(id) && additive) next.delete(id);
      else next.add(id);
      return { selected: next };
    }),
  selectAll: () => set((s) => ({ selected: new Set(s.pages.map((p) => p.id)) })),
  clearSelection: () => set({ selected: new Set() }),
  setThumbSize: (thumbSize) => set({ thumbSize }),

  setWatermark: (patch) =>
    set((s) => {
      if (patch.image !== undefined && s.watermark.image && patch.image !== s.watermark.image) URL.revokeObjectURL(s.watermark.image.url);
      return { watermark: { ...s.watermark, ...patch }, result: null };
    }),
  setNumbers: (patch) => set((s) => ({ numbers: { ...s.numbers, ...patch }, result: null })),
  setSignature: (sig) =>
    set((s) => {
      if (s.signature && s.signature !== sig) URL.revokeObjectURL(s.signature.url);
      return { signature: sig, result: null };
    }),
  patchSignature: (patch) => set((s) => (s.signature ? { signature: { ...s.signature, ...patch }, result: null } : {})),
  setCompress: (patch) => set((s) => ({ compress: { ...s.compress, ...patch }, result: null })),
  setSplit: (patch) => set((s) => ({ split: { ...s.split, ...patch }, result: null })),

  setStatus: (status, extra = {}) =>
    set((s) => ({
      status,
      progress: extra.progress !== undefined ? extra.progress : status === "processing" ? s.progress : null,
      error: extra.error !== undefined ? extra.error : status === "error" ? s.error : null,
      result: extra.result !== undefined ? extra.result : s.result,
      jobId: extra.jobId !== undefined ? extra.jobId : s.jobId,
    })),

  clearResult: () => set((s) => ({ result: null, status: s.sources.length ? "ready" : "empty", error: null })),

  reset: () => {
    const s = get();
    releaseSources(s.sources);
    if (s.watermark.image) URL.revokeObjectURL(s.watermark.image.url);
    if (s.signature) URL.revokeObjectURL(s.signature.url);
    set({
      sources: [],
      pages: [],
      original: [],
      selected: new Set(),
      watermark: DEFAULT_WATERMARK,
      numbers: DEFAULT_NUMBERS,
      signature: null,
      compress: DEFAULT_COMPRESS,
      split: DEFAULT_SPLIT,
      status: "empty",
      progress: null,
      error: null,
      result: null,
      jobId: null,
    });
  },
}));
