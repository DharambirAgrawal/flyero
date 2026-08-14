import { createHmac } from "node:crypto";
import { config, hasLlm, type Risk } from "../config.js";
import { buildBrief, type Brief } from "./brief/index.js";
import { sampleLineages, describeLineage } from "./studio/sampler.js";
import { generateIdea } from "./idea/index.js";
import { compose } from "./compose/composer.js";
import { renderSpec, rasterize, rasterizeForCritique } from "./render/index.js";
import { prioritise, ruleCritic, visionCritic, describeFix, type CriticFix } from "./critic/index.js";
import { reviseSpec } from "./revise/index.js";
import { failedGateIds, runGates, type GateResult } from "./gates/index.js";
import { checkEditability, exportFlyer } from "./export/index.js";
import { selectPassingCandidate, type SelectionDecision } from "./select/index.js";
import { assetDataUri, getAssets, type AssetRecord } from "../store/assets.js";
import {
  getJob,
  getRevision,
  saveProcessLog,
  saveRevision,
  setStage,
  updateJob,
  type JobRow,
} from "../store/jobs.js";
import type { CallContext } from "../llm/index.js";
import type { AssetRef } from "../components/types.js";
import type { DesignSpec, Lineage } from "./compose/spec.js";
import type { LayoutResult } from "./layout/solver.js";
import { DEFAULT_FORMAT, FORMAT_IDS, type FormatId } from "../creative/formats.js";

/**
 * The pipeline. Stages 1–10 wired together, with the internal competition that
 * makes the product's promise possible: several candidates are built, and the
 * Gatekeeper ships the best one that clears the bar — or nothing at all.
 */

/** Vision calls are the expensive part; the whole job shares one allowance. */
class VisionBudget {
  private used = 0;
  constructor(private readonly max: number) {}
  take(): boolean {
    if (this.used >= this.max) return false;
    this.used += 1;
    return true;
  }
  get spent(): number {
    return this.used;
  }
  get remaining(): number {
    return Math.max(0, this.max - this.used);
  }
}

export type CandidateOutcome = {
  lineage: Lineage;
  spec: DesignSpec;
  layout: LayoutResult;
  svg: string;
  png: Buffer;
  gates: GateResult;
  revisions: number;
  critiques: CriticFix[][];
  composerAttempts: number;
  error?: string;
};

async function assetRefs(assets: AssetRecord[]): Promise<AssetRef[]> {
  return Promise.all(assets.map(async (a) => ({
    assetId: a.id,
    href: await assetDataUri(a),
    toneMap: a.analysis.toneMap,
    focalPoint: a.analysis.focalPoint,
    subjectBox: a.analysis.subjectBox,
    textSafeZones: a.analysis.textSafeZones,
    width: a.width,
    height: a.height,
  })));
}

async function buildCandidate(
  input: {
    brief: Brief;
    lineage: Lineage;
    assets: AssetRecord[];
    budget: VisionBudget;
    allowVisionCritique: boolean;
    format: FormatId;
  },
  ctx: CallContext,
): Promise<CandidateOutcome> {
  const refs = await assetRefs(input.assets);
  const idea = await generateIdea(
    { brief: input.brief, lineage: input.lineage },
    { ...ctx, stage: "idea" },
  );

  const composed = await compose(
    { brief: input.brief, idea, lineage: input.lineage, format: input.format },
    { ...ctx, stage: "compose" },
  );

  let spec = composed.spec;
  let render = renderSpec(spec, refs);
  let png = rasterizeForCritique(render.svg);
  const critiques: CriticFix[][] = [];
  let revisions = 0;
  let visionReviewed = false;

  for (let round = 0; round < config.maxRevisionLoops; round++) {
    const rules = ruleCritic(spec, render.layout);
    // Vision is only worth spending when the cheap checks are already satisfied.
    const mayReview =
      input.allowVisionCritique && !visionReviewed && !rules.some((f) => f.severity === "high");
    const vision =
      !mayReview || !input.budget.take()
        ? []
        : await visionCritic({ spec, png }, { ...ctx, stage: "critique" });
    if (mayReview && vision.length > 0) visionReviewed = true;

    const fixes = prioritise([...rules, ...vision]);
    critiques.push(fixes);
    if (fixes.length === 0) break;

    try {
      const revised = await reviseSpec(
        { spec, fixes: fixes.map(describeFix) },
        { ...ctx, stage: "revise" },
      );
      if (revised.operations === 0) break;
      spec = revised.spec;
      render = renderSpec(spec, refs);
      png = rasterizeForCritique(render.svg);
      revisions += 1;
    } catch {
      // A revision that will not validate is discarded; the candidate stands as-is.
      break;
    }
  }

  const gateInput = {
    spec,
    layout: render.layout,
    requestedAssetIds: input.assets.map((a) => a.id),
  };
  const preflight = await runGates(gateInput, { ...ctx, stage: "gates" });
  const worthVisualReview =
    Object.values(preflight.mechanical).every(Boolean) &&
    preflight.detail.G3 &&
    preflight.detail.G5 &&
    preflight.detail.G6;
  const gates =
    worthVisualReview && input.budget.take()
      ? await runGates({ ...gateInput, png }, { ...ctx, stage: "gates" })
      : preflight;

  return {
    lineage: input.lineage,
    spec,
    layout: render.layout,
    svg: render.svg,
    png: rasterize(render.svg),
    gates,
    revisions,
    critiques,
    composerAttempts: composed.attempts,
  };
}

