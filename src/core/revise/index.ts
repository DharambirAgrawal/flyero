import * as z from "zod/v4";
import { callStructured, type CallContext } from "../../llm/index.js";
import { catalogueFor } from "../../components/registry.js";
import { safeParseSpec, type DesignSpec } from "../compose/spec.js";

/**
 * Stage 8 — Reviser.
 *
 * Applies fixes as *spec edits*, never regeneration. The idea, the lineage and
 * the seed are immutable here — that is what stops a revision from quietly
 * becoming a different flyer (FR-3).
 */

const editSchema = z.object({
  operations: z
    .array(
      z.discriminatedUnion("op", [
        z.object({
          op: z.literal("remove_element"),
          id: z.string().max(40),
          reason: z.string().max(160),
        }),
        z.object({
          op: z.literal("set_copy"),
          field: z.enum(["eyebrow", "headline", "body", "ctaLabel"]),
          value: z.string().max(180).nullable(),
          reason: z.string().max(160),
        }),
        z.object({
          op: z.literal("swap_component"),
          id: z.string().max(40),
          component: z.string().max(60),
          reason: z.string().max(160),
        }),
        z.object({
          op: z.literal("set_why"),
          id: z.string().max(40),
          whyHere: z.string().max(200),
          reason: z.string().max(160),
        }),
        z.object({
          op: z.literal("remove_relationship"),
          front: z.string().max(40),
          behind: z.string().max(40),
          reason: z.string().max(160),
        }),
        z.object({
          op: z.literal("set_overlap"),
          front: z.string().max(40),
          behind: z.string().max(40),
          overlap: z.number().min(0).max(0.4),
          reason: z.string().max(160),
        }),
      ]),
    )
    .max(6),
});

const SYSTEM = `You revise an existing flyer specification by editing it — never by starting over.

You may remove elements, swap one component for another, rewrite copy, adjust or drop a
relationship, and restate why an element is there. You may not change the creative idea, the
metaphor, the composition topology, or the signature gesture: those were decided upstream and
the flyer's identity depends on them.

Prefer removal to addition. A flyer that fails is almost always carrying too much, not too
little. If a fix can be achieved by deleting something, delete it.

Return only the operations needed for the requested fixes. An empty list is valid if the
requested change cannot be made through spec edits.`;

export type ReviseInput = {
  spec: DesignSpec;
  /** Critic fixes, or a plain-language instruction from the user. */
  fixes: string[];
  userInstruction?: string;
};

export async function reviseSpec(
  input: ReviseInput,
  ctx: CallContext,
): Promise<{ spec: DesignSpec; operations: number }> {
  const elementList = input.spec.elements
    .map(
      (e) =>
        `- ${e.id}: component=${e.component} role=${e.role} why="${e.whyHere}"`,
    )
    .join("\n");
  const relationshipList = input.spec.relationships.length
    ? input.spec.relationships
        .map((r) => `- ${r.front} in front of ${r.behind} (overlap ${r.overlap ?? 0}): ${r.purpose}`)
        .join("\n")
    : "(none)";

  const ask = input.userInstruction
    ? `THE USER ASKED FOR THIS CHANGE, in their own words:\n"${input.userInstruction}"`
    : `FIXES TO APPLY:\n${input.fixes.map((f) => `- ${f}`).join("\n")}`;

  const result = await callStructured(
    {
      role: "planner",
      system: SYSTEM,
      prompt: `CURRENT FLYER

Idea (immutable): ${input.spec.idea}
Product: ${input.spec.productName}

Copy:
  eyebrow:  ${input.spec.copy.eyebrow ?? "(none)"}
  headline: ${input.spec.copy.headline}
  body:     ${input.spec.copy.body ?? "(none)"}
  cta:      ${input.spec.copy.cta.label}

Elements:
${elementList}

Relationships:
${relationshipList}

Components you may swap to:
${catalogueFor(input.spec.lineage.topology)}

${ask}

Return the edit operations.`,
      schema: editSchema,
      schemaName: "spec_edits",
      maxTokens: 6000,
      effort: "high",
    },
    ctx,
  );

  const next = applyOperations(input.spec, result.operations);
  const parsed = safeParseSpec(next);
  if (!parsed.ok) {
    // A revision that breaks the schema is discarded; the previous revision stands.
    throw new Error(`Revision produced an invalid spec: ${parsed.errors.join("; ")}`);
  }
  return { spec: parsed.spec, operations: result.operations.length };
}

type Operation = z.infer<typeof editSchema>["operations"][number];

export function applyOperations(spec: DesignSpec, operations: Operation[]): DesignSpec {
  // Structured clone keeps the original spec intact so revision history is real.
  const next: DesignSpec = JSON.parse(JSON.stringify(spec));

  for (const op of operations) {
    switch (op.op) {
      case "remove_element": {
        next.elements = next.elements.filter((e) => e.id !== op.id);
        next.relationships = next.relationships.filter(
          (r) => r.front !== op.id && r.behind !== op.id,
        );
        break;
      }
      case "set_copy": {
        if (op.field === "ctaLabel") {
          if (op.value) next.copy.cta.label = op.value.slice(0, 34);
        } else if (op.field === "headline") {
          if (op.value) next.copy.headline = op.value.slice(0, 90);
        } else if (op.field === "eyebrow") {
          next.copy.eyebrow = op.value ? op.value.slice(0, 42) : null;
        } else {
          next.copy.body = op.value ? op.value.slice(0, 180) : null;
        }
        break;
      }
      case "swap_component": {
        const el = next.elements.find((e) => e.id === op.id);
        if (el) el.component = op.component;
        break;
      }
      case "set_why": {
        const el = next.elements.find((e) => e.id === op.id);
        if (el) el.whyHere = op.whyHere;
        break;
      }
      case "remove_relationship": {
        next.relationships = next.relationships.filter(
          (r) => !(r.front === op.front && r.behind === op.behind),
        );
        break;
      }
      case "set_overlap": {
        const rel = next.relationships.find(
          (r) => r.front === op.front && r.behind === op.behind,
        );
        if (rel) rel.overlap = op.overlap;
        break;
      }
    }
  }

  return next;
}
