import type { FastifyInstance, FastifyReply } from "fastify";
import { ulid } from "ulid";
import { z } from "zod";
import { config, type Risk } from "../config.js";
import { guideMarkdown } from "./guide.js";
import { newJobSeed, sampleLineages } from "../core/studio/sampler.js";
import { copySchema, lineageSchema, type Lineage } from "../core/compose/spec.js";
import { rehydrateTone } from "../core/canvas/tone.js";
import { assembleSpec, type AuthoredSpec, type DesignSpec } from "../core/compose/assemble.js";
import { renderSpec, rasterize } from "../core/render/index.js";
import { paletteFor } from "../core/render/theme.js";
import { fontPairById } from "../creative/fontpairs.js";
import { METAPHORS } from "../creative/metaphors.js";
import { TOPOLOGIES } from "../creative/topologies.js";
import { typographyById } from "../creative/typebehaviors.js";
import { materialById } from "../creative/materials.js";
import { colorLogicById } from "../creative/colorlogic.js";
import { gestureById } from "../creative/gestures.js";
import { graphicsById } from "../creative/graphics.js";
import { artDirectionById, elementBudgetForDensity } from "../creative/artdirections.js";
import { DEFAULT_FORMAT, FORMAT_IDS, formatById, type FormatId } from "../creative/formats.js";
import { recipeFor } from "../core/layout/recipes.js";
import { componentPropsSchema, engineOwnedPropsFor, manifestsFor } from "../components/registry.js";
import { runGates, failedGateIds, visionVerdictSchema } from "../core/gates/index.js";
import { ruleCritic, describeFix } from "../core/critic/index.js";
import { checkEditability, exportFlyer } from "../core/export/index.js";
import { getAsset, getAssets, assetDataUri } from "../store/assets.js";
import {
  createJob,
  getJob,
  getRevision,
  saveProcessLog,
  saveRevision,
  updateJob,
} from "../store/jobs.js";
import type { AssetRef } from "../components/types.js";

/**
 * The agent-driven surface.
 *
 * These routes exist so a reasoning agent — a Claude Code session, say — can be
 * the studio's creative director without this service holding a model key. The
 * agent supplies meaning; the engine supplies geometry, judgement-by-code, and
 * an honest verdict. The division of labour is identical to the in-house
 * pipeline; only the author changes.
 */


/**
 * A complete, valid composition.
 *
 * Published because two separate agents burned fifteen attempts each guessing
 * at this shape. The tool description said "read the design guide for the
 * shape" and the guide described it in prose — which is not something you can
 * copy. An example you can paste and edit is worth more than any schema.
 */
export const COMPOSITION_EXAMPLE = {
  lineage: "<<paste the `lineage` object from request_designers, unchanged>>",
  productName: "Nepal",
  /* What the user actually said. Every claim on the flyer must trace to a line
     here — Gate G6 checks it, and this is the field agents most often omit. */
  sourceStatements: [
    "We run guided one-week treks in the Kathmandu valley and the ridges above it.",
    "Mornings are spent at the temples, evenings on the ridgeline.",
  ],
  idea: "The peak you can see from the city is the one you can walk to.",
  story: [
    "A valley full of temples.",
    "A ridge behind it.",
    "A peak behind that.",
    "All of it in one week.",
  ],
  copy: {
    eyebrow: "HIMALAYA",
    headline: "Walk to the view",
    body: "Temples in the morning, a ridgeline by evening.",
    cta: { label: "Start planning", url: null, qr: false },
    details: [],
  },
  elements: [
    {
      id: "message",
      component: "headline-block",
      role: "message",
      whyHere: "The one idea, in four words.",
      props: { treatment: "plain" },
    },
    {
      id: "hero",
      component: "photo-hero",
      role: "evidence",
      whyHere: "The mountain itself — without it the cover test fails.",
      assets: ["<<assetId from import_image>>"],
      props: {},
    },
    {
      id: "note",
      component: "body-paragraph",
      role: "support",
      whyHere: "Says what a week actually contains.",
      props: {},
    },
    {
      id: "action",
      component: "cta-button",
      role: "cta",
      whyHere: "The one thing to do.",
      props: {},
    },
    {
      id: "who",
      component: "footer-lockup",
      role: "brand",
      whyHere: "Names who is offering the trip.",
      props: {},
    },
  ],
  relationships: [],
  gesturePurpose:
    "Explains the single deliberate rule-break your lineage's gesture applies.",
  assetIds: ["<<same assetIds as above>>"],
  brandColors: [],
} as const;

