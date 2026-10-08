"use client";

import { useId, useRef } from "react";
import { useTranslations } from "next-intl";
import { FlipHorizontal2, FlipVertical2, Image as ImageIcon, RotateCcw, RotateCw, Type, Upload, X } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { SettingsGroup } from "@/components/shell/SettingsPanel";
import { Segmented } from "@/components/shell/Segmented";
import { ToggleRow } from "@/components/shell/ToggleRow";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/formatBytes";
import { useImageEditor, selectedItem } from "./store";
import { OUTPUT_FORMATS, type AspectPreset, type CompressPreset, type OutputFormat, type WatermarkPosition } from "./types";

const PRESET_QUALITY: Record<CompressPreset, number> = { smallest: 60, balanced: 82, best: 92 };

function LabeledSlider({
  label,
  value,
  display,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  display?: string;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <SettingsGroup label={label} value={display ?? `${value}`}>
      <Slider
        id={id}
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
      />
    </SettingsGroup>
  );
}

export function CompressPanel() {
  const t = useTranslations("image.compress");
  const c = useImageEditor((s) => s.settings.compress);
  const update = useImageEditor((s) => s.update);
  const item = useImageEditor(selectedItem);
  const formats = OUTPUT_FORMATS.map((f) => ({ value: f.value, label: f.label }));
  const lossy = c.format !== "png";

  return (
    <>
      <SettingsGroup label={t("preset")}>
        <Segmented<CompressPreset>
          label={t("preset")}
          value={c.preset}
          onChange={(preset) => update("compress", { preset, quality: PRESET_QUALITY[preset] })}
          options={[
            { value: "smallest", label: t("presetSmallest") },
            { value: "balanced", label: t("presetBalanced") },
            { value: "best", label: t("presetBest") },
          ]}
        />
      </SettingsGroup>
      <SettingsGroup label={t("outputFormat")}>
        <Segmented<OutputFormat> label={t("outputFormat")} value={c.format} onChange={(format) => update("compress", { format })} options={formats} />
      </SettingsGroup>
      {lossy && (
        <LabeledSlider label={t("quality")} value={c.quality} display={`${c.quality}%`} min={1} max={100} onChange={(quality) => update("compress", { quality })} />
      )}
      <ToggleRow label={t("stripMetadata")} hint={t("stripMetadataHint")} checked={c.stripMetadata} onCheckedChange={(stripMetadata) => update("compress", { stripMetadata })} />
      <ToggleRow
        label={t("maxSize")}
        hint={c.maxBytes ? t("maxSizeHint", { size: formatBytes(c.maxBytes, 0) }) : t("maxSizeOff")}
        checked={c.maxBytes !== null}
        onCheckedChange={(on) => update("compress", { maxBytes: on ? 500 * 1024 : null })}
        disabled={!lossy}
      />
      {c.maxBytes !== null && lossy && (
        <LabeledSlider
          label={t("maxSizeTarget")}
          value={Math.round(c.maxBytes / 1024)}
          display={formatBytes(c.maxBytes, 0)}
          min={20}
          max={Math.max(100, Math.round((item?.file.size ?? 5 * 1024 * 1024) / 1024))}
          step={10}
          onChange={(kb) => update("compress", { maxBytes: kb * 1024 })}
        />
      )}
    </>
  );
}

