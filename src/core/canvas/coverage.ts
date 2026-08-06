/**
 * The coverage floor — GAP-ANALYSIS.md's own first-priority item: "measure
 * ink/object coverage of the canvas; make it a mechanical check with a real
 * threshold. Nothing else can be judged without it."
 *
 * `decor/budget.ts` already caps decoration ink from above (`MAX_INK_COVERAGE`)
 * so a graphic language cannot bury the composition in ornament. Nothing
 * capped it from below: a headline, a CTA pill and two small motifs on an
 * otherwise flat page pass every existing gate — G3's 4-7 element count, the
 * contrast checks, the banned list — while reading as visibly unfinished.
 *
 * A coarse grid, same idea as `ToneField`: a cell counts as covered if any
 * element box or decoration bbox touches it. Grid membership rather than a
 * sum of areas, so overlapping boxes are not double-counted — a full-bleed
 * photo with three text boxes on top of it should read as "the canvas is
 * full", not 400% covered.
 */

import type { Rect } from "./tone.js";
import type { DesignSpec } from "../compose/spec.js";
import type { LayoutResult } from "../layout/solver.js";

/** Finer than ToneField's 90px — coverage is an area measurement, not a legibility estimate. */
const CELL = 60;

/**
 * Below this fraction of the canvas actually carrying an element or a
 * decoration, a flyer reads as empty regardless of what technically passed.
 *
 * Calibrated against 40 fixture-sampled designers across 5 seeds (`npm test`
 * covers the regression): the lowest normal sample measured 0.386
 * (`split-editorial` / `swiss-grid`, deliberately restrained). A minimal
 * headline+CTA+brand repro — the shape of a real regression this gate exists
 * to catch — measured 0.21-0.27. 0.32 sits with margin on both sides.
 */
export const MIN_COVERAGE = 0.32;

export function measureCoverage(spec: DesignSpec, layout: LayoutResult): number {
  const { w, h } = spec.canvas;
  const cols = Math.max(1, Math.round(w / CELL));
  const rows = Math.max(1, Math.round(h / CELL));
  const cellW = w / cols;
  const cellH = h / rows;
  const covered = new Uint8Array(cols * rows);

  const mark = (rect: Rect): void => {
    const c0 = Math.max(0, Math.floor(rect.x / cellW));
    const c1 = Math.min(cols - 1, Math.ceil((rect.x + rect.w) / cellW) - 1);
    const r0 = Math.max(0, Math.floor(rect.y / cellH));
    const r1 = Math.min(rows - 1, Math.ceil((rect.y + rect.h) / cellH) - 1);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) covered[r * cols + c] = 1;
    }
  };

  for (const el of spec.elements) {
    const box = layout.boxes[el.id];
    if (box) mark(box);
  }
  for (const decoration of layout.decorations) {
    mark(decoration.bbox);
  }

  let count = 0;
  for (let i = 0; i < covered.length; i++) count += covered[i]!;
  return count / covered.length;
}
