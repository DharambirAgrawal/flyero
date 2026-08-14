/**
 * Depth as a continuous property, not a paint order.
 *
 * `zIndex` answers "what covers what" and nothing else, which is why posters
 * came out flat: every element sat on the same imaginary pane, at full
 * saturation and full contrast, and overlap was the only cue that anything was
 * in front. Real scenes give you four more cues at once, and the reason humans
 * apply them intuitively is that they all follow from one number.
 *
 * So elements carry a depth in 0..1 — 0 is the far wall, 1 is the lens — and
 * scale, haze, contrast and blur are all *derived* from it. That coupling is
 * the point. Per-element styling always breaks it: something gets blurred but
 * stays saturated, or shrinks but keeps its contrast, and the eye reads the
 * inconsistency as "pasted" without being able to say why.
 */

import { mix } from "../../creative/color.js";

/** Where an element sits between the far wall (0) and the lens (1). */
export type Depth = number;

/** The plane the composition is focused on. Things here are sharp. */
export const FOCAL_DEPTH = 0.62;

export type DepthEffects = {
  /** Multiplier on the element's natural size. */
  scale: number;
  /** Gaussian blur radius in px; 0 for anything near the focal plane. */
  blur: number;
  /** How far to mix the element's colours toward the atmosphere, 0..1. */
  haze: number;
  /** Multiplier on contrast — distance flattens tone. */
  contrast: number;
};

/**
 * The visual consequences of sitting at a given depth.
 *
 * `strength` scales the whole effect so a composition can be nearly flat
 * (editorial, deliberately graphic) or strongly dimensional, without any call
 * site having to reason about the individual cues.
 */
export function depthEffects(depth: Depth, strength = 1): DepthEffects {
  const d = Math.min(1, Math.max(0, depth));
  const distance = Math.abs(d - FOCAL_DEPTH);

  return {
    // Nearer is larger. Deliberately gentle: this is a poster, not a lens.
    scale: 1 + (d - FOCAL_DEPTH) * 0.22 * strength,
    /*
     * Blur grows either side of the focal plane, and foreground blur is the cue
     * that actually sells depth — a slightly soft object in front of a sharp
     * one is something a flat collage never produces by accident.
     */
    blur: distance < 0.12 ? 0 : (distance - 0.12) * 26 * strength,
    // Atmospheric perspective: far things drift toward the background.
    haze: Math.max(0, (FOCAL_DEPTH - d)) * 0.55 * strength,
    // Distance eats the blacks before it eats the whites.
    contrast: 1 - Math.max(0, FOCAL_DEPTH - d) * 0.4 * strength,
  };
}

/**
 * An element's colour once the atmosphere has had its way with it.
 *
 * Applied to *drawn* colour rather than photographs — a photo gets the same
 * treatment through a haze overlay, because recolouring its pixels would mean
 * decoding and re-encoding it on every render.
 */
export function hazed(colour: string, atmosphere: string, effects: DepthEffects): string {
  return effects.haze <= 0 ? colour : mix(colour, atmosphere, effects.haze);
}

/**
 * A sensible depth for a role, when nothing more specific is known.
 *
 * Grounds sit at the back, the subject occupies the focal plane, and type comes
 * forward — which is the arrangement that makes a headline feel like it is *in
 * front of* the picture rather than printed on the same sheet.
 */
export function depthForRole(role: string, bleeds: boolean): Depth {
  // A bleeding photograph is the poster, not the far wall. Putting it at 0.12
  // derived a ~6px Gaussian blur plus haze — which is why full-bleed travel
  // flyers came back as foggy stock wallpaper with type on top. The picture
  // that *is* the design sits on the focal plane so it stays sharp; type
  // still comes forward of it. Structure that bleeds (a frame, a ground
  // wash) is the one thing that belongs at the back.
  if (role === "structure") return bleeds ? 0.12 : 0.2;
  switch (role) {
    case "evidence":
      return FOCAL_DEPTH;
    case "message":
      return 0.82;
    case "cta":
      return 0.78;
    default:
      return 0.72;
  }
}
