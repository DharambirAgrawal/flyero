import * as z from "zod/v4";
import { callStructured, type CallContext } from "../../llm/index.js";
import type { DesignSpec } from "../compose/spec.js";
import type { GateResult } from "../gates/index.js";

export type SelectionCandidate = {
  spec: DesignSpec;
  png: Buffer;
  gates: GateResult;
  revisions: number;
};

export type SelectionDecision = {
  index: number;
  method: "single-passer" | "comparative-jury" | "deterministic-fallback";
  reason: string;
  findings: string[];
};

const jurySchema = z.object({
  winner: z.number().int().min(0).max(5),
  reason: z.string().min(10).max(300),
  findings: z.array(z.string().min(5).max(180)).max(4),
});

const JURY_SYSTEM = `You are the final creative director choosing between flyer candidates that
already passed every quality gate. This is a comparative editorial decision, not another score.

Pick the candidate that feels most authored and campaign-specific:
- the visual idea is immediately legible and could not fit any random product
- image, type and graphic language form one art-directed world
- the evidence does marketing work instead of decorating the copy
- the hierarchy has a deliberate reading path and a memorable first beat
- it avoids the generic "AI template" look even when every candidate is polished

Do not reward more decoration, more text, novelty for its own sake, or a familiar clean template.
Return one winner and concrete comparative reasons.`;

function fallback(candidates: SelectionCandidate[]): SelectionDecision {
  const ranked = candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort(
      (a, b) =>
        a.candidate.revisions - b.candidate.revisions ||
        a.candidate.gates.notes.length - b.candidate.gates.notes.length ||
        a.candidate.spec.lineage.candidateSeed.localeCompare(b.candidate.spec.lineage.candidateSeed),
    );
  return {
    index: ranked[0]!.index,
    method: "deterministic-fallback",
    reason: "Passing candidates tied without an available comparative jury; chose the least-revised clean result.",
    findings: [],
  };
}

export async function selectPassingCandidate(
  candidates: SelectionCandidate[],
  ctx: CallContext,
  allowVision: boolean,
): Promise<SelectionDecision> {
  if (candidates.length === 0) throw new Error("selectPassingCandidate requires at least one candidate");
  if (candidates.length === 1) {
    return {
      index: 0,
      method: "single-passer",
      reason: "Only one candidate cleared every gate.",
      findings: [],
    };
  }
  if (!allowVision) return fallback(candidates);

  const descriptions = candidates
    .map(
      (candidate, index) =>
        `${index}: idea="${candidate.spec.idea}"; archetype=${candidate.spec.campaignArchetype}; artDirection=${candidate.spec.lineage.artDirection}; ` +
        `metaphor=${candidate.spec.lineage.metaphor}; topology=${candidate.spec.lineage.topology}; ` +
        `readingPath=${candidate.spec.lineage.readingPath}`,
    )
    .join("\n");

  try {
    const verdict = await callStructured(
      {
        role: "vision",
        system: JURY_SYSTEM,
        prompt: `Images are in candidate order, starting at 0.\n\n${descriptions}\n\nChoose the strongest campaign execution.`,
        schema: jurySchema,
        schemaName: "comparative_flyer_jury",
        images: candidates.map((candidate) => ({
          mediaType: "image/png" as const,
          base64: candidate.png.toString("base64"),
        })),
        maxTokens: 2600,
        effort: "low",
      },
      ctx,
    );
    if (verdict.winner >= candidates.length) return fallback(candidates);
    return {
      index: verdict.winner,
      method: "comparative-jury",
      reason: verdict.reason,
      findings: verdict.findings,
    };
  } catch {
    return fallback(candidates);
  }
}
