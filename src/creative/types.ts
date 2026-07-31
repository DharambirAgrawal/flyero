/**
 * The seven creative dimensions. Every value in every dimension is hand-curated and
 * individually professional — that is what makes structured sampling beat
 * temperature noise (REQUIREMENTS.md DR-3).
 */
import type { Risk } from "../config.js";

export type MetaphorId =
  | "transformation"
  | "signal-from-noise"
  | "before-after-fold"
  | "annotation-editorial"
  | "cartography"
  | "magnification"
  | "assembly-compile"
  | "conversation"
  | "constellation"
  | "lens"
  | "threshold-door"
  | "growth";

export type TopologyId =
  | "diagonal-progression"
  | "split-editorial"
  | "radial-field"
  | "oversized-anchor"
  | "layered-depth-stack"
  | "zigzag-path"
  | "off-center-hero"
  | "framed-evidence"
  | "vertical-narrative"
  | "asymmetric-two-column";

export type TypographyId =
  | "compressed-monumental"
  | "editorial-annotated"
  | "woven-through-image"
  | "technical-mono-accents"
  | "quiet-with-one-loud-word"
  | "stacked-contrast"
  | "masked-by-subject"
  | "baseline-broken";

export type MaterialId =
  | "technical-paper"
  | "optical-diagnostic"
  | "printed-halftone"
  | "soft-industrial"
  | "ink-on-cream"
  | "chromatic-glass";

/**
 * The visual vocabulary a flyer is drawn out of — see `graphics.ts`. Added as a
 * seventh dimension because the other six could all vary while the page stayed
 * a plain rectangle of type: nothing decided what the flyer was *made of*.
 */
export type GraphicsId =
  | "editorial-restraint"
  | "swiss-grid"
  | "organic-blobs"
  | "retro-stripes"
  | "halftone-pop"
  | "paper-collage"
  | "dashed-cartography"
  | "botanical-frame"
  | "sticker-sheet"
  | "geometric-memphis";

export type ColorLogicId =
  | "single-accent-on-action"
  | "duotone-evidence"
  | "warm-neutral-cool-accent"
  | "inverted-dark-field"
  | "paper-and-ink"
  | "two-accent-before-after"
  | "monochrome-with-signal"
  | "tinted-ground"
  | "saturated-field"
  | "colour-block-duo";

export type GestureId =
  | "element-escapes-canvas"
  | "path-becomes-cta-underline"
  | "headline-behind-subject"
  | "one-rotated-element"
  | "intentional-crop-of-hero"
  | "oversized-letterform-as-structure"
  | "annotation-breaks-margin"
  | "hero-overlaps-eyebrow"
  | "rule-line-pierces-block"
  | "number-bleeds-off-edge";

export type ReadingPath =
  | "left-to-right"
  | "top-to-bottom"
  | "diagonal"
  | "zigzag"
  | "radial"
  | "center-out"
  | "edge-in";

/**
 * Shared shape for a dimension value. `adventurousness` gates which values a
 * given `risk` level may sample: safe <= 1, studio <= 2, experimental <= 3.
 */
export type DimensionValue<Id extends string> = {
  id: Id;
  /** One line the Idea Engine and Composer are prompted with. */
  brief: string;
  adventurousness: 1 | 2 | 3;
};

export function allowedFor<Id extends string>(
  values: readonly DimensionValue<Id>[],
  risk: Risk,
): DimensionValue<Id>[] {
  const ceiling = risk === "safe" ? 1 : risk === "studio" ? 2 : 3;
  return values.filter((v) => v.adventurousness <= ceiling);
}
