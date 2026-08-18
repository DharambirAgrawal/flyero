import { describe, it, expect } from "vitest";
import { deriveSpecies, SPECIES_LABEL } from "../../src/core/studio/species.js";
import { sampleLineages } from "../../src/core/studio/sampler.js";
import { TOPOLOGY_IDS } from "../../src/creative/topologies.js";
import { TYPOGRAPHY_IDS, typographyById } from "../../src/creative/typebehaviors.js";
import { GRAPHICS_IDS, graphicsById, isSilentGraphics } from "../../src/creative/graphics.js";
import { isPhotoGround, photoFillsPage } from "../../src/core/layout/recipes.js";

/**
 * Poster species is a pure derivation of the sampled lineage — the point is
 * that it can never disagree with the recipe/typography/graphics data it
 * reads, because it reads exactly that data and nothing else.
 */
describe("poster species", () => {
  it("assigns P only when the topology's evidence slot fills the page", () => {
    for (const topology of TOPOLOGY_IDS) {
      for (const typography of TYPOGRAPHY_IDS) {
        for (const graphics of GRAPHICS_IDS) {
          const species = deriveSpecies({ topology, typography, graphics });
          if (species === "P") {
            expect(isPhotoGround(topology), topology).toBe(true);
            expect(photoFillsPage(topology), topology).toBe(true);
          }
        }
      }
    }
  });

  it("assigns S for every photoGround topology that doesn't reach full bleed", () => {
    for (const topology of TOPOLOGY_IDS) {
      if (!isPhotoGround(topology) || photoFillsPage(topology)) continue;
      const species = deriveSpecies({ topology, typography: TYPOGRAPHY_IDS[0]!, graphics: GRAPHICS_IDS[0]! });
      expect(species, topology).toBe("S");
    }
  });

  it("assigns T only for non-photoGround topologies with participating type and a non-silent graphic language", () => {
    for (const topology of TOPOLOGY_IDS) {
      for (const typographyId of TYPOGRAPHY_IDS) {
        for (const graphicsId of GRAPHICS_IDS) {
          const species = deriveSpecies({ topology, typography: typographyId, graphics: graphicsId });
          if (species !== "T") continue;
          expect(isPhotoGround(topology), topology).toBe(false);
          expect(typographyById(typographyId).participating, typographyId).toBe(true);
          expect(isSilentGraphics(graphicsById(graphicsId)), graphicsId).toBe(false);
        }
      }
    }
  });

  it("is deterministic — same lineage input always yields the same species", () => {
    for (const topology of TOPOLOGY_IDS) {
      const input = { topology, typography: TYPOGRAPHY_IDS[0]!, graphics: GRAPHICS_IDS[0]! };
      const first = deriveSpecies(input);
      for (let i = 0; i < 5; i++) expect(deriveSpecies(input)).toBe(first);
    }
  });

  it("every topology reaches at least one species across the full typography x graphics grid", () => {
    // Sanity: no topology is silently unclassifiable (would fall through to
    // undefined rather than P/T/S).
    for (const topology of TOPOLOGY_IDS) {
      const species = deriveSpecies({ topology, typography: TYPOGRAPHY_IDS[0]!, graphics: GRAPHICS_IDS[0]! });
      expect(["P", "T", "S"]).toContain(species);
      expect(SPECIES_LABEL[species]).toBeTruthy();
    }
  });

  it("classifies every lineage the sampler actually produces, across many seeds", () => {
    for (let i = 0; i < 50; i++) {
      const { lineages } = sampleLineages({ jobSeed: `species-test-${i}`, count: 3, risk: "studio" });
      for (const lineage of lineages) {
        const species = deriveSpecies(lineage);
        expect(["P", "T", "S"]).toContain(species);
      }
    }
  });
});
