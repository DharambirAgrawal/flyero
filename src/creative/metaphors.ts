import type { DimensionValue, MetaphorId } from "./types.js";

/**
 * 12 metaphor families. The Idea Engine works *inside* one of these, which is why
 * the boring option is never in its choice set (ARCHITECTURE.md §9).
 */
export const METAPHORS: readonly DimensionValue<MetaphorId>[] = [
  {
    id: "transformation",
    brief:
      "Show the subject mid-change: the weak state and the strong state are the same object, caught in the act of becoming. The product is the force doing it.",
    adventurousness: 1,
  },
  {
    id: "signal-from-noise",
    brief:
      "One thing is legible and everything else is deliberately suppressed — greyed, blurred, small, repeated. The product is what makes the one thing stand out.",
    adventurousness: 1,
  },
  {
    id: "before-after-fold",
    brief:
      "A single surface folded, torn or split so both states are visible at once along one hard edge. The seam is the product's intervention.",
    adventurousness: 1,
  },
  {
    id: "annotation-editorial",
    brief:
      "The subject is marked up the way an editor or expert marks up work: circles, margin notes, strike-throughs, callouts. The product is the annotating intelligence.",
    adventurousness: 1,
  },
  {
    id: "cartography",
    brief:
      "Treat the problem as terrain and the product as the route through it: paths, waypoints, legends, a marked destination.",
    adventurousness: 2,
  },
  {
    id: "magnification",
    brief:
      "One small detail is blown up far past life size so the viewer sees what they would otherwise miss. The product is the magnifier.",
    adventurousness: 2,
  },
  {
    id: "assembly-compile",
    brief:
      "Scattered fragments visibly resolve into one finished artifact. The product is the assembler; show both the loose parts and the result.",
    adventurousness: 1,
  },
  {
    id: "conversation",
    brief:
      "Frame the value as an exchange — a question and a much better answer, two voices, an ask and a response. The product speaks the good half.",
    adventurousness: 2,
  },
  {
    id: "constellation",
    brief:
      "Disconnected points revealed to have a shape once the right lines are drawn. The product draws the lines.",
    adventurousness: 2,
  },
  {
    id: "lens",
    brief:
      "The same scene shown through and outside an optical element, and only the part inside the lens is clear, corrected or true.",
    adventurousness: 2,
  },
  {
    id: "threshold-door",
    brief:
      "A boundary between where the viewer is and where they want to be — an opening, a gate, a step through. The product is the passage, the CTA is the crossing.",
    adventurousness: 3,
  },
  {
    id: "growth",
    brief:
      "A small input visibly compounding into a large outcome across the canvas — stages, increments, a curve you can read as a picture.",
    adventurousness: 2,
  },
] as const;

export const METAPHOR_IDS = METAPHORS.map((m) => m.id);
