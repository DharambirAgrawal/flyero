/**
 * Font loading and exact text measurement.
 *
 * The layout solver must know real glyph advances before it commits to a font
 * size, otherwise "no overflow" is a hope rather than a guarantee. fontkit reads
 * the same TTF binaries resvg rasterises with, so measurement and render agree.
 */
import { openSync } from "fontkit";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "../../config.js";

type Face = {
  family: string;
  weight: number;
  path: string;
  font: any;
  /**
   * Some shipped faces (IBM Plex Mono among them) carry a glyf record for the
   * space glyph that fontkit's outline reader runs off the end of, so both
   * `layout()` and `advanceWidth` throw. The horizontal-metrics table is intact
   * and is what a rasteriser uses anyway, so we fall back to it per face rather
   * than dropping the font. Probed once at load, not per call.
   */
  useHmtx: boolean;
};

let faces: Face[] | null = null;

/**
 * A few faces (e.g. IBM Plex Mono Medium) ship no typographic-family name, so
 * their family reads as "IBM Plex Mono Medium". Weight comes from the filename,
 * which we control, so trimming the style word is safe and keeps one family per
 * typeface — which is how both fontkit lookup and resvg matching expect to work.
 */
const STYLE_WORDS = [
  "Thin",
  "ExtraLight",
  "Light",
  "Regular",
  "Medium",
  "SemiBold",
  "Bold",
  "ExtraBold",
  "Black",
];

function normalizeFamily(name: string): string {
  const parts = name.trim().split(" ");
  while (parts.length > 1 && STYLE_WORDS.includes(parts[parts.length - 1]!)) {
    parts.pop();
  }
  return parts.join(" ");
}

function loadFaces(): Face[] {
  if (faces) return faces;
  if (!existsSync(config.fontsDir)) {
    throw new Error(
      `FONTS_DIR ${config.fontsDir} does not exist. Run \`npm run fonts\` to install the curated set.`,
    );
  }
  const files = readdirSync(config.fontsDir).filter((f) => f.endsWith(".ttf"));
  if (files.length === 0) {
    throw new Error(`No .ttf files in ${config.fontsDir}. Run \`npm run fonts\`.`);
  }
  faces = files.map((file) => {
    const path = join(config.fontsDir, file);
    const font = openSync(path) as any;
    const [, rawWeight] = file.replace(/\.ttf$/, "").split("-");
    let useHmtx = false;
    try {
      font.layout("Ag 0");
    } catch {
      useHmtx = true;
    }
    return {
      // Weight-specific faces report familyName like "Inter Black". The typographic
      // family (name ID 16) is the one font matchers key on, so prefer it.
      family: normalizeFamily(font.name?.records?.preferredFamily?.en ?? font.familyName ?? ""),
      weight: Number(rawWeight ?? 400),
      path,
      font,
      useHmtx,
    };
  });
  return faces;
}

export function fontFiles(): string[] {
  return loadFaces().map((f) => f.path);
}

export function availableFamilies(): string[] {
  return Array.from(new Set(loadFaces().map((f) => f.family))).sort();
}

/** Nearest available weight for a family, preferring heavier on ties. */
function resolveFace(family: string, weight: number): Face {
  const all = loadFaces();
  const inFamily = all.filter((f) => f.family === family);
  const pool = inFamily.length > 0 ? inFamily : all.filter((f) => f.family === "Inter");
  if (pool.length === 0) throw new Error(`No font face available for ${family}`);
  let best = pool[0]!;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const face of pool) {
    const delta = Math.abs(face.weight - weight);
    if (delta < bestDelta || (delta === bestDelta && face.weight > best.weight)) {
      best = face;
      bestDelta = delta;
    }
  }
  return best;
}

export type TextStyle = {
  family: string;
  weight: number;
  size: number;
  /** em-relative letter spacing, e.g. -0.03 */
  tracking?: number;
  lineHeight?: number;
};

export type Metrics = {
  /** Distance from the top of a line box to the alphabetic baseline. */
  ascent: number;
  descent: number;
  lineGap: number;
  capHeight: number;
  xHeight: number;
};

export function metricsFor(style: TextStyle): Metrics {
  const face = resolveFace(style.family, style.weight);
  const { font } = face;
  const scale = style.size / font.unitsPerEm;
  return {
    ascent: font.ascent * scale,
    descent: Math.abs(font.descent) * scale,
    lineGap: (font.lineGap ?? 0) * scale,
    capHeight: (font.capHeight ?? font.ascent * 0.7) * scale,
    xHeight: (font.xHeight ?? font.ascent * 0.5) * scale,
  };
}