export function ResizePanel() {
  const t = useTranslations("image.resize");
  const r = useImageEditor((s) => s.settings.resize);
  const update = useImageEditor((s) => s.update);
  const item = useImageEditor(selectedItem);
  const src = item?.info;
  const ratio = src ? src.width / src.height : 1;
  const wId = useId();
  const hId = useId();

  const setWidth = (v: number | null) => update("resize", { enabled: true, width: v, height: r.lockRatio && v ? Math.round(v / ratio) : r.height });
  const setHeight = (v: number | null) => update("resize", { enabled: true, height: v, width: r.lockRatio && v ? Math.round(v * ratio) : r.width });
  const parse = (s: string) => {
    const n = parseInt(s, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  return (
    <>
      <ToggleRow label={t("enable")} hint={src ? t("sourceSize", { width: src.width, height: src.height }) : undefined} checked={r.enabled} onCheckedChange={(enabled) => update("resize", { enabled })} />
      <SettingsGroup label={t("mode")}>
        <Segmented label={t("mode")} value={r.mode} onChange={(mode) => update("resize", { mode, enabled: true })} options={[{ value: "pixels", label: t("pixels") }, { value: "percent", label: t("percent") }]} />
      </SettingsGroup>
      {r.mode === "pixels" ? (
        <div className="flex items-end gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor={wId} className="text-[13px] font-medium text-fg-muted">{t("width")}</label>
            <Input id={wId} type="number" inputMode="numeric" min={1} value={r.width ?? ""} placeholder={src ? String(src.width) : ""} onChange={(e) => setWidth(parse(e.target.value))} />
          </div>
          <button
            type="button"
            onClick={() => update("resize", { lockRatio: !r.lockRatio })}
            aria-pressed={r.lockRatio}
            aria-label={t("lockRatio")}
            title={t("lockRatio")}
            className={cn("mb-0.5 flex size-9 shrink-0 items-center justify-center rounded-sm border text-fg-muted", r.lockRatio ? "border-primary-line bg-primary-soft text-primary" : "border-border bg-surface-2")}
          >
            <span aria-hidden className="text-sm">{r.lockRatio ? "🔗" : "⛓️‍💥"}</span>
          </button>
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor={hId} className="text-[13px] font-medium text-fg-muted">{t("height")}</label>
            <Input id={hId} type="number" inputMode="numeric" min={1} value={r.height ?? ""} placeholder={src ? String(src.height) : ""} onChange={(e) => setHeight(parse(e.target.value))} />
          </div>
        </div>
      ) : (
        <LabeledSlider label={t("scale")} value={r.percent} display={`${r.percent}%`} min={5} max={200} step={5} onChange={(percent) => update("resize", { percent, enabled: true })} />
      )}
      <SettingsGroup label={t("presets")}>
        <div className="flex flex-wrap gap-2">
          {[25, 50, 75].map((p) => (
            <button key={p} type="button" onClick={() => update("resize", { enabled: true, mode: "percent", percent: p })} className="h-8 rounded-sm border border-border bg-surface-2 px-3 text-xs font-medium text-fg-muted hover:text-fg">
              {p}%
            </button>
          ))}
          {[
            { label: "1080p", w: 1920 },
            { label: "4K", w: 3840 },
            { label: "IG 1080", w: 1080 },
          ].map((p) => (
            <button key={p.label} type="button" onClick={() => update("resize", { enabled: true, mode: "pixels", lockRatio: true, width: p.w, height: Math.round(p.w / ratio) })} className="h-8 rounded-sm border border-border bg-surface-2 px-3 text-xs font-medium text-fg-muted hover:text-fg">
              {p.label}
            </button>
          ))}
        </div>
      </SettingsGroup>
      <ToggleRow label={t("noUpscale")} checked={r.noUpscale} onCheckedChange={(noUpscale) => update("resize", { noUpscale })} />
    </>
  );
}

const ASPECTS: AspectPreset[] = ["free", "1:1", "4:5", "16:9", "9:16", "3:2", "4:3"];

export function CropPanel() {
  const t = useTranslations("image.crop");
  const crop = useImageEditor((s) => s.settings.crop);
  const rot = useImageEditor((s) => s.settings.rotate);
  const update = useImageEditor((s) => s.update);
  const turn = (delta: 90 | -90) => update("rotate", { angle: (((rot.angle + delta) % 360) + 360) % 360 as 0 | 90 | 180 | 270 });

  return (
    <>
      <SettingsGroup label={t("aspect")}>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("aspect")}>
          {ASPECTS.map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={crop.aspect === a}
              onClick={() => update("crop", { aspect: a })}
              className={cn("h-8 rounded-sm border px-3 text-xs font-medium", crop.aspect === a ? "border-primary-line bg-primary-soft text-primary" : "border-border bg-surface-2 text-fg-muted hover:text-fg")}
            >
              {a === "free" ? t("free") : a}
            </button>
          ))}
        </div>
      </SettingsGroup>
      <p className="text-xs text-fg-subtle">{t("hint")}</p>
      {crop.rect && (
        <button type="button" onClick={() => update("crop", { rect: null })} className="flex h-8 w-fit items-center gap-2 rounded-sm border border-border bg-surface-2 px-3 text-xs font-medium text-fg-muted hover:text-fg">
          <X className="size-3.5" aria-hidden />
          {t("clear")}
        </button>
      )}
      <SettingsGroup label={t("rotate")}>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: t("rotateLeft"), icon: RotateCcw, on: () => turn(-90), active: false },
            { label: t("rotateRight"), icon: RotateCw, on: () => turn(90), active: false },
            { label: t("flipH"), icon: FlipHorizontal2, on: () => update("rotate", { flipH: !rot.flipH }), active: rot.flipH },
            { label: t("flipV"), icon: FlipVertical2, on: () => update("rotate", { flipV: !rot.flipV }), active: rot.flipV },
          ].map((b) => (
            <button
              key={b.label}
              type="button"
              onClick={b.on}
              aria-pressed={b.active}
              title={b.label}
              aria-label={b.label}
              className={cn("flex h-10 items-center justify-center rounded-sm border", b.active ? "border-primary-line bg-primary-soft text-primary" : "border-border bg-surface-2 text-fg-muted hover:text-fg")}
            >
              <b.icon className="size-4" aria-hidden />
            </button>
          ))}
        </div>
        <span className="text-xs text-fg-subtle">{t("angle", { angle: rot.angle })}</span>
      </SettingsGroup>
    </>
  );
}

