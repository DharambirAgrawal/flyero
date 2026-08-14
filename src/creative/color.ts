/**
 * Colour maths. Pure, deterministic, no dependencies — used by the colour-logic
 * generators, the contrast rule critic and the banned-list detector.
 */

export type Rgb = { r: number; g: number; b: number };
export type Hsl = { h: number; s: number; l: number };

export function hexToRgb(hex: string): Rgb {
  const clean = hex.replace("#", "").trim();
  const rgb =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean.length >= 6
        ? clean.slice(0, 6)
        : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(rgb)) throw new Error(`Invalid hex colour ${JSON.stringify(hex)}`);
  return {
    r: parseInt(rgb.slice(0, 2), 16),
    g: parseInt(rgb.slice(2, 4), 16),
    b: parseInt(rgb.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const to = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h: h * 360, s, l };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const hn = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number): number => {
    let tn = t;
    if (tn < 0) tn += 1;
    if (tn > 1) tn -= 1;
    if (tn < 1 / 6) return p + (q - p) * 6 * tn;
    if (tn < 1 / 2) return q;
    if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6;
    return p;
  };
  return {
    r: channel(hn + 1 / 3) * 255,
    g: channel(hn) * 255,
    b: channel(hn - 1 / 3) * 255,
  };
}

export function hsl(h: number, s: number, l: number): string {
  return rgbToHex(hslToRgb({ h, s, l }));
}

export function toHsl(hex: string): Hsl {
  return rgbToHsl(hexToRgb(hex));
}

function channelLuminance(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/** WCAG 2.1 contrast ratio, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG-AA: 4.5 for body text, 3.0 for large text (>=24px bold / >=30px regular). */
export function meetsAA(fg: string, bg: string, large = false): boolean {
  return contrastRatio(fg, bg) >= (large ? 3 : 4.5);
}

/**
 * Nudges `fg` lighter or darker (away from `bg`) until it clears AA. Used by the
 * layout solver so contrast is guaranteed by construction rather than critiqued
 * after the fact.
 */
export function ensureContrast(fg: string, bg: string, large = false): string {
  if (meetsAA(fg, bg, large)) return fg;
  const target = large ? 3 : 4.5;
  const base = toHsl(fg);
  const bgLum = relativeLuminance(bg);

  // Try the promising direction first, then the other one. Searching only one
  // direction fails against mid-tone grounds, where neither pure white nor pure
  // black is reachable by going the "obvious" way.
  const directions = bgLum < 0.5 ? [1, -1] : [-1, 1];
  for (const direction of directions) {
    for (let step = 1; step <= 20; step++) {
      const l = Math.max(0, Math.min(1, base.l + direction * step * 0.05));
      const candidate = hsl(base.h, base.s, l);
      if (contrastRatio(candidate, bg) >= target) return candidate;
    }
  }

  // Mid-tone grounds can be out of reach at this hue and saturation; fall back
  // to whichever extreme actually reads.
  return contrastRatio("#ffffff", bg) >= contrastRatio("#000000", bg) ? "#ffffff" : "#000000";
}

export function mix(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex({
    r: ca.r + (cb.r - ca.r) * t,
    g: ca.g + (cb.g - ca.g) * t,
    b: ca.b + (cb.b - ca.b) * t,
  });
}

export function withAlpha(hex: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  const v = Math.round(a * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${v}`;
}

/** Hue families used by the banned-list detector and DR-1's colour-family check. */
export type HueFamily =
  | "neutral"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "cyan"
  | "blue"
  | "purple"
  | "magenta";

export function hueFamily(hex: string): HueFamily {
  const { h, s, l } = toHsl(hex);
  if (s < 0.15 || l < 0.06 || l > 0.94) return "neutral";
  if (h < 15 || h >= 345) return "red";
  if (h < 45) return "orange";
  if (h < 70) return "yellow";
  if (h < 160) return "green";
  if (h < 200) return "cyan";
  if (h < 255) return "blue";
  if (h < 300) return "purple";
  return "magenta";
}
