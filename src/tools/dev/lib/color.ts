export interface RGB {
  r: number;
  g: number;
  b: number;
}
export interface HSL {
  h: number;
  s: number;
  l: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function hexToRgb(hex: string): RGB | null {
  const m = hex.trim().replace(/^#/, "");
  if (!/^([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(m)) return null;
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m.slice(0, 6);
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: RGB): string {
  return "#" + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("");
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const hn = (((h % 360) + 360) % 360) / 360, sn = clamp(s, 0, 100) / 100, ln = clamp(l, 0, 100) / 100;
  if (sn === 0) {
    const v = Math.round(ln * 255);
    return { r: v, g: v, b: v };
  }
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;
  const f = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return { r: Math.round(f(hn + 1 / 3) * 255), g: Math.round(f(hn) * 255), b: Math.round(f(hn - 1 / 3) * 255) };
}

/** Parses "#abc", "rgb(1,2,3)", "hsl(200 50% 40%)" or bare hex. */
export function parseColor(input: string): RGB | null {
  const s = input.trim().toLowerCase();
  const hex = hexToRgb(s);
  if (hex) return hex;
  const rgb = s.match(/^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)/);
  if (rgb) return { r: clamp(+rgb[1], 0, 255), g: clamp(+rgb[2], 0, 255), b: clamp(+rgb[3], 0, 255) };
  const hsl = s.match(/^hsla?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)%?\s*[, ]\s*([\d.]+)%?/);
  if (hsl) return hslToRgb({ h: +hsl[1], s: +hsl[2], l: +hsl[3] });
  return null;
}

export function formatRgb(c: RGB): string {
  return `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;
}
export function formatHsl(c: HSL): string {
  return `hsl(${Math.round(c.h)}, ${Math.round(c.s)}%, ${Math.round(c.l)}%)`;
}

/** Relative luminance per WCAG. */
export function luminance({ r, g, b }: RGB): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: RGB, b: RGB): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export type PaletteKind = "complementary" | "analogous" | "triadic" | "split" | "tetradic" | "shades" | "tints" | "monochrome";

export function generatePalette(base: RGB, kind: PaletteKind): RGB[] {
  const hsl = rgbToHsl(base);
  const rot = (deg: number) => hslToRgb({ ...hsl, h: hsl.h + deg });
  switch (kind) {
    case "complementary":
      return [base, rot(180)];
    case "analogous":
      return [rot(-60), rot(-30), base, rot(30), rot(60)];
    case "triadic":
      return [base, rot(120), rot(240)];
    case "split":
      return [base, rot(150), rot(210)];
    case "tetradic":
      return [base, rot(90), rot(180), rot(270)];
    case "shades":
      return [0, 1, 2, 3, 4, 5].map((i) => hslToRgb({ ...hsl, l: hsl.l * (1 - i / 6) }));
    case "tints":
      return [0, 1, 2, 3, 4, 5].map((i) => hslToRgb({ ...hsl, l: hsl.l + (100 - hsl.l) * (i / 6) }));
    case "monochrome":
      return [10, 25, 40, 55, 70, 85].map((l) => hslToRgb({ ...hsl, l }));
  }
}
