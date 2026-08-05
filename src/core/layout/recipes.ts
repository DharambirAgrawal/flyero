import type { ReadingPath, TopologyId } from "../../creative/types.js";
import { readingPathFor } from "../../creative/topologies.js";
import type { Role } from "../../components/types.js";

/**
 * Topology recipes (SCHEMAS.md §9).
 *
 * The solver *fits content into* these recipes — it does not invent a grid.
 * Rects are normalised 0–1 against the safe rectangle, so margins are respected
 * by construction. Values outside 0–1 are deliberate bleeds and must be listed
 * in `bleed`, or the margin pass will pull them back inside.
 *
 * These ten must be genuinely different *structures*, not one column with the
 * x nudged. If the message sits at the top in nine of them, ten sampled
 * designers produce one layout wearing ten palettes — which is the failure the
 * Diversity Requirement exists to prevent. Read the table in the doc comment
 * below before editing: it is the at-a-glance check that they still differ.
 *
 *   topology                message      evidence     cta          notes
 *   diagonal-progression    top-left     lower-right  bottom-right corner to corner
 *   split-editorial         left column  right, bleed left rail    hard vertical split
 *   radial-field            centred top  centre       centred      everything on one axis
 *   oversized-anchor        foot, on art full bleed   foot         art dominates, type at base
 *   layered-depth-stack     mid-page     full bleed   lower        poster: type over image
 *   zigzag-path             top-right    mid-left     bottom-left  weight alternates
 *   off-center-hero         left middle  right, bleed left lower   subject off centre
 *   framed-evidence         below frame  inset window bottom       type wraps the window
 *   vertical-narrative      top          middle       lower        strict column of beats
 *   asymmetric-two-column   right top    right lower  right foot   narrow left rail
 */

export type Rect = { x: number; y: number; w: number; h: number };

export type SlotName = Role | "eyebrow";

export type Align = "start" | "middle" | "end";

export type TopologyRecipe = {
  id: TopologyId;
  readingPath: ReadingPath;
  slots: Record<SlotName, Rect>;
  /** Slots exempt from the safe-margin clamp, so they can run off the canvas. */
  bleed: SlotName[];
  /**
   * When true, a *photographic* evidence element becomes the ground: it covers
   * the whole canvas and the type is set over it.
   *
   * This is the single biggest lever on how designed a flyer looks. Measured
   * ink coverage across the ten topologies averaged 25.6% against 55-80% for
   * comparable Canva templates — and the only two that came close were the two
   * where a photograph already covered the page. Coverage comes from the image
   * being the ground, not from adding ornament.
   *
   * Deliberately NOT set on every topology. A poster where type floats over a
   * photograph is one good idea; ten of them is the sameness this dimension
   * exists to prevent. The editorial topologies keep their columns.
   */
  photoGround?: boolean;
  /** Text alignment per slot; anything unlisted reads flush-left. */
  align: Partial<Record<SlotName, Align>>;
  /** Headline size ceiling as a fraction of canvas width, before typography scaling. */
  headlineCeiling: number;
  /** Max headline lines this composition can carry without going soft. */
  headlineMaxLines: number;
  notes: string;
};

const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

type RecipeBody = Omit<TopologyRecipe, "id" | "readingPath">;

