import * as z from "zod/v4";
import { callStructured, type CallContext } from "../../llm/index.js";
import { catalogueFor, hasComponent } from "../../components/registry.js";
import { METAPHORS } from "../../creative/metaphors.js";
import { TOPOLOGIES } from "../../creative/topologies.js";
import { gestureById } from "../../creative/gestures.js";
import { graphicsById } from "../../creative/graphics.js";
import { artDirectionById, elementBudgetForDensity } from "../../creative/artdirections.js";
import { isPhotoGround, photoFillsPage } from "../layout/recipes.js";
import { typographyById } from "../../creative/typebehaviors.js";
import { deriveSpecies, SPECIES_LABEL } from "../studio/species.js";
import { DEFAULT_FORMAT, formatById, type FormatId } from "../../creative/formats.js";
import { assembleSpec } from "./assemble.js";
import { compileRecipe, type RecipeFill, type SlotFill } from "./recipe.js";
import type { DesignSpec, Lineage } from "./spec.js";
import type { IdeaResult } from "../idea/index.js";
import type { Brief } from "../brief/index.js";

/**
 * Stage 4 — Composer.
 *
 * Turns the idea into a validated Design Spec: which components, in which roles,
 * with which relationships. It chooses meaning; it never chooses geometry.
 *
 * Component props are expressed as one flat, permissive object rather than a
 * discriminated union — structured outputs need a closed schema, and each
 * component's own zod schema strips what it doesn't use when it renders.
 */

const propsSchema = z.object({
  text: z.string().max(120).nullable(),
  label: z.string().max(48).nullable(),
  title: z.string().max(36).nullable(),
  loudWord: z.string().max(24).nullable(),
  items: z.array(z.string().max(52)).max(5).nullable(),
  primary: z.string().max(40).nullable(),
  secondary: z.string().max(40).nullable(),
  ask: z.string().max(60).nullable(),
  reply: z.string().max(90).nullable(),
  value: z.union([z.string().max(8), z.number().min(0).max(100)]).nullable(),
  caption: z.string().max(44).nullable(),
  character: z.string().max(2).nullable(),
  beforeLabel: z.string().max(18).nullable(),
  afterLabel: z.string().max(18).nullable(),
  tagline: z.string().max(48).nullable(),
  attribution: z.string().max(40).nullable(),
  emphasisRow: z.number().int().min(0).max(8).nullable(),
  strikeRow: z.number().int().min(0).max(8).nullable(),
  resolved: z.number().int().min(0).max(5).nullable(),
  style: z.enum(["underlined", "solid", "bracketed"]).nullable(),
  marker: z.enum(["rule", "index", "dot"]).nullable(),
  treatment: z.enum(["plain", "outline", "shadow", "arch", "plate", "band", "solid", "tinted"]).nullable(),
  state: z.enum(["idle", "active", "resolved"]).nullable(),
  rule: z.boolean().nullable(),
  axis: z.enum(["vertical", "horizontal"]).nullable(),
  display: z.string().max(12).nullable(),
  layout: z.enum(["beside", "above"]).nullable(),
  showName: z.boolean().nullable(),
  fit: z.enum(["cover", "contain"]).nullable(),
  aspect: z.enum(["square", "portrait", "landscape"]).nullable(),
  scrim: z.enum(["none", "bottom", "top", "full"]).nullable(),
  shape: z.enum(["circle", "arch", "pill", "blob"]).nullable(),
  ring: z.boolean().nullable(),
  motif: z.enum(["plane", "pin", "compass", "none"]).nullable(),
  feature: z.boolean().nullable(),
  edge: z.enum(["top", "bottom", "left", "right"]).nullable(),
  backing: z.boolean().nullable(),
  subject: z
    .enum([
      "plane",
      "pin",
      "suitcase",
      "camera",
      "mountain",
      "sun",
      "cloud",
      "leaf",
      "arrow",
      "ticket",
      "compass",
      "forest",
      "meadow",
      "riverside",
      "hills",
    ])
    .nullable(),
  arrangement: z.enum(["halo", "stack", "scatter", "row", "column", "grid"]).nullable(),
  dividers: z.boolean().nullable(),
  uppercaseLabels: z.boolean().nullable(),
  figures: z.boolean().nullable(),
  sun: z.boolean().nullable(),
  curve: z.enum(["straight", "stepped", "curved"]).nullable(),
  arrow: z.boolean().nullable(),
  corners: z.enum(["full", "brackets"]).nullable(),
  orientation: z.enum(["horizontal", "vertical"]).nullable(),
  weight: z.enum(["hair", "medium", "heavy"]).nullable(),
  direction: z.enum(["to-right", "to-bottom", "radial"]).nullable(),
  density: z.number().int().min(1).max(12).nullable(),
  kind: z.enum(["origin", "waypoint", "destination"]).nullable(),
});

