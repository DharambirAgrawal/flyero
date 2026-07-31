import type { DimensionValue, ReadingPath, TopologyId } from "./types.js";

export type TopologyValue = DimensionValue<TopologyId> & {
  /** Locked map from SCHEMAS.md §3 — readingPath is derived, never sampled. */
  readingPath: ReadingPath;
};

/** 10 composition topologies. Geometry for each lives in src/core/layout/recipes.ts. */
export const TOPOLOGIES: readonly TopologyValue[] = [
  {
    id: "diagonal-progression",
    readingPath: "diagonal",
    brief: "Content advances corner to corner; the eye travels down-right through stages.",
    adventurousness: 2,
  },
  {
    id: "split-editorial",
    readingPath: "left-to-right",
    brief: "A hard vertical split: message on one side, evidence on the other, like a magazine spread.",
    adventurousness: 1,
  },
  {
    id: "radial-field",
    readingPath: "radial",
    brief: "One centre of gravity with elements arranged around it at varying distance.",
    adventurousness: 3,
  },
  {
    id: "oversized-anchor",
    readingPath: "center-out",
    brief: "One element is enormous and everything else is small and deferential to it.",
    adventurousness: 2,
  },
  {
    id: "layered-depth-stack",
    readingPath: "edge-in",
    brief: "Overlapping planes at different depths; the composition reads front-to-back, not just flat.",
    adventurousness: 2,
  },
  {
    id: "zigzag-path",
    readingPath: "zigzag",
    brief: "The eye is bounced left-right-left down the canvas by alternating weight.",
    adventurousness: 2,
  },
  {
    id: "off-center-hero",
    readingPath: "left-to-right",
    brief: "The subject sits well off the optical centre, with generous asymmetric breathing room.",
    adventurousness: 1,
  },
  {
    id: "framed-evidence",
    readingPath: "center-out",
    brief: "The product sits inside an explicit frame or window; type wraps the frame.",
    adventurousness: 1,
  },
  {
    id: "vertical-narrative",
    readingPath: "top-to-bottom",
    brief: "A strict top-to-bottom sequence — the story is read as a column of beats.",
    adventurousness: 1,
  },
  {
    id: "asymmetric-two-column",
    readingPath: "left-to-right",
    brief: "Two columns of clearly unequal width; the narrow one carries support, the wide one carries weight.",
    adventurousness: 1,
  },
] as const;

export const TOPOLOGY_IDS = TOPOLOGIES.map((t) => t.id);

const READING_PATHS = new Map<TopologyId, ReadingPath>(
  TOPOLOGIES.map((t) => [t.id, t.readingPath]),
);

/** DR-1 measures reading-path variance through this derived field. */
export function readingPathFor(topology: TopologyId): ReadingPath {
  const path = READING_PATHS.get(topology);
  if (!path) throw new Error(`Unknown topology ${topology}`);
  return path;
}
