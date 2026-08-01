/**
 * The clutter budget.
 *
 * Engine-generated ornament is invisible to Gate G3 (which counts
 * `spec.elements`) and to the banned-list's `meaningless-structure` signal
 * (which looks for `role: "structure"` elements). Nothing downstream will stop
 * a graphic language from covering the page in sparkles. **These constants are
 * the entire safety net**, which is why they live in one file with names, and
 * why each one has a test.
 *
 * The product's whole claim is that it refuses to ship bad work. Restraint has
 * to be enforced by code, not by taste.
 */

import type { DecorForm } from "./types.js";
import type { Density } from "../../creative/artdirections.js";

export const DECOR_BUDGET = {
  /** Hard ceiling on ornament instances, whatever a language asks for. */
  MAX_ITEMS: 6,
  /** Distinct forms allowed. Three forms is a mood board, not a design. */
  MAX_FORMS: 2,
  /** Ornament ink as a fraction of the canvas. The ground is exempt. */
  MAX_INK_COVERAGE: 0.14,
  /** Marks allowed above the content. Everything else is forced underneath. */
  MAX_OVER_ITEMS: 2,
  /** Fixed attempt budget per slot, so placement can never loop unbounded. */
  ATTEMPTS_PER_SLOT: 24,
  /** Keep-out inflation around a text box, in px. */
  PAD_TEXT: 28,
  /** Keep-out inflation around the evidence element. */
  PAD_EVIDENCE: 24,
  /** Keep-out inflation around everything else. */
  PAD_NON_TEXT: 16,
} as const;

/**
 * Density is an art-direction decision, not a random ornament multiplier.
 * Rich systems may spend the global allowance; quiet systems are mechanically
 * stopped well before it.
 */
export function decorBudgetFor(density: Density): {
  maxItems: number;
  maxForms: number;
  maxInkCoverage: number;
  maxOverItems: number;
} {
  if (density === "quiet") {
    return { maxItems: 3, maxForms: 1, maxInkCoverage: 0.07, maxOverItems: 1 };
  }
  if (density === "balanced") {
    return { maxItems: 5, maxForms: 2, maxInkCoverage: 0.11, maxOverItems: 1 };
  }
  return {
    maxItems: DECOR_BUDGET.MAX_ITEMS,
    maxForms: DECOR_BUDGET.MAX_FORMS,
    maxInkCoverage: DECOR_BUDGET.MAX_INK_COVERAGE,
    maxOverItems: DECOR_BUDGET.MAX_OVER_ITEMS,
  };
}

/**
 * Forms permitted above the content. A halftone field or a filled blob over a
 * headline is not a design decision, so the rest are structurally forced under
 * the composition rather than left to the placement logic to get right.
 */
export const OVER_ALLOWED: ReadonlySet<DecorForm> = new Set<DecorForm>([
  "sparkle",
  "dashed-route",
  "torn-edge",
  "motif",
  "squiggle",
  "tape",
  "badge",
]);

/**
 * How many *loud* moves one flyer may make in total.
 *
 * Gate G5 already insists on exactly one signature gesture, but it counts only
 * the gesture. Nothing stopped a flyer taking a gesture, a saturated split
 * ground, an arched headline and two solid ornaments — four competing bids for
 * attention, each individually defensible.
 *
 * This is the "spend your boldness in one place" rule, made mechanical: the
 * ground, the gesture and the type treatment are counted first because they are
 * decided before ornament, and whatever budget survives is what ornament may
 * spend. Ornament yields because it is the least meaningful of the four.
 */
export const MAX_BOLD_MOVES = 3;

/** Bold moves already committed before ornament is planned. */
export function boldnessSpent(input: {
  /** A ground that is anything other than a flat wash. */
  groundIsLoud: boolean;
  /** The signature gesture actually applied by the solver. */
  gestureApplied: boolean;
  /** A headline drawn as anything other than plain type. */
  treatmentIsLoud: boolean;
}): number {
  return (
    (input.groundIsLoud ? 1 : 0) +
    (input.gestureApplied ? 1 : 0) +
    (input.treatmentIsLoud ? 1 : 0)
  );
}

/**
 * Rough ink-to-bounding-box ratio per form, used to estimate coverage without
 * rasterising. Deliberately generous: over-estimating ink makes the cap bite
 * sooner, which is the safe direction to be wrong in.
 */
export const INK_FACTOR: Record<DecorForm, number> = {
  blob: 0.78,
  "stripe-field": 0.5,
  "checker-field": 0.5,
  "halftone-field": 0.2,
  "grid-field": 0.12,
  squiggle: 0.12,
  sparkle: 0.3,
  burst: 0.65,
  "dashed-route": 0.08,
  "arc-bands": 0.35,
  "torn-edge": 0.9,
  ribbon: 0.85,
  polygon: 0.7,
  motif: 0.45,
  tape: 0.9,
  badge: 0.55,
};