const slotSchema = z.object({
  component: z.string().describe("must be one of the component ids in the catalogue"),
  whyHere: z
    .string()
    .max(200)
    .describe("What breaks if this element is deleted? Answer concretely."),
  useAssets: z
    .array(z.string())
    .max(6)
    .nullable()
    .describe("assetIds to place inside this component, if any"),
  props: propsSchema,
});

/**
 * Recipe-shaped, not a free elements/relationships graph (plan item R4): four
 * named slots the engine already knows how to place, plus which asset is the
 * subject. `compileRecipe` (`./recipe.js`) derives the headline's structural
 * relationship and the gesture's required element — this stage decides
 * content, not structure, the same split the agent-native `compose_recipe`
 * surface uses, so the two paths can't drift apart.
 */
const composeRecipeSchema = z.object({
  groundAsset: z
    .string()
    .nullable()
    .describe("The uploaded assetId that IS the subject, when there is a real photo of it. Null otherwise."),
  extraAssets: z.array(z.string()).max(5).nullable(),
  slots: z.object({
    evidence: slotSchema,
    message: slotSchema,
    support: slotSchema,
    cta: slotSchema,
    brand: slotSchema.nullable().describe("A logo/footer element, only when the art direction's density needs it."),
  }),
  extras: z
    .array(slotSchema.extend({ role: z.enum(["support", "structure"]) }))
    .max(3)
    .nullable()
    .describe("Extra content beyond the four named slots, only for a 'balanced'/'rich' density budget."),
  extraOverlap: z
    .object({
      kind: z.enum(["overlap", "weave", "annotate", "connect", "frame"]),
      front: z.enum(["message", "support", "cta", "brand"]),
      behind: z.enum(["evidence", "message", "support", "brand"]),
      overlap: z.number().min(0).max(0.4),
      purpose: z.string().max(200),
    })
    .nullable()
    .describe("One optional relationship beyond the message↔evidence one the engine already derives."),
  /**
   * Small labelled facts — date, place, price, phone, handle.
   *
   * Carried by a single `detail-cluster` element rather than one element per
   * line, so a poster can hold a dozen text objects inside the 4-7 budget Gate
   * G3 enforces. Every value must come from the brief: this is copy, and Gate
   * G6 applies to it exactly as it does to the headline.
   */
  details: z
    .array(
      z.object({
        label: z.string().max(24).describe("e.g. When, Where, Price — one or two words"),
        value: z.string().max(48).describe("the fact itself, taken from the brief"),
      }),
    )
    .max(6)
    .describe("Only facts the brief actually states. Empty when there are none."),
  gesturePurpose: z.string().max(200),
  qr: z.boolean().describe("Should the CTA carry a scannable QR code? True whenever a URL exists."),
});

export type ComposeInput = {
  brief: Brief;
  idea: IdeaResult;
  lineage: Lineage;
  fixes?: string[];
  /** Defaults to the original portrait format so every existing caller is unaffected. */
  format?: FormatId;
};

const SYSTEM = `You are the composer for a flyer studio. You translate an idea into content: which
component fills each of four named slots, which asset is the subject, and the short strings
inside components. The engine derives structure from that — the headline's relationship to the
evidence, and the signature gesture — so you never author a relationships graph by hand.

WHAT YOU DECIDE: which component fills evidence/message/support/cta (and brand, when the density
budget needs a fifth element), groundAsset, and the short strings inside components.
WHAT YOU NEVER DECIDE: coordinates, sizes, fonts, colours, alignment, spacing, or the
relationship graph. A deterministic layout engine owns all of that. Do not describe positions in
whyHere.

HARD RULES:

1. Four named slots (evidence/message/support/cta) are required; add \`brand\` and, only for a
   "balanced"/"rich" density budget, up to 3 \`extras\` to reach the element count the art
   direction requires. Every slot must answer "what breaks if you remove me?" in whyHere,
   concretely. "Adds visual interest" is a deletion, not an answer.
2. \`slots.evidence\` is the most important choice you make — it is what lets someone identify
   the product with the logo and headline covered. Pick the component that shows the product's
   subject matter, not a generic frame. When there is a real photo of the thing, set
   \`groundAsset\` to its assetId — never leave it null just because a component could draw an
   abstraction instead.
3. \`extraOverlap\` is optional and rare — the engine already gives the headline a structural
   relationship to the evidence. Only set it for a second, specific relationship you can name a
   real purpose for (weave, annotate, connect, frame). Null is the normal answer.
4. Structure-role extras (grids, halftone fields, rules, letterforms) are decoration unless
   something registers against them. Include one only when it does real work — a bare
   decorative grid is auto-rejected by the quality gates.
5. Use the exact component ids from the catalogue. Nothing else exists.
6. Fill props only where the component needs words. Anything you leave null gets a sensible
   default. Never invent statistics for big-numeral or score-ring — use them only when the
   brief supplies a real figure.`;

