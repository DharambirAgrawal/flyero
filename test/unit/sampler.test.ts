import { describe, it, expect } from "vitest";
import { sampleLineages, PROFILE_SPACE, describeLineage } from "../../src/core/studio/sampler.js";
import { vetoFor, VETO_COUNT } from "../../src/creative/compatibility.js";
import { readingPathFor, TOPOLOGY_IDS } from "../../src/creative/topologies.js";
import { METAPHOR_IDS } from "../../src/creative/metaphors.js";
import { TYPOGRAPHY_IDS } from "../../src/creative/typebehaviors.js";
import { MATERIAL_IDS } from "../../src/creative/materials.js";
import { COLOR_LOGIC_IDS } from "../../src/creative/colorlogic.js";
import { GESTURE_IDS } from "../../src/creative/gestures.js";
import { GRAPHICS_IDS } from "../../src/creative/graphics.js";
import { ART_DIRECTIONS, artDirectionById } from "../../src/creative/artdirections.js";
import { isPhotoGround } from "../../src/core/layout/recipes.js";
import { graphicsById, isSilentGraphics } from "../../src/creative/graphics.js";

/**
 * Milestone 1's definition of done: the sampler produces valid lineages with the
 * right distribution — 10,000 samples, no vetoed pair, all values reachable.
 */
describe("Studio Sampler", () => {
  it("counts only coherent profiles inside art-direction systems", () => {
    const expected = ART_DIRECTIONS.reduce(
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
    expect(PROFILE_SPACE).toBe(expected);
    expect(PROFILE_SPACE).toBeGreaterThan(40_000);
  });

  it("forces unique metaphor families within one job", () => {
    for (let i = 0; i < 200; i++) {
      const { lineages } = sampleLineages({ jobSeed: `job-${i}`, count: 3, risk: "studio" });
      expect(new Set(lineages.map((l) => l.metaphor)).size).toBe(3);
    }
  });

  it("forces distinct coherent art directions within the normal competition", () => {
    for (let i = 0; i < 200; i++) {
      const { lineages } = sampleLineages({ jobSeed: `direction-${i}`, count: 3, risk: "studio" });
      expect(new Set(lineages.map((l) => l.artDirection)).size).toBe(3);
      for (const lineage of lineages) {
        const direction = artDirectionById(lineage.artDirection);
        expect(direction.metaphors).toContain(lineage.metaphor);
        expect(direction.topologies).toContain(lineage.topology);
        expect(direction.typography).toContain(lineage.typography);
        expect(direction.materials).toContain(lineage.material);
        expect(direction.colorLogic).toContain(lineage.colorLogic);
        expect(direction.gestures).toContain(lineage.gesture);
        expect(direction.graphics).toContain(lineage.graphics);
      }
    }
  });

  it("routes campaign archetypes only into art directions that support them", () => {
    const { lineages } = sampleLineages({
      jobSeed: "event",
      count: 3,
      risk: "studio",
      campaignArchetype: "event-invitation",
    });
    for (const lineage of lineages) {
      expect(artDirectionById(lineage.artDirection).archetypes).toContain("event-invitation");
    }
  });

  it("never emits a vetoed combination across 10,000 samples", () => {
    let checked = 0;
    for (let i = 0; i < 3400; i++) {
      const { lineages } = sampleLineages({ jobSeed: `veto-${i}`, count: 3, risk: "experimental" });
      for (const l of lineages) {
        expect(vetoFor(l)).toBeNull();
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(10_000);
    expect(VETO_COUNT).toBeGreaterThan(0);
  });

  it("reaches every value of every dimension", () => {
    const seen = {
      metaphor: new Set<string>(),
      topology: new Set<string>(),
      typography: new Set<string>(),
      material: new Set<string>(),
      colorLogic: new Set<string>(),
      gesture: new Set<string>(),
      graphics: new Set<string>(),
    };
    for (let i = 0; i < 4000; i++) {
      for (const l of sampleLineages({ jobSeed: `reach-${i}`, count: 3, risk: "experimental" })
        .lineages) {
        seen.metaphor.add(l.metaphor);
        seen.topology.add(l.topology);
        seen.typography.add(l.typography);
        seen.material.add(l.material);
        seen.colorLogic.add(l.colorLogic);
        seen.gesture.add(l.gesture);
        seen.graphics.add(l.graphics);
      }
    }
    expect(seen.metaphor.size).toBe(METAPHOR_IDS.length);
    expect(seen.topology.size).toBe(TOPOLOGY_IDS.length);
    expect(seen.typography.size).toBe(TYPOGRAPHY_IDS.length);
    expect(seen.material.size).toBe(MATERIAL_IDS.length);
    expect(seen.colorLogic.size).toBe(COLOR_LOGIC_IDS.length);
    expect(seen.gesture.size).toBe(GESTURE_IDS.length);
    expect(seen.graphics.size).toBe(GRAPHICS_IDS.length);
  });

  it("honours the risk ceiling", () => {
    // 'safe' may only sample the least adventurous values, so its reachable set
    // must be strictly smaller than 'experimental'.
    const safeSeen = new Set<string>();
    const wildSeen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      for (const l of sampleLineages({ jobSeed: `risk-${i}`, count: 3, risk: "safe" }).lineages) {
        safeSeen.add(l.topology);
      }
      for (const l of sampleLineages({ jobSeed: `risk-${i}`, count: 3, risk: "experimental" })
        .lineages) {
        wildSeen.add(l.topology);
      }
    }
    expect(safeSeen.size).toBeLessThan(wildSeen.size);
  });

  it("derives readingPath from topology rather than sampling it", () => {
    const { lineages } = sampleLineages({ jobSeed: "path", count: 3, risk: "studio" });
    for (const l of lineages) {
      expect(l.readingPath).toBe(readingPathFor(l.topology));
    }
  });

  it("prefers photo-as-ground topologies when the evidence is a photograph", () => {
    for (let i = 0; i < 200; i++) {
      const { lineages } = sampleLineages({
        jobSeed: `photo-${i}`,
        count: 3,
        risk: "studio",
        evidence: "photographic",
      });
      expect(new Set(lineages.map((l) => l.artDirection)).size).toBe(3);
      for (const lineage of lineages) {
        expect(isPhotoGround(lineage.topology), lineage.topology).toBe(true);
        expect(isSilentGraphics(graphicsById(lineage.graphics)), lineage.graphics).toBe(false);
      }
    }
  });

  it("is deterministic for a given job seed", () => {
    const a = sampleLineages({ jobSeed: "stable", count: 3, risk: "studio" });
    const b = sampleLineages({ jobSeed: "stable", count: 3, risk: "studio" });
    expect(a.lineages.map(describeLineage)).toEqual(b.lineages.map(describeLineage));
  });

  it("gives independent sessions different designers — DR-1's mechanism", () => {
    // Ten independent jobs, one winner each. Diversity must come from the seed,
    // with no shared state of any kind between runs.
    const signatures = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const { lineages } = sampleLineages({ count: 3, risk: "studio" });
      signatures.add(describeLineage(lineages[0]!));
    }
    expect(signatures.size).toBeGreaterThanOrEqual(9);
  });
});
