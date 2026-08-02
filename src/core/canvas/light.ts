/**
 * One light for the whole poster.
 *
 * Every element used to invent its own shadow or have none: `Panel` offset a
 * black rect by a hardcoded (3, 6), `polaroid-stack` used (3, 6) too, the
 * headline plate had no shadow at all, and photo scrims darkened from whichever
 * edge happened to carry text. Nothing agreed with anything else.
 *
 * That disagreement is *the* reason composited elements read as pasted on
 * rather than sitting in a scene. A real photograph has one sun; a real poster
 * has one imagined one. When every shadow falls the same way at the same
 * softness, unrelated objects start to look like they share a world — and that
 * costs nothing but consistency.
 *
 * Declared once per flyer, derived from the seed so it stays deterministic, and
 * every drop shadow, contact shadow and offset in the system is computed from
 * it rather than chosen locally.
 */

import { mix, withAlpha } from "../../creative/color.js";
import type { Rng } from "../../lib/rng.js";

export type LightSource = {
  /** Degrees clockwise from due north; where the light comes *from*. */
  azimuth: number;
  /** Degrees above the horizon. High is midday and flat; low is long shadows. */
  elevation: number;
  /** 0 = a hard point light, 1 = a fully overcast sky. */
  softness: number;
  /** The colour shadows tend toward — never pure black, which reads as a hole. */
  tint: string;
};

/**
 * The light for a flyer.
 *
 * Kept in a narrow band on purpose. A light from below or from straight ahead
 * is dramatic and almost always wrong on a poster; every convincing one is lit
 * from somewhere above and slightly to one side, which is also how a reader's
 * own room is lit.
 */
export function planLight(rng: Pick<Rng, "range" | "bool">, groundInk: string): LightSource {
  return {
    // Upper-left or upper-right. Overhead-and-a-bit, like a window.
    azimuth: rng.bool() ? rng.range(300, 340) : rng.range(20, 60),
    elevation: rng.range(48, 68),
    softness: rng.range(0.3, 0.65),
    // Shadows take a little of the page's own colour, so they sit *in* the
    // image rather than punching a black hole through it.
    tint: mix(groundInk, "#000000", 0.75),
  };
}

export type ShadowSpec = {
  /** Horizontal offset in px. */
  dx: number;
  /** Vertical offset in px. */
  dy: number;
  /** Gaussian blur radius; 0 means a hard edge. */
  blur: number;
  /** Ready-to-use rgba fill. */
  fill: string;
};

/**
 * The shadow an element of a given size casts under this light.
 *
 * `lift` is how far the element sits off the page — a tucked-in panel barely
 * lifts, a tilted polaroid lifts a lot. Offset and blur both scale with it,
 * which is what separates "resting on" from "floating above": a shadow that is
 * far away *and* sharp is the classic tell of a fake one.
 */
export function shadowFor(light: LightSource, size: number, lift = 1): ShadowSpec {
  const rad = ((light.azimuth - 90) * Math.PI) / 180;
  // A low sun throws long shadows; a high one throws almost none.
  const reach = size * 0.035 * lift * (1 - light.elevation / 90) * 2.4;
  const blur = Math.max(1, size * 0.02 * lift * (0.4 + light.softness));
  // Softer and further means fainter — the same amount of darkness spread wider.
  const opacity = Math.max(0.06, 0.3 * (1 - light.softness * 0.55) * Math.min(1, lift));
  return {
    dx: Math.round(-Math.cos(rad) * reach * 100) / 100,
    dy: Math.round(Math.sin(rad) * reach * 100) / 100,
    blur: Math.round(blur * 100) / 100,
    fill: withAlpha(light.tint, Math.round(opacity * 100) / 100),
  };
}

/**
 * Contact shadow: the dark seam directly beneath something resting on a
 * surface. Tighter and darker than the cast shadow, and it is what actually
 * makes an object look like it is *touching* the page rather than hovering.
 */
export function contactShadowFor(light: LightSource, size: number): ShadowSpec {
  return {
    dx: 0,
    dy: Math.round(size * 0.006 * 100) / 100,
    blur: Math.round(size * 0.008 * 100) / 100,
    fill: withAlpha(light.tint, 0.22),
  };
}