function composePrompt(input: ComposeInput): string {
  const { brief, idea, lineage } = input;
  const metaphor = METAPHORS.find((m) => m.id === lineage.metaphor)!;
  const topology = TOPOLOGIES.find((t) => t.id === lineage.topology)!;
  const typography = typographyById(lineage.typography);
  const gesture = gestureById(lineage.gesture);
  const graphics = graphicsById(lineage.graphics);
  const artDirection = artDirectionById(lineage.artDirection);
  const elementBudget = elementBudgetForDensity(artDirection.density);
  const species = deriveSpecies(lineage);

  const assetLines = brief.assets.length
    ? brief.assets
        .map((a) => `- ${a.assetId} (${a.kind}) suits: ${a.recommendedRoles.join(", ")}`)
        .join("\n")
    : "(none — evidence components draw a credible abstraction of the artefact instead)";

  const requirement = gesture.requires
    ? `\nREQUIRED: the signature gesture "${gesture.id}" can only be expressed through the component "${gesture.requires}". Your elements MUST include one using that component.`
    : "";

  const fixes = input.fixes?.length
    ? `\n\nTHIS IS A REVISION. Apply these specific fixes and change nothing else:\n${input.fixes.map((f) => `- ${f}`).join("\n")}`
    : "";

  const preference = artDirection.preferredComponents?.length
    ? `\nPreferred evidence component(s) for this art direction: ${artDirection.preferredComponents.join(", ")} — reach for one of these over a plainer alternative when an evidence slot fits it.`
    : "";

  const photoPage = isPhotoGround(lineage.topology)
    ? photoFillsPage(lineage.topology)
      ? `\nThis topology makes the photograph the canvas. Evidence MUST be a photograph component (photo-hero, masked-image, torn-photo, polaroid-stack, photo-grid) — not a document-card or a tiny motif. Put the headline overlapping it (relationship kind overlap, headline in front). Prefer treatment plate or band and a solid CTA. Do not add a body paragraph just to fill space; the picture carries the message. A cream page with a small inset is the wrong reading of this assignment.`
      : `\nThe photograph is this layout's visual field — large in the evidence slot this topology declared, not a postage-stamp inset. Evidence MUST be a photograph component. Prefer headline treatment plate or band. Do not add a body paragraph to fill cream space.`
    : "";

  return `THE IDEA (this is what the flyer shows — everything serves it)
${idea.idea}

Story beats: ${idea.story.join(" → ")}

COPY (already written — place it, do not rewrite it)
eyebrow:  ${idea.eyebrow ?? "(none)"}
headline: ${idea.headline}
body:     ${idea.body ?? "(none)"}
cta:      ${idea.ctaLabel}${brief.campaign.cta.url ? ` → ${brief.campaign.cta.url}` : ""}

PRODUCT
${brief.product.name} — ${brief.product.category}
Communication archetype: ${brief.archetype}

CREATIVE POSITION
- Art direction: ${artDirection.id} — ${artDirection.brief}
  Density: ${artDirection.density}; use ${elementBudget.min}-${elementBudget.max} content elements.
  This is one coherent campaign world, not seven independent style requests.
- Metaphor: ${metaphor.id} — ${metaphor.brief}
- Composition: ${topology.id} — ${topology.brief}${photoPage}
- Poster species: ${species} — ${SPECIES_LABEL[species]}
- Typography behaviour: ${typography.id} — ${typography.brief}
- Signature gesture: ${gesture.id} — ${gesture.brief}${requirement}
- Graphic language: ${graphics.id} — ${graphics.brief}
  The engine paints this field itself, behind and around your composition.
  Do NOT spend an element on decoration — your 4-7 elements are content only.

AVAILABLE ASSETS
${assetLines}

COMPONENT CATALOGUE (ids you may use)${preference}
${catalogueFor(lineage.topology)}

Compose the flyer.${fixes}`;
}

