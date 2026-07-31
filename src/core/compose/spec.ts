import { z } from "zod";
import { hasComponent } from "../../components/registry.js";
import { METAPHOR_IDS } from "../../creative/metaphors.js";
import { TOPOLOGY_IDS } from "../../creative/topologies.js";
import { TYPOGRAPHY_IDS } from "../../creative/typebehaviors.js";
import { MATERIAL_IDS } from "../../creative/materials.js";
import { COLOR_LOGIC_IDS } from "../../creative/colorlogic.js";
import { GESTURE_IDS, gestureById } from "../../creative/gestures.js";
import { GRAPHICS_IDS } from "../../creative/graphics.js";

/**
 * Data contracts from docs/SCHEMAS.md. These are law: the Composer's output is
 * rejected and retried unless it parses cleanly here.
 *
 * The spec carries NO coordinates — geometry is the Layout Solver's output.
 */

const enumOf = <T extends string>(values: readonly T[]) => z.enum(values as [T, ...T[]]);

export const riskSchema = z.enum(["safe", "studio", "experimental"]);

export const readingPathSchema = z.enum([
  "left-to-right",
  "top-to-bottom",
  "diagonal",
  "zigzag",
  "radial",
  "center-out",
  "edge-in",
]);

export const lineageSchema = z.object({
  jobSeed: z.string().min(1),
  candidateSeed: z.string().min(1),
  metaphor: enumOf(METAPHOR_IDS),
  topology: enumOf(TOPOLOGY_IDS),
  typography: enumOf(TYPOGRAPHY_IDS),
  material: enumOf(MATERIAL_IDS),
  colorLogic: enumOf(COLOR_LOGIC_IDS),
  gesture: enumOf(GESTURE_IDS),
  // Defaulted, not required: ~11 stored spec.json files predate this dimension
  // and must still parse, or re-rendering and exporting earlier work breaks.
  graphics: enumOf(GRAPHICS_IDS).default("editorial-restraint"),
  risk: riskSchema,
  readingPath: readingPathSchema,
  fontPair: z.string().min(1),
});

export type Lineage = z.infer<typeof lineageSchema>;

export const roleSchema = z.enum(["evidence", "message", "support", "cta", "brand", "structure"]);

export const specElementSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "element ids are lowercase kebab-case"),
  component: z.string().refine(hasComponent, {
    message: "component must exist in the Component Library",
  }),
  role: roleSchema,
  /** Gate G3's delete test: what breaks if this element is removed? */
  whyHere: z.string().min(8).max(200),
  assets: z.array(z.string()).max(6).optional(),
  props: z.record(z.unknown()).optional(),
});

export type SpecElement = z.infer<typeof specElementSchema>;

export const specRelationshipSchema = z.object({
  front: z.string().min(1),
  behind: z.string().min(1),
  overlap: z.number().min(0).max(1).optional(),
  /** Unjustified overlap is decoration; the gates reject it. */
  purpose: z.string().min(8).max(200),
});

export type SpecRelationship = z.infer<typeof specRelationshipSchema>;

export const copySchema = z.object({
  eyebrow: z.string().max(42).nullable(),
  headline: z.string().min(3).max(90),
  body: z.string().max(180).nullable(),
  cta: z.object({
    label: z.string().min(2).max(34),
    url: z.string().nullable(),
    qr: z.boolean(),
  }),
  /**
   * Small labelled facts — date, place, time, price, phone, handle.
   *
   * The reference posters carry 12-30 visual objects; our element budget is
   * 4-7 and Gate G3 counts elements, not words. Raising G3 would gut the
   * restraint that makes this product worth using, so density comes from one
   * element carrying a *cluster* of related facts instead. One element, one
   * reason to exist, several lines — which is how a real poster puts "17-18
   * June" and "123 Anywhere St" on the page without spending two ideas.
   */
  details: z
    .array(
      z.object({
        label: z.string().max(24),
        value: z.string().min(1).max(48),
      }),
    )
    .max(6)
    .default([]),
});

export type Copy = z.infer<typeof copySchema>;

export const brandSchema = z.object({
  colors: z.object({
    bg: z.string(),
    fg: z.string(),
    accent: z.string(),
    muted: z.string(),
  }),
  fonts: z.object({
    display: z.string(),
    body: z.string(),
    mono: z.string().nullable().optional(),
  }),
});

export const designSpecSchema = z
  .object({
    specVersion: z.literal("1.0"),
    seed: z.string().min(1),
    lineage: lineageSchema,
    productName: z.string().min(1).max(60),
    /** Gate G1: one sentence, and it must be short enough to actually be one. */
    idea: z.string().min(10).max(140),
    /** problem → product acting → payoff → CTA */
    story: z.tuple([z.string(), z.string(), z.string(), z.string()]),
    canvas: z.object({
      w: z.literal(1080),
      h: z.literal(1350),
      safe: z.number().int().min(32).max(120),
    }),
    brand: brandSchema,
    copy: copySchema,
    /** Gate G3: restraint. Enforced by the schema, not just critiqued. */
    elements: z.array(specElementSchema).min(4).max(7),
    relationships: z.array(specRelationshipSchema).max(6),
    gesture: z.object({
      type: enumOf(GESTURE_IDS),
      purpose: z.string().min(8).max(200),
    }),
  })
  .superRefine((spec, ctx) => {
    const ids = new Set<string>();
    for (const el of spec.elements) {
      if (ids.has(el.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate element id ${el.id}`,
          path: ["elements"],
        });
      }
      ids.add(el.id);
    }
    for (const [i, rel] of spec.relationships.entries()) {
      if (!ids.has(rel.front)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `relationship.front ${rel.front} is not an element id`,
          path: ["relationships", i, "front"],
        });
      }
      if (!ids.has(rel.behind)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `relationship.behind ${rel.behind} is not an element id`,
          path: ["relationships", i, "behind"],
        });
      }
      if (rel.front === rel.behind) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "an element cannot sit in front of itself",
          path: ["relationships", i],
        });
      }
    }
    if (!spec.elements.some((e) => e.role === "cta")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "every flyer needs an element with role 'cta'",
        path: ["elements"],
      });
    }
    if (!spec.elements.some((e) => e.role === "evidence")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "every flyer needs an element with role 'evidence' (Gate G2, the cover test)",
        path: ["elements"],
      });
    }
    if (!spec.elements.some((e) => e.role === "message")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "every flyer needs an element with role 'message'",
        path: ["elements"],
      });
    }
    if (spec.gesture.type !== spec.lineage.gesture) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "gesture must match the sampled lineage gesture",
        path: ["gesture", "type"],
      });
    }
    // A gesture that needs a component the spec never included would silently do
    // nothing, leaving Gate G5 to pass a flyer with no rule-break at all.
    const required = gestureById(spec.gesture.type).requires;
    if (required && !spec.elements.some((e) => e.component === required)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `gesture ${spec.gesture.type} requires an element using component '${required}'`,
        path: ["elements"],
      });
    }
  });

export type DesignSpec = z.infer<typeof designSpecSchema>;

export function parseSpec(input: unknown): DesignSpec {
  return designSpecSchema.parse(input);
}

export type SpecParseResult =
  | { ok: true; spec: DesignSpec }
  | { ok: false; errors: string[] };

/** Non-throwing parse whose errors are formatted for the Composer's retry prompt. */
export function safeParseSpec(input: unknown): SpecParseResult {
  const result = designSpecSchema.safeParse(input);
  if (result.success) return { ok: true, spec: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
  };
}
