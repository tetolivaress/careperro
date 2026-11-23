import { kindOf } from "@/lib/fileTypes";

/** "01:22", "1:02:07", or "00:24.6" with tenths. */
export function clock(seconds: number, tenths = false): string {
  const s = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  const base = h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  return tenths ? `${base}.${Math.floor((s % 1) * 10)}` : base;
}

export function speedLabel(speed: number): string {
  return `${Number(speed.toFixed(2))}×`;
}

const CODECS: Record<string, string> = {
  avc: "H.264",
  hevc: "H.265",
  vp8: "VP8",
  vp9: "VP9",
  av1: "AV1",
  aac: "AAC",
  opus: "Opus",
  mp3: "MP3",
  vorbis: "Vorbis",
  flac: "FLAC",
  ac3: "AC-3",
  eac3: "E-AC-3",
};

export function codecLabel(codec: string | null): string | null {
  if (!codec) return null;
  return CODECS[codec.toLowerCase()] ?? (codec.startsWith("pcm") ? "PCM" : codec.toUpperCase());
}

/** Anything the browser calls a video, plus .mkv, which usually arrives without a MIME type. */
export function isVideoFile(file: File): boolean {
  return kindOf(file) === "video" || /\.(mkv|m4v|ogv)$/i.test(file.name);
}

export function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

const THUMB_W = 112;
const THUMB_H = 64;

/**
 * Loads a video off-screen to read its duration and grab a small poster frame.
 * Resolves with nulls when the browser can't decode the file; never rejects.
 */
export function probeMedia(url: string): Promise<{ duration: number | null; thumb: string | null }> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    let settled = false;
    const duration = () => (Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null);
    const finish = (thumb: string | null) => {
      if (settled) {
        if (thumb) URL.revokeObjectURL(thumb);
        return;
      }
      settled = true;
      window.clearTimeout(timer);
      const d = duration();
      video.removeAttribute("src");
      video.load();
      resolve({ duration: d, thumb });
    };
    const timer = window.setTimeout(() => finish(null), 8000);
    video.addEventListener("error", () => finish(null), { once: true });
    video.addEventListener(
      "loadedmetadata",
      () => {
        const d = duration();
        video.currentTime = d ? Math.min(d * 0.1, 5) : 0.1;
      },
      { once: true },
    );
    video.addEventListener(
      "seeked",
      () => {
        const canvas = document.createElement("canvas");
        canvas.width = THUMB_W;
        canvas.height = THUMB_H;
        const ctx = canvas.getContext("2d");
        if (!ctx || !video.videoWidth) return finish(null);
        const scale = Math.max(THUMB_W / video.videoWidth, THUMB_H / video.videoHeight);
        const w = video.videoWidth * scale;
        const h = video.videoHeight * scale;
        ctx.drawImage(video, (THUMB_W - w) / 2, (THUMB_H - h) / 2, w, h);
        canvas.toBlob((blob) => finish(blob ? URL.createObjectURL(blob) : null), "image/jpeg", 0.72);
      },
      { once: true },
    );
    video.src = url;
  });
}

/* ───────── "Resume where I left off": positions and the toggle live in localStorage only ───────── */

const POSITIONS_KEY = "reactool-player-positions";
const RESUME_KEY = "reactool-player-resume";
const MAX_POSITIONS = 60;

type Positions = Record<string, { t: number; at: number }>;

/** Identifies a file without reading it. Hashed (cyrb53) so file names never sit in storage as plain text. */
export function fingerprint(file: File): string {
  const text = `${file.name}:${file.size}:${file.lastModified}`;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function readPositions(): Positions {
  try {
    const raw = localStorage.getItem(POSITIONS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Positions) : {};
  } catch {
    return {};
  }
}

function writePositions(positions: Positions): void {
  try {
    const keep = Object.entries(positions)
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, MAX_POSITIONS);
    localStorage.setItem(POSITIONS_KEY, JSON.stringify(Object.fromEntries(keep)));
  } catch {
    /* storage full or blocked: resuming just won't work */
  }
}

export function savedPosition(file: File): number | null {
  return readPositions()[fingerprint(file)]?.t ?? null;
}

export function savePosition(file: File, time: number | null): void {
  const positions = readPositions();
  if (time === null) delete positions[fingerprint(file)];
  else positions[fingerprint(file)] = { t: Math.round(time * 10) / 10, at: Date.now() };
  writePositions(positions);
}

export function clearPositions(): void {
  try {
    localStorage.removeItem(POSITIONS_KEY);
  } catch {
    /* nothing to clear */
  }
}

export function readResumePref(): boolean {
  try {
    return localStorage.getItem(RESUME_KEY) !== "off";
  } catch {
    return true;
  }
}

export function writeResumePref(on: boolean): void {
  try {
    localStorage.setItem(RESUME_KEY, on ? "on" : "off");
  } catch {
    /* preference stays in memory */
  }
}