export type ComposeResult = { spec: DesignSpec; attempts: number };

/**
 * Composes and validates, retrying with the validator's own complaints fed back.
 * A spec that will not validate is never allowed downstream.
 */
/** LLM output props carry nulls for unset fields; a slot never should. */
function slotFill(el: { component: string; whyHere: string; useAssets: string[] | null; props: Record<string, unknown> }, loudWord: string | null): SlotFill {
  return {
    component: el.component,
    whyHere: el.whyHere,
    ...(el.useAssets && el.useAssets.length > 0 ? { assets: el.useAssets } : {}),
    props: stripNulls({
      ...el.props,
      // The headline block needs to know which word the typography singles out.
      ...(el.component === "headline-block" ? { loudWord } : {}),
    }),
  };
}

export async function compose(
  input: ComposeInput,
  ctx: CallContext,
  maxAttempts = 3,
): Promise<ComposeResult> {
  const brandColors = input.brief.assets.flatMap((a) => a.palette);
  const canvas = formatById(input.format ?? DEFAULT_FORMAT);
  let errors: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const prompt =
      errors.length > 0
        ? `${composePrompt(input)}

YOUR PREVIOUS ATTEMPT WAS REJECTED:
${errors.map((e) => `- ${e}`).join("\n")}

Fix exactly these problems and return the whole structure again.`
        : composePrompt(input);

    const composed = await callStructured(
      {
        role: "planner",
        system: SYSTEM,
        prompt,
        schema: composeRecipeSchema,
        schemaName: "design_composition",
        maxTokens: 8000,
        effort: "high",
      },
      ctx,
    );

    // Unknown component ids are the most common failure; name them explicitly
    // ahead of `compileRecipe`'s own check, so the retry prompt is specific.
    const allComponents = [
      composed.slots.evidence,
      composed.slots.message,
      composed.slots.support,
      composed.slots.cta,
      ...(composed.slots.brand ? [composed.slots.brand] : []),
      ...(composed.extras ?? []),
    ];
    const unknown = allComponents.filter((el) => !hasComponent(el.component));
    if (unknown.length > 0) {
      errors = unknown.map((el) => `component "${el.component}" does not exist — use only catalogue ids`);
      continue;
    }

    const loudWord = input.idea.loudWord;
    const recipeFill: RecipeFill = {
      productName: input.brief.product.name,
      campaignArchetype: input.brief.archetype,
      sourceStatements: input.brief.statements.filter((s) => s.source === "user").map((s) => s.text),
      idea: input.idea.idea,
      story: input.idea.story,
      copy: {
        eyebrow: input.idea.eyebrow,
        headline: input.idea.headline,
        body: input.idea.body,
        cta: {
          label: input.idea.ctaLabel,
          url: input.brief.campaign.cta.url,
          qr: composed.qr && Boolean(input.brief.campaign.cta.url),
        },
        details: composed.details ?? [],
      },
      groundAsset: composed.groundAsset ?? undefined,
      extraAssets: composed.extraAssets ?? undefined,
      slots: {
        evidence: slotFill(composed.slots.evidence, loudWord),
        message: slotFill(composed.slots.message, loudWord),
        support: slotFill(composed.slots.support, loudWord),
        cta: slotFill(composed.slots.cta, loudWord),
        ...(composed.slots.brand ? { brand: slotFill(composed.slots.brand, loudWord) } : {}),
      },
      extras: (composed.extras ?? []).map((el) => ({ ...slotFill(el, loudWord), role: el.role })),
      extraOverlap: composed.extraOverlap ?? undefined,
      gesturePurpose: composed.gesturePurpose,
    };

    const compiled = compileRecipe(input.lineage, recipeFill);
    if (!compiled.ok) {
      errors = compiled.errors;
      continue;
    }

    const direction = artDirectionById(input.lineage.artDirection);
    const budget = elementBudgetForDensity(direction.density);
    const count = compiled.authored.elements.length;
    if (count < budget.min || count > budget.max) {
      errors = [
        `${direction.id} is a ${direction.density} art direction and requires ${budget.min}-${budget.max} content elements; the filled recipe produced ${count} — add or drop a \`brand\` slot or an \`extras\` entry.`,
      ];
      continue;
    }

    const result = assembleSpec(input.lineage, compiled.authored, brandColors, canvas);
    if (result.ok) return { spec: result.spec, attempts: attempt };

    errors = result.errors;
  }

  throw new Error(
    `Composer failed to produce a valid spec after ${maxAttempts} attempts: ${errors.join("; ")}`,
  );
}

function stripNulls(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined));
}
