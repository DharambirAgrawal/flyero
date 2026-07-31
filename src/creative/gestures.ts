import type { DimensionValue, GestureId } from "./types.js";

export type GestureValue = DimensionValue<GestureId> & {
  /**
   * What the layout solver actually does. Exactly one gesture is applied per
   * flyer (Gate G5) — the solver reads this tag, never free-form text.
   */
  apply:
    | "bleed-element"
    | "connector-to-cta"
    | "headline-behind"
    | "rotate-element"
    | "crop-hero"
    | "letterform-structure"
    | "annotation-out-of-margin"
    | "overlap-eyebrow"
    | "rule-through-block"
    | "numeral-bleed";
  /** Element role the gesture prefers to act on. */
  target: "evidence" | "message" | "support" | "cta" | "structure";
  /**
   * Some gestures are only expressible through a specific component. The spec
   * schema enforces its presence, so a gesture can never silently no-op and
   * leave Gate G5 passing on a flyer that has no rule-break at all.
   */
  requires?: string;
};

export const GESTURES: readonly GestureValue[] = [
  {
    id: "element-escapes-canvas",
    brief: "One element runs off the canvas edge instead of being politely contained.",
    apply: "bleed-element",
    target: "evidence",
    adventurousness: 2,
  },
  {
    id: "path-becomes-cta-underline",
    brief: "The story's connecting path terminates as the underline beneath the call to action.",
    apply: "connector-to-cta",
    target: "cta",
    requires: "path-connector",
    adventurousness: 2,
  },
  {
    id: "headline-behind-subject",
    brief: "The headline passes behind the product so reading it forces you to see the product.",
    apply: "headline-behind",
    target: "message",
    adventurousness: 3,
  },
  {
    id: "one-rotated-element",
    brief: "Exactly one element sits off-axis by a few degrees — clearly a decision, not an error.",
    apply: "rotate-element",
    target: "support",
    adventurousness: 1,
  },
  {
    id: "intentional-crop-of-hero",
    brief: "The hero is cropped hard so the viewer completes it mentally.",
    apply: "crop-hero",
    target: "evidence",
    adventurousness: 2,
  },
  {
    id: "oversized-letterform-as-structure",
    brief: "A single giant letterform becomes architecture other elements sit against.",
    apply: "letterform-structure",
    target: "structure",
    requires: "oversized-letterform",
    adventurousness: 3,
  },
  {
    id: "annotation-breaks-margin",
    brief: "One annotation deliberately crosses the safe margin the rest of the layout respects.",
    apply: "annotation-out-of-margin",
    target: "support",
    requires: "annotation-label",
    adventurousness: 2,
  },
  {
    id: "hero-overlaps-eyebrow",
    brief: "The product overlaps the eyebrow line, putting the subject physically in front of its own label.",
    apply: "overlap-eyebrow",
    target: "evidence",
    requires: "eyebrow-label",
    adventurousness: 1,
  },
  {
    id: "rule-line-pierces-block",
    brief: "A single rule runs straight through a text block instead of stopping politely beside it.",
    apply: "rule-through-block",
    target: "message",
    requires: "rule-line",
    adventurousness: 2,
  },
  {
    id: "number-bleeds-off-edge",
    brief: "A key numeral is set huge and allowed to run off the edge.",
    apply: "numeral-bleed",
    target: "support",
    requires: "big-numeral",
    adventurousness: 3,
  },
] as const;

export const GESTURE_IDS = GESTURES.map((g) => g.id);

export function gestureById(id: GestureId): GestureValue {
  const found = GESTURES.find((g) => g.id === id);
  if (!found) throw new Error(`Unknown gesture ${id}`);
  return found;
}
