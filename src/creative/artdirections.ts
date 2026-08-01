import type {
  ArtDirectionId,
  CampaignArchetype,
  ColorLogicId,
  GestureId,
  GraphicsId,
  MaterialId,
  MetaphorId,
  TopologyId,
  TypographyId,
} from "./types.js";

export type Density = "quiet" | "balanced" | "rich";

/**
 * An art direction is a coherent family of choices, not a template.
 *
 * It contains no coordinates and chooses no component. The sampler still rolls
 * a fresh lineage inside each family, but it can no longer combine seven
 * individually reasonable dimensions into one visually contradictory flyer.
 */
export type ArtDirection = {
  id: ArtDirectionId;
  brief: string;
  adventurousness: 1 | 2 | 3;
  archetypes: readonly CampaignArchetype[];
  density: Density;
  metaphors: readonly MetaphorId[];
  topologies: readonly TopologyId[];
  typography: readonly TypographyId[];
  materials: readonly MaterialId[];
  colorLogic: readonly ColorLogicId[];
  gestures: readonly GestureId[];
  graphics: readonly GraphicsId[];
  /**
   * Evidence components that best express this direction's personality.
   * The Composer sees these as a preference, not a requirement — unlike
   * `requires` on a gesture, the catalogue still lists every valid
   * component for the topology.
   */
  preferredComponents?: readonly string[];
};

