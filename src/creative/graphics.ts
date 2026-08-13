/**
 * The seventh creative dimension: graphic language.
 *
 * The other six dimensions decide *what the flyer says and how it is
 * structured*. None of them decides what it is drawn out of, which is why ten
 * sampled designers could produce ten palettes of the same plain page. A
 * graphic language names the visual vocabulary — the ground it sits on and the
 * marks the engine is allowed to draw around it.
 *
 * Languages request ornament **declaratively**. A slot says "a blob, tinted,
 * under the content, in a corner, between 18% and 34% of canvas width"; it
 * never names a coordinate. Placement, keep-outs and the clutter budget are the
 * engine's job (`../core/decor/decorations.ts`), so a language cannot ask for
 * something that would bury the type.
 *
 * `editorial-restraint` and `swiss-grid` are deliberately near-silent. Quiet
 * output has to stay reachable, or the product loses the thing that makes it
 * worth using.
 */

import type { DimensionValue, GraphicsId } from "./types.js";
import type { DecorSlot, GroundKind } from "../core/decor/types.js";

export type GraphicsValue = DimensionValue<GraphicsId> & {
  /** Ground treatments this language may sit on; the sampler picks one. */
  grounds: readonly GroundKind[];
  /** Ordered ornament requests. Later slots are dropped first when capped. */
  slots: readonly DecorSlot[];
};

