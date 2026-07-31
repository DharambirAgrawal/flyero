import type { DimensionValue, MaterialId } from "./types.js";

export type MaterialValue = DimensionValue<MaterialId> & {
  /** Surface treatment the renderer applies; kept few and cheap so output stays deterministic. */
  surface: {
    /** Paper grain / halftone / none — drives the background texture component. */
    texture: "none" | "grain" | "halftone" | "grid-fine" | "scanline";
    /** How hard edges and corners are. */
    cornerRadius: number;
    /** Stroke weight used by frames, rules and connectors. */
    strokeWidth: number;
    /** Whether panels cast a soft shadow. */
    elevation: boolean;
  };
};

export const MATERIALS: readonly MaterialValue[] = [
  {
    id: "technical-paper",
    brief: "Drafting-table feel: fine measured rules, hairline strokes, square corners, nothing glossy.",
    surface: { texture: "grid-fine", cornerRadius: 2, strokeWidth: 1.5, elevation: false },
    adventurousness: 1,
  },
  {
    id: "optical-diagnostic",
    brief: "Instrument readout: crisp geometry, thin registration marks, a clinical calm.",
    surface: { texture: "scanline", cornerRadius: 0, strokeWidth: 1.25, elevation: false },
    adventurousness: 2,
  },
  {
    id: "printed-halftone",
    brief: "Offset-print character: visible dot structure, slightly heavy ink, honest imperfection.",
    surface: { texture: "halftone", cornerRadius: 0, strokeWidth: 2.5, elevation: false },
    adventurousness: 2,
  },
  {
    id: "soft-industrial",
    brief: "Machined but friendly: generous radii, matte planes, restrained depth.",
    surface: { texture: "none", cornerRadius: 18, strokeWidth: 2, elevation: true },
    adventurousness: 1,
  },
  {
    id: "ink-on-cream",
    brief: "Letterpress on warm stock: dense ink, tight rules, no gloss anywhere.",
    surface: { texture: "grain", cornerRadius: 1, strokeWidth: 2.75, elevation: false },
    adventurousness: 1,
  },
  {
    id: "chromatic-glass",
    brief:
      "Refracted colour edges on an otherwise flat field. Use sparingly — one refracting element only, never a floating panel.",
    surface: { texture: "none", cornerRadius: 10, strokeWidth: 1.75, elevation: true },
    adventurousness: 3,
  },
] as const;

export const MATERIAL_IDS = MATERIALS.map((m) => m.id);

export function materialById(id: MaterialId): MaterialValue {
  const found = MATERIALS.find((m) => m.id === id);
  if (!found) throw new Error(`Unknown material ${id}`);
  return found;
}
