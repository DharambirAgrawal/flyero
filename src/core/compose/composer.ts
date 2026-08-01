import * as z from "zod/v4";
import { callStructured, type CallContext } from "../../llm/index.js";
import { catalogueFor, hasComponent } from "../../components/registry.js";
import { METAPHORS } from "../../creative/metaphors.js";
import { TOPOLOGIES } from "../../creative/topologies.js";
import { gestureById } from "../../creative/gestures.js";
import { graphicsById } from "../../creative/graphics.js";
import { typographyById } from "../../creative/typebehaviors.js";
import { CANVAS } from "../../config.js";
import { paletteFor } from "../render/theme.js";
import { fontPairById } from "../../creative/fontpairs.js";
import { safeParseSpec, type DesignSpec, type Lineage } from "./spec.js";
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
  items: z.array(z.string().max(52)).max(5).nullable(),
  primary: z.string().max(40).nullable(),
  secondary: z.string().max(40).nullable(),
  ask: z.string().max(60).nullable(),
  reply: z.string().max(90).nullable(),
  value: z.string().max(8).nullable(),
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
  treatment: z.enum(["solid", "outline", "tinted"]).nullable(),
  state: z.enum(["idle", "active", "resolved"]).nullable(),
});

const composedSchema = z.object({
  elements: z
    .array(
      z.object({
        id: z
          .string()
          .max(40)
          .describe("lowercase kebab-case, unique within the flyer, e.g. 'hero' or 'proof-note'"),
        component: z.string().describe("must be one of the component ids in the catalogue"),
        role: z.enum(["evidence", "message", "support", "cta", "brand", "structure"]),
        whyHere: z
          .string()
          .max(200)
          .describe("What breaks if this element is deleted? Answer concretely."),
        useAssets: z
          .array(z.string())
          .max(2)
          .nullable()
          .describe("assetIds to place inside this component, if any"),
        props: propsSchema,
      }),
    )
    .min(4)
    .max(7),
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
  relationships: z
    .array(
      z.object({
        front: z.string(),
        behind: z.string(),
        overlap: z.number().min(0).max(0.4),
        purpose: z.string().max(200),
      }),
    )
    .max(3),
  gesturePurpose: z.string().max(200),
  qr: z.boolean().describe("Should the CTA carry a scannable QR code? True whenever a URL exists."),
});

export type ComposeInput = {
  brief: Brief;
  idea: IdeaResult;
  lineage: Lineage;
  fixes?: string[];
};

const SYSTEM = `You are the composer for a flyer studio. You translate an idea into a structure:
which components carry it, what role each plays, and how they relate in depth.

WHAT YOU DECIDE: components, roles, relationships, and the short strings inside components.
WHAT YOU NEVER DECIDE: coordinates, sizes, fonts, colours, alignment, spacing. A deterministic
layout engine owns all of that. Do not describe positions in whyHere or purpose.

HARD RULES:

1. Four to seven elements. Not eight. Every element must answer "what breaks if you remove me?"
   in whyHere, concretely. "Adds visual interest" is a deletion, not an answer.
2. Exactly one element with role "evidence" is required, and it is the most important choice
   you make — it is what lets someone identify the product with the logo and headline covered.
   Pick the component that shows the product's subject matter, not a generic frame.
3. Exactly one element with role "cta" and one with role "message".
4. Relationships express meaning, not decoration. If you cannot say what an overlap achieves
   for the reader, do not create it. Zero relationships is a valid answer.
5. Structure components (grids, halftone fields, rules, letterforms) are decoration unless
   something registers against them. Include one only when it does real work — a bare
   decorative grid is auto-rejected by the quality gates.
6. Use the exact component ids from the catalogue. Nothing else exists.
7. Fill props only where the component needs words. Anything you leave null gets a sensible
   default. Never invent statistics for big-numeral or score-ring — use them only when the
   brief supplies a real figure.`;

function composePrompt(input: ComposeInput): string {
  const { brief, idea, lineage } = input;
  const metaphor = METAPHORS.find((m) => m.id === lineage.metaphor)!;
  const topology = TOPOLOGIES.find((t) => t.id === lineage.topology)!;
  const typography = typographyById(lineage.typography);
  const gesture = gestureById(lineage.gesture);
  const graphics = graphicsById(lineage.graphics);

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

CREATIVE POSITION
- Metaphor: ${metaphor.id} — ${metaphor.brief}
- Composition: ${topology.id} — ${topology.brief}
- Typography behaviour: ${typography.id} — ${typography.brief}
- Signature gesture: ${gesture.id} — ${gesture.brief}${requirement}
- Graphic language: ${graphics.id} — ${graphics.brief}
  The engine paints this field itself, behind and around your composition.
  Do NOT spend an element on decoration — your 4-7 elements are content only.

AVAILABLE ASSETS
${assetLines}

COMPONENT CATALOGUE (ids you may use)
${catalogueFor(lineage.topology)}

Compose the flyer.${fixes}`;
}

export type ComposeResult = { spec: DesignSpec; attempts: number };

/**
 * Composes and validates, retrying with the validator's own complaints fed back.
 * A spec that will not validate is never allowed downstream.
 */
export async function compose(
  input: ComposeInput,
  ctx: CallContext,
  maxAttempts = 3,
): Promise<ComposeResult> {
  const palette = paletteFor(input.lineage, input.brief.assets.flatMap((a) => a.palette));
  const fonts = fontPairById(input.lineage.fontPair);
  let errors: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const prompt =
      errors.length > 0
        ? `${composePrompt(input)}

YOUR PREVIOUS ATTEMPT WAS REJECTED BY THE SCHEMA VALIDATOR:
${errors.map((e) => `- ${e}`).join("\n")}

Fix exactly these problems and return the whole structure again.`
        : composePrompt(input);

    const composed = await callStructured(
      {
        role: "planner",
        system: SYSTEM,
        prompt,
        schema: composedSchema,
        schemaName: "design_composition",
        maxTokens: 8000,
        effort: "high",
      },
      ctx,
    );

    const candidate = {
      specVersion: "1.0" as const,
      seed: input.lineage.candidateSeed,
      lineage: input.lineage,
      productName: input.brief.product.name,
      idea: input.idea.idea,
      story: input.idea.story,
      canvas: { ...CANVAS },
      brand: {
        colors: palette,
        fonts: { display: fonts.display, body: fonts.body, mono: fonts.mono ?? null },
      },
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
      elements: composed.elements.map((el) => ({
        id: el.id,
        component: el.component,
        role: el.role,
        whyHere: el.whyHere,
        ...(el.useAssets && el.useAssets.length > 0 ? { assets: el.useAssets } : {}),
        props: stripNulls({
          ...el.props,
          // The headline block needs to know which word the typography singles out.
          ...(el.component === "headline-block" ? { loudWord: input.idea.loudWord } : {}),
        }),
      })),
      relationships: composed.relationships,
      gesture: { type: input.lineage.gesture, purpose: composed.gesturePurpose },
    };

    const result = safeParseSpec(candidate);
    if (result.ok) return { spec: result.spec, attempts: attempt };

    errors = result.errors;
    // Unknown component ids are the most common failure; name them explicitly.
    for (const el of composed.elements) {
      if (!hasComponent(el.component)) {
        errors.push(`component "${el.component}" does not exist — use only catalogue ids`);
      }
    }
  }

  throw new Error(
    `Composer failed to produce a valid spec after ${maxAttempts} attempts: ${errors.join("; ")}`,
  );
}

function stripNulls(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined));
}