/** More gates passed wins; ties break on fewer revisions, then fewer notes. */
function scoreCandidate(c: CandidateOutcome): number {
  const gatesPassed = Object.values(c.gates.detail).filter(Boolean).length;
  const mechPassed = Object.values(c.gates.mechanical).filter(Boolean).length;
  return gatesPassed * 100 + mechPassed * 10 - c.revisions - c.gates.notes.length * 0.1;
}

export async function runJob(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job) throw new Error(`Unknown job ${jobId}`);

  const ctx: CallContext = { jobId, apiKey: job.api_key, stage: "brief" };
  const started = Date.now();

  try {
    if (!hasLlm()) {
      throw new Error("ANTHROPIC_API_KEY is not configured — generation cannot run");
    }

    const assets = await getAssets(JSON.parse(job.asset_ids) as string[]);
    const brand = job.brand ? (JSON.parse(job.brand) as { colors?: string[]; tone?: string[] }) : null;
    const jobFormat = (FORMAT_IDS as string[]).includes(job.format)
      ? (job.format as FormatId)
      : DEFAULT_FORMAT;

    await setStage(jobId, "brief");
    const brief = await buildBrief({ prompt: job.prompt, assets, brand }, ctx);
    await updateJob(jobId, { product_name: brief.product.name });

    await setStage(jobId, "sample");
    const initial = sampleLineages({
      jobSeed: job.job_seed,
      count: config.lineagesPerRun,
      risk: job.risk as Risk,
      campaignArchetype: brief.archetype,
      evidence: assets.length > 0 ? "photographic" : undefined,
    });

    const budget = new VisionBudget(config.maxVisionCallsPerJob);
    const allLineages: Lineage[] = [];
    const candidates: CandidateOutcome[] = [];
    const failures: string[] = [];

    const runLineageSet = async (lineages: Lineage[], allowVisionCritique: boolean) => {
      allLineages.push(...lineages);
      await setStage(jobId, "idea");
      // Candidates within a set run in parallel. A restart is a second bounded
      // set, never an unbounded search and never a history lookup.
      const settled = await Promise.allSettled(
        lineages.map((lineage) =>
          buildCandidate(
            { brief, lineage, assets, budget, allowVisionCritique, format: jobFormat },
            { ...ctx, stage: "idea" },
          ),
        ),
      );
      for (const [i, outcome] of settled.entries()) {
        if (outcome.status === "fulfilled") candidates.push(outcome.value);
        else {
          failures.push(
            `${describeLineage(lineages[i]!)}: ${String(outcome.reason?.message ?? outcome.reason)}`,
          );
        }
      }
    };

    await runLineageSet(initial.lineages, true);

    let restartCount = 0;
    while (
      !candidates.some((candidate) => candidate.gates.passed) &&
      restartCount < config.maxOuterRestarts &&
      budget.remaining > 0
    ) {
      restartCount += 1;
      await setStage(jobId, "sample");
      const restarted = sampleLineages({
        jobSeed: `${job.job_seed}:restart:${restartCount}`,
        count: config.lineagesPerRun,
        risk: job.risk as Risk,
        campaignArchetype: brief.archetype,
        evidence: assets.length > 0 ? "photographic" : undefined,
      });
      // Restart candidates skip the exploratory vision-critic pass. Their
      // remaining allowance is spent on final gate evidence, not polish loops.
      await runLineageSet(restarted.lineages, false);
    }

    if (candidates.length === 0) {
      throw new Error(`every candidate failed — ${failures.join(" | ")}`);
    }

    await setStage(jobId, "gates");
    const ranked = [...candidates].sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
    const passing = candidates.filter((candidate) => candidate.gates.passed);
    let winner: CandidateOutcome;
    let selection: SelectionDecision;
    if (passing.length > 0) {
      const allowJury = passing.length > 1 && budget.take();
      selection = await selectPassingCandidate(
        passing.map((candidate) => ({
          spec: candidate.spec,
          png: rasterizeForCritique(candidate.svg),
          gates: candidate.gates,
          revisions: candidate.revisions,
        })),
        { ...ctx, stage: "select" },
        allowJury,
      );
      winner = passing[selection.index]!;
    } else {
      winner = ranked[0]!;
      selection = {
        index: candidates.indexOf(winner),
        method: "deterministic-fallback",
        reason: "No candidate cleared every gate; attached the mechanically strongest failure.",
        findings: failedGateIds(winner.gates),
      };
    }
    const passed = winner.gates.passed;

    await setStage(jobId, "export");
    const revision = job.revision;
    exportFlyer({ jobId, revision, spec: winner.spec, svg: winner.svg, png: winner.png });
    const editability = checkEditability(winner.svg);

    await saveRevision({
      jobId,
      revision,
      spec: winner.spec,
      layout: winner.layout,
      gates: winner.gates,
      instruction: null,
    });

    // The process log is a training asset — every candidate, not just the winner.
    await saveProcessLog(jobId, revision, {
      brief,
      lineages: allLineages,
      restartCount,
      durationMs: Date.now() - started,
      visionCallsUsed: budget.spent,
      candidateFailures: failures,
      selection,
      editability,
      candidates: candidates.map((c) => ({
        lineage: c.lineage,
        idea: c.spec.idea,
        spec: c.spec,
        layoutWarnings: c.layout.warnings,
        gates: c.gates,
        critiques: c.critiques,
        revisions: c.revisions,
        composerAttempts: c.composerAttempts,
        score: scoreCandidate(c),
        won: c === winner,
      })),
    });

    await updateJob(jobId, {
      status: passed ? "done" : "below_bar",
      stage: null,
      idea: winner.spec.idea,
      lineage: JSON.stringify(winner.lineage),
      gates: JSON.stringify(winner.gates),
      below_bar: passed ? 0 : 1,
      failed_gates: passed ? null : JSON.stringify(failedGateIds(winner.gates)),
      reason: passed ? null : winner.gates.notes.slice(0, 3).join("; ") || "did not clear the bar",
    });

    await notify(jobId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateJob(jobId, { status: "failed", stage: null, error: message });
    await saveProcessLog(jobId, job.revision, { error: message, durationMs: Date.now() - started });
    await notify(jobId);
  }
}

