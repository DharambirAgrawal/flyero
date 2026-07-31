import type { GraphicsId, MaterialId, MetaphorId, TopologyId, TypographyId } from "./types.js";

/**
 * The veto matrix (ARCHITECTURE.md §4): a small hand-written list of genuinely
 * bad pairings. A vetoed lineage is re-rolled, not repaired. Keep this list short
 * — over-vetoing collapses the sample space and hurts DR-1.
 */

type Veto<A extends string, B extends string> = { a: A; b: B; why: string };

export const TOPOLOGY_TYPOGRAPHY_VETOES: readonly Veto<TopologyId, TypographyId>[] = [
  {
    a: "radial-field",
    b: "editorial-annotated",
    why: "Margin annotations need a stable edge to hang off; a radial field has none.",
  },
  {
    a: "radial-field",
    b: "stacked-contrast",
    why: "Flush-stacked lines fight a composition organised around a centre.",
  },
  {
    a: "vertical-narrative",
    b: "woven-through-image",
    why: "A strict beat column leaves no room for type to pass through the subject.",
  },
  {
    a: "oversized-anchor",
    b: "compressed-monumental",
    why: "Two competing monumental objects — nothing can be the anchor.",
  },
  {
    a: "framed-evidence",
    b: "masked-by-subject",
    why: "The frame already contains the subject, so it cannot crop into the headline.",
  },
  {
    a: "asymmetric-two-column",
    b: "masked-by-subject",
    why: "Column edges are the structure; letting the subject break them destroys the read.",
  },
] as const;

export const TOPOLOGY_METAPHOR_VETOES: readonly Veto<TopologyId, MetaphorId>[] = [
  {
    a: "radial-field",
    b: "before-after-fold",
    why: "A fold needs one hard axis; a radial field has no single seam.",
  },
  {
    a: "vertical-narrative",
    b: "constellation",
    why: "Constellations need two-dimensional scatter to reveal a shape.",
  },
  {
    a: "oversized-anchor",
    b: "assembly-compile",
    why: "Assembly needs several visible fragments; the anchor swallows them.",
  },
] as const;

export const MATERIAL_TYPOGRAPHY_VETOES: readonly Veto<MaterialId, TypographyId>[] = [
  {
    a: "chromatic-glass",
    b: "technical-mono-accents",
    why: "Refraction plus instrument labels reads as the 2026 AI aesthetic we ban.",
  },
  {
    a: "ink-on-cream",
    b: "woven-through-image",
    why: "Letterpress ink has no depth layer for type to weave behind.",
  },
] as const;

export type VetoHit = { dimensions: string; why: string };

/**
 * Material × graphic language.
 *
 * These two dimensions both speak about *surface*, so left unconstrained they
 * contradict each other: a sticker sheet printed on drafting paper, or a
 * Memphis pattern on an instrument readout, is not a bold combination — it is
 * two briefs fighting. Vetoing the incoherent pairs is also what stops the
 * seventh dimension making `material` feel arbitrary.
 */
export const MATERIAL_GRAPHICS_VETOES: readonly Veto<MaterialId, GraphicsId>[] = [
  {
    a: "technical-paper",
    b: "sticker-sheet",
    why: "Drafting paper carries measured rules, not scattered stickers.",
  },
  {
    a: "technical-paper",
    b: "geometric-memphis",
    why: "A drafting surface and eighties Memphis clash rather than combine.",
  },
  {
    a: "optical-diagnostic",
    b: "sticker-sheet",
    why: "An instrument readout with sparkles on it reads as a mistake.",
  },
  {
    a: "optical-diagnostic",
    b: "botanical-frame",
    why: "Clinical calm and botanical ornament pull in opposite directions.",
  },
  {
    a: "optical-diagnostic",
    b: "paper-collage",
    why: "Torn paper contradicts the precision the material is built on.",
  },
  {
    a: "chromatic-glass",
    b: "paper-collage",
    why: "Refraction and hand-torn stock cannot be the same surface.",
  },
  {
    a: "chromatic-glass",
    b: "swiss-grid",
    why: "Glass wants depth; the Swiss grid wants a flat rational plane.",
  },
];

/**
 * Topology × graphic language — only where the *structure* is contradicted.
 */
export const TOPOLOGY_GRAPHICS_VETOES: readonly Veto<TopologyId, GraphicsId>[] = [
  {
    a: "radial-field",
    b: "swiss-grid",
    why: "A rationalist grid and a single radial centre of gravity are opposite claims.",
  },
  {
    a: "vertical-narrative",
    b: "dashed-cartography",
    why: "A strict column already carries the eye; a route line only competes with it.",
  },
];

export function vetoFor(input: {
  topology: TopologyId;
  typography: TypographyId;
  metaphor: MetaphorId;
  material: MaterialId;
  graphics?: GraphicsId;
}): VetoHit | null {
  if (input.graphics) {
    for (const v of MATERIAL_GRAPHICS_VETOES) {
      if (v.a === input.material && v.b === input.graphics) {
        return { dimensions: `material×graphics (${v.a}×${v.b})`, why: v.why };
      }
    }
    for (const v of TOPOLOGY_GRAPHICS_VETOES) {
      if (v.a === input.topology && v.b === input.graphics) {
        return { dimensions: `topology×graphics (${v.a}×${v.b})`, why: v.why };
      }
    }
  }
  for (const v of TOPOLOGY_TYPOGRAPHY_VETOES) {
    if (v.a === input.topology && v.b === input.typography) {
      return { dimensions: `topology×typography (${v.a}×${v.b})`, why: v.why };
    }
  }
  for (const v of TOPOLOGY_METAPHOR_VETOES) {
    if (v.a === input.topology && v.b === input.metaphor) {
      return { dimensions: `topology×metaphor (${v.a}×${v.b})`, why: v.why };
    }
  }
  for (const v of MATERIAL_TYPOGRAPHY_VETOES) {
    if (v.a === input.material && v.b === input.typography) {
      return { dimensions: `material×typography (${v.a}×${v.b})`, why: v.why };
    }
  }
  return null;
}

export const VETO_COUNT =
  MATERIAL_GRAPHICS_VETOES.length +
  TOPOLOGY_GRAPHICS_VETOES.length +
  TOPOLOGY_TYPOGRAPHY_VETOES.length +
  TOPOLOGY_METAPHOR_VETOES.length +
  MATERIAL_TYPOGRAPHY_VETOES.length;