export const GRAPHICS: readonly GraphicsValue[] = [
  {
    id: "editorial-restraint",
    brief:
      "No ornament at all. Structure, type and white space carry the whole composition — the magazine-page discipline.",
    grounds: ["flat"],
    slots: [],
    adventurousness: 1,
  },
  {
    id: "swiss-grid",
    brief:
      "Rationalist: a faint measured grid, hard alignment, ornament reduced to the structure itself.",
    grounds: ["flat", "block-frame"],
    slots: [{ form: "grid-field", layer: "under", zone: "field", weight: "wash", scale: [1, 1] }],
    adventurousness: 1,
  },
  {
    id: "organic-blobs",
    brief:
      "Soft irregular colour shapes bleeding off the edges, the way a boutique or wellness brand sets a page.",
    grounds: ["gradient-wash", "gradient-wash", "flat"],
    slots: [
      { form: "blob", layer: "under", zone: "corner", weight: "tint", scale: [0.34, 0.6] },
      { form: "blob", layer: "under", zone: "edge", weight: "wash", scale: [0.26, 0.44] },
    ],
    adventurousness: 2,
  },
  {
    id: "retro-stripes",
    brief:
      "Seventies travel print: banded stripe fields and concentric arcs in warm flat colour.",
    grounds: ["split-horizontal", "split-horizontal", "flat"],
    slots: [
      { form: "arc-bands", layer: "under", zone: "edge", weight: "tint", scale: [0.5, 0.85] },
      { form: "stripe-field", layer: "under", zone: "corner", weight: "wash", scale: [0.3, 0.5] },
    ],
    adventurousness: 2,
  },
  {
    id: "halftone-pop",
    brief:
      "Comic-print energy: dot fields, a starburst badge, heavy flat ink, visible printing structure and — sometimes — a stamp-edge border ring, the vintage offset-print poster.",
    grounds: ["pattern-tile", "pattern-tile", "flat", "scallop-frame"],
    slots: [
      { form: "halftone-field", layer: "under", zone: "field", weight: "wash", scale: [1, 1] },
      { form: "burst", layer: "under", zone: "corner", weight: "solid", scale: [0.2, 0.32] },
    ],
    adventurousness: 2,
  },
  {
    id: "paper-collage",
    brief:
      "Cut-and-pasted: torn paper edges, layered stock, the hand-made scrapbook look.",
    grounds: ["flat", "split-horizontal"],
    slots: [
      { form: "torn-edge", layer: "under", zone: "edge", weight: "tint", scale: [0.7, 1] },
      { form: "tape", layer: "over", zone: "corner", weight: "solid", scale: [0.14, 0.22] },
      { form: "blob", layer: "under", zone: "corner", weight: "wash", scale: [0.3, 0.5] },
    ],
    adventurousness: 2,
  },
  {
    id: "dashed-cartography",
    brief:
      "Route maps: bowed dashed flight paths joining points, pins and a plane in motion. The travel-poster signature.",
    grounds: ["flat", "pattern-tile"],
    slots: [
      { form: "dashed-route", layer: "over", zone: "gap", weight: "solid", scale: [0.4, 0.75] },
      {
        form: "motif",
        layer: "over",
        zone: "corner",
        weight: "solid",
        scale: [0.08, 0.14],
        motifs: ["plane", "pin", "compass", "globe", "map"],
      },
    ],
    adventurousness: 2,
  },
  {
    id: "botanical-frame",
    brief:
      "Leaves and arches framing the composition — the florist, spa and wedding-stationery register.",
    grounds: ["arch-field", "arch-field", "flat"],
    slots: [
      {
        form: "motif",
        layer: "under",
        zone: "corner",
        weight: "tint",
        scale: [0.16, 0.28],
        motifs: ["leaf", "fern", "vine", "rose", "maple-leaf", "sprout"],
      },
      { form: "squiggle", layer: "over", zone: "gap", weight: "solid", scale: [0.2, 0.36] },
    ],
    adventurousness: 2,
  },
  {
    id: "sticker-sheet",
    brief:
      "Playful and loud: sparkles, badges and ribbon banners scattered like stickers on a laptop.",
    grounds: ["split-diagonal", "split-diagonal", "flat"],
    slots: [
      { form: "ribbon", layer: "under", zone: "edge", weight: "solid", scale: [0.4, 0.7] },
      { form: "badge", layer: "over", zone: "corner", weight: "solid", scale: [0.1, 0.16] },
      { form: "sparkle", layer: "over", zone: "gap", weight: "solid", scale: [0.06, 0.12] },
      { form: "sparkle", layer: "over", zone: "corner", weight: "solid", scale: [0.05, 0.09] },
    ],
    adventurousness: 3,
  },
  {
    id: "geometric-memphis",
    brief:
      "Eighties Memphis / Y2K: hard polygons, checkerboards, loose squiggles and a scattered novelty mark (a star, a bolt, a smiley) in clashing flat colour.",
    grounds: ["split-diagonal", "split-diagonal", "flat"],
    slots: [
      { form: "checker-field", layer: "under", zone: "corner", weight: "wash", scale: [0.3, 0.5] },
      { form: "polygon", layer: "under", zone: "edge", weight: "tint", scale: [0.18, 0.32] },
      { form: "squiggle", layer: "over", zone: "gap", weight: "solid", scale: [0.22, 0.38] },
      {
        form: "motif",
        layer: "over",
        zone: "gap",
        weight: "solid",
        scale: [0.08, 0.14],
        motifs: ["star", "lightning", "flower", "smiley", "dice", "puzzle"],
      },
    ],
    adventurousness: 3,
  },
  {
    id: "kawaii-doodle",
    brief:
      "Hand-drawn scrapbook page: a wobbly ink border around the whole composition, doodled flowers and stars scattered like a diary margin, everything a little imperfect on purpose.",
    grounds: ["wobble-frame", "wobble-frame", "flat"],
    slots: [
      {
        form: "motif",
        layer: "over",
        zone: "gap",
        weight: "tint",
        scale: [0.07, 0.13],
        motifs: ["flower", "star", "heart", "rainbow", "smiley", "butterfly"],
      },
      { form: "squiggle", layer: "over", zone: "gap", weight: "solid", scale: [0.14, 0.24] },
    ],
    adventurousness: 3,
  },
  {
    id: "festive-scene",
    brief:
      "A celebration in full colour: a bunting banner overhead, balloons and a wrapped gift anchoring a corner, confetti drifting around them — the party-invitation register.",
    grounds: ["flat", "gradient-wash"],
    slots: [
      { form: "bunting-string", layer: "over", zone: "banner", weight: "solid", scale: [0.55, 0.8] },
      {
        form: "motif",
        layer: "over",
        zone: "corner",
        weight: "solid",
        scale: [0.14, 0.22],
        motifs: ["balloon", "gift", "cupcake", "party-hat", "balloon-bunch"],
      },
      {
        form: "motif",
        layer: "over",
        zone: "gap",
        weight: "tint",
        scale: [0.05, 0.09],
        motifs: ["confetti", "star", "sparkle-doodle", "streamer"],
      },
      { form: "tape", layer: "over", zone: "corner", weight: "solid", scale: [0.12, 0.2] },
      // A large, barely-there echo behind everything — the ghost balloon
      // silhouette a photo sits in front of on a real party invite. `wash`
      // weight is exempt from the keep-out/tone checks (it's faint enough
      // that "under a headline" is invisible, not wrong), which is what
      // makes a mark this large safe to place at all.
      {
        form: "motif",
        layer: "under",
        zone: "corner",
        weight: "wash",
        scale: [0.4, 0.6],
        motifs: ["balloon", "flower", "cupcake", "balloon-bunch"],
      },
    ],
    adventurousness: 3,
  },
] as const;

export const GRAPHICS_IDS = GRAPHICS.map((g) => g.id) as GraphicsId[];

export function graphicsById(id: GraphicsId): GraphicsValue {
  const value = GRAPHICS.find((g) => g.id === id);
  if (!value) throw new Error(`Unknown graphic language ${id}`);
  return value;
}
