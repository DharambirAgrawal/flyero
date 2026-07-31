/**
 * Choosing ornament colour, and working out what colour a box actually sits on.
 *
 * The contrast machinery in `gates/` compares type against
 * `spec.brand.colors.bg` — the *flat* background. Once a ground can be a
 * gradient or a diagonal split, `bg` may be painted over across most of the
 * canvas, and the gate would happily pass a flyer whose CTA is unreadable.
 * `effectiveGroundUnder` is what closes that hole.
 */

import { ensureContrast, mix, relativeLuminance, withAlpha } from "../../creative/color.js";
import type { Theme } from "../../components/types.js";
import type { DecorWeight, GroundPlan, Rect } from "./types.js";

/** A fill is treated as dark when light type would read better on it. */
export const DARK_THRESHOLD = 0.45;

export function isDarkFill(hex: string): boolean {
  return relativeLuminance(hex) < DARK_THRESHOLD;
}

export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return w * h;
}

/**
 * The colour a box is really sitting on: the darkest ground region covering at
 * least 30% of it, falling back to the base wash. Bboxes are used rather than
 * true paths because ground planning already refuses to run a seam through a
 * text box, so the approximation cannot drift far.
 */
export function effectiveGroundUnder(ground: GroundPlan, box: Rect): string {
  const area = Math.max(1, box.w * box.h);
  let worst = ground.base;
  let worstLum = relativeLuminance(ground.base);

  for (const region of ground.regions) {
    if (overlapArea(box, region.bbox) / area < 0.3) continue;
    const lum = relativeLuminance(region.fill);
    // "Worst" means furthest from the base in luminance — that is the fill most
    // likely to break the contrast assumption the ink was chosen under.
    if (Math.abs(lum - 0.5) > Math.abs(worstLum - 0.5)) {
      worst = region.fill;
      worstLum = lum;
    }
  }
  return worst;
}

/** Hue ornament draws from, given what it is sitting on. */
function pickDecorHue(theme: Theme, ground: string): string {
  const { accent, fg } = theme.palette;
  // On a dark ground the accent usually still reads; on a light one, prefer the
  // accent and fall back to the text colour when the accent is too pale.
  if (isDarkFill(ground)) return relativeLuminance(accent) > 0.35 ? accent : mix(accent, "#ffffff", 0.4);
  return relativeLuminance(accent) < 0.7 ? accent : fg;
}

/**
 * Ornament ink. `wash` and `tint` are alpha'd down far enough to sit under type
 * without touching legibility; `solid` is held to the AA-large threshold even
 * though it is decoration, because a shape that fails contrast against its own
 * ground just looks like a rendering fault.
 */
export function decorInk(theme: Theme, ground: string, weight: DecorWeight): string {
  const base = pickDecorHue(theme, ground);
  // These were originally 0.06/0.16, which rendered as almost nothing on a
  // saturated ground — the layer worked and the flyers looked unchanged.
  // A wash still has to be faint enough to sit under type; a tint is meant to
  // read as a deliberate block of colour.
  if (weight === "wash") return withAlpha(base, 0.12);
  if (weight === "tint") return withAlpha(base, 0.38);
  return ensureContrast(base, ground, true);
}
