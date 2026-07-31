import * as z from "zod/v4";
import { callStructured, type CallContext } from "../../llm/index.js";
import { detectBanned } from "../../creative/banned.js";
import { meetsAA, contrastRatio } from "../../creative/color.js";
import { hasLlm } from "../../config.js";
import type { DesignSpec } from "../compose/spec.js";
import type { LayoutResult } from "../layout/solver.js";

/**
 * Stage 7 — Critic, in two layers.
 *
 * The rule critic is cheap, exact, and runs first; the vision critic is only
 * asked the things code cannot see, and must answer with element-level fixes
 * rather than scores (ARCHITECTURE.md §9 — a critic that emits scores rewards
 * generic polish).
 */

export type CriticFix = {
  source: "rule" | "vision";
  severity: "high" | "medium" | "low";
  elementId: string | null;
  problem: string;
  action: string;
};

export function ruleCritic(spec: DesignSpec, layout: LayoutResult): CriticFix[] {
  const fixes: CriticFix[] = [];

  for (const warning of layout.warnings) {
    const elementId = spec.elements.find((e) => warning.includes(e.id))?.id ?? null;
    const severity: CriticFix["severity"] = warning.includes("does not fit")
      ? "high"
      : warning.includes("overflows") || warning.includes("exceeds")
        ? "high"
        : "medium";
    fixes.push({
      source: "rule",
      severity,
      elementId,
      problem: warning,
      action: warning.includes("headline does not fit")
        ? "shorten the headline to fewer words so it can be set large"
        : warning.includes("overflows") || warning.includes("exceeds")
          ? "remove one element or shorten the longest text so the column fits the safe area"
          : "reconsider this relationship — it is not achieving what it claims",
    });
  }

  const { bg, fg, accent, muted } = spec.brand.colors;
  for (const [name, colour, large] of [
    ["foreground", fg, false],
    ["muted", muted, true],
    ["accent", accent, true],
  ] as const) {
    if (!meetsAA(colour, bg, large)) {
      fixes.push({
        source: "rule",
        severity: "high",
        elementId: null,
        problem: `${name} ${colour} on ${bg} is only ${contrastRatio(colour, bg).toFixed(2)}:1`,
        action: "the palette is failing WCAG-AA; this is a colour-logic problem, not a layout one",
      });
    }
  }

  const banned = detectBanned(spec, layout.boxes);
  for (const hit of banned.hits) {
    fixes.push({
      source: "rule",
      severity: banned.clear ? "medium" : "high",
      elementId: null,
      problem: `banned-list signal "${hit.signal}": ${hit.detail}`,
      action:
        hit.signal === "meaningless-structure"
          ? "delete this structure element or give it something that registers against it"
          : "change the composition so this signal no longer applies",
    });
  }

  for (const el of spec.elements) {
    if (el.whyHere.trim().length < 8) {
      fixes.push({
        source: "rule",
        severity: "high",
        elementId: el.id,
        problem: `${el.id} has no real justification`,
        action: "delete this element — it fails the delete test",
      });
    }
  }

  return fixes;
}

const visionFixesSchema = z.object({
  fixes: z
    .array(
      z.object({
        severity: z.enum(["high", "medium", "low"]),
        elementId: z
          .string()
          .max(40)
          .nullable()
          .describe("The element id this concerns, or null if it is about the whole composition"),
        problem: z.string().max(200).describe("What is wrong, stated as an observation"),
        action: z
          .string()
          .max(200)
          .describe("A concrete change, e.g. 'reduce the headline to two lines'. Never 'make it better'."),
      }),
    )
    .max(5),
});

const VISION_SYSTEM = `You are the vision critic in a flyer studio. You see a rendered flyer and
return a short list of specific, actionable fixes — never scores, never praise, never general advice.

Only report things you can actually see in the image. Look for:
- the idea not reading (someone glancing at this could not say what it shows)
- the product not being visible as a subject
- the headline sitting as a floating label rather than participating
- elements colliding in a way that hurts legibility
- one element having no visible reason to exist

Do NOT report: colour preferences, "add more whitespace" without a target, requests for
extra elements, or anything you would say about any flyer. If the flyer is genuinely fine,
return an empty list. An empty list is a real and useful answer.`;

export async function visionCritic(
  input: { spec: DesignSpec; png: Buffer },
  ctx: CallContext,
): Promise<CriticFix[]> {
  if (!hasLlm()) return [];
  const elementList = input.spec.elements
    .map((e) => `- ${e.id} (${e.component}, ${e.role}): ${e.whyHere}`)
    .join("\n");

  try {
    const result = await callStructured(
      {
        role: "vision",
        system: VISION_SYSTEM,
        prompt: `Flyer for "${input.spec.productName}".
Intended idea: "${input.spec.idea}"

Elements present:
${elementList}

What specifically needs to change?`,
        schema: visionFixesSchema,
        schemaName: "vision_fixes",
        images: [{ mediaType: "image/png", base64: input.png.toString("base64") }],
        maxTokens: 3000,
        effort: "low",
      },
      ctx,
    );
    return result.fixes.map((f) => ({ ...f, source: "vision" as const }));
  } catch {
    return [];
  }
}

/** Highest-severity first, capped — the reviser gets a focused list, not a dump. */
export function prioritise(fixes: CriticFix[], limit = 4): CriticFix[] {
  const rank = { high: 0, medium: 1, low: 2 } as const;
  return [...fixes].sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, limit);
}

export function describeFix(fix: CriticFix): string {
  return `${fix.elementId ? `[${fix.elementId}] ` : ""}${fix.problem} → ${fix.action}`;
}