/**
 * A second example, and the reason there are two.
 *
 * The instructions tell an agent to fetch an example and copy it, which makes
 * this text the strongest signal in the whole system — stronger than any prose
 * in the guide. With one example on offer it stops being a demonstration of the
 * *shape* and becomes a template of the *flyer*: a photograph, a paragraph and
 * a button, four elements, lots of paper. That is exactly what real output kept
 * coming back as, and it is the same failure as describing only seven of
 * thirty-five components — whatever we show is what gets built.
 *
 * So this one is deliberately unlike the other: no photograph at all, a figure
 * assembled for the occasion, and a fact cluster carrying five things as one
 * element. Two examples read as a range to choose from; one reads as the
 * answer.
 */
export const COMPOSITION_EXAMPLE_ASSEMBLED = {
  lineage: "<<paste the `lineage` object from request_designers, unchanged>>",
  productName: "Kestrel Park",
  /*
   * Every fact below traces to one of these lines.
   *
   * Without them this example composed and then failed Gate G6 — correctly,
   * because a date and a meeting point are exactly the kind of thing a model
   * invents. An example that quietly fails a gate is worse than no example: it
   * teaches the shape *and* the mistake, and the agent copying it has no idea
   * why its flyer was rejected. `sourceStatements` is where the user's own
   * words go, and G6 checks every detail value against them.
   */
  sourceStatements: [
    "We are running a community planting day on Sat 17 June, 10am.",
    "Meet at Kestrel Park, north gate.",
    "Bring gloves if you have them and we will have spares.",
  ],
  idea: "A patch of scrubland is handed back to the people who live beside it.",
  story: [
    "A fenced-off corner nobody uses.",
    "One Saturday, forty pairs of hands.",
    "Beds dug, a path laid, a bench.",
    "It reopens as a garden.",
  ],
  copy: {
    eyebrow: "COMMUNITY PLANTING DAY",
    headline: "Dig in",
    body: null,
    cta: { label: "Come along", url: null, qr: false },
    details: [
      { label: "When", value: "Sat 17 June, 10am" },
      { label: "Where", value: "Kestrel Park, north gate" },
      { label: "Bring", value: "Gloves if you have them" },
    ],
  },
  elements: [
    {
      id: "message",
      component: "headline-block",
      role: "message",
      whyHere: "Two words carry the whole invitation.",
      props: {},
    },
    {
      /*
       * The evidence is drawn, not photographed. There is no honest photograph
       * of a garden that does not exist yet, and a stock picture of somebody
       * else's garden would fail the cover test while pretending to pass it.
       */
      id: "scene",
      component: "composed-figure",
      role: "evidence",
      whyHere: "Shows the garden being made — no photograph of it exists yet.",
      props: {
        parts: [
          {
            id: "ground",
            draw: { kind: "shape", form: "blob" },
            size: "huge",
            at: { at: "center" },
            tone: "ground",
            layer: "behind",
          },
          {
            id: "sun",
            draw: { kind: "motif", motif: "sun" },
            size: "small",
            at: { of: "ground", side: "top-right-of", gap: "tight" },
            tone: "accent",
          },
          {
            id: "leaf-a",
            draw: { kind: "motif", motif: "leaf" },
            size: "medium",
            at: { of: "ground", side: "on" },
            tone: "ink",
            rotate: -14,
          },
          {
            id: "leaf-b",
            draw: { kind: "motif", motif: "leaf" },
            size: "small",
            at: { of: "leaf-a", side: "right-of", gap: "near" },
            tone: "accent",
            rotate: 18,
          },
          {
            id: "path",
            draw: { kind: "shape", form: "squiggle" },
            size: "large",
            at: { of: "ground", side: "below", gap: "tight" },
            tone: "muted",
          },
        ],
      },
    },
    {
      /* Five facts, one element. This is how a page gets full without spending
         the whole 4-7 budget on single lines of text. */
      id: "facts",
      component: "detail-cluster",
      role: "support",
      whyHere: "When, where and what to bring — nobody turns up without these.",
      props: {},
    },
    {
      id: "action",
      component: "cta-button",
      role: "cta",
      whyHere: "The one thing to do.",
      props: {},
    },
    {
      id: "who",
      component: "footer-lockup",
      role: "brand",
      whyHere: "Says who is organising it.",
      props: {},
    },
    {
      id: "frame",
      component: "eyebrow-label",
      role: "support",
      whyHere: "Names the kind of event before the two-word headline lands.",
      props: {},
    },
  ],
  relationships: [],
  gesturePurpose:
    "Explains the single deliberate rule-break your lineage's gesture applies.",
  assetIds: [],
  brandColors: [],
} as const;

/**
 * The rules that are not visible from the example alone.
 */
