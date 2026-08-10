/**
 * The canvas tone field — what is actually on the page, queryable before
 * anything is drawn.
 *
 * See `docs/CANVAS-MODEL.md` for the reasoning. In short: every legibility bug
 * this project has hit came from components drawing blind, and being patched
 * one at a time where each surfaced. A component gets a box and a theme; it has
 * no way to ask what is underneath it, how bright that is, or whether it is
 * calm enough to carry type.
 *
 * This is a coarse grid — roughly 90px cells — painted in the same z-order the
 * renderer will use. It is an *estimate built from what the system already
 * knows*: fills it chose, and tone maps measured once at upload. It never
 * rasterises, because layout must not depend on the renderer — that would be
 * circular, slow, and fatal to byte-identical output.
 */

import { hexToRgb, relativeLuminance } from "../../creative/color.js";

export type Rect = { x: number; y: number; w: number; h: number };

export type ToneSample = {
  /** Mean relative luminance 0–1 of everything painted here. */
  luminance: number;
  /** Tonal spread. High means busy — a photograph, a treeline, a pattern. */
  variance: number;
  /** Representative fill, for contrast arithmetic. */
  fill: string;
};

export type QuietZone = Rect & {
  sample: ToneSample;
};

/**
 * The neutral whose relative luminance is `l`.
 *
 * A cell's `fill` and its `luminance` must describe the same thing. They did
 * not: `paintPhoto` stored the measured luminance but set `fill` to an
 * arbitrary tint, so ink chosen against the fill was chosen against a colour
 * that was never on the page — a photograph measuring 0.19 reported a fill of
 * white, and the muted ink came back as a mid grey that vanished on it. Worse,
 * the contrast gate printed a ratio derived from that same phantom fill, so its
 * message said 4.74:1 about something illegible.
 */
export function greyForLuminance(l: number): string {
  const t = Math.min(1, Math.max(0, l));
  const c = t <= 0.0031308 ? t * 12.92 : 1.055 * Math.pow(t, 1 / 2.4) - 0.055;
  const hex = Math.round(Math.min(255, Math.max(0, c * 255)))
    .toString(16)
    .padStart(2, "0");
  return `#${hex}${hex}${hex}`;
}

/** Above this spread, a region is treated as busy and fine type will not hold. */
export const BUSY_VARIANCE = 0.055;

/**
 * Even where the 8×8 tone map itself reads flat, a photograph has real
 * texture at full resolution that eight samples cannot see — a plain wall
 * still has grain, a clear sky still has gradient. Never claim zero.
 */
const PHOTO_VARIANCE_FLOOR = 0.02;

/**
 * Local busyness around one texel of an 8×8 tone map: the spread of its
 * (up to) 3×3 neighbourhood, not the whole photo's mean. A photo is bright
 * *here* and dark *there* by design (see `paintPhoto`'s own comment) — its
 * busyness is exactly as local as its luminance, so a single global number
 * for the whole image would flatten a photo that is calm sky above and
 * detailed foliage below into one verdict for both.
 */
function localToneVariance(toneMap: number[], u: number, v: number): number {
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let dv = -1; dv <= 1; dv++) {
    for (let du = -1; du <= 1; du++) {
      const uu = u + du;
      const vv = v + dv;
      if (uu < 0 || uu > 7 || vv < 0 || vv > 7) continue;
      const value = toneMap[vv * 8 + uu]!;
      sum += value;
      sumSq += value * value;
      count += 1;
    }
  }
  const mean = sum / count;
  return Math.max(PHOTO_VARIANCE_FLOOR, sumSq / count - mean * mean);
}

/** Target cell size in px. Fine enough to find a headline zone, cheap to build. */
const CELL = 90;

type Cell = { lum: number; varr: number; fill: string };

/**
 * Rebuilds a `ToneField` from a layout that has been through JSON.
 *
 * `LayoutResult.tone` is a class instance, and the job store persists layouts as
 * JSON — so on any path that reloads one (the review endpoint, the reviser) the
 * methods were gone and the first call threw
 * `layout.tone.legibleFor is not a function`. Rehydrating is the small fix;
 * the larger lesson is that anything on `LayoutResult` must survive a round
 * trip, because that type crosses a storage boundary.
 */
export function rehydrateTone(
  tone: unknown,
  canvas: { w: number; h: number },
  base: string,
): ToneField {
  if (tone instanceof ToneField) return tone;
  const field = new ToneField(canvas, base);
  const cells = (tone as { cells?: unknown })?.cells;
  if (Array.isArray(cells)) field.restore(cells as never);
  return field;
}

export class ToneField {
  readonly cols: number;
  readonly rows: number;
  private readonly cellW: number;
  private readonly cellH: number;
  private readonly cells: Cell[];

