import { isPhotoGround, photoFillsPage } from "../layout/recipes.js";
import { typographyById } from "../../creative/typebehaviors.js";
import { graphicsById, isSilentGraphics } from "../../creative/graphics.js";
import type { Lineage } from "../compose/spec.js";

/**
 * Poster species — the GAP-ANALYSIS finding ("the image is the poster, not an
 * inset" / "the palette commits") made into one sticky, derived label instead
 * of a paragraph an agent has to re-infer from `photoGround`/`typography.
 * participating` every time. Pure function of the sampled lineage: no LLM
 * call, no new sampler dimension, nothing that could desync from the recipe
 * data it reads.
 *
 * - P — photo-is-the-page: the topology's evidence slot IS the canvas
 *   (`photoFillsPage`). Type and marks sit on the photograph.
 * - S — split: a real evidence slab shares the page with type (either a
 *   `photoGround` topology whose slot doesn't reach full bleed, e.g.
 *   oversized-anchor's 82%-height plate, or any topology where type isn't
 *   structurally carrying the page either — the honest middle case).
 * - T — type-is-the-page: no dominant photograph; monumental type plus a
 *   non-silent graphic language carry the composition instead.
 */
export type PosterSpecies = "P" | "T" | "S";

export function deriveSpecies(lineage: Pick<Lineage, "topology" | "typography" | "graphics">): PosterSpecies {
  if (isPhotoGround(lineage.topology)) {
    return photoFillsPage(lineage.topology) ? "P" : "S";
  }
  const typography = typographyById(lineage.typography);
  const graphics = graphicsById(lineage.graphics);
  if (typography.participating && !isSilentGraphics(graphics)) return "T";
  return "S";
}

export const SPECIES_LABEL: Record<PosterSpecies, string> = {
  P: "photo-is-the-page — the photograph IS the canvas; type and marks sit on it, not beside it",
  T: "type-is-the-page — monumental type plus graphic marks carry the page; there is no dominant photograph",
  S: "split — a real evidence slab shares the page with type; neither the photo nor the type is the whole canvas",
};