export const ART_DIRECTIONS: readonly ArtDirection[] = [
  {
    id: "editorial-impact",
    brief: "Edited magazine discipline: decisive type, asymmetric image placement and very little ornament.",
    adventurousness: 1,
    archetypes: ["product-promotion", "editorial-announcement", "offer-promotion"],
    density: "quiet",
    metaphors: ["annotation-editorial", "magnification", "lens", "signal-from-noise"],
    topologies: ["split-editorial", "off-center-hero", "framed-evidence", "type-poster"],
    typography: ["editorial-annotated", "compressed-monumental", "quiet-with-one-loud-word"],
    materials: ["ink-on-cream", "soft-industrial", "printed-halftone"],
    colorLogic: ["single-accent-on-action", "warm-neutral-cool-accent", "monochrome-with-signal"],
    gestures: ["one-rotated-element", "intentional-crop-of-hero", "rule-line-pierces-block"],
    graphics: ["editorial-restraint", "swiss-grid", "halftone-pop"],
  },
  {
    id: "photographic-campaign",
    brief: "The photograph is the field; type and one graphic move are integrated into the subject.",
    adventurousness: 1,
    archetypes: ["product-promotion", "event-invitation", "offer-promotion", "editorial-announcement"],
    density: "balanced",
    metaphors: ["growth", "lens", "magnification", "threshold-door", "signal-from-noise"],
    topologies: ["diagonal-progression", "oversized-anchor", "layered-depth-stack", "off-center-hero", "banded-masthead"],
    typography: ["editorial-annotated", "compressed-monumental", "woven-through-image", "masked-by-subject"],
    materials: ["soft-industrial", "printed-halftone", "ink-on-cream"],
    colorLogic: ["saturated-field", "duotone-evidence", "tinted-ground", "single-accent-on-action"],
    gestures: ["hero-overlaps-eyebrow", "intentional-crop-of-hero", "headline-behind-subject"],
    graphics: ["editorial-restraint", "organic-blobs", "botanical-frame"],
  },
  {
    id: "rational-information",
    brief: "Information is the visual material: measured sections, precise labels and a strong reading system.",
    adventurousness: 1,
    archetypes: ["awareness-education", "editorial-announcement", "product-promotion"],
    density: "rich",
    metaphors: ["annotation-editorial", "signal-from-noise", "magnification", "assembly-compile"],
    topologies: ["vertical-narrative", "asymmetric-two-column", "section-stack", "split-editorial"],
    typography: ["editorial-annotated", "technical-mono-accents", "stacked-contrast"],
    materials: ["technical-paper", "optical-diagnostic", "soft-industrial"],
    colorLogic: ["single-accent-on-action", "paper-and-ink", "monochrome-with-signal", "colour-block-duo"],
    gestures: ["hero-overlaps-eyebrow", "annotation-breaks-margin", "rule-line-pierces-block", "path-becomes-cta-underline"],
    graphics: ["swiss-grid", "editorial-restraint", "dashed-cartography"],
  },
  {
    id: "crafted-collage",
    brief: "Tactile cut-and-paste storytelling: layered photographs, torn stock and controlled imperfection.",
    adventurousness: 2,
    archetypes: ["event-invitation", "editorial-announcement", "product-promotion", "awareness-education"],
    density: "rich",
    metaphors: ["constellation", "assembly-compile", "conversation", "growth"],
    topologies: ["layered-depth-stack", "zigzag-path", "radial-field", "framed-evidence"],
    typography: ["quiet-with-one-loud-word", "stacked-contrast", "baseline-broken"],
    materials: ["ink-on-cream", "printed-halftone", "soft-industrial"],
    colorLogic: ["warm-neutral-cool-accent", "paper-and-ink", "colour-block-duo", "two-accent-before-after"],
    gestures: ["one-rotated-element", "element-escapes-canvas", "annotation-breaks-margin"],
    graphics: ["paper-collage", "sticker-sheet", "organic-blobs"],
    preferredComponents: ["polaroid-stack", "torn-photo"],
  },
  {
    id: "retro-event",
    brief: "A printed event poster: monumental type, bands, punchy flat colour and period-shaped marks.",
    adventurousness: 2,
    archetypes: ["event-invitation", "offer-promotion", "editorial-announcement"],
    density: "balanced",
    metaphors: ["threshold-door", "constellation", "conversation", "growth"],
    topologies: ["banded-masthead", "type-poster", "radial-field", "framed-centre"],
    typography: ["compressed-monumental", "stacked-contrast", "baseline-broken"],
    materials: ["printed-halftone", "ink-on-cream"],
    colorLogic: ["saturated-field", "colour-block-duo", "warm-neutral-cool-accent"],
    gestures: ["one-rotated-element", "number-bleeds-off-edge", "element-escapes-canvas"],
    graphics: ["retro-stripes", "halftone-pop", "geometric-memphis"],
  },
  {
    id: "botanical-celebration",
    brief: "Warm celebratory framing: organic shapes, botanical marks and personal image treatments.",
    adventurousness: 2,
    archetypes: ["event-invitation", "offer-promotion", "product-promotion"],
    density: "rich",
    metaphors: ["growth", "constellation", "lens", "conversation"],
    topologies: ["framed-centre", "radial-field", "banded-masthead", "off-center-hero"],
    typography: ["quiet-with-one-loud-word", "stacked-contrast", "editorial-annotated"],
    materials: ["soft-industrial", "ink-on-cream", "printed-halftone"],
    colorLogic: ["warm-neutral-cool-accent", "tinted-ground", "saturated-field"],
    gestures: ["one-rotated-element", "hero-overlaps-eyebrow", "intentional-crop-of-hero"],
    graphics: ["botanical-frame", "organic-blobs", "sticker-sheet"],
    preferredComponents: ["polaroid-stack", "torn-photo"],
  },
  {
    id: "cartographic-story",
    brief: "The eye follows a route: connected evidence, waypoints and labels make progress visible.",
    adventurousness: 2,
    archetypes: ["awareness-education", "event-invitation", "product-promotion"],
    density: "balanced",
    metaphors: ["cartography", "constellation", "assembly-compile", "threshold-door"],
    topologies: ["diagonal-progression", "zigzag-path", "radial-field", "section-stack"],
    typography: ["editorial-annotated", "technical-mono-accents", "stacked-contrast"],
    materials: ["technical-paper", "ink-on-cream", "printed-halftone"],
    colorLogic: ["duotone-evidence", "single-accent-on-action", "colour-block-duo"],
    gestures: ["path-becomes-cta-underline", "annotation-breaks-margin", "element-escapes-canvas"],
    graphics: ["dashed-cartography", "swiss-grid", "editorial-restraint"],
  },
  {
    id: "document-transformation",
    brief: "The artefact is the proof: documents, interfaces and annotations visibly change state.",
    adventurousness: 1,
    archetypes: ["product-promotion", "awareness-education", "editorial-announcement"],
    density: "balanced",
    metaphors: ["transformation", "before-after-fold", "annotation-editorial", "signal-from-noise", "assembly-compile"],
    topologies: ["split-editorial", "framed-evidence", "asymmetric-two-column", "section-stack"],
    typography: ["technical-mono-accents", "editorial-annotated", "stacked-contrast"],
    materials: ["technical-paper", "optical-diagnostic", "soft-industrial"],
    colorLogic: ["single-accent-on-action", "paper-and-ink", "two-accent-before-after"],
    gestures: ["hero-overlaps-eyebrow", "path-becomes-cta-underline", "rule-line-pierces-block"],
    graphics: ["swiss-grid", "editorial-restraint", "halftone-pop"],
  },
  {
    id: "maximal-pop",
    brief: "One loud campaign world: monumental type, saturated blocks and a deliberately dense graphic field.",
    adventurousness: 3,
    archetypes: ["event-invitation", "offer-promotion", "awareness-education"],
    density: "rich",
    metaphors: ["conversation", "constellation", "threshold-door", "growth"],
    topologies: ["type-poster", "banded-masthead", "layered-depth-stack", "radial-field"],
    typography: ["compressed-monumental", "baseline-broken", "masked-by-subject"],
    materials: ["printed-halftone", "chromatic-glass"],
    colorLogic: ["saturated-field", "colour-block-duo", "two-accent-before-after", "inverted-dark-field"],
    gestures: ["number-bleeds-off-edge", "oversized-letterform-as-structure", "element-escapes-canvas"],
    graphics: ["sticker-sheet", "geometric-memphis", "halftone-pop"],
  },
  {
    id: "cinematic-minimal",
    brief: "A single dominant image or word with cinematic restraint and one exact interruption.",
    adventurousness: 1,
    archetypes: ["product-promotion", "editorial-announcement", "offer-promotion"],
    density: "quiet",
    metaphors: ["lens", "magnification", "signal-from-noise", "transformation"],
    topologies: ["off-center-hero", "framed-evidence", "oversized-anchor", "type-poster"],
    typography: ["editorial-annotated", "quiet-with-one-loud-word", "woven-through-image"],
    materials: ["soft-industrial", "ink-on-cream"],
    colorLogic: ["paper-and-ink", "single-accent-on-action", "inverted-dark-field"],
    gestures: ["one-rotated-element", "hero-overlaps-eyebrow", "headline-behind-subject"],
    graphics: ["editorial-restraint", "organic-blobs"],
  },
] as const;

export const ART_DIRECTION_IDS = ART_DIRECTIONS.map((d) => d.id) as ArtDirectionId[];

export function artDirectionById(id: ArtDirectionId): ArtDirection {
  const found = ART_DIRECTIONS.find((d) => d.id === id);
  if (!found) throw new Error(`Unknown art direction ${id}`);
  return found;
}

export function elementBudgetForDensity(density: Density): { min: number; max: number } {
  if (density === "quiet") return { min: 4, max: 5 };
  if (density === "balanced") return { min: 5, max: 6 };
  return { min: 6, max: 7 };
}
