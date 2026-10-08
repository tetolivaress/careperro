"use client";

import { useEffect, useState } from "react";

export interface Thumb {
  time: number;
  url: string;
}

/**
 * Renders evenly spaced frames from a video URL into small JPEG object URLs on the main thread.
 * Seeking is async and drawImage is cheap, so the UI stays responsive. Cancels on URL change/unmount.
 */
export function useVideoThumbnails(src: string | null, duration: number, count = 12, height = 56): Thumb[] {
  const [thumbs, setThumbs] = useState<Thumb[]>([]);

  useEffect(() => {
    if (!src || !duration || !Number.isFinite(duration)) return;
    let canceled = false;
    const created: string[] = [];
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    video.src = src;

    const seek = (t: number) =>
      new Promise<void>((resolve, reject) => {
        const onSeeked = () => {
          cleanup();
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error("seek failed"));
        };
        const cleanup = () => {
          video.removeEventListener("seeked", onSeeked);
          video.removeEventListener("error", onError);
        };
        video.addEventListener("seeked", onSeeked);
        video.addEventListener("error", onError);
        video.currentTime = Math.min(Math.max(t, 0), Math.max(duration - 0.05, 0));
      });

    const run = async () => {
      await new Promise<void>((resolve, reject) => {
        if (video.readyState >= 1) return resolve();
        video.addEventListener("loadedmetadata", () => resolve(), { once: true });
        video.addEventListener("error", () => reject(new Error("load failed")), { once: true });
      });
      if (canceled) return;
      const aspect = video.videoWidth / Math.max(video.videoHeight, 1) || 16 / 9;
      const canvas = document.createElement("canvas");
      canvas.height = height;
      canvas.width = Math.max(1, Math.round(height * aspect));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const out: Thumb[] = [];
      for (let i = 0; i < count; i++) {
        if (canceled) return;
        const time = (duration * (i + 0.5)) / count;
        try {
          await seek(time);
        } catch {
          break;
        }
        if (canceled) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.7));
        if (canceled || !blob) return;
        const url = URL.createObjectURL(blob);
        created.push(url);
        out.push({ time, url });
        setThumbs([...out]);
      }
    };

    run().catch(() => {
      /* unsupported codec for <video>: timeline stays blank */
    });

    return () => {
      canceled = true;
      video.removeAttribute("src");
      video.load();
      for (const u of created) URL.revokeObjectURL(u);
      setThumbs([]);
    };
  }, [src, duration, count, height]);

  return thumbs;
}