export const COMPOSITION_NOTES = [
  "`lineage` must be the object from request_designers, copied unchanged. Do not rebuild or trim it.",
  "Each element needs `whyHere` — not `purpose`, not `why`. Gate G3 rejects an element that cannot justify itself.",
  "`role` is singular, one of: evidence | message | support | cta | brand | structure.",
  "You need exactly one `message` and one `cta`, and at least one `evidence`.",
  "Element count is 4-7 overall, but your assignment narrows it: quiet 4-5, balanced 5-6, rich 6-7. Check `direction.density` and count before you send — the two examples are different sizes on purpose, because no single count is valid for every assignment.",
  "`assets` goes on the element that displays the image; `assetIds` at the top level lists every asset used.",
  "`props` may only contain keys that component declares. Engine-owned props (positions, scrims, alignment) are rejected.",
  "`copy.cta.url` may be null. Do not invent a web address.",
  "`sourceStatements` is the user's own words, and Gate G6 checks every `copy.details` value against it. Omit it and any date, place or price you show is treated as invented — which is exactly what it would be. This is the field agents forget most often.",
  "The check is a literal one: each `details` value must appear verbatim inside one source statement (case and punctuation are ignored, wording is not). Writing \"Sat 17 June, 10am\" when the user said \"Saturday the 17th at ten\" fails, and should — paraphrasing a date is how wrong dates get printed. Quote the user, or put your wording into `sourceStatements` only if that is genuinely what they said.",
  "Never send colours, fonts, sizes or coordinates. They come from the lineage.",
  "Two examples are returned, not one. Read both before copying either: `photo-led` when there is something real to photograph, `assembled` when there is not, or when the page would otherwise be four things on a lot of paper.",
  "`composed-figure` places parts by relationship (`{ of: \"sun\", side: \"top-right-of\", gap: \"near\" }`), never by coordinate, and counts as ONE element while carrying up to eight parts. It is the tool for a one-off arrangement and the tool for density.",
  "Read each component's LOOKS LIKE line before choosing. Picking by name alone is how every flyer ends up built from the same three components.",
] as const;

const authoredSchema = z.object({
  lineage: lineageSchema,
  /**
   * Canvas size. Omit when recomposing an existing `flyerId` to keep its
   * current canvas; omit with no `flyerId` for the original Instagram
   * portrait. Only set this to actually change format.
   */
  format: z.enum(FORMAT_IDS as [FormatId, ...FormatId[]]).optional(),
  productName: z.string().min(1).max(60),
  campaignArchetype: z
    .enum([
      "product-promotion",
      "event-invitation",
      "awareness-education",
      "editorial-announcement",
      "offer-promotion",
    ])
    .default("product-promotion"),
  sourceStatements: z.array(z.string().min(1).max(300)).max(40).default([]),
  idea: z.string().min(10).max(140),
  story: z.tuple([z.string(), z.string(), z.string(), z.string()]),
  /**
   * The one copy schema, not a second copy of it.
   *
   * This used to re-declare the shape by hand — and drifted: `copy.details`
   * was added to `copySchema` and the component library, but never here, so
   * every fact cluster an agent sent was silently stripped at the API boundary
   * and no flyer produced through the real path could ever show one. A schema
   * duplicated is a schema that will disagree.
   */
  copy: copySchema,
  elements: z
    .array(
      z.object({
        id: z.string(),
        component: z.string(),
        role: z.string(),
        whyHere: z.string(),
        assets: z.array(z.string()).optional(),
        props: z.record(z.unknown()).optional(),
      }),
    )
    .min(1)
    .max(12),
  relationships: z
    .array(
      z.object({
        kind: z.enum(["overlap", "weave", "annotate", "connect", "frame"]).default("overlap"),
        front: z.string(),
        behind: z.string(),
        overlap: z.number().min(0).max(0.4).optional(),
        purpose: z.string(),
      }),
    )
    .max(6)
    .default([]),
  gesturePurpose: z.string().min(8).max(200),
  assetIds: z.array(z.string()).max(6).default([]),
  brandColors: z.array(z.string()).max(5).default([]),
  /** Supply to add a revision to an existing flyer instead of starting one. */
  flyerId: z.string().optional(),
  prompt: z.string().max(2000).optional(),
});


const elementEditSchema = z.object({
  id: z.string(),
  component: z.string().optional(),
  role: z.string().optional(),
  whyHere: z.string().optional(),
  assets: z.array(z.string()).optional(),
  props: z.record(z.unknown()).optional(),
});

/**
 * A partial change to an existing flyer. Every field is optional and an omitted
 * field means "leave it alone" — so tightening one line of copy costs one small
 * request instead of resending the whole composition.
 */