export function WatermarkPanel() {
  const t = useTranslations("image.watermark");
  const wm = useImageEditor((s) => s.settings.watermark);
  const update = useImageEditor((s) => s.update);
  const fileRef = useRef<HTMLInputElement>(null);
  const textId = useId();
  const colorId = useId();

  return (
    <>
      <ToggleRow label={t("enable")} checked={wm.enabled} onCheckedChange={(enabled) => update("watermark", { enabled })} />
      <SettingsGroup label={t("type")}>
        <Segmented label={t("type")} value={wm.type} onChange={(type) => update("watermark", { type, enabled: true })} options={[{ value: "text", label: t("text") }, { value: "image", label: t("logo") }]} />
      </SettingsGroup>
      {wm.type === "text" ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={textId} className="text-[13px] font-medium text-fg-muted">{t("textLabel")}</label>
            <div className="relative">
              <Type className="pointer-events-none absolute top-1/2 start-2.5 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
              <Input id={textId} value={wm.text} onChange={(e) => update("watermark", { text: e.target.value, enabled: true })} className="ps-8" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <label htmlFor={colorId} className="text-[13px] font-medium text-fg-muted">{t("color")}</label>
            <input id={colorId} type="color" value={wm.color} onChange={(e) => update("watermark", { color: e.target.value })} className="h-8 w-12 cursor-pointer rounded-sm border border-border bg-surface-2 p-0.5" />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => fileRef.current?.click()} className="flex h-10 items-center gap-2 rounded-sm border border-border-strong bg-surface-2 px-3 text-[13px] font-medium text-fg hover:bg-surface-3">
            <Upload className="size-4 text-fg-muted" aria-hidden />
            {wm.image ? t("replaceLogo") : t("uploadLogo")}
          </button>
          {wm.image && (
            <span className="flex items-center gap-1.5 text-xs text-fg-muted">
              <ImageIcon className="size-3.5" aria-hidden />
              {formatBytes(wm.image.size)}
            </span>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) update("watermark", { image: f, enabled: true });
              e.target.value = "";
            }}
          />
        </div>
      )}
      <SettingsGroup label={t("position")}>
        <div className="grid w-fit grid-cols-3 gap-1.5" role="radiogroup" aria-label={t("position")}>
          {([1, 2, 3, 4, 5, 6, 7, 8, 9] as WatermarkPosition[]).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={wm.position === p && !wm.tiled}
              aria-label={t("positionN", { n: p })}
              disabled={wm.tiled}
              onClick={() => update("watermark", { position: p })}
              className={cn("flex size-9 items-center justify-center rounded-sm border", wm.position === p && !wm.tiled ? "border-primary-line bg-primary-soft" : "border-border bg-surface-2", wm.tiled && "opacity-40")}
            >
              <span className={cn("size-2 rounded-[2px]", wm.position === p && !wm.tiled ? "bg-primary" : "bg-fg-subtle")} aria-hidden />
            </button>
          ))}
        </div>
      </SettingsGroup>
      <ToggleRow label={t("tiled")} hint={t("tiledHint")} checked={wm.tiled} onCheckedChange={(tiled) => update("watermark", { tiled })} />
      <LabeledSlider label={t("opacity")} value={wm.opacity} display={`${wm.opacity}%`} min={5} max={100} onChange={(opacity) => update("watermark", { opacity })} />
      <LabeledSlider label={t("size")} value={wm.size} display={`${wm.size}%`} min={5} max={60} onChange={(size) => update("watermark", { size })} />
    </>
  );
}