/** Re-runs one revision of an existing flyer against a plain-language instruction. */
export async function runRevision(jobId: string, instruction: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job) throw new Error(`Unknown job ${jobId}`);
  const ctx: CallContext = { jobId, apiKey: job.api_key, stage: "revise" };

  try {
    if (!hasLlm()) {
      // runJob checks this before starting; this path never did, so a
      // caller with no server-side model key (revise_flyer over MCP, or
      // POST /v1/flyers/:id/revise directly) got a raw SDK exception after
      // a poll delay instead of the same clear, immediate signal
      // create_flyer already gives up front.
      throw new Error(
        "ANTHROPIC_API_KEY is not configured — revision cannot run. Use revise_composition instead " +
          "(the agent-native path: apply the change to the spec yourself and call compose_flyer again " +
          "with the same flyerId).",
      );
    }
    const previous = job.revision;
    const row = await getRevision(jobId, previous);
    if (!row) throw new Error(`Job ${jobId} has no revision ${previous} to revise`);

    const spec = JSON.parse(row.spec) as DesignSpec;
    const assets = await getAssets(JSON.parse(job.asset_ids) as string[]);
    const refs = await assetRefs(assets);

    await setStage(jobId, "revise");
    const revised = await reviseSpec({ spec, fixes: [], userInstruction: instruction }, ctx);

    await setStage(jobId, "render");
    const render = renderSpec(revised.spec, refs);
    const png = rasterize(render.svg);

    await setStage(jobId, "gates");
    const budget = new VisionBudget(2);
    const gates = await runGates(
      {
        spec: revised.spec,
        layout: render.layout,
        requestedAssetIds: assets.map((a) => a.id),
        png: budget.take() ? rasterizeForCritique(render.svg) : undefined,
      },
      { ...ctx, stage: "gates" },
    );

    const revision = previous + 1;
    exportFlyer({ jobId, revision, spec: revised.spec, svg: render.svg, png });
    await saveRevision({ jobId, revision, spec: revised.spec, layout: render.layout, gates, instruction });
    await saveProcessLog(jobId, revision, {
      instruction,
      operations: revised.operations,
      gates,
      layoutWarnings: render.layout.warnings,
    });

    await updateJob(jobId, {
      status: gates.passed ? "done" : "below_bar",
      stage: null,
      revision,
      gates: JSON.stringify(gates),
      below_bar: gates.passed ? 0 : 1,
      failed_gates: gates.passed ? null : JSON.stringify(failedGateIds(gates)),
      reason: gates.passed ? null : gates.notes.slice(0, 3).join("; "),
    });

    await notify(jobId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateJob(jobId, { status: "failed", stage: null, error: message });
    await notify(jobId);
  }
}

async function notify(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job?.callback_url) return;
  const payload = {
    jobId: job.id,
    status: job.status,
    idea: job.idea ?? undefined,
    urls: {
      png: `/v1/flyers/${job.id}/export?format=png`,
      svg: `/v1/flyers/${job.id}/export?format=svg`,
      spec: `/v1/flyers/${job.id}/spec`,
    },
  };
  const body = JSON.stringify(payload);
  const signature = config.webhookSigningSecret
    ? createHmac("sha256", config.webhookSigningSecret).update(body).digest("hex")
    : "";
  try {
    await fetch(job.callback_url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-flyero-signature": signature },
      body,
    });
  } catch {
    // A dead webhook must never fail the job that already succeeded.
  }
}

export type { JobRow };
