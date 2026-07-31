import * as z from "zod/v4";
import { contrastRatio, meetsAA } from "../../creative/color.js";
import { inkFor } from "../../components/primitives.js";
import { themeFromSpec } from "../render/theme.js";
import { BUSY_VARIANCE } from "../canvas/tone.js";
import { detectBanned, type BannedHit } from "../../creative/banned.js";
import { typographyById } from "../../creative/typebehaviors.js";
import { recipeFor } from "../layout/recipes.js";
import { callStructured, type CallContext } from "../../llm/index.js";
import { hasLlm } from "../../config.js";
import type { DesignSpec } from "../compose/spec.js";
import type { LayoutResult } from "../layout/solver.js";

/**
 * Stage 9 — Gatekeeper. The Six Gates plus the mechanical checks.
 *
 * Evaluation follows SCHEMAS.md §7 exactly, so nobody has to invent scoring.
 * Gates that need judgement (does the idea read? is the product guessable?) ask
 * the vision critic a targeted yes/no question; everything else is code.
 */

export type GateId = "G1" | "G2" | "G3" | "G4" | "G5" | "G6";

export type GateResult = {
  passed: boolean;
  detail: Record<GateId, boolean>;
  mechanical: {
    overflow: boolean;
    contrast: boolean;
    margins: boolean;
    ctaPresent: boolean;
    assetsUsedOrReported: boolean;
    bannedListClear: boolean;
  };
  notes: string[];
  bannedHits: BannedHit[];
  unusedAssets: string[];
  /**
   * G1, G2 and G4 cannot be settled by code alone — someone has to look. This
   * records who did: an in-house vision model, an external agent that read the
   * render, or nobody yet. A flyer with "pending" here is never `passed`, which
   * is what stops the honest-failure promise from being quietly bypassed when
   * no reviewer is configured.
   */
  visualReview: "model" | "agent" | "pending";
};

/** Slogan-shaped emptiness. Gate G6's regex half. */
const HOLLOW_WORDS = [
  "innovate",
  "elevate",
  "empower",
  "unlock",
  "revolutionize",
  "revolutionise",
  "seamless",
  "cutting-edge",
  "game-changing",
  "next-generation",
  "supercharge",
  "transform your",
  "take it to the next level",
  "the future of",
  "reimagine",
];

/** Numbers that look like invented proof. */
const STAT_PATTERN = /\b\d+(\.\d+)?\s*(%|x\b|×)|\b\d{1,3},\d{3}\+?\b|\b\d+\s*(million|billion|k\+)\b/i;

export const visionVerdictSchema = z.object({
  ideaReads: z.boolean().describe("Can you describe this flyer's single visual idea in one sentence?"),
  ideaAsSeen: z.string().max(160).describe("State the idea you actually see, in your own words."),
  productGuessable: z
    .boolean()
    .describe("With the logo and headline ignored, can you tell roughly what the product does?"),
  productGuess: z.string().max(120),
  headlineParticipates: z
    .boolean()
    .describe("Does the headline take part in the composition, or is it a label floating on decoration?"),
  copyReadsHuman: z.boolean().describe("Does the copy sound like a person wrote it?"),
  collisions: z.array(z.string().max(120)).max(5).describe("Elements that overlap illegibly, if any"),
});

export type VisionVerdict = z.infer<typeof visionVerdictSchema>;

const VISION_SYSTEM = `You are the final reviewer in a flyer studio. You are shown a rendered flyer
and you answer specific questions about it. You are not asked whether you like it.

Judge only what is visible. Be strict but fair:
- "productGuessable" means: cover the logo and the headline in your mind. Does the remaining
  imagery still suggest what kind of product this is? Generic shapes, abstract gradients, and
  decorative panels do NOT count. A depicted document, interface, chart, or artefact does.
- "headlineParticipates" means the headline has a structural role — it is scaled against
  something, overlaps something, is masked by something, or anchors the composition. A
  headline sitting politely in empty space above a picture does not participate.
- "collisions" lists only overlaps that genuinely harm legibility, not deliberate layering.`;

export type GateInput = {
  spec: DesignSpec;
  layout: LayoutResult;
  requestedAssetIds: string[];
  /** Rendered flyer for the in-house vision critic to judge. */
  png?: Buffer;
  /** A verdict supplied by an external reviewer that already looked at the render. */
  verdict?: VisionVerdict | null;
};

