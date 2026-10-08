"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ToolHeader, Pane, CopyButton } from "@/components/shell/TwoPaneTool";
import { contrastRatio, formatHsl, formatRgb, hslToRgb, parseColor, rgbToHex, rgbToHsl, type HSL } from "./lib/color";
import { cn } from "@/lib/utils";

export default function ColorTool() {
  const t = useTranslations("dev.color");
  const [text, setText] = useState("#3ddc97");
  const rgb = useMemo(() => parseColor(text), [text]);
  const hsl = rgb ? rgbToHsl(rgb) : null;
  const hex = rgb ? rgbToHex(rgb) : "#000000";

  const setFromHsl = (patch: Partial<HSL>) => {
    if (!hsl) return;
    setText(rgbToHex(hslToRgb({ ...hsl, ...patch })));
  };

  const rows: [string, string][] = rgb && hsl ? [["HEX", hex], ["RGB", formatRgb(rgb)], ["HSL", formatHsl(hsl)], ["CSS", `--color: ${hex};`]] : [];
  const white = { r: 255, g: 255, b: 255 }, black = { r: 0, g: 0, b: 0 };
  const grade = (ratio: number) => (ratio >= 4.5 ? t("pass") : ratio >= 3 ? t("passLarge") : t("fail"));

  const slider = (label: string, value: number, max: number, key: keyof HSL, bg: string) => (
    <label className="flex flex-col gap-1.5 text-xs text-fg-muted">
      <span className="flex justify-between font-medium">
        {label}
        <span className="text-fg tabular-nums">{Math.round(value)}</span>
      </span>
      <input type="range" min={0} max={max} value={Math.round(value)} onChange={(e) => setFromHsl({ [key]: Number(e.target.value) } as Partial<HSL>)} className="h-2 w-full cursor-pointer appearance-none rounded-full accent-[var(--primary)]" style={{ background: bg }} />
    </label>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-6">
        <ToolHeader />
      </div>
      <div className="grid min-h-0 flex-1 gap-3 p-4 md:grid-cols-2 md:p-6">
        <Pane title={t("input")}>
          <div className="flex flex-1 flex-col gap-5 p-4">
            <div className="flex items-center gap-3">
              <label className="relative size-14 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-border" style={{ background: hex }} title={t("pick")}>
                <input type="color" value={hex} onChange={(e) => setText(e.target.value)} aria-label={t("pick")} className="absolute inset-0 size-full cursor-pointer opacity-0" />
              </label>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t("placeholder")}
                aria-label={t("input")}
                aria-invalid={!rgb}
                className={cn("h-11 flex-1 rounded-sm border bg-surface-2 px-3 font-mono text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring/60", rgb ? "border-border" : "border-danger")}
              />
            </div>
            {!rgb && <p className="text-xs text-danger">{t("invalid")}</p>}
            {hsl && (
              <div className="flex flex-col gap-4">
                {slider("H", hsl.h, 360, "h", "linear-gradient(to right, hsl(0 100% 50%), hsl(60 100% 50%), hsl(120 100% 50%), hsl(180 100% 50%), hsl(240 100% 50%), hsl(300 100% 50%), hsl(360 100% 50%))")}
                {slider("S", hsl.s, 100, "s", `linear-gradient(to right, hsl(${hsl.h} 0% ${hsl.l}%), hsl(${hsl.h} 100% ${hsl.l}%))`)}
                {slider("L", hsl.l, 100, "l", `linear-gradient(to right, #000, hsl(${hsl.h} ${hsl.s}% 50%), #fff)`)}
              </div>
            )}
            <div className="mt-auto h-24 w-full rounded-lg border border-border" style={{ background: hex }} aria-hidden />
          </div>
        </Pane>
        <Pane title={t("formats")} actions={<CopyButton text={rows.map(([k, v]) => `${k}: ${v}`).join("\n")} />}>
          <div className="flex flex-1 flex-col gap-3 p-4">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-center gap-3 rounded-sm border border-border bg-surface-2 px-3 py-2">
                <span className="w-10 text-[11px] font-semibold text-fg-subtle">{k}</span>
                <code className="flex-1 font-mono text-sm text-fg">{v}</code>
                <CopyButton text={v} className="h-7" />
              </div>
            ))}
            {rgb && (
              <div className="mt-2 flex flex-col gap-2">
                <span className="text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">{t("contrast")}</span>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    [white, t("onWhite")],
                    [black, t("onBlack")],
                  ].map(([bgc, label]) => {
                    const ratio = contrastRatio(rgb, bgc as typeof white);
                    return (
                      <div key={label as string} className="flex items-center justify-between rounded-sm border border-border px-3 py-2 text-xs" style={{ background: rgbToHex(bgc as typeof white), color: hex }}>
                        <span className="font-semibold">Aa {label as string}</span>
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-fg">
                          {ratio.toFixed(2)} · {grade(ratio)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </Pane>
      </div>
    </div>
  );
}
