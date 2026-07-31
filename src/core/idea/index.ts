import * as z from "zod/v4";
import { callStructured, type CallContext } from "../../llm/index.js";
import { METAPHORS } from "../../creative/metaphors.js";
import { TOPOLOGIES } from "../../creative/topologies.js";
import { typographyById } from "../../creative/typebehaviors.js";
import { materialById } from "../../creative/materials.js";
import { gestureById } from "../../creative/gestures.js";
import type { Lineage } from "../compose/spec.js";
import type { Brief } from "../brief/index.js";

/**
 * Stage 3 — Idea Engine.
 *
 * Produces the one sentence the whole flyer is built around (Gate G1) *inside*
 * the sampled lineage. The lineage is what makes ten runs differ: the same brief
 * with metaphor "transformation" and with metaphor "signal-from-noise" cannot
 * produce the same idea, because the idea has to be expressible in that family.
 */

export const ideaSchema = z.object({
  idea: z
    .string()
    .max(140)
    .describe("One sentence naming what the viewer literally sees. Not a slogan, not a summary."),
  story: z
    .tuple([z.string(), z.string(), z.string(), z.string()])
    .describe("Four beats: the problem state, the product acting, the payoff, the call to action."),
  headline: z.string().max(90),
  eyebrow: z.string().max(42).nullable(),
  body: z.string().max(180).nullable(),
  ctaLabel: z.string().max(34),
  /** The single word the typography behaviour may set apart, when it wants one. */
  loudWord: z.string().max(24).nullable(),
});

export type IdeaResult = z.infer<typeof ideaSchema>;

const SYSTEM = `You are the idea stage of a flyer studio. You decide what the viewer SEES, and you
write the words. You never decide sizes, positions, colours, or fonts — other systems own those.

WHAT MAKES AN IDEA GOOD (this is the entire job):

1. It is one sentence describing a picture, not a concept.
   Good: "A weak résumé bullet is visibly rewritten into a strong one, mid-page."
   Bad:  "Showcasing the power of AI-driven resume optimization."

2. The product is the picture. Someone who covers the logo and the headline should still
   guess what the product does, because the subject of the flyer IS the thing the product
   works on — a résumé, an invoice, a route, a inbox. Never abstract "technology" shapes.

3. It makes the benefit visible rather than stated. If your idea could be replaced by a
   sentence of ad copy, it is not an idea yet.

COPY RULES:

- Real words. "Turn experience into opportunity" is human. "Innovate. Integrate. Elevate."
  is what a machine writes. Never write three abstract nouns in a row. Never use
  "unlock", "elevate", "empower", "revolutionize", "seamless", "cutting-edge", "game-changing".
- Never invent a statistic, testimonial, award, or customer count. If the brief marked
  something "placeholder" or "assumption", do not state it as fact.
- The headline is short enough to be set very large — aim for 2 to 6 words. It should reward
  reading, not explain everything.
- body may be null. Silence is often stronger than a supporting sentence. Use it only when
  there is something specific and true to say.
- loudWord, when set, must be a word that literally appears in your headline.`;

export async function generateIdea(
  input: { brief: Brief; lineage: Lineage },
  ctx: CallContext,
): Promise<IdeaResult> {
  const { brief, lineage } = input;
  const metaphor = METAPHORS.find((m) => m.id === lineage.metaphor)!;
  const topology = TOPOLOGIES.find((t) => t.id === lineage.topology)!;
  const typography = typographyById(lineage.typography);
  const material = materialById(lineage.material);
  const gesture = gestureById(lineage.gesture);

  const facts = brief.statements
    .map((s) => `- [${s.source}] ${s.text}`)
    .join("\n");

  const prompt = `THE BRIEF

Product: ${brief.product.name} — ${brief.product.category}
Benefits the user actually claimed: ${brief.product.knownBenefits.join("; ") || "(none stated)"}
Objective: ${brief.campaign.objective}
Audience (assumed, confidence ${brief.audience.confidence}): ${brief.audience.assumed}
Call to action: ${brief.campaign.cta.label}${brief.campaign.cta.url ? ` → ${brief.campaign.cta.url}` : ""}

Statements and their sources — anything not marked [user] may NOT be stated as fact:
${facts || "(none)"}

YOUR ASSIGNED CREATIVE POSITION

You are not a general-purpose designer today. You have been handed one specific set of
instincts, and your idea must live inside them:

- Metaphor family — ${metaphor.id}: ${metaphor.brief}
- Composition — ${topology.id}: ${topology.brief}
- Typography behaviour — ${typography.id}: ${typography.brief}
- Material — ${material.id}: ${material.brief}
- Signature gesture — ${gesture.id}: ${gesture.brief}

The metaphor family is the binding constraint. An idea that would work equally well under a
different metaphor is not using this one. Push it until the metaphor is doing visible work.

Write the idea, the four story beats, and the copy.`;

  return callStructured(
    {
      role: "planner",
      system: SYSTEM,
      prompt,
      schema: ideaSchema,
      schemaName: "creative_idea",
      maxTokens: 6000,
      effort: "high",
    },
    ctx,
  );
}
