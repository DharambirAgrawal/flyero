/**
 * The decoration layer's data contracts.
 *
 * Two subsystems live here and they are deliberately kept apart:
 *
 *  - **Ground** is the coloured field the whole composition sits on. It must be
 *    decided inside `solveLayout`, because the solver is the only place that
 *    sets `box.onDark`, and `onDark` is the only thing that switches type to a
 *    light ink. Plan the ground in the renderer and dark type lands on a dark
 *    field with nothing to notice.
 *  - **Decorations** are ornament placed after the boxes are final, subject to
 *    keep-out zones around every text and evidence element.
 *
 * Both are **plain serialisable data, not React**. That is what lets the budget
 * caps be enforced before anything is painted, lets the keep-out invariant be
 * unit-tested without rendering, and lets the reviser replay a layout exactly.
 *
 * Nothing here ever enters `spec.elements`, so the 4–7 content budget and Gate
 * G3 are untouched, and the LLM neither places nor chooses ornament.
 */

import type { MotifName, Tile } from "../../components/shapes.js";

export type Rect = { x: number; y: number; w: number; h: number };

// ── Ground ──────────────────────────────────────────────────────────────────

export type GroundKind =
  | "flat"
  | "split-horizontal"
  | "split-diagonal"
  | "arch-field"
  | "gradient-wash"
  | "pattern-tile"
  | "block-frame";

export type GroundRegion = {
  /** Path in canvas coordinates; `null` means the full canvas. */
  d: string | null;
  fill: string;
  /** Precomputed `relativeLuminance(fill) < 0.45`, so coverage tests stay cheap. */
  isDark: boolean;
  /** Axis-aligned bounds, used for O(1) coverage against a layout box. */
  bbox: Rect;
};

export type TexturePlan = {
  /** Pattern element id. */
  id: string;
  tile: Tile;
  fill: string;
  rotate: number;
};

export type GradientPlan = {
  id: string;
  from: string;
  to: string;
  /** Degrees; 0 runs left to right. */
  angle: number;
};

export type GroundPlan = {
  kind: GroundKind;
  /** The flat wash painted under everything else. */
  base: string;
  /** Painted in order over `base`. */
  regions: GroundRegion[];
  /** Replaces the old per-circle textures with a single `<pattern>`. */
  texture: TexturePlan | null;
  gradient: GradientPlan | null;
};

// ── Decorations ─────────────────────────────────────────────────────────────

export type DecorForm =
  | "blob"
  | "stripe-field"
  | "checker-field"
  | "halftone-field"
  | "grid-field"
  | "squiggle"
  | "sparkle"
  | "burst"
  | "dashed-route"
  | "arc-bands"
  | "torn-edge"
  | "ribbon"
  | "polygon"
  | "motif";

export type DecorLayer = "under" | "over";

/**
 * How loudly a mark may be inked. `wash` is faint enough to sit under type
 * without harming legibility, which is why it is the only weight allowed to
 * intrude on a keep-out zone.
 */
export type DecorWeight = "wash" | "tint" | "solid";

export type DecorNode =
  | {
      t: "path";
      d: string;
      fill?: string;
      stroke?: string;
      sw?: number;
      dash?: string;
      op?: number;
      rule?: "evenodd";
    }
  | { t: "rect"; x: number; y: number; w: number; h: number; rx?: number; fill: string; op?: number }
  | { t: "circle"; cx: number; cy: number; r: number; fill: string; op?: number }
  | {
      t: "pattern";
      id: string;
      tile: Tile;
      rotate: number;
      fill: string;
      target: Rect;
      op?: number;
    }
  | {
      t: "motif";
      name: MotifName;
      x: number;
      y: number;
      size: number;
      rotate: number;
      fill: string;
      op?: number;
    };

export type Decoration = {
  /** Positional, never counter-derived — see `ids.ts`. */
  id: string;
  form: DecorForm;
  layer: DecorLayer;
  weight: DecorWeight;
  nodes: DecorNode[];
  /** Canvas-space bounds, used by the caps and by the keep-out tests. */
  bbox: Rect;
  /** Rough ink area in px², used by the coverage cap. */
  ink: number;
};

// ── Placement ───────────────────────────────────────────────────────────────

/** Where on the canvas a slot wants to sit. */
export type DecorZone = "corner" | "edge" | "field" | "gap" | "behind-message";

/** A graphic language's declarative request for one mark. */
export type DecorSlot = {
  form: DecorForm;
  layer: DecorLayer;
  zone: DecorZone;
  weight: DecorWeight;
  /** Size range as a fraction of canvas width. */
  scale: [number, number];
  /** Restricts `form: "motif"` to a themed subset. */
  motifs?: readonly MotifName[];
};

/**
 * A region ornament must respect. `allowance` is the fraction of a decoration's
 * own bbox that may intrude — zero for text and evidence.
 */
export type KeepOut = {
  rect: Rect;
  allowance: number;
  /** For diagnostics and test failure messages. */
  elementId: string;
};