export function FiltersPanel() {
  const t = useTranslations("image.filters");
  const f = useImageEditor((s) => s.settings.filters);
  const update = useImageEditor((s) => s.update);
  const reset = () => update("filters", { brightness: 100, contrast: 100, saturation: 100, grayscale: 0, blur: 0 });
  return (
    <>
      <LabeledSlider label={t("brightness")} value={f.brightness} display={`${f.brightness}%`} min={0} max={200} onChange={(brightness) => update("filters", { brightness })} />
      <LabeledSlider label={t("contrast")} value={f.contrast} display={`${f.contrast}%`} min={0} max={200} onChange={(contrast) => update("filters", { contrast })} />
      <LabeledSlider label={t("saturation")} value={f.saturation} display={`${f.saturation}%`} min={0} max={200} onChange={(saturation) => update("filters", { saturation })} />
      <LabeledSlider label={t("grayscale")} value={f.grayscale} display={`${f.grayscale}%`} min={0} max={100} onChange={(grayscale) => update("filters", { grayscale })} />
      <LabeledSlider label={t("blur")} value={f.blur} display={`${f.blur}`} min={0} max={20} step={0.5} onChange={(blur) => update("filters", { blur })} />
      <SettingsGroup label={t("presets")}>
        <div className="flex flex-wrap gap-2">
          {[
            { label: t("presetVivid"), v: { brightness: 105, contrast: 110, saturation: 135, grayscale: 0, blur: 0 } },
            { label: t("presetMono"), v: { brightness: 100, contrast: 110, saturation: 100, grayscale: 100, blur: 0 } },
            { label: t("presetSoft"), v: { brightness: 108, contrast: 92, saturation: 90, grayscale: 0, blur: 0 } },
            { label: t("presetFaded"), v: { brightness: 110, contrast: 85, saturation: 70, grayscale: 20, blur: 0 } },
          ].map((p) => (
            <button key={p.label} type="button" onClick={() => update("filters", p.v)} className="h-8 rounded-sm border border-border bg-surface-2 px-3 text-xs font-medium text-fg-muted hover:text-fg">
              {p.label}
            </button>
          ))}
          <button type="button" onClick={reset} className="h-8 rounded-sm border border-border px-3 text-xs font-medium text-fg-subtle hover:text-fg">
            {t("reset")}
          </button>
        </div>
      </SettingsGroup>
    </>
  );
}

export function ConvertPanel() {
  const t = useTranslations("image.convert");
  const c = useImageEditor((s) => s.settings.compress);
  const update = useImageEditor((s) => s.update);
  const item = useImageEditor(selectedItem);
  return (
    <>
      <SettingsGroup label={t("target")}>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("target")}>
          {OUTPUT_FORMATS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={c.format === f.value}
              onClick={() => update("compress", { format: f.value })}
              className={cn("flex flex-col items-start gap-0.5 rounded-lg border p-3 text-start", c.format === f.value ? "border-primary-line bg-primary-soft" : "border-border bg-surface-2 hover:border-border-strong")}
            >
              <span className={cn("text-sm font-semibold", c.format === f.value ? "text-primary" : "text-fg")}>{f.label}</span>
              <span className="text-xs text-fg-subtle">{t(`hint_${f.value}`)}</span>
            </button>
          ))}
        </div>
      </SettingsGroup>
      {c.format !== "png" && <LabeledSlider label={t("quality")} value={c.quality} display={`${c.quality}%`} min={1} max={100} onChange={(quality) => update("compress", { quality })} />}
      {item && <p className="text-xs text-fg-subtle">{t("from", { format: item.file.type.split("/")[1]?.toUpperCase() ?? "?" })}</p>}
    </>
  );
}