const patchSchema = z.object({
  productName: z.string().min(1).max(60).optional(),
  campaignArchetype: z
    .enum([
      "product-promotion",
      "event-invitation",
      "awareness-education",
      "editorial-announcement",
      "offer-promotion",
    ])
    .optional(),
  idea: z.string().min(10).max(140).optional(),
  sourceStatements: z.array(z.string().min(1).max(300)).max(40).optional(),
  story: z.tuple([z.string(), z.string(), z.string(), z.string()]).optional(),
  copy: z
    .object({
      eyebrow: z.string().max(42).nullable().optional(),
      headline: z.string().min(3).max(90).optional(),
      body: z.string().max(180).nullable().optional(),
      ctaLabel: z.string().min(2).max(34).optional(),
      ctaUrl: z.string().nullable().optional(),
      qr: z.boolean().optional(),
    })
    .optional(),
  elements: z.array(elementEditSchema).max(7).optional(),
  addElements: z
    .array(
      z.object({
        id: z.string(),
        component: z.string(),
        role: z.string(),
        whyHere: z.string(),
        assets: z.array(z.string()).optional(),
        props: z.record(z.unknown()).optional(),
      }),
    )
    .max(4)
    .optional(),
  removeElements: z.array(z.string()).max(4).optional(),
  relationships: z
    .array(
      z.object({
        kind: z.enum(["overlap", "weave", "annotate", "connect", "frame"]).default("overlap"),
        front: z.string(),
        behind: z.string(),
        overlap: z.number().min(0).max(0.4).optional(),
        purpose: z.string(),
      }),
    )
    .max(6)
    .optional(),
  gesturePurpose: z.string().min(8).max(200).optional(),
  brandColors: z.array(z.string()).max(5).optional(),
});

const assignmentSchema = z.object({
  runs: z.number().int().min(1).max(6).default(3),
  risk: z.enum(["safe", "studio", "experimental"]).optional(),
  /** Canvas size for the flyer(s) this assignment is for; pass the same value to POST /v1/flyers/compose. */
  format: z.enum(FORMAT_IDS as [FormatId, ...FormatId[]]).default(DEFAULT_FORMAT),
  campaignArchetype: z
    .enum([
      "product-promotion",
      "event-invitation",
      "awareness-education",
      "editorial-announcement",
      "offer-promotion",
    ])
    .optional(),
  brandColors: z.array(z.string()).max(5).default([]),
  jobSeed: z.string().optional(),
});

function fail(reply: FastifyReply, status: number, code: string, message: string, details: unknown = {}) {
  return reply.status(status).send({ error: { code, message, details } });
}

/** Everything an author needs to work inside a sampled lineage. */
function describeAssignment(lineage: Lineage, brandColors: string[]) {
  const metaphor = METAPHORS.find((m) => m.id === lineage.metaphor)!;
  const topology = TOPOLOGIES.find((t) => t.id === lineage.topology)!;
  const typography = typographyById(lineage.typography);
  const material = materialById(lineage.material);
  const colorLogic = colorLogicById(lineage.colorLogic);
  const gesture = gestureById(lineage.gesture);
  const graphics = graphicsById(lineage.graphics);
  const artDirection = artDirectionById(lineage.artDirection);
  const elementBudget = elementBudgetForDensity(artDirection.density);
  const recipe = recipeFor(lineage.topology);
  const pair = fontPairById(lineage.fontPair);

  return {
    lineage,
    direction: {
      artDirection: {
        id: artDirection.id,
        brief: artDirection.brief,
        density: artDirection.density,
      },
      metaphor: { id: metaphor.id, brief: metaphor.brief },
      topology: { id: topology.id, brief: topology.brief, readingPath: topology.readingPath },
      typography: { id: typography.id, brief: typography.brief, participating: typography.participating },
      material: { id: material.id, brief: material.brief },
      colorLogic: { id: colorLogic.id, brief: colorLogic.brief },
      gesture: {
        id: gesture.id,
        brief: gesture.brief,
        requiresComponent: gesture.requires ?? null,
      },
      graphics: {
        id: graphics.id,
        brief: graphics.brief,
        // Stated so a cold session does not spend one of its 4-7 elements on
        // decoration the engine is going to draw anyway.
        appliedBy: "engine",
        note: "The engine paints this field behind and around your composition. Your elements are content only.",
      },
    },
    // Resolved for information only — the author does not get to change these.
    resolved: {
      palette: paletteFor(lineage, brandColors),
      fonts: { display: pair.display, body: pair.body, mono: pair.mono ?? null },
    },
    constraints: {
      elements: elementBudget,
      headlineMaxLines: recipe.headlineMaxLines,
      requiredRoles: ["evidence", "message", "cta"],
      note: recipe.notes,
    },
    components: manifestsFor(lineage.topology).map((m) => ({
      id: m.id,
      category: m.category,
      roles: m.roles,
      purpose: m.purpose,
      assetSlots: m.assetSlots,
      textLimits: m.textLimits ?? null,
      propsSchema: componentPropsSchema(m.id),
      engineOwnedProps: engineOwnedPropsFor(m.id),
    })),
  };
}


