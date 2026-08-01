import * as z from "zod/v4";
import { callStructured, type CallContext } from "../../llm/index.js";
import type { AssetRecord } from "../../store/assets.js";
import type { CampaignArchetype } from "../../creative/types.js";

/**
 * Stage 1 — Brief Builder.
 *
 * The only stage that decides what is *true*. Every statement is labelled with
 * its source, and the model is told in the strongest terms that "user" is
 * reserved for things the user actually wrote (FR-4). Gate G6 checks this again
 * downstream, but the discipline starts here.
 */

export const briefSchema = z.object({
  archetype: z
    .enum([
      "product-promotion",
      "event-invitation",
      "awareness-education",
      "editorial-announcement",
      "offer-promotion",
    ])
    .default("product-promotion"),
  product: z.object({
    name: z.string().max(60),
    category: z.string().max(80),
    knownBenefits: z.array(z.string().max(120)).max(5),
  }),
  campaign: z.object({
    objective: z.string().max(160),
    cta: z.object({
      label: z.string().max(34),
      url: z.string().nullable(),
    }),
  }),
  audience: z.object({
    assumed: z.string().max(160),
    confidence: z.number().min(0).max(1),
  }),
  statements: z
    .array(
      z.object({
        text: z.string().max(200),
        source: z.enum(["user", "assumption", "placeholder"]),
      }),
    )
    .max(10),
});

export type Brief = z.infer<typeof briefSchema> & {
  assets: Array<{
    assetId: string;
    kind: string;
    recommendedRoles: string[];
    palette: string[];
  }>;
  constraints: {
    allTextEditable: true;
    avoidGenericTechAesthetic: true;
    useUploadedAssets: boolean;
  };
};

const SYSTEM = `You are the brief builder for a flyer studio that refuses to ship dishonest work.

You turn a raw prompt into a structured campaign brief. Your one hard rule:

NEVER INVENT FACTS. Every statement you record carries a source:
- "user"        — the user literally wrote this, or it follows inescapably from what they wrote.
- "assumption"  — a reasonable inference you are making. Label it. Do not disguise it as fact.
- "placeholder" — something the flyer will need but the user has not supplied.

Statistics, testimonials, awards, customer counts, funding, and performance claims are NEVER
"user" unless the user stated them. If you are tempted to write "trusted by thousands" or
"3x faster", that is an invention — either omit it or mark it "placeholder".

Choose the communication archetype from the user's actual intent:
- product-promotion: sell or introduce a product/service
- event-invitation: announce an occasion and its practical details
- awareness-education: explain an issue and move the reader to act
- editorial-announcement: publish a notice, story, programme or update
- offer-promotion: lead with a concrete sale, menu, package or limited offer

Write the CTA label as something a person would actually click or do ("Join the waitlist",
"Book a demo"), not a slogan. If the prompt contains a URL, use it verbatim.

knownBenefits are concrete outcomes for the user, in plain words — not feature names and not
adjectives. "Rewrites your résumé the way recruiters read it" is a benefit. "AI-powered" is not.`;

export async function buildBrief(
  input: {
    prompt: string;
    assets: AssetRecord[];
    brand: { colors?: string[]; tone?: string[] } | null;
  },
  ctx: CallContext,
): Promise<Brief> {
  const assetLines = input.assets.length
    ? input.assets
        .map(
          (a) =>
            `- ${a.id} (${a.kind}, ${a.width}x${a.height}) recommended roles: ${a.analysis.recommendedRoles.join(", ")}`,
        )
        .join("\n")
    : "(none)";

  const prompt = `The user's prompt, verbatim:
"""
${input.prompt}
"""

Uploaded assets:
${assetLines}

Brand hints supplied by the user: ${
    input.brand ? JSON.stringify(input.brand) : "(none — invent a coherent treatment later)"
  }

Produce the campaign brief.`;

  const core = await callStructured(
    {
      role: "planner",
      system: SYSTEM,
      prompt,
      schema: briefSchema,
      schemaName: "campaign_brief",
      maxTokens: 4000,
      effort: "low",
    },
    ctx,
  );

  return {
    ...core,
    assets: input.assets.map((a) => ({
      assetId: a.id,
      kind: a.kind,
      recommendedRoles: a.analysis.recommendedRoles,
      palette: a.analysis.palette,
    })),
    constraints: {
      allTextEditable: true,
      avoidGenericTechAesthetic: true,
      useUploadedAssets: input.assets.length > 0,
    },
  };
}

export type { CampaignArchetype };
