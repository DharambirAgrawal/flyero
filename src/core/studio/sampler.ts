import { ulid } from "ulid";
import { Rng } from "../../lib/rng.js";
import { allowedFor } from "../../creative/types.js";
import type { Risk } from "../../config.js";
import { METAPHORS } from "../../creative/metaphors.js";
import { TOPOLOGIES, readingPathFor } from "../../creative/topologies.js";
import { TYPOGRAPHY } from "../../creative/typebehaviors.js";
import { MATERIALS } from "../../creative/materials.js";
import { COLOR_LOGIC } from "../../creative/colorlogic.js";
import { GESTURES } from "../../creative/gestures.js";
import { GRAPHICS } from "../../creative/graphics.js";
import { pairsFor } from "../../creative/fontpairs.js";
import { vetoFor } from "../../creative/compatibility.js";
import type { Lineage } from "../compose/spec.js";

/**
 * The Studio Sampler (ARCHITECTURE.md §4).
 *
 * Diversity by construction: each run re-rolls the "designer" rather than
 * consulting what was made before. No history lookup exists in this module by
 * design — that is AGENTS.md law 2, not an oversight.
 */

export type SampleOptions = {
  /** Fresh per job. Independent sessions get independent seeds — this is DR-1. */
  jobSeed?: string;
  count: number;
  risk: Risk;
};

export type SampleResult = {
  jobSeed: string;
  lineages: Lineage[];
};

const MAX_REROLLS = 40;

/** ~4.6M structurally distinct designer profiles before the Idea Engine varies further. */
export const PROFILE_SPACE =
  METAPHORS.length *
  TOPOLOGIES.length *
  TYPOGRAPHY.length *
  MATERIALS.length *
  COLOR_LOGIC.length *
  GESTURES.length *
  GRAPHICS.length;

export function newJobSeed(): string {
  return ulid();
}

/**
 * Samples `count` lineages from one job seed. Metaphor families are forced unique
 * across the set so the internal competition compares ideas, not recolours.
 */
export function sampleLineages({ jobSeed, count, risk }: SampleOptions): SampleResult {
  const seed = jobSeed ?? newJobSeed();
  const rng = new Rng(`studio:${seed}`);

  const metaphorPool = allowedFor(METAPHORS, risk);
  const topologyPool = allowedFor(TOPOLOGIES, risk);
  const typographyPool = allowedFor(TYPOGRAPHY, risk);
  const materialPool = allowedFor(MATERIALS, risk);
  const colorPool = allowedFor(COLOR_LOGIC, risk);
  const gesturePool = allowedFor(GESTURES, risk);
  const graphicsPool = allowedFor(GRAPHICS, risk);

  // Unique metaphors across candidates; if more candidates than metaphors are
  // requested, the list wraps rather than failing.
  const shuffledMetaphors = rng.shuffle(metaphorPool);
  const lineages: Lineage[] = [];

  for (let i = 0; i < count; i++) {
    const metaphor = shuffledMetaphors[i % shuffledMetaphors.length]!.id;
    const candidateSeed = `${seed}-${i}`;
    const lineageRng = new Rng(`lineage:${candidateSeed}`);

    let sampled: Lineage | null = null;
    for (let attempt = 0; attempt < MAX_REROLLS; attempt++) {
      const topology = lineageRng.pick(topologyPool).id;
      const typography = lineageRng.pick(typographyPool).id;
      const material = lineageRng.pick(materialPool).id;
      const colorLogic = lineageRng.pick(colorPool).id;
      const gesture = lineageRng.pick(gesturePool).id;
      const graphics = lineageRng.pick(graphicsPool).id;

      if (vetoFor({ topology, typography, metaphor, material, graphics })) continue;

      const fontPair = lineageRng.pick(pairsFor(material, typography)).id;
      sampled = {
        jobSeed: seed,
        candidateSeed,
        metaphor,
        topology,
        typography,
        material,
        colorLogic,
        gesture,
        graphics,
        risk,
        readingPath: readingPathFor(topology),
        fontPair,
      };
      break;
    }

    if (!sampled) {
      throw new Error(
        `Studio Sampler could not find a non-vetoed lineage for metaphor ${metaphor} after ${MAX_REROLLS} attempts — the veto matrix is too aggressive`,
      );
    }
    lineages.push(sampled);
  }

  return { jobSeed: seed, lineages };
}

/** Human-readable one-liner used in process logs and the batch introspection view. */
export function describeLineage(l: Lineage): string {
  return [l.metaphor, l.topology, l.typography, l.material, l.colorLogic, l.gesture].join(" · ");
}
