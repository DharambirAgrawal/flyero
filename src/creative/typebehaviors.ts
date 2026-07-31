import type { DimensionValue, TypographyId } from "./types.js";

export type TypographyValue = DimensionValue<TypographyId> & {
  /**
   * Gate G4 asks whether the headline participates in the composition. Behaviors
   * in the participating set satisfy it structurally; the others must earn it
   * through a relationship or the gesture (SCHEMAS.md §7).
   */
  participating: boolean;
  /** Multiplier applied to the topology's base headline size. */
  headlineScale: number;
  tracking: number;
  lineHeight: number;
};

export const TYPOGRAPHY: readonly TypographyValue[] = [
  {
    id: "compressed-monumental",
    brief: "Very large, tightly tracked headline set in few words; the type is the largest object on the canvas.",
    participating: true,
    headlineScale: 1.35,
    tracking: -0.03,
    lineHeight: 0.92,
    adventurousness: 2,
  },
  {
    id: "editorial-annotated",
    brief: "Moderate headline with small annotating labels pointing into the evidence, like a diagram caption.",
    participating: true,
    headlineScale: 0.95,
    tracking: -0.01,
    lineHeight: 1.06,
    adventurousness: 1,
  },
  {
    id: "woven-through-image",
    brief: "The headline passes physically through the subject — parts in front, parts behind.",
    participating: true,
    headlineScale: 1.15,
    tracking: -0.02,
    lineHeight: 0.98,
    adventurousness: 3,
  },
  {
    id: "technical-mono-accents",
    brief: "Humanist headline with monospaced eyebrow/labels carrying technical precision.",
    participating: false,
    headlineScale: 1.0,
    tracking: -0.015,
    lineHeight: 1.04,
    adventurousness: 1,
  },
  {
    id: "quiet-with-one-loud-word",
    brief: "The headline is restrained except for one word set far larger or in the accent colour.",
    participating: true,
    headlineScale: 1.05,
    tracking: -0.02,
    lineHeight: 1.0,
    adventurousness: 2,
  },
  {
    id: "stacked-contrast",
    brief: "Headline stacked in lines of deliberately different size and weight, flush to one edge.",
    participating: true,
    headlineScale: 1.2,
    tracking: -0.025,
    lineHeight: 0.94,
    adventurousness: 2,
  },
  {
    id: "masked-by-subject",
    brief: "The subject crops into the headline so some letterforms are partially occluded but still legible.",
    participating: true,
    headlineScale: 1.25,
    tracking: -0.03,
    lineHeight: 0.95,
    adventurousness: 3,
  },
  {
    id: "baseline-broken",
    brief: "One line of the headline sits off the common baseline, shifted or rotated slightly.",
    participating: true,
    headlineScale: 1.1,
    tracking: -0.02,
    lineHeight: 0.97,
    adventurousness: 3,
  },
] as const;

export const TYPOGRAPHY_IDS = TYPOGRAPHY.map((t) => t.id);

export function typographyById(id: TypographyId): TypographyValue {
  const found = TYPOGRAPHY.find((t) => t.id === id);
  if (!found) throw new Error(`Unknown typography behavior ${id}`);
  return found;
}