export async function runGates(input: GateInput, ctx: CallContext): Promise<GateResult> {
  const { spec, layout } = input;
  const notes: string[] = [];

  // ── Mechanical checks (pure code, hard failures) ──────────────────────────
  const safe = {
    x: spec.canvas.safe,
    y: spec.canvas.safe,
    w: spec.canvas.w - spec.canvas.safe * 2,
    h: spec.canvas.h - spec.canvas.safe * 2,
  };

  const overflowWarnings = layout.warnings.filter(
    (w) => w.includes("does not fit") || w.includes("overflows") || w.includes("exceeds"),
  );
  const overflow = overflowWarnings.length === 0;
  if (!overflow) notes.push(...overflowWarnings);

  // Body and CTA text must clear WCAG-AA against the ground they sit on.
  //
  // "The ground" is not `brand.colors.bg`. Once a flyer can carry a gradient
  // wash or a diagonal colour split, the flat page colour may be painted over
  // across most of the canvas, and checking against it would happily pass a
  // flyer whose CTA is unreadable. Each element is therefore checked against
  // the fill actually underneath it, and against the ink it will actually be
  // drawn in — which for a box the solver marked `onDark` is a light ink, not
  // the brand foreground.
  const { bg, fg, accent, muted } = spec.brand.colors;
  const contrastFailures: string[] = [];
  const theme = themeFromSpec(spec);

  for (const el of spec.elements) {
    if (el.role === "structure" || el.role === "evidence") continue;
    const box = layout.boxes[el.id];
    if (!box) continue;
    const ink = inkFor(theme, box, fg);
    // Headline-scale type is held to the large-text threshold, as WCAG allows.
    const large = (box.fontSize ?? 0) >= 32;

    // Checked against the *measured* tone field the solver used, not against a
    // separate estimate. A gate that reasons from different numbers than the
    // solver is a gate that can disagree with the picture it is judging — and
    // a contrast ratio alone cannot see that fine type over leaves is
    // unreadable at any ratio, which is why `legibleFor` also weighs busyness.
    if (!layout.tone.legibleFor(box, ink, large)) {
      const sample = layout.tone.sample(box);
      contrastFailures.push(
        `${el.id}: ink ${ink} over measured tone ${sample.luminance.toFixed(2)}` +
          ` (${contrastRatio(ink, sample.fill).toFixed(2)}:1` +
          `${sample.variance > BUSY_VARIANCE ? ", busy ground" : ""})`,
      );
    }
  }

  // The palette still has to hold up on the base wash, so a flyer cannot pass
  // merely because every element happens to sit on a region that rescues it.
  const base = layout.ground.base;
  if (!meetsAA(fg, base)) {
    contrastFailures.push(`foreground ${fg} on ${base} is ${contrastRatio(fg, base).toFixed(2)}:1`);
  }
  if (!meetsAA(muted, base, true)) {
    contrastFailures.push(`muted ${muted} on ${base} is ${contrastRatio(muted, base).toFixed(2)}:1`);
  }
  if (!meetsAA(accent, base, true)) {
    contrastFailures.push(`accent ${accent} on ${base} is ${contrastRatio(accent, base).toFixed(2)}:1`);
  }
  const contrast = contrastFailures.length === 0;
  if (!contrast) notes.push(...contrastFailures);

  const gestureElement = layout.appliedGesture?.elementId ?? null;
  // Slots the topology deliberately runs off the canvas. Without this the gate
  // contradicts the recipe and fails a flyer for doing exactly what its own
  // composition asked for.
  const bleedSlots = new Set(recipeFor(spec.lineage.topology).bleed);
  const slotFor = (el: { component: string; role: string }) =>
    el.component === "eyebrow-label" ? "eyebrow" : el.role;
  const marginFailures: string[] = [];
  for (const el of spec.elements) {
    if (el.role === "structure" || el.id === gestureElement) continue;
    if (bleedSlots.has(slotFor(el) as never)) continue;
    const box = layout.boxes[el.id];
    if (!box) continue;
    if (
      box.x < safe.x - 1 ||
      box.y < safe.y - 1 ||
      box.x + box.w > safe.x + safe.w + 1 ||
      box.y + box.h > safe.y + safe.h + 1
    ) {
      marginFailures.push(`${el.id} breaks the safe margin without being the signature gesture`);
    }
  }
  const margins = marginFailures.length === 0;
  if (!margins) notes.push(...marginFailures);

  const ctaEl = spec.elements.find((e) => e.role === "cta");
  const ctaPresent = Boolean(ctaEl && spec.copy.cta.label.trim().length > 0);
  if (!ctaPresent) notes.push("no legible call to action");

  const usedAssets = new Set(spec.elements.flatMap((e) => e.assets ?? []));
  const unusedAssets = input.requestedAssetIds.filter((id) => !usedAssets.has(id));
  // Unused is acceptable — silently dropping without reporting is not.
  const assetsUsedOrReported = true;
  if (unusedAssets.length > 0) {
    notes.push(`assets not placed: ${unusedAssets.join(", ")}`);
  }

  // The ground is passed in because a gradient running navy -> cyan would
  // otherwise evade signal 1 entirely, reopening the exact hole the banned list
  // exists to close: it only ever inspected `brand.colors.bg`.
  const banned = detectBanned(spec, layout.boxes, layout.ground);
  if (!banned.clear) {
    notes.push(...banned.hits.map((h) => `banned-list: ${h.signal} — ${h.detail}`));
  }

  // ── The Six Gates ─────────────────────────────────────────────────────────
  // An externally supplied verdict wins: the reviewer already saw the render,
  // so there is nothing to gain from asking a model the same questions again.
  const vision =
    input.verdict ?? (input.png && hasLlm() ? await askVision(spec, input.png, ctx) : null);
  const visualReview: GateResult["visualReview"] = input.verdict
    ? "agent"
    : vision
      ? "model"
      : "pending";
  if (visualReview === "pending") {
    notes.push(
      "awaiting visual review — G1, G2 and G4 cannot be settled by code, so this flyer is not done",
    );
  }

  // G1 — one idea.
  const ideaWellFormed = spec.idea.trim().length >= 10 && spec.idea.length <= 140;
  const g1 = ideaWellFormed && (vision ? vision.ideaReads : true);
  if (!ideaWellFormed) notes.push("G1: idea sentence missing or too long");
  if (vision && !vision.ideaReads) notes.push(`G1: the idea does not read — reviewer saw "${vision.ideaAsSeen}"`);

  // G2 — the cover test.
  const hasEvidence = spec.elements.some((e) => e.role === "evidence");
  const g2 = hasEvidence && (vision ? vision.productGuessable : true);
  if (!hasEvidence) notes.push("G2: no evidence element — nothing shows the product");
  if (vision && !vision.productGuessable) {
    notes.push(`G2: product not guessable with logo and headline covered (reviewer guessed "${vision.productGuess}")`);
  }

  // G3 — restraint.
  const count = spec.elements.length;
  const everyElementJustified = spec.elements.every((e) => e.whyHere.trim().length >= 8);
  const g3 = count >= 4 && count <= 7 && everyElementJustified;
  if (!g3) notes.push(`G3: ${count} elements, all justified: ${everyElementJustified}`);

  // G4 — type participates.
  const headlineEl = spec.elements.find((e) => e.component === "headline-block");
  const typography = typographyById(spec.lineage.typography);
  const headlineInRelationship = headlineEl
    ? spec.relationships.some((r) => r.front === headlineEl.id || r.behind === headlineEl.id)
    : false;
  const headlineIsGestureTarget = headlineEl ? layout.appliedGesture?.elementId === headlineEl.id : false;
  const structurallyParticipates =
    typography.participating || headlineInRelationship || headlineIsGestureTarget;
  const g4 = structurallyParticipates && (vision ? vision.headlineParticipates : true);
  if (!structurallyParticipates) {
    notes.push("G4: headline has no structural role and the typography behaviour does not give it one");
  }
  if (vision && !vision.headlineParticipates) {
    notes.push("G4: reviewer reads the headline as a floating label");
  }

  // G5 — exactly one gesture, actually applied.
  const g5 = layout.appliedGesture !== null && spec.gesture.purpose.trim().length >= 8;
  if (!g5) notes.push("G5: the signature gesture was not applied to this composition");

  // G6 — real words.
  const copyBlob = [spec.copy.eyebrow, spec.copy.headline, spec.copy.body, spec.copy.cta.label]
    .filter(Boolean)
    .join(" ");
  const hollow = HOLLOW_WORDS.filter((w) => copyBlob.toLowerCase().includes(w));
  const inventedStat = STAT_PATTERN.test(copyBlob);
  const g6 = hollow.length === 0 && !inventedStat && (vision ? vision.copyReadsHuman : true);
  if (hollow.length > 0) notes.push(`G6: slogan-shaped words: ${hollow.join(", ")}`);
  if (inventedStat) notes.push("G6: copy contains a figure that reads as an invented statistic");
  if (vision && !vision.copyReadsHuman) notes.push("G6: reviewer finds the copy machine-written");

  if (vision?.collisions.length) {
    notes.push(...vision.collisions.map((c) => `collision: ${c}`));
  }

  const detail: Record<GateId, boolean> = { G1: g1, G2: g2, G3: g3, G4: g4, G5: g5, G6: g6 };
  const mechanical = {
    overflow,
    contrast,
    margins,
    ctaPresent,
    assetsUsedOrReported,
    bannedListClear: banned.clear,
  };

  return {
    passed:
      visualReview !== "pending" &&
      Object.values(detail).every(Boolean) &&
      Object.values(mechanical).every(Boolean),
    detail,
    mechanical,
    notes,
    bannedHits: banned.hits,
    unusedAssets,
    visualReview,
  };
}

async function askVision(
  spec: DesignSpec,
  png: Buffer,
  ctx: CallContext,
): Promise<VisionVerdict | null> {
  try {
    return await callStructured(
      {
        role: "vision",
        system: VISION_SYSTEM,
        prompt: `This flyer is for "${spec.productName}".

Its intended idea was: "${spec.idea}"

Answer the questions about what you actually see. Do not be generous — this flyer will only ship if it genuinely clears the bar.`,
        schema: visionVerdictSchema,
        schemaName: "gate_verdict",
        images: [{ mediaType: "image/png", base64: png.toString("base64") }],
        maxTokens: 3000,
        effort: "low",
      },
      ctx,
    );
  } catch {
    return null;
  }
}

export function failedGateIds(result: GateResult): string[] {
  const gates = (Object.keys(result.detail) as GateId[]).filter((g) => !result.detail[g]);
  const mech = Object.entries(result.mechanical)
    .filter(([, ok]) => !ok)
    .map(([k]) => k);
  return [...gates, ...mech];
}
