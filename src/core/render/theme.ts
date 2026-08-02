import { fontPairById } from "../../creative/fontpairs.js";
import { materialById } from "../../creative/materials.js";
import { typographyById } from "../../creative/typebehaviors.js";
import { colorLogicById, type Palette } from "../../creative/colorlogic.js";
import { Rng } from "../../lib/rng.js";
import { planLight } from "../canvas/light.js";
import type { Theme } from "../../components/types.js";
import type { DesignSpec, Lineage } from "../compose/spec.js";

/**
 * Everything visual is derived from the lineage plus the seed, so the theme is a
 * pure function of the spec. The Composer never picks a font or a hex value.
 */
export function themeFromSpec(spec: DesignSpec): Theme {
  return {
    palette: spec.brand.colors,
    fonts: fontPairById(spec.lineage.fontPair),
    material: materialById(spec.lineage.material),
    typography: typographyById(spec.lineage.typography),
    // Seeded, so the light is as deterministic as everything else it governs.
    light: planLight(new Rng(`light:${spec.seed}`), spec.brand.colors.fg),
  };
}

/** Generates the palette for a lineage — called once, before the Composer runs. */
export function paletteFor(lineage: Lineage, brandColors: string[]): Palette {
  const rng = new Rng(`palette:${lineage.candidateSeed}`);
  return colorLogicById(lineage.colorLogic).generate(rng, brandColors);
}

export function fontsFor(lineage: Lineage): { display: string; body: string; mono: string | null } {
  const pair = fontPairById(lineage.fontPair);
  return { display: pair.display, body: pair.body, mono: pair.mono ?? null };
}