const RECIPES: Record<TopologyId, RecipeBody> = {
  // Corner to corner: type holds the top-left, the subject falls to the lower
  // right, and the eye lands on the action in the bottom corner.
  "diagonal-progression": {
    slots: {
      eyebrow: r(0, 0, 0.5, 0.03),
      message: r(0, 0.06, 0.66, 0.26),
      evidence: r(0.24, 0.36, 0.82, 0.44),
      support: r(0, 0.36, 0.2, 0.1),
      cta: r(0.4, 0.85, 0.6, 0.1),
      brand: r(0, 0.955, 0.34, 0.045),
      structure: r(-0.05, 0, 1.1, 1),
    },
    bleed: ["evidence"],
    align: { cta: "end" },
    headlineCeiling: 0.135,
    headlineMaxLines: 3,
    photoGround: true,
    notes: "The eye starts top-left and lands bottom-right on the CTA.",
  },

  // A hard vertical split. The right column is a full-height image running off
  // the edge; everything verbal stacks in the left rail.
  "split-editorial": {
    slots: {
      eyebrow: r(0, 0, 0.4, 0.03),
      message: r(0, 0.07, 0.44, 0.3),
      evidence: r(0.5, -0.06, 0.58, 1.12),
      support: r(0, 0.42, 0.42, 0.16),
      cta: r(0, 0.7, 0.44, 0.1),
      brand: r(0, 0.955, 0.4, 0.045),
      structure: r(0, 0, 1, 1),
    },
    bleed: ["evidence"],
    align: {},
    headlineCeiling: 0.115,
    headlineMaxLines: 4,
    notes: "Hard vertical split; the image column bleeds off the right edge.",
  },

  // One axis. Everything centres, so the composition reads outward from the
  // middle rather than down the page.
  "radial-field": {
    slots: {
      eyebrow: r(0.2, 0.04, 0.6, 0.03),
      message: r(0.04, 0.1, 0.92, 0.17),
      evidence: r(0.14, 0.3, 0.72, 0.4),
      support: r(0.18, 0.73, 0.64, 0.08),
      cta: r(0.22, 0.85, 0.56, 0.1),
      brand: r(0.3, 0.955, 0.4, 0.045),
      structure: r(-0.08, -0.05, 1.16, 1.1),
    },
    bleed: [],
    align: { eyebrow: "middle", message: "middle", support: "middle", cta: "middle", brand: "middle" },
    headlineCeiling: 0.1,
    headlineMaxLines: 3,
    notes: "One centre of gravity; every element is centred on the same axis.",
  },

  // The artwork is the poster. It covers the upper three-quarters edge to edge
  // and the type sits at the foot, on the image.
  "oversized-anchor": {
    slots: {
      eyebrow: r(0.02, 0.02, 0.5, 0.03),
      message: r(0.02, 0.62, 0.9, 0.22),
      evidence: r(-0.08, -0.06, 1.16, 0.82),
      support: r(0.02, 0.86, 0.5, 0.07),
      cta: r(0.54, 0.86, 0.46, 0.08),
      brand: r(0.02, 0.955, 0.4, 0.045),
      structure: r(-0.1, -0.06, 1.2, 1.12),
    },
    bleed: ["evidence"],
    align: {},
    headlineCeiling: 0.115,
    headlineMaxLines: 3,
    photoGround: true,
    notes: "The image is the poster; type sits at its foot rather than above it.",
  },

  // Full-bleed plate with the message floating in the middle of it — the
  // closest thing here to a travel poster.
  "layered-depth-stack": {
    slots: {
      eyebrow: r(0.02, 0.03, 0.5, 0.03),
      message: r(0.04, 0.34, 0.8, 0.26),
      evidence: r(-0.08, -0.06, 1.16, 1.12),
      support: r(0.04, 0.64, 0.52, 0.1),
      cta: r(0.04, 0.8, 0.56, 0.1),
      brand: r(0.6, 0.955, 0.4, 0.045),
      structure: r(-0.08, -0.06, 1.16, 1.12),
    },
    bleed: ["evidence", "structure"],
    align: {},
    headlineCeiling: 0.125,
    headlineMaxLines: 3,
    photoGround: true,
    notes: "A full-bleed plate with the message set over it, poster fashion.",
  },

  // Weight alternates side to side going down: type right, subject left,
  // action back to the left foot.
  "zigzag-path": {
    slots: {
      eyebrow: r(0.5, 0, 0.5, 0.03),
      message: r(0.3, 0.06, 0.7, 0.24),
      evidence: r(-0.06, 0.34, 0.76, 0.36),
      support: r(0.56, 0.72, 0.44, 0.1),
      cta: r(0, 0.85, 0.56, 0.1),
      brand: r(0.66, 0.955, 0.34, 0.045),
      structure: r(-0.05, 0, 1.1, 1),
    },
    bleed: ["evidence"],
    align: { eyebrow: "end", message: "end", support: "end", brand: "end" },
    headlineCeiling: 0.12,
    headlineMaxLines: 3,
    notes: "Weight bounces right-left-right down the page.",
  },

  // The subject sits right of centre and runs off that edge for its full
  // height; the words hold the left with a lot of air.
  "off-center-hero": {
    slots: {
      eyebrow: r(0, 0.02, 0.4, 0.03),
      // The message used to start at 0.3, leaving a quarter of the page empty
      // between a lone eyebrow and the headline. Air low in the column reads as
      // deliberate because the brand mark anchors it; a void at the top just
      // reads as a missing element.
      message: r(0, 0.09, 0.46, 0.34),
      evidence: r(0.46, -0.06, 0.62, 1.12),
      support: r(0, 0.47, 0.42, 0.14),
      cta: r(0, 0.72, 0.44, 0.1),
      brand: r(0, 0.955, 0.4, 0.045),
      structure: r(0, 0, 1.08, 1),
    },
    bleed: ["evidence"],
    align: {},
    headlineCeiling: 0.115,
    headlineMaxLines: 4,
    photoGround: true,
    notes: "Subject held right and bled off that edge; type holds the left.",
  },

  // An explicit window near the top, with the type reading underneath it —
  // the inverse of every other recipe here.
  "framed-evidence": {
    slots: {
      eyebrow: r(0.02, 0.02, 0.6, 0.03),
      message: r(0.02, 0.60, 0.96, 0.16),
      evidence: r(0.08, 0.09, 0.84, 0.46),
      support: r(0.02, 0.78, 0.52, 0.08),
      cta: r(0.02, 0.9, 0.62, 0.08),
      brand: r(0.66, 0.955, 0.34, 0.045),
      structure: r(0.04, 0.07, 0.92, 0.5),
    },
    bleed: [],
    align: {},
    headlineCeiling: 0.105,
    headlineMaxLines: 3,
    notes: "A window holds the subject up top; the type reads beneath it.",
  },

  // The strict column of beats, top to bottom. The one classic layout in the set.
  "vertical-narrative": {
    slots: {
      eyebrow: r(0, 0, 0.5, 0.03),
      message: r(0, 0.05, 0.88, 0.22),
      evidence: r(0, 0.3, 1, 0.36),
      support: r(0, 0.69, 0.72, 0.11),
      cta: r(0, 0.84, 0.66, 0.1),
      brand: r(0, 0.955, 0.4, 0.045),
      structure: r(0, 0, 1, 1),
    },
    bleed: [],
    align: {},
    headlineCeiling: 0.12,
    headlineMaxLines: 3,
    notes: "A strict column of beats read top to bottom.",
  },


  // A band across the head and another across the foot. The label and the
  // practical facts live in the bands; the middle is the subject and one big
  // line. The story does not start at the top-left — it starts in the middle.
  "banded-masthead": {
    slots: {
      eyebrow: r(0.04, 0.015, 0.6, 0.03),
      message: r(0.04, 0.4, 0.92, 0.24),
      evidence: r(-0.06, 0.09, 1.12, 0.62),
      support: r(0.04, 0.88, 0.62, 0.07),
      cta: r(0.04, 0.79, 0.56, 0.08),
      brand: r(0.7, 0.88, 0.3, 0.07),
      structure: r(-0.06, 0, 1.12, 1),
    },
    bleed: ["evidence"],
    photoGround: true,
    align: {},
    headlineCeiling: 0.15,
    headlineMaxLines: 2,
    notes: "Bands top and foot; the subject owns the middle.",
  },

  // The words are the poster. Any image is a note, not the subject — so the
  // evidence slot is deliberately small and low.
  "type-poster": {
    slots: {
      eyebrow: r(0, 0.02, 0.5, 0.03),
      message: r(0, 0.1, 1, 0.52),
      evidence: r(0.52, 0.66, 0.48, 0.2),
      support: r(0, 0.66, 0.46, 0.16),
      cta: r(0, 0.87, 0.6, 0.08),
      brand: r(0.72, 0.955, 0.28, 0.045),
      structure: r(0, 0, 1, 1),
    },
    bleed: [],
    align: {},
    // Deliberately far above the others: this topology exists to set type big.
    // Capped below the old 0.24: the headline box is allowed to grow past its
    // nominal slot height to fit the text (see solver.ts §3), which read fine
    // against the tall portrait format this was tuned against but overflowed
    // the safe rect on square-1x1's shorter canvas at 4 lines near ceiling.
    headlineCeiling: 0.19,
    headlineMaxLines: 3,
    notes: "Type dominates; the image is a footnote.",
  },

  // Three bands of equal weight — the explainer rather than the announcement.
  // Support is the *main* content here, not a caption.
  "section-stack": {
    slots: {
      eyebrow: r(0, 0.015, 0.6, 0.03),
      message: r(0, 0.07, 0.86, 0.14),
      evidence: r(0, 0.24, 1, 0.24),
      support: r(0, 0.53, 1, 0.28),
      cta: r(0, 0.86, 0.64, 0.08),
      brand: r(0.72, 0.955, 0.28, 0.045),
      structure: r(0, 0, 1, 1),
    },
    bleed: [],
    align: {},
    headlineCeiling: 0.1,
    headlineMaxLines: 2,
    notes: "Equal stacked sections; the middle carries the argument.",
  },

  // A border wraps the page and everything centres inside it. The invitation,
  // the notice, the certificate — symmetric, and quiet by construction.
  "framed-centre": {
    slots: {
      eyebrow: r(0.15, 0.08, 0.7, 0.03),
      message: r(0.08, 0.17, 0.84, 0.22),
      evidence: r(0.18, 0.42, 0.64, 0.28),
      support: r(0.1, 0.73, 0.8, 0.09),
      cta: r(0.2, 0.85, 0.6, 0.07),
      brand: r(0.3, 0.93, 0.4, 0.04),
      structure: r(0.04, 0.04, 0.92, 0.92),
    },
    bleed: [],
    align: {
      eyebrow: "middle",
      message: "middle",
      support: "middle",
      cta: "middle",
      brand: "middle",
    },
    headlineCeiling: 0.12,
    headlineMaxLines: 3,
    notes: "A frame holds the page; everything centres inside it.",
  },

  // A narrow left rail carries the quiet material; the wide right column runs
  // the whole argument.
  "asymmetric-two-column": {
    slots: {
      eyebrow: r(0.36, 0.02, 0.32, 0.03),
      message: r(0.36, 0.08, 0.64, 0.24),
      evidence: r(0.36, 0.36, 0.72, 0.42),
      support: r(0, 0.36, 0.3, 0.34),
      cta: r(0.36, 0.85, 0.64, 0.1),
      brand: r(0, 0.955, 0.32, 0.045),
      structure: r(0, 0, 1, 1),
    },
    bleed: ["evidence"],
    align: {},
    headlineCeiling: 0.115,
    headlineMaxLines: 4,
    notes: "Narrow left rail carries support; the wide right column carries the weight.",
  },
};

export const TOPOLOGY_RECIPES: Record<TopologyId, TopologyRecipe> = Object.fromEntries(
  Object.entries(RECIPES).map(([id, recipe]) => [
    id,
    { ...recipe, id: id as TopologyId, readingPath: readingPathFor(id as TopologyId) },
  ]),
) as Record<TopologyId, TopologyRecipe>;

export function recipeFor(topology: TopologyId): TopologyRecipe {
  const recipe = TOPOLOGY_RECIPES[topology];
  if (!recipe) throw new Error(`No layout recipe for topology ${topology}`);
  return recipe;
}

/** Projects a normalised recipe rect onto the canvas safe rectangle. */
export function toCanvas(rect: Rect, safe: { x: number; y: number; w: number; h: number }): Rect {
  return {
    x: safe.x + rect.x * safe.w,
    y: safe.y + rect.y * safe.h,
    w: rect.w * safe.w,
    h: rect.h * safe.h,
  };
}
