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
          field: z.enum(["eyebrow", "headline", "body", "ctaLabel", "ctaUrl"]),
          value: z.string().max(180).nullable(),
          reason: z.string().max(160),
        }),
        z.object({
          op: z.literal("add_element"),
          id: z.string().max(40),
          component: z.string().max(60),
          role: z.enum(["evidence", "message", "support", "cta", "brand", "structure"]),
          whyHere: z.string().max(200),
          propsJson: z.string().max(1000),
          reason: z.string().max(160),
        }),
        z.object({
          op: z.literal("swap_component"),
          id: z.string().max(40),
          component: z.string().max(60),
          reason: z.string().max(160),
        }),
        z.object({
          op: z.literal("set_prop"),
          id: z.string().max(40),
          key: z.enum([
            "text",
            "label",
            "title",
            "loudWord",
            "items",
            "primary",
            "secondary",
            "ask",
            "reply",
            "value",
            "caption",
            "character",
            "beforeLabel",
            "afterLabel",
            "tagline",
            "attribution",
            "emphasisRow",
            "strikeRow",
            "resolved",
            "style",
            "marker",
            "treatment",
            "state",
            "rule",
            "axis",
            "display",
            "layout",
            "showName",
            "fit",
            "aspect",
            "scrim",
            "shape",
            "ring",
            "motif",
            "feature",
            "edge",
            "backing",
            "subject",
            "arrangement",
            "dividers",
            "uppercaseLabels",
            "figures",
            "sun",
            "curve",
            "arrow",
            "corners",
            "orientation",
            "weight",
            "direction",
            "density",
            "kind",
          ]),
          value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]),
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
          op: z.literal("add_relationship"),
          kind: z.enum(["overlap", "weave", "annotate", "connect", "frame"]),
          front: z.string().max(40),
          behind: z.string().max(40),
          overlap: z.number().min(0).max(0.4),
          purpose: z.string().min(8).max(200),
          reason: z.string().max(160),
        }),
        z.object({
          op: z.literal("set_overlap"),
          front: z.string().max(40),
          behind: z.string().max(40),
          overlap: z.number().min(0).max(0.4),
          reason: z.string().max(160),
        }),
        z.object({
          op: z.literal("set_details"),
          details: z
            .array(z.object({ label: z.string().max(24), value: z.string().max(48) }))
            .max(6),
          reason: z.string().max(160),
        }),
      ]),
    )
    .max(6),
});

const SYSTEM = `You revise an existing flyer specification by editing it — never by starting over.

You may add or remove a necessary content element, swap one component for another, edit
author-safe component props, rewrite copy/details, and add, adjust or drop a relationship.
You may not change the creative idea, the
metaphor, the composition topology, or the signature gesture: those were decided upstream and
the flyer's identity depends on them.

Prefer removal to addition. Add only when a required proof, action or fact cluster is genuinely
missing and the result remains within four to seven elements. Never add decoration.

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
        `- ${e.id}: component=${e.component} role=${e.role} props=${JSON.stringify(e.props ?? {})} assets=${(e.assets ?? []).join(",") || "none"} why="${e.whyHere}"`,
    )
    .join("\n");
  const relationshipList = input.spec.relationships.length
    ? input.spec.relationships
        .map((r) => `- ${r.kind}: ${r.front} → ${r.behind} (overlap ${r.overlap ?? 0}): ${r.purpose}`)
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
Communication archetype: ${input.spec.campaignArchetype}
Art direction (immutable): ${input.spec.lineage.artDirection}

Copy:
  eyebrow:  ${input.spec.copy.eyebrow ?? "(none)"}
  headline: ${input.spec.copy.headline}
  body:     ${input.spec.copy.body ?? "(none)"}
  cta:      ${input.spec.copy.cta.label}
  details:  ${input.spec.copy.details.map((detail) => `${detail.label}: ${detail.value}`).join("; ") || "(none)"}

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
        } else if (op.field === "ctaUrl") {
          next.copy.cta.url = op.value;
        } else if (op.field === "headline") {
          if (op.value) next.copy.headline = op.value.slice(0, 90);
        } else if (op.field === "eyebrow") {
          next.copy.eyebrow = op.value ? op.value.slice(0, 42) : null;
        } else {
          next.copy.body = op.value ? op.value.slice(0, 180) : null;
        }
        break;
      }
      case "add_element": {
        let props: Record<string, unknown> = {};
        try {
          const decoded = JSON.parse(op.propsJson);
          if (decoded && typeof decoded === "object" && !Array.isArray(decoded)) props = decoded;
        } catch {
          props = {};
        }
        next.elements.push({
          id: op.id,
          component: op.component,
          role: op.role,
          whyHere: op.whyHere,
          props,
        });
        break;
      }
      case "swap_component": {
        const el = next.elements.find((e) => e.id === op.id);
        if (el) {
          el.component = op.component;
          // Props belong to the old component and may be invalid for the new
          // one. Defaults are safer than carrying accidental incompatible state.
          el.props = {};
        }
        break;
      }
      case "set_prop": {
        const el = next.elements.find((e) => e.id === op.id);
        if (el) {
          el.props = { ...(el.props ?? {}) };
          if (op.value === null) delete el.props[op.key];
          else el.props[op.key] = op.value;
        }
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
      case "add_relationship": {
        const exists = next.relationships.some(
          (relationship) =>
            relationship.front === op.front && relationship.behind === op.behind,
        );
        if (!exists) {
          next.relationships.push({
            kind: op.kind,
            front: op.front,
            behind: op.behind,
            overlap: op.overlap,
            purpose: op.purpose,
          });
        }
        break;
      }
      case "set_overlap": {
        const rel = next.relationships.find(
          (r) => r.front === op.front && r.behind === op.behind,
        );
        if (rel) rel.overlap = op.overlap;
        break;
      }
      case "set_details": {
        next.copy.details = op.details;
        break;
      }
    }
  }

  return next;
}
