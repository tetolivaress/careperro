"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Shuffle } from "lucide-react";
import { ToolHeader, Pane, CopyButton, NativeSelect, toolButton } from "@/components/shell/TwoPaneTool";
import { generatePalette, parseColor, rgbToHex, rgbToHsl, luminance, type PaletteKind } from "./lib/color";
import { useClipboard } from "@/components/shell/TwoPaneTool";
import { cn } from "@/lib/utils";

const KINDS: PaletteKind[] = ["complementary", "analogous", "triadic", "split", "tetradic", "shades", "tints", "monochrome"];

function randomHex(): string {
  const b = crypto.getRandomValues(new Uint8Array(3));
  return rgbToHex({ r: b[0], g: b[1], b: b[2] });
}

export default function PaletteTool() {
  const t = useTranslations("dev.palette");
  const [base, setBase] = useState("#3ddc97");
  const [kind, setKind] = useState<PaletteKind>("analogous");
  const { copy } = useClipboard();
  const rgb = parseColor(base) ?? { r: 61, g: 220, b: 151 };
  const palette = useMemo(() => generatePalette(rgb, kind).map(rgbToHex), [rgb.r, rgb.g, rgb.b, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const css = `:root {\n${palette.map((c, i) => `  --${kind}-${i + 1}: ${c};`).join("\n")}\n}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6">
        <ToolHeader />
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs font-medium text-fg-muted">
            {t("base")}
            <span className="relative size-8 overflow-hidden rounded-sm border border-border" style={{ background: rgbToHex(rgb) }}>
              <input type="color" value={rgbToHex(rgb)} onChange={(e) => setBase(e.target.value)} aria-label={t("base")} className="absolute inset-0 size-full cursor-pointer opacity-0" />
            </span>
            <input value={base} onChange={(e) => setBase(e.target.value)} aria-label={t("base")} className="h-8 w-28 rounded-sm border border-border bg-surface-2 px-2 font-mono text-xs text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring/60" />
          </label>
          <NativeSelect label={t("scheme")} value={kind} onChange={setKind} options={KINDS.map((k) => ({ value: k, label: t(k) }))} />
          <button type="button" onClick={() => setBase(randomHex())} className={toolButton}>
            <Shuffle className="size-3.5 text-fg-muted" aria-hidden /> {t("random")}
          </button>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 gap-3 p-4 md:grid-cols-[1.4fr_1fr] md:p-6">
        <Pane title={t(kind)}>
          <div className="flex flex-1 flex-col gap-2 p-3 md:flex-row">
            {palette.map((c, i) => {
              const dark = luminance(parseColor(c)!) < 0.4;
              const h = rgbToHsl(parseColor(c)!);
              return (
                <button
                  key={`${c}-${i}`}
                  type="button"
                  onClick={() => copy(c)}
                  style={{ background: c }}
                  className={cn("flex min-h-[72px] flex-1 flex-col items-start justify-end gap-0.5 rounded-lg p-3 text-start transition-transform hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none md:min-h-0", dark ? "text-white" : "text-black")}
                  aria-label={`${c} — copy`}
                >
                  <span className="font-mono text-sm font-semibold">{c}</span>
                  <span className="text-[11px] opacity-70">
                    {Math.round(h.h)}° {Math.round(h.s)}% {Math.round(h.l)}%
                  </span>
                </button>
              );
            })}
          </div>
        </Pane>
        <Pane title={t("cssVars")} actions={<CopyButton text={css} label={t("copyCss")} />}>
          <pre className="scrollbar-thin flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed text-fg">{css}</pre>
        </Pane>
      </div>
    </div>
  );
}