/** Advance width in font units, summed from the horizontal-metrics table. */
function hmtxAdvance(font: any, text: string): number {
  let total = 0;
  for (const char of text) {
    const codePoint = char.codePointAt(0)!;
    let gid = 0;
    try {
      gid = font.glyphForCodePoint(codePoint).id;
    } catch {
      gid = 0;
    }
    total += font.hmtx.metrics.get(gid)?.advance ?? 0;
  }
  return total;
}

/** Exact advance width of a string at a given style, including tracking. */
export function measureText(text: string, style: TextStyle): number {
  if (text.length === 0) return 0;
  const face = resolveFace(style.family, style.weight);
  const { font } = face;

  let units: number;
  if (face.useHmtx) {
    units = hmtxAdvance(font, text);
  } else {
    try {
      units = font.layout(text).advanceWidth;
    } catch {
      // A face that normally shapes fine can still trip on one glyph.
      units = hmtxAdvance(font, text);
    }
  }

  const base = (units / font.unitsPerEm) * style.size;
  const tracking = (style.tracking ?? 0) * style.size * Math.max(0, text.length - 1);
  return base + tracking;
}

/** Greedy word wrap on exact advances. Words longer than maxWidth are hard-split. */
export function wrapText(text: string, style: TextStyle, maxWidth: number): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) return [];
  const lines: string[] = [];
  let current = "";

  const pushCurrent = () => {
    if (current.length > 0) {
      lines.push(current);
      current = "";
    }
  };

  for (const word of normalized.split(" ")) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (measureText(candidate, style) <= maxWidth) {
      current = candidate;
      continue;
    }
    pushCurrent();
    if (measureText(word, style) <= maxWidth) {
      current = word;
      continue;
    }
    // A single word wider than the column: split it by character.
    let chunk = "";
    for (const char of word) {
      if (measureText(chunk + char, style) > maxWidth && chunk.length > 0) {
        lines.push(chunk);
        chunk = char;
      } else {
        chunk += char;
      }
    }
    current = chunk;
  }
  pushCurrent();
  return lines;
}

export type FitResult = {
  size: number;
  lines: string[];
  width: number;
  height: number;
};

/**
 * Largest size in [min, max] at which `text` wraps into at most `maxLines` and
 * fits the box. This is the core of "the LLM never places pixels": the composer
 * asks for a headline, the solver decides how big it can be.
 */
export function fitText(
  text: string,
  style: Omit<TextStyle, "size">,
  box: { w: number; h: number },
  opts: { min: number; max: number; maxLines: number; lineHeight?: number },
): FitResult {
  const lineHeight = opts.lineHeight ?? style.lineHeight ?? 1.05;

  /**
   * Real ink extent, not lines × leading. With tight leading (compressed display
   * type runs at ~0.92) the naive product is smaller than the glyphs actually
   * occupy, and every consumer of this height would under-reserve space.
   */
  const inkHeight = (lineCount: number, size: number): number => {
    const { ascent, descent } = metricsFor({ ...style, size, lineHeight });
    return (lineCount - 1) * size * lineHeight + ascent + descent;
  };

  const words = text.replace(/\s+/g, " ").trim().split(" ");
  let best: FitResult | null = null;

  // Integer search downward keeps results stable across platforms.
  for (let size = Math.floor(opts.max); size >= Math.floor(opts.min); size--) {
    const styled: TextStyle = { ...style, size, lineHeight };
    // A size that forces a word to be broken mid-character is not a fit — it
    // reads as a rendering fault, not as typography. Come down until whole
    // words survive.
    const widestWord = Math.max(...words.map((w) => measureText(w, styled)));
    if (widestWord > box.w) continue;
    const lines = wrapText(text, styled, box.w);
    if (lines.length === 0) break;
    if (lines.length > opts.maxLines) continue;
    const height = inkHeight(lines.length, size);
    if (height > box.h) continue;
    const width = Math.max(...lines.map((l) => measureText(l, styled)));
    if (width > box.w) continue;
    best = { size, lines, width, height };
    break;
  }

  if (best) return best;

  // Nothing fit: use the minimum size and report honestly so the rule critic
  // can flag overflow rather than the renderer silently clipping.
  const styled: TextStyle = { ...style, size: opts.min, lineHeight };
  const lines = wrapText(text, styled, box.w);
  return {
    size: opts.min,
    lines,
    width: lines.length > 0 ? Math.max(...lines.map((l) => measureText(l, styled))) : 0,
    height: lines.length > 0 ? inkHeight(lines.length, opts.min) : 0,
  };
}

/** Test seam: forget cached faces (used after changing FONTS_DIR in tests). */
export function resetFontCache(): void {
  faces = null;
}
