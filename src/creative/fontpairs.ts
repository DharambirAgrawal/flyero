import type { MaterialId, TypographyId } from "./types.js";

/**
 * 17 curated open-license pairings. The model never picks fonts freeform
 * (REQUIREMENTS.md §6) — it inherits the pairing implied by its lineage.
 * Every family here must exist in FONTS_DIR (see scripts/install-fonts.ts).
 */
export type FontPair = {
  id: string;
  display: string;
  body: string;
  /** Mono family for technical labels; falls back to body when absent. */
  mono?: string;
  /**
   * A second, deliberately different register — a script or handwritten
   * family a `word` part in `composed-figure` can opt into, so a composition
   * can mix a bold display headline with a flowing name/accent word ("HAPPY
   * BIRTHDAY" + "Samira!") without every headline in the flyer switching to
   * script. Only defined on pairs where it was chosen on purpose to sit next
   * to that pair's display font; absent everywhere else, and callers must
   * fall back to `display` when it's missing rather than assume it exists.
   */
  accent?: string;
  accentWeight?: number;
  /** Weights the renderer is allowed to request for each role. */
  weights: { display: number; body: number; label: number };
  materials: MaterialId[];
  typography: TypographyId[];
};

export const FONT_PAIRS: readonly FontPair[] = [
  {
    id: "fraunces-inter",
    display: "Fraunces",
    body: "Inter",
    weights: { display: 900, body: 400, label: 600 },
    materials: ["ink-on-cream", "printed-halftone", "technical-paper"],
    typography: ["editorial-annotated", "quiet-with-one-loud-word", "stacked-contrast", "baseline-broken"],
  },
  {
    id: "archivo-inter",
    display: "Archivo",
    body: "Inter",
    weights: { display: 900, body: 400, label: 600 },
    materials: ["soft-industrial", "optical-diagnostic", "technical-paper", "chromatic-glass"],
    typography: ["compressed-monumental", "masked-by-subject", "stacked-contrast", "woven-through-image"],
  },
  {
    id: "spacegrotesk-ibmplex",
    display: "Space Grotesk",
    body: "IBM Plex Sans",
    mono: "IBM Plex Mono",
    weights: { display: 700, body: 400, label: 500 },
    materials: ["optical-diagnostic", "technical-paper", "soft-industrial"],
    typography: ["technical-mono-accents", "editorial-annotated", "compressed-monumental", "baseline-broken"],
  },
  {
    id: "dmserif-inter",
    display: "DM Serif Display",
    body: "Inter",
    weights: { display: 400, body: 400, label: 600 },
    materials: ["ink-on-cream", "printed-halftone", "soft-industrial"],
    typography: ["quiet-with-one-loud-word", "stacked-contrast", "editorial-annotated"],
  },
  {
    id: "sora-ibmplex",
    display: "Sora",
    body: "IBM Plex Sans",
    mono: "IBM Plex Mono",
    weights: { display: 800, body: 400, label: 600 },
    materials: ["soft-industrial", "chromatic-glass", "optical-diagnostic"],
    typography: ["compressed-monumental", "woven-through-image", "masked-by-subject", "technical-mono-accents"],
  },
  {
    id: "librefranklin-newsreader",
    display: "Libre Franklin",
    body: "Newsreader",
    weights: { display: 900, body: 400, label: 600 },
    materials: ["printed-halftone", "ink-on-cream", "technical-paper"],
    typography: ["compressed-monumental", "editorial-annotated", "stacked-contrast"],
  },
  {
    id: "instrumentserif-inter",
    display: "Instrument Serif",
    body: "Inter",
    weights: { display: 400, body: 400, label: 500 },
    materials: ["ink-on-cream", "soft-industrial", "printed-halftone"],
    typography: ["quiet-with-one-loud-word", "baseline-broken", "masked-by-subject"],
  },
  {
    id: "archivo-jetbrains",
    display: "Archivo",
    body: "Inter",
    mono: "JetBrains Mono",
    weights: { display: 800, body: 400, label: 500 },
    materials: ["optical-diagnostic", "technical-paper", "chromatic-glass"],
    typography: ["technical-mono-accents", "compressed-monumental", "woven-through-image"],
  },
  {
    id: "newsreader-inter",
    display: "Newsreader",
    body: "Inter",
    weights: { display: 700, body: 400, label: 600 },
    materials: ["ink-on-cream", "technical-paper", "printed-halftone"],
    typography: ["editorial-annotated", "quiet-with-one-loud-word", "baseline-broken"],
  },
  {
    id: "spacegrotesk-inter",
    display: "Space Grotesk",
    body: "Inter",
    weights: { display: 700, body: 400, label: 600 },
    materials: ["soft-industrial", "optical-diagnostic", "chromatic-glass", "technical-paper"],
    typography: ["stacked-contrast", "masked-by-subject", "compressed-monumental", "woven-through-image"],
  },
  {
    id: "anton-inter",
    display: "Anton",
    body: "Inter",
    // Anton ships one weight; asking for 900 would silently fall back.
    weights: { display: 400, body: 400, label: 600 },
    accent: "Great Vibes",
    accentWeight: 400,
    materials: ["printed-halftone", "soft-industrial", "chromatic-glass"],
    typography: ["compressed-monumental", "masked-by-subject", "stacked-contrast"],
  },
  {
    id: "caveat-archivonarrow",
    display: "Caveat",
    body: "Archivo Narrow",
    weights: { display: 700, body: 400, label: 600 },
    materials: ["ink-on-cream", "printed-halftone"],
    typography: ["quiet-with-one-loud-word", "baseline-broken", "editorial-annotated"],
  },
  {
    id: "greatvibes-librefranklin",
    display: "Great Vibes",
    body: "Libre Franklin",
    weights: { display: 400, body: 400, label: 600 },
    materials: ["ink-on-cream", "chromatic-glass"],
    typography: ["quiet-with-one-loud-word", "stacked-contrast"],
  },
  {
    id: "robotoslab-inter",
    display: "Roboto Slab",
    body: "Inter",
    weights: { display: 900, body: 400, label: 600 },
    materials: ["technical-paper", "printed-halftone", "soft-industrial"],
    typography: ["editorial-annotated", "stacked-contrast", "compressed-monumental"],
  },
  {
    id: "archivonarrow-robotoslab",
    display: "Archivo Narrow",
    body: "Roboto Slab",
    weights: { display: 700, body: 400, label: 600 },
    materials: ["optical-diagnostic", "technical-paper"],
    typography: ["technical-mono-accents", "compressed-monumental", "woven-through-image"],
  },
  {
    id: "permanentmarker-nunito",
    display: "Permanent Marker",
    body: "Nunito",
    // Permanent Marker ships one weight; asking for another would silently fall back.
    weights: { display: 400, body: 700, label: 800 },
    materials: ["ink-on-cream", "printed-halftone"],
    typography: ["stacked-contrast", "baseline-broken", "quiet-with-one-loud-word"],
  },
  {
    id: "bungee-inter",
    display: "Bungee",
    body: "Inter",
    // Bungee ships one weight; asking for another would silently fall back.
    weights: { display: 400, body: 400, label: 600 },
    accent: "Great Vibes",
    accentWeight: 400,
    materials: ["printed-halftone", "ink-on-cream"],
    typography: ["compressed-monumental", "stacked-contrast", "baseline-broken"],
  },
] as const;

export const FONT_FAMILIES = Array.from(
  new Set(FONT_PAIRS.flatMap((p) => [p.display, p.body, p.mono].filter(Boolean) as string[])),
);

/** Pairings valid for a lineage; never empty — falls back to material-compatible pairs. */
export function pairsFor(material: MaterialId, typography: TypographyId): FontPair[] {
  const both = FONT_PAIRS.filter(
    (p) => p.materials.includes(material) && p.typography.includes(typography),
  );
  if (both.length > 0) return both;
  const byMaterial = FONT_PAIRS.filter((p) => p.materials.includes(material));
  if (byMaterial.length > 0) return byMaterial;
  return [...FONT_PAIRS];
}

/** Looks up a pairing by id; throws rather than silently substituting a face. */
export function fontPairById(id: string): FontPair {
  const pair = FONT_PAIRS.find((p) => p.id === id);
  if (!pair) throw new Error(`Unknown font pair ${JSON.stringify(id)}`);
  return pair;
}
