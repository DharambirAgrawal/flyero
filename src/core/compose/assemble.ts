import { CANVAS } from "../../config.js";
import { fontPairById } from "../../creative/fontpairs.js";
import { paletteFor } from "../render/theme.js";
import { safeParseSpec, type DesignSpec, type Lineage, type SpecParseResult } from "./spec.js";

/**
 * Assembles a Design Spec from the parts an author decides (idea, story, copy,
 * elements, relationships) plus the parts the engine owns (palette, fonts,
 * canvas, seed).
 *
 * Both authors go through here: the in-house Composer stage when a model key is
 * configured, and an external agent driving the REST API. Neither one gets to
 * choose a colour or a font — those are derived from the lineage, which is why
 * the same lineage always looks like itself.
 */

export type AuthoredSpec = {
  productName: string;
  idea: string;
  story: [string, string, string, string];
  copy: {
    eyebrow: string | null;
    headline: string;
    body: string | null;
    cta: { label: string; url: string | null; qr: boolean };
  };
  elements: Array<{
    id: string;
    component: string;
    role: string;
    whyHere: string;
    assets?: string[];
    props?: Record<string, unknown>;
  }>;
  relationships: Array<{
    front: string;
    behind: string;
    overlap?: number;
    purpose: string;
  }>;
  gesturePurpose: string;
};

export function assembleSpec(
  lineage: Lineage,
  authored: AuthoredSpec,
  brandColors: string[] = [],
): SpecParseResult {
  const palette = paletteFor(lineage, brandColors);
  const fonts = fontPairById(lineage.fontPair);

  return safeParseSpec({
    specVersion: "1.0",
    seed: lineage.candidateSeed,
    lineage,
    productName: authored.productName,
    idea: authored.idea,
    story: authored.story,
    canvas: { ...CANVAS },
    brand: {
      colors: palette,
      fonts: { display: fonts.display, body: fonts.body, mono: fonts.mono ?? null },
    },
    copy: authored.copy,
    elements: authored.elements.map((el) => ({
      id: el.id,
      component: el.component,
      role: el.role,
      whyHere: el.whyHere,
      ...(el.assets && el.assets.length > 0 ? { assets: el.assets } : {}),
      ...(el.props ? { props: el.props } : {}),
    })),
    relationships: authored.relationships,
    gesture: { type: lineage.gesture, purpose: authored.gesturePurpose },
  });
}

export type { DesignSpec, Lineage };
