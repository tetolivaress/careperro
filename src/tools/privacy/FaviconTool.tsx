"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { zipSync } from "fflate";
import { DropZone, ExportBar, SettingsGroup, ToggleRow, ToolShell } from "@/components/shell";
import { CopyButton } from "@/components/shell/TwoPaneTool";
import { IconTile } from "@/components/ui/icon-tile";
import { Slider } from "@/components/ui/slider";
import { downloadBlob } from "@/lib/download";
import { formatBytes } from "@/lib/formatBytes";
import { takeFiles } from "@/lib/fileHandoff";
import { useToolShellStore } from "@/stores/toolShell";
import { useSessionStore } from "@/stores/session";
import { useCurrentTool } from "@/tools/useCurrentTool";
import { useToolCopy } from "@/tools/copy";
import { buildIco } from "./lib/ico";

const SIZES = [16, 32, 48, 64, 180, 192, 512] as const;

interface RenderOpts {
  background: string;
  transparent: boolean;
  padding: number; // percent
  radius: number; // percent
}

async function renderSize(bitmap: ImageBitmap, size: number, o: RenderOpts): Promise<Blob> {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  const r = (o.radius / 100) * (size / 2);
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, r);
  ctx.clip();
  if (!o.transparent) {
    ctx.fillStyle = o.background;
    ctx.fillRect(0, 0, size, size);
  }
  const pad = (o.padding / 100) * size;
  const inner = size - pad * 2;
  const scale = Math.min(inner / bitmap.width, inner / bitmap.height);
  const w = bitmap.width * scale, h = bitmap.height * scale;
  ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
  return canvas.convertToBlob({ type: "image/png" });
}