/**
 * Render, judge, export and record one revision. Shared by compose and patch so
 * the two paths can never drift into recording different things.
 */
async function renderAndRecord(input: {
  spec: DesignSpec;
  flyerId: string;
  revision: number;
  assetIds: string[];
  apiKey: string;
  author: string;
}) {
  const { spec, flyerId, revision } = input;
  const assets = await getAssets(input.assetIds);
  const refs: AssetRef[] = assets.map((a) => ({
    assetId: a.id,
    href: assetDataUri(a),
    toneMap: a.analysis.toneMap,
    focalPoint: a.analysis.focalPoint,
    subjectBox: a.analysis.subjectBox,
    textSafeZones: a.analysis.textSafeZones,
    width: a.width,
    height: a.height,
  }));

  const { svg, layout } = renderSpec(spec, refs);
  const png = rasterize(svg);
  const gates = await runGates(
    { spec, layout, requestedAssetIds: input.assetIds },
    { jobId: flyerId, apiKey: input.apiKey, stage: "gates" },
  );
  const critique = ruleCritic(spec, layout);

  exportFlyer({ jobId: flyerId, revision, spec, svg, png });
  saveRevision({ jobId: flyerId, revision, spec, layout, gates, instruction: null });
  saveProcessLog(flyerId, revision, {
    author: input.author,
    idea: spec.idea,
    lineage: spec.lineage,
    spec,
    layoutWarnings: layout.warnings,
    gates,
    critique,
    editability: checkEditability(svg),
  });

  updateJob(flyerId, {
    status: "awaiting_review",
    stage: null,
    revision,
    idea: spec.idea,
    lineage: JSON.stringify(spec.lineage),
    gates: JSON.stringify(gates),
    product_name: spec.productName,
    below_bar: 0,
    failed_gates: null,
    reason: null,
  });

  return {
    flyerId,
    revision,
    status: "awaiting_review" as const,
    idea: spec.idea,
    codeCheckedGates: {
      G3: gates.detail.G3,
      G5: gates.detail.G5,
      G6: gates.detail.G6,
      mechanical: gates.mechanical,
    },
    pendingYourJudgement: ["G1", "G2", "G4"],
    notes: gates.notes,
    critique: critique.map(describeFix),
    layoutWarnings: layout.warnings,
    urls: {
      png: `/v1/flyers/${flyerId}/export?format=png`,
      svg: `/v1/flyers/${flyerId}/export?format=svg`,
      spec: `/v1/flyers/${flyerId}/spec`,
    },
    next: `Fetch the PNG, look at it, then POST /v1/flyers/${flyerId}/review with your verdict.`,
  };
}


/**
 * A layout reloaded from the job store is plain JSON: `tone` has lost its
 * methods. Anything placed on `LayoutResult` crosses that storage boundary, so
 * it either has to be plain data or be rebuilt here.
 */
function rehydrateLayout(layout: any, spec: any): any {
  return {
    ...layout,
    tone: rehydrateTone(layout?.tone, spec.canvas, layout?.ground?.base ?? spec.brand.colors.bg),
  };
}