  constructor(
    private readonly canvas: { w: number; h: number },
    base: string,
  ) {
    this.cols = Math.max(1, Math.round(canvas.w / CELL));
    this.rows = Math.max(1, Math.round(canvas.h / CELL));
    this.cellW = canvas.w / this.cols;
    this.cellH = canvas.h / this.rows;
    const lum = relativeLuminance(base);
    this.cells = Array.from({ length: this.cols * this.rows }, () => ({
      lum,
      varr: 0,
      fill: base,
    }));
  }

  private indicesFor(rect: Rect): number[] {
    const c0 = Math.max(0, Math.floor(rect.x / this.cellW));
    const c1 = Math.min(this.cols - 1, Math.ceil((rect.x + rect.w) / this.cellW) - 1);
    const r0 = Math.max(0, Math.floor(rect.y / this.cellH));
    const r1 = Math.min(this.rows - 1, Math.ceil((rect.y + rect.h) / this.cellH) - 1);
    const out: number[] = [];
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) out.push(r * this.cols + c);
    }
    return out;
  }

  /**
   * Paints a flat fill over a rect. `alpha` lets a scrim or a wash contribute
   * partially rather than replacing what is beneath it.
   */
  paintFlat(rect: Rect, fill: string, alpha = 1): void {
    const lum = relativeLuminance(fill);
    for (const i of this.indicesFor(rect)) {
      const cell = this.cells[i]!;
      cell.lum = cell.lum * (1 - alpha) + lum * alpha;
      // A flat fill calms whatever was beneath it in proportion to its opacity.
      cell.varr *= 1 - alpha;
      if (alpha >= 0.5) cell.fill = fill;
    }
  }

  /**
   * Paints a photograph using its measured 8×8 tone map, so the field knows the
   * image is bright *here* and dark *there* rather than carrying a single mean.
   * That distinction is the whole point: a canopy averaging 0.45 has a band at
   * 0.72 where white type disappears.
   */
  paintPhoto(rect: Rect, toneMap: number[] | undefined, _tint?: string): void {
    if (!toneMap || toneMap.length !== 64) {
      // Unknown brightness: mid grey and maximally busy, so consumers treat it
      // as hostile to fine type. The safe answer, not an optimistic one.
      for (const i of this.indicesFor(rect)) {
        const cell = this.cells[i]!;
        cell.lum = 0.5;
        cell.varr = 1;
        cell.fill = greyForLuminance(0.5);
      }
      return;
    }
    const c0 = Math.max(0, Math.floor(rect.x / this.cellW));
    const r0 = Math.max(0, Math.floor(rect.y / this.cellH));
    for (const i of this.indicesFor(rect)) {
      const c = i % this.cols;
      const r = Math.floor(i / this.cols);
      // Map this cell's centre into the photo's own 8×8 grid.
      const u = Math.min(7, Math.max(0, Math.floor((((c - c0) * this.cellW) / Math.max(1, rect.w)) * 8)));
      const v = Math.min(7, Math.max(0, Math.floor((((r - r0) * this.cellH) / Math.max(1, rect.h)) * 8)));
      const cell = this.cells[i]!;
      cell.lum = toneMap[v * 8 + u]!;
      // Measured, not assumed: a flat-looking crop of a genuinely busy photo
      // now reads as calm, and a detailed region of an otherwise-plain photo
      // still reads as busy — see `localToneVariance`.
      cell.varr = localToneVariance(toneMap, u, v);
      // The fill must agree with the luminance, or every consumer that reasons
      // from colour reasons about a surface that is not there.
      cell.fill = greyForLuminance(cell.lum);
    }
  }

  /** What is under this rect? */
  sample(rect: Rect): ToneSample {
    const idx = this.indicesFor(rect);
    if (idx.length === 0) return { luminance: 0.5, variance: 1, fill: "#808080" };
    let sum = 0;
    let sumSq = 0;
    let busiest = 0;
    let varrSum = 0;
    const fills = new Map<string, number>();
    for (const i of idx) {
      const cell = this.cells[i]!;
      sum += cell.lum;
      sumSq += cell.lum * cell.lum;
      busiest = Math.max(busiest, cell.varr);
      varrSum += cell.varr;
      fills.set(cell.fill, (fills.get(cell.fill) ?? 0) + 1);
    }
    const mean = sum / idx.length;
    // Cross-cell luminance spread: this catches rects that straddle a tonal
    // seam (photo/ground boundary). However, the `legibleFor` busy check is
    // designed for *photographic texture* (fine type over leaves is unreadable
    // at any ratio), not for tonal seams — seams are a contrast problem the
    // ratio check below already handles. Weighting spread by mean cell `varr`
    // ensures that only photographic texture (high per-cell variance) drives
    // the busy verdict; two adjacent flat zones produce spread but near-zero
    // cell variance, so they no longer falsely trigger the photo-texture path.
    const meanVarr = varrSum / idx.length;
    const spread = Math.max(0, sumSq / idx.length - mean * mean);
    const fill = [...fills.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    return { luminance: mean, variance: Math.max(spread * (meanVarr / PHOTO_VARIANCE_FLOOR), busiest * 0.12), fill };
  }

  /**
   * Finds calm regions large enough to hold a requested box.
   *
   * Candidates are aligned to the field grid and sorted deterministically by
   * busyness, then by available black/white contrast. The caller still owns
   * composition constraints and collision checks; this method answers only
   * "where can these words physically read?"
   */
  quietZones(size: { w: number; h: number }, bounds?: Rect, limit = 8): QuietZone[] {
    const area = bounds ?? { x: 0, y: 0, w: this.canvas.w, h: this.canvas.h };
    if (size.w <= 0 || size.h <= 0 || size.w > area.w || size.h > area.h) return [];

    const maxX = area.x + area.w - size.w;
    const maxY = area.y + area.h - size.h;
    const xs = new Set<number>([area.x, maxX]);
    const ys = new Set<number>([area.y, maxY]);
    for (let x = area.x; x <= maxX; x += this.cellW) xs.add(Math.min(maxX, x));
    for (let y = area.y; y <= maxY; y += this.cellH) ys.add(Math.min(maxY, y));

    const zones: QuietZone[] = [];
    for (const y of ys) {
      for (const x of xs) {
        const rect = { x, y, w: size.w, h: size.h };
        zones.push({ ...rect, sample: this.sample(rect) });
      }
    }

    return zones
      .sort((a, b) => {
        const variance = a.sample.variance - b.sample.variance;
        if (Math.abs(variance) > 1e-9) return variance;
        const contrastPotential = (sample: ToneSample) =>
          Math.max(1.05 / (sample.luminance + 0.05), (sample.luminance + 0.05) / 0.05);
        const contrast = contrastPotential(b.sample) - contrastPotential(a.sample);
        if (Math.abs(contrast) > 1e-9) return contrast;
        return a.y - b.y || a.x - b.x;
      })
      .slice(0, Math.max(0, limit));
  }

  /**
   * Ink that will actually read on this rect: white or near-black, whichever
   * clears the measured tone by more. Deliberately not the brand foreground —
   * over a photograph or a saturated field, brand ink is exactly what fails.
   */
  inkOver(rect: Rect, light = "#ffffff", dark = "#111111"): string {
    const { luminance } = this.sample(rect);
    const toLight = Math.abs(relativeLuminance(light) - luminance);
    const toDark = Math.abs(relativeLuminance(dark) - luminance);
    return toLight >= toDark ? light : dark;
  }

  /**
   * Whether type of this size can hold here without help. Busy regions fail
   * regardless of contrast ratio: fine type over leaves is unreadable even at
   * 21:1, which is precisely what a numeric contrast check cannot see.
   */
  legibleFor(rect: Rect, ink: string, large: boolean): boolean {
    const { luminance, variance } = this.sample(rect);
    if (variance > BUSY_VARIANCE && !large) return false;
    const inkLum = relativeLuminance(ink);
    const hi = Math.max(inkLum, luminance) + 0.05;
    const lo = Math.min(inkLum, luminance) + 0.05;
    return hi / lo >= (large ? 3 : 4.5);
  }

  /** Reinstates persisted cells — see `rehydrateTone`. */
  restore(cells: Cell[]): void {
    if (cells.length !== this.cells.length) return;
    for (let i = 0; i < cells.length; i++) this.cells[i] = { ...cells[i]! };
  }

  /** Coarse debug view, one character per cell. Used by tests and scripts. */
  describe(): string {
    const ramp = " .:-=+*#%@";
    const lines: string[] = [];
    for (let r = 0; r < this.rows; r++) {
      let line = "";
      for (let c = 0; c < this.cols; c++) {
        const cell = this.cells[r * this.cols + c]!;
        line += ramp[Math.min(ramp.length - 1, Math.floor(cell.lum * ramp.length))];
      }
      lines.push(line);
    }
    return lines.join("\n");
  }
}

/** Mixes toward a target by `t`, used when a scrim contributes to the field. */
export function tintedLuminance(fill: string, over: string, alpha: number): number {
  const a = hexToRgb(fill);
  const b = hexToRgb(over);
  const mixHex = `#${[a.r, a.g, a.b]
    .map((ch, i) => {
      const other = [b.r, b.g, b.b][i]!;
      return Math.round(ch * (1 - alpha) + other * alpha)
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}`;
  return relativeLuminance(mixHex);
}