export default function FaviconTool() {
  const t = useTranslations("privacy.favicon");
  const tool = useCurrentTool();
  const copy = useToolCopy();
  const [file, setFile] = useState<File | null>(() => takeFiles()?.[0] ?? null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [opts, setOpts] = useState<RenderOpts>({ background: "#0a0a0b", transparent: true, padding: 0, radius: 0 });
  const [appName, setAppName] = useState("My App");
  const [themeColor, setThemeColor] = useState("#0a0a0b");
  const [previews, setPreviews] = useState<Record<number, string>>({});
  const [rendering, setRendering] = useState(false);
  const setShellFile = useToolShellStore((s) => s.setFile);
  const recordProcessed = useSessionStore((s) => s.recordProcessed);

  useEffect(() => {
    if (!file) return;
    let bmp: ImageBitmap | null = null;
    let cancelled = false;
    createImageBitmap(file).then((b) => {
      if (cancelled) {
        b.close();
        return;
      }
      bmp = b;
      setBitmap(b);
    });
    return () => {
      cancelled = true;
      bmp?.close();
    };
  }, [file]);

  useEffect(() => {
    setShellFile(file ? { name: file.name, meta: bitmap ? `${bitmap.width} × ${bitmap.height} · ${formatBytes(file.size)}` : formatBytes(file.size) } : null);
  }, [file, bitmap, setShellFile]);

  // Live previews for the sizes shown on screen.
  useEffect(() => {
    if (!bitmap) return;
    let cancelled = false;
    const urls: string[] = [];
    Promise.all([16, 32, 180, 512].map(async (s) => [s, URL.createObjectURL(await renderSize(bitmap, s, opts))] as const)).then((pairs) => {
      if (cancelled) {
        pairs.forEach(([, u]) => URL.revokeObjectURL(u));
        return;
      }
      pairs.forEach(([, u]) => urls.push(u));
      setPreviews(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [bitmap, opts]);

  const manifest = useMemo(
    () =>
      JSON.stringify(
        {
          name: appName,
          short_name: appName,
          icons: [
            { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
          ],
          theme_color: themeColor,
          background_color: themeColor,
          display: "standalone",
        },
        null,
        2,
      ),
    [appName, themeColor],
  );

  const html = `<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="${themeColor}">`;

  const download = async () => {
    if (!bitmap) return;
    setRendering(true);
    try {
      const files: Record<string, Uint8Array> = {};
      const icoParts: { size: number; data: Uint8Array }[] = [];
      for (const s of SIZES) {
        const bytes = new Uint8Array(await (await renderSize(bitmap, s, opts)).arrayBuffer());
        const name = s === 180 ? "apple-touch-icon.png" : s === 16 || s === 32 ? `favicon-${s}.png` : `icon-${s}.png`;
        files[name] = bytes;
        if (s === 16 || s === 32 || s === 48) icoParts.push({ size: s, data: bytes });
      }
      files["favicon.ico"] = buildIco(icoParts);
      files["site.webmanifest"] = new TextEncoder().encode(manifest);
      files["snippet.html"] = new TextEncoder().encode(html);
      const zipped = zipSync(files, { level: 6 });
      downloadBlob(new Blob([zipped as BlobPart], { type: "application/zip" }), "favicons.zip");
      recordProcessed();
    } finally {
      setRendering(false);
    }
  };

  if (!tool) return null;
  const c = copy(tool);

  if (!file) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-5 py-10 md:px-12">
        <div className="flex max-w-[640px] flex-col items-center gap-3 text-center">
          <IconTile icon="app-window" size={52} />
          <h1 className="text-2xl font-bold tracking-tight text-fg">{c.name}</h1>
          <p className="text-sm text-fg-muted">{c.description}</p>
        </div>
        <DropZone className="w-full max-w-[640px]" accept={tool.accept} maxSize={tool.maxSize} title={t("drop")} subtitle={t("dropSubtitle")} formats={["PNG", "SVG", "JPG", "WebP"]} onFiles={(f) => setFile(f[0])} />
      </div>
    );
  }

  const slider = (label: string, key: "padding" | "radius", max: number) => (
    <SettingsGroup label={label} value={`${opts[key]}%`}>
      <Slider value={[opts[key]]} min={0} max={max} step={1} onValueChange={(v) => setOpts((o) => ({ ...o, [key]: Array.isArray(v) ? v[0] : v }))} aria-label={label} />
    </SettingsGroup>
  );

  const settings = (
    <>
      <ToggleRow label={t("transparent")} checked={opts.transparent} onCheckedChange={(v) => setOpts((o) => ({ ...o, transparent: v }))} />
      {!opts.transparent && (
        <SettingsGroup label={t("background")}>
          <div className="flex items-center gap-2">
            <input type="color" value={opts.background} onChange={(e) => setOpts((o) => ({ ...o, background: e.target.value }))} aria-label={t("background")} className="size-9 cursor-pointer rounded-sm border border-border bg-transparent" />
            <code className="font-mono text-xs text-fg-muted">{opts.background}</code>
          </div>
        </SettingsGroup>
      )}
      {slider(t("padding"), "padding", 30)}
      {slider(t("radius"), "radius", 100)}
      <SettingsGroup label={t("appName")}>
        <input value={appName} onChange={(e) => setAppName(e.target.value)} aria-label={t("appName")} className="h-10 w-full rounded-sm border border-border bg-surface-2 px-3 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring/60" />
      </SettingsGroup>
      <SettingsGroup label={t("themeColor")}>
        <div className="flex items-center gap-2">
          <input type="color" value={themeColor} onChange={(e) => setThemeColor(e.target.value)} aria-label={t("themeColor")} className="size-9 cursor-pointer rounded-sm border border-border bg-transparent" />
          <code className="font-mono text-xs text-fg-muted">{themeColor}</code>
        </div>
      </SettingsGroup>
      <SettingsGroup label={t("html")}>
        <div className="relative">
          <pre className="scrollbar-thin overflow-auto rounded-sm border border-border bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-fg">{html}</pre>
          <CopyButton text={html} className="absolute end-2 top-2 h-7" />
        </div>
      </SettingsGroup>
      <SettingsGroup label={t("manifest")}>
        <div className="relative">
          <pre className="scrollbar-thin max-h-40 overflow-auto rounded-sm border border-border bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-fg">{manifest}</pre>
          <CopyButton text={manifest} className="absolute end-2 top-2 h-7" />
        </div>
      </SettingsGroup>
      <p className="text-xs text-fg-subtle">
        {t("included")}: favicon.ico · {SIZES.map((s) => `${s}px`).join(" · ")} · site.webmanifest
      </p>
      {bitmap && bitmap.width < 512 && <p className="text-xs text-warning">{t("small", { width: bitmap.width, height: bitmap.height })}</p>}
    </>
  );

  const preview = (
    <div className="flex flex-col items-center gap-8 p-6">
      <div className="flex items-end gap-6">
        {[512, 180, 32, 16].map((s) => (
          <div key={s} className="flex flex-col items-center gap-2">
            {previews[s] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previews[s]} alt="" width={Math.min(s, 160)} height={Math.min(s, 160)} className="rounded-sm" style={{ imageRendering: s <= 32 ? "pixelated" : "auto" }} />
            ) : (
              <div style={{ width: Math.min(s, 160), height: Math.min(s, 160) }} className="rounded-sm bg-surface-2" />
            )}
            <span className="text-[11px] text-fg-subtle">{s}px</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-fg-subtle">
        <div className="flex items-center gap-2 rounded-t-lg border border-b-0 border-border bg-surface px-3 py-2">
          {previews[16] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previews[16]} alt="" width={16} height={16} />
          )}
          <span className="text-fg">{appName}</span>
          <span className="ms-4">{t("browserTab")}</span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          {previews[180] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previews[180]} alt="" width={56} height={56} className="rounded-[14px] shadow-md" />
          )}
          <span className="text-fg">{appName}</span>
          <span>{t("homeScreen")}</span>
        </div>
      </div>
    </div>
  );

  return (
    <ToolShell
      preview={preview}
      settings={settings}
      footer={<ExportBar onReset={() => { setFile(null); setBitmap(null); setPreviews({}); }} downloadLabel={rendering ? t("generating", { count: SIZES.length }) : t("download")} downloadDisabled={!bitmap || rendering} onDownload={download} />}
    />
  );
}