export function registerAgentRoutes(app: FastifyInstance): void {
  // ── How to use this API at all ───────────────────────────────────────────
  app.get("/v1/guide", async (_request, reply) => {
    return reply.type("text/markdown; charset=utf-8").send(guideMarkdown());
  });

  // ── 1. Get a creative assignment ─────────────────────────────────────────
  app.post("/v1/studio/assignments", async (request, reply) => {
    const parsed = assignmentSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return fail(reply, 400, "invalid_request", "Invalid assignment request", parsed.error.issues);
    }
    const { runs, brandColors, campaignArchetype, format } = parsed.data;
    const risk = (parsed.data.risk ?? config.defaultRisk) as Risk;
    const jobSeed = parsed.data.jobSeed ?? newJobSeed();
    const { lineages } = sampleLineages({ jobSeed, count: runs, risk, campaignArchetype });

    return {
      jobSeed,
      risk,
      // Echoed so the agent can carry it unchanged into POST /v1/flyers/compose
      // — the sampler itself doesn't vary by format, only the canvas does.
      canvas: formatById(format),

      /**
       * Stated in the response because not stating it cost a real run 27 draws.
       *
       * An agent hunting for a metaphor that fits its brief has no way to know
       * the sampler can filter by campaign archetype, so it redraws until luck
       * supplies one. That is not the agent being careless — it is the API
       * hiding the control that exists.
       */
      archetype: campaignArchetype ?? null,
      hint: campaignArchetype
        ? undefined
        : "No campaignArchetype given, so metaphors were drawn from the whole set. " +
          "Pass one of product-promotion | event-invitation | awareness-education | " +
          "editorial-announcement | offer-promotion and the sampler will only return " +
          "designers whose metaphor suits that kind of brief — redrawing until one fits " +
          "is fighting the sampler, not using it.",
      campaignArchetype: campaignArchetype ?? null,
      assignments: lineages.map((l) => describeAssignment(l, brandColors)),
      next: "Write the idea, then POST /v1/flyers/compose with the lineage returned here.",
    };
  });

  // ── 2. Compose: author's spec in, rendered and judged flyer out ──────────
  /** The shape of a composition, as something an agent can copy rather than infer. */
  app.get("/v1/schema/composition", async () => ({
    /*
     * Two, and they are meant to be read as a pair. `example` is singular and
     * kept for callers that already read it; `examples` is what a fresh agent
     * should look at, because one example is copied as a template and two are
     * compared as a range.
     */
    example: COMPOSITION_EXAMPLE,
    examples: [
      {
        name: "photo-led",
        useWhen:
          "There is a real thing to photograph — a place, a dish, an object, a face. The picture is the evidence.",
        elementCount: COMPOSITION_EXAMPLE.elements.length,
        fitsDensity: ["quiet", "balanced"],
        composition: COMPOSITION_EXAMPLE,
      },
      {
        name: "assembled",
        useWhen:
          "Nothing honest to photograph, or the page needs density. Builds its evidence from parts and carries several facts in one element.",
        elementCount: COMPOSITION_EXAMPLE_ASSEMBLED.elements.length,
        fitsDensity: ["balanced", "rich"],
        composition: COMPOSITION_EXAMPLE_ASSEMBLED,
      },
    ],
    /*
     * Published because no fixed element count is valid for every assignment —
     * quiet tops out at 5 and rich starts at 6, so any single example is
     * rejected outright by some lineages. That is precisely the "guessed the
     * shape and burned fifteen attempts" failure the examples exist to prevent,
     * reintroduced by the examples themselves. Caught by a test, not by eye.
     */
    elementBudgets: {
      quiet: elementBudgetForDensity("quiet"),
      balanced: elementBudgetForDensity("balanced"),
      rich: elementBudgetForDensity("rich"),
      note: "Read `direction.density` on your assignment and count your elements against this table BEFORE composing. The two examples are deliberately different sizes; add or drop a support element to fit.",
    },
    notes: COMPOSITION_NOTES,
  }));

  app.post("/v1/flyers/compose", async (request, reply) => {
    const parsed = authoredSchema.safeParse(request.body);
    if (!parsed.success) {
      return fail(reply, 400, "invalid_request", "Invalid composition", parsed.error.issues);
    }
    const body = parsed.data;
    const direction = artDirectionById(body.lineage.artDirection);
    const elementBudget = elementBudgetForDensity(direction.density);
    if (body.elements.length < elementBudget.min || body.elements.length > elementBudget.max) {
      return fail(
        reply,
        422,
        "invalid_spec",
        `${direction.id} requires ${elementBudget.min}-${elementBudget.max} content elements; received ${body.elements.length}`,
      );
    }

    // An element naming an asset *is* the request to use it. Requiring the id to
    // be repeated in a top-level list only creates a silent failure mode where
    // the element renders a placeholder and the gates report nothing wrong.
    const referenced = body.elements.flatMap((el) => el.assets ?? []);
    const assetIds = Array.from(new Set([...body.assetIds, ...referenced]));
    const missing = assetIds.filter((id) => !getAsset(id));
    if (missing.length > 0) {
      return fail(
        reply,
        400,
        "invalid_request",
        `Unknown assetId(s): ${missing.join(", ")} — upload them via POST /v1/assets first`,
      );
    }

    // Resolve canvas: an explicit `format` always wins; recomposing an
    // existing flyer without one keeps its current canvas rather than
    // silently resetting to the default portrait; a brand-new flyer with
    // neither gets the default.
    let canvas: { w: number; h: number; safe: number } | undefined = body.format
      ? formatById(body.format)
      : undefined;
    if (!canvas && body.flyerId) {
      const existingJob = await getJob(body.flyerId);
      const prevRevision = existingJob ? await getRevision(existingJob.id, existingJob.revision) : null;
      if (prevRevision) canvas = (JSON.parse(prevRevision.spec) as DesignSpec).canvas;
    }
    canvas ??= formatById(DEFAULT_FORMAT);

    const assembled = assembleSpec(
      body.lineage,
      {
        productName: body.productName,
        campaignArchetype: body.campaignArchetype,
        sourceStatements: body.sourceStatements,
        idea: body.idea,
        story: body.story,
        copy: body.copy,
        elements: body.elements,
        relationships: body.relationships,
        gesturePurpose: body.gesturePurpose,
      } as AuthoredSpec,
      body.brandColors,
      canvas,
    );

    if (!assembled.ok) {
      // The validator's complaints are the whole point: they tell the author
      // exactly which rule was broken so the next attempt is informed.
      return reply.status(422).send({
        error: {
          code: "invalid_spec",
          message: "The composition does not satisfy the design spec",
          details: { problems: assembled.errors },
        },
        hint: "Fix these and POST again. Element count must be 4–7, and you need one evidence, one message and one cta.",
      });
    }

    const spec = assembled.spec;

    // Existing flyer → this becomes its next revision.
    let flyerId = body.flyerId ?? null;
    let revision = 0;
    if (flyerId) {
      const existing = await getJob(flyerId);
      if (!existing) return fail(reply, 404, "not_found", `No flyer ${flyerId}`);
      revision = existing.revision + 1;
    } else {
      flyerId = `fly_${ulid()}`;
      await createJob({
        id: flyerId,
        apiKey: request.apiKey,
        prompt: body.prompt ?? body.idea,
        risk: body.lineage.risk,
        jobSeed: body.lineage.jobSeed,
        assetIds,
        brand: body.brandColors.length ? { colors: body.brandColors } : null,
        callbackUrl: null,
        batchId: null,
      });
    }

    const result = await renderAndRecord({
      spec,
      flyerId,
      revision,
      assetIds,
      apiKey: request.apiKey,
      author: "agent",
    });
    return reply.status(201).send(result);
  });

  // ── 2b. Patch: change part of a flyer without resending the whole spec ───
  app.patch<{ Params: { flyerId: string } }>("/v1/flyers/:flyerId", async (request, reply) => {
    const job = await getJob(request.params.flyerId);
    if (!job) return fail(reply, 404, "not_found", "No such flyer");

    const parsed = patchSchema.safeParse(request.body);
    if (!parsed.success) {
      return fail(reply, 400, "invalid_request", "Invalid patch", parsed.error.issues);
    }
    const row = await getRevision(job.id, job.revision);
    if (!row) return fail(reply, 404, "not_found", `No revision ${job.revision}`);

    const current = JSON.parse(row.spec);
    const patch = parsed.data;

    // Copy edits, field by field, so an omitted field means "leave it alone"
    // rather than "clear it".
    const copy = { ...current.copy };
    if (patch.copy) {
      for (const key of ["eyebrow", "headline", "body"] as const) {
        if (patch.copy[key] !== undefined) copy[key] = patch.copy[key];
      }
      if (patch.copy.ctaLabel !== undefined) copy.cta = { ...copy.cta, label: patch.copy.ctaLabel };
      if (patch.copy.ctaUrl !== undefined) copy.cta = { ...copy.cta, url: patch.copy.ctaUrl };
      if (patch.copy.qr !== undefined) copy.cta = { ...copy.cta, qr: patch.copy.qr };
    }

    let elements = current.elements as AuthoredSpec["elements"];
    for (const id of patch.removeElements ?? []) {
      elements = elements.filter((e) => e.id !== id);
    }
    for (const edit of patch.elements ?? []) {
      const target = elements.find((e) => e.id === edit.id);
      if (!target) {
        return fail(reply, 400, "invalid_request", `No element "${edit.id}" to patch`);
      }
      if (edit.component !== undefined) target.component = edit.component;
      if (edit.role !== undefined) target.role = edit.role;
      if (edit.whyHere !== undefined) target.whyHere = edit.whyHere;
      if (edit.assets !== undefined) target.assets = edit.assets;
      // Props merge, so changing one field does not wipe the rest.
      if (edit.props !== undefined) target.props = { ...(target.props ?? {}), ...edit.props };
    }
    if (patch.addElements) elements = [...elements, ...patch.addElements];
    const direction = artDirectionById(current.lineage.artDirection);
    const elementBudget = elementBudgetForDensity(direction.density);
    if (elements.length < elementBudget.min || elements.length > elementBudget.max) {
      return fail(
        reply,
        422,
        "invalid_spec",
        `${direction.id} requires ${elementBudget.min}-${elementBudget.max} content elements; patch would produce ${elements.length}`,
      );
    }

    const authored: AuthoredSpec = {
      productName: patch.productName ?? current.productName,
      campaignArchetype: patch.campaignArchetype ?? current.campaignArchetype,
      sourceStatements: patch.sourceStatements ?? current.provenance?.userStatements ?? [],
      idea: patch.idea ?? current.idea,
      story: patch.story ?? current.story,
      copy,
      elements,
      relationships: patch.relationships ?? current.relationships,
      gesturePurpose: patch.gesturePurpose ?? current.gesture.purpose,
    };

    // Brand colours are part of the flyer's identity, not of this request. A
    // patch that omits them must not silently regenerate the palette from
    // nothing — that changes the design out from under the author.
    const storedBrand = job.brand ? (JSON.parse(job.brand) as { colors?: string[] }) : null;
    const brandColors = patch.brandColors ?? storedBrand?.colors ?? [];
    // A patch never changes the canvas — reuse the flyer's own stored size.
    const assembled = assembleSpec(current.lineage, authored, brandColors, current.canvas);
    if (!assembled.ok) {
      return reply.status(422).send({
        error: {
          code: "invalid_spec",
          message: "The patched composition does not satisfy the design spec",
          details: { problems: assembled.errors },
        },
      });
    }

    // Same rule as compose: an element naming an asset *is* the request to use it.
    // Patching hero.assets to a newly prepared id must load that buffer, not silently
    // draw the empty placeholder while the job still points at yesterday's uploads.
    const previous = JSON.parse(job.asset_ids) as string[];
    const referenced = elements.flatMap((el) => el.assets ?? []);
    const assetIds = Array.from(new Set([...previous, ...referenced]));
    const found = await getAssets(assetIds);
    const foundIds = new Set(found.map((a) => a.id));
    const missing = assetIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      return fail(
        reply,
        400,
        "invalid_request",
        `Unknown assetId(s): ${missing.join(", ")} — upload them via POST /v1/assets first`,
      );
    }
    await updateJob(job.id, { asset_ids: JSON.stringify(assetIds) });

    const result = await renderAndRecord({
      spec: assembled.spec,
      flyerId: job.id,
      revision: job.revision + 1,
      assetIds,
      apiKey: request.apiKey,
      author: "agent-patch",
    });
    return reply.status(200).send(result);
  });

  // ── 3. Submit the visual verdict only a viewer can give ──────────────────
  app.post<{ Params: { flyerId: string } }>(
    "/v1/flyers/:flyerId/review",
    async (request, reply) => {
      const job = await getJob(request.params.flyerId);
      if (!job) return fail(reply, 404, "not_found", "No such flyer");

      const parsed = visionVerdictSchema.safeParse(request.body);
      if (!parsed.success) {
        return fail(reply, 400, "invalid_request", "Invalid review verdict", parsed.error.issues);
      }

      const row = await getRevision(job.id, job.revision);
      if (!row) return fail(reply, 404, "not_found", `No revision ${job.revision}`);

      const spec = JSON.parse(row.spec);
      const layout = rehydrateLayout(JSON.parse(row.layout), spec);
      const gates = await runGates(
        {
          spec,
          layout,
          requestedAssetIds: JSON.parse(job.asset_ids) as string[],
          verdict: parsed.data,
        },
        { jobId: job.id, apiKey: request.apiKey, stage: "gates" },
      );

      await saveRevision({ jobId: job.id, revision: job.revision, spec, layout, gates, instruction: null });
      await updateJob(job.id, {
        status: gates.passed ? "done" : "below_bar",
        gates: JSON.stringify(gates),
        below_bar: gates.passed ? 0 : 1,
        failed_gates: gates.passed ? null : JSON.stringify(failedGateIds(gates)),
        reason: gates.passed ? null : gates.notes.slice(0, 3).join("; "),
      });

      return {
        flyerId: job.id,
        revision: job.revision,
        status: gates.passed ? "done" : "below_bar",
        gates: gates.detail,
        mechanical: gates.mechanical,
        notes: gates.notes,
        ...(gates.passed
          ? { message: "All six gates cleared. This flyer is done." }
          : {
              failedGates: failedGateIds(gates),
              message:
                "Not done. Fix the spec and POST /v1/flyers/compose again with the same flyerId.",
            }),
      };
    },
  );

  // ── Deterministic critique on demand ─────────────────────────────────────
  app.get<{ Params: { flyerId: string }; Querystring: { revision?: string } }>(
    "/v1/flyers/:flyerId/critique",
    async (request, reply) => {
      const job = await getJob(request.params.flyerId);
      if (!job) return fail(reply, 404, "not_found", "No such flyer");
      const revision = request.query.revision ? Number(request.query.revision) : job.revision;
      const row = await getRevision(job.id, revision);
      if (!row) return fail(reply, 404, "not_found", `No revision ${revision}`);

      const spec = JSON.parse(row.spec);
      const layout = rehydrateLayout(JSON.parse(row.layout), spec);
      const fixes = ruleCritic(spec, layout);
      return {
        flyerId: job.id,
        revision,
        fixes,
        summary: fixes.map(describeFix),
      };
    },
  );
}
