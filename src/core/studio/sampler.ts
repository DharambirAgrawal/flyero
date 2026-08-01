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
import { ART_DIRECTIONS } from "../../creative/artdirections.js";
import { pairsFor } from "../../creative/fontpairs.js";
import { vetoFor } from "../../creative/compatibility.js";
import type { Lineage } from "../compose/spec.js";
import type { CampaignArchetype } from "../../creative/types.js";

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
  campaignArchetype?: CampaignArchetype;
};

export type SampleResult = {
  jobSeed: string;
  lineages: Lineage[];
};

const MAX_REROLLS = 40;

/**
 * Coherent structural profiles before copy, components, assets and seeded
 * recipe parameters vary further. This intentionally counts only combinations
 * allowed inside an art direction; the old unrestricted Cartesian product was
 * large but included visually contradictory "designers".
 */
export const PROFILE_SPACE = ART_DIRECTIONS.reduce(
  (sum, d) =>
    sum +
    d.metaphors.length *
      d.topologies.length *
      d.typography.length *
      d.materials.length *
      d.colorLogic.length *
      d.gestures.length *
      d.graphics.length,
  0,
);

export function newJobSeed(): string {
  return ulid();
}

/**
 * Samples `count` lineages from one job seed. Metaphor families are forced unique
 * across the set so the internal competition compares ideas, not recolours.
 */
export function sampleLineages({
  jobSeed,
  count,
  risk,
  campaignArchetype,
}: SampleOptions): SampleResult {
  const seed = jobSeed ?? newJobSeed();
  const rng = new Rng(`studio:${seed}`);

  const metaphorAllowed = allowedFor(METAPHORS, risk);
  const topologyAllowed = allowedFor(TOPOLOGIES, risk);
  const typographyAllowed = allowedFor(TYPOGRAPHY, risk);
  const materialAllowed = allowedFor(MATERIALS, risk);
  const colorAllowed = allowedFor(COLOR_LOGIC, risk);
  const gestureAllowed = allowedFor(GESTURES, risk);
  const graphicsAllowed = allowedFor(GRAPHICS, risk);
  const directionAllowed = ART_DIRECTIONS.filter(
    (d) =>
      d.adventurousness <= (risk === "safe" ? 1 : risk === "studio" ? 2 : 3) &&
      (!campaignArchetype || d.archetypes.includes(campaignArchetype)),
  );
  if (directionAllowed.length === 0) {
    throw new Error(`No art direction supports ${campaignArchetype ?? risk}`);
  }
  const directions = rng.shuffle(directionAllowed);
  const lineages: Lineage[] = [];
  const usedMetaphors = new Set<string>();

  const inside = <T extends { id: string }>(pool: readonly T[], ids: readonly string[]): T[] => {
    const chosen = pool.filter((item) => ids.includes(item.id));
    if (chosen.length === 0) throw new Error("Art direction has no values at this risk level");
    return chosen;
  };

  for (let i = 0; i < count; i++) {
    const direction = directions[i % directions.length]!;
    const candidateSeed = `${seed}-${i}`;
    const lineageRng = new Rng(`lineage:${candidateSeed}`);
    const metaphorPool = inside(metaphorAllowed, direction.metaphors);
    const unusedMetaphors = metaphorPool.filter((m) => !usedMetaphors.has(m.id));
    const metaphor = lineageRng.pick(unusedMetaphors.length > 0 ? unusedMetaphors : metaphorPool).id;
    usedMetaphors.add(metaphor);
    const topologyPool = inside(topologyAllowed, direction.topologies);
    const typographyPool = inside(typographyAllowed, direction.typography);
    const materialPool = inside(materialAllowed, direction.materials);
    const colorPool = inside(colorAllowed, direction.colorLogic);
    const gesturePool = inside(gestureAllowed, direction.gestures);
    const graphicsPool = inside(graphicsAllowed, direction.graphics);

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
        artDirection: direction.id,
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
  return [
    l.artDirection,
    l.metaphor,
    l.topology,
    l.typography,
    l.material,
    l.colorLogic,
    l.gesture,
  ].join(" · ");
}
