import { ulid } from "ulid";
import { dbAll, dbGet, dbRun, nowIso } from "./db.js";
import type { Risk } from "../config.js";
import { DEFAULT_FORMAT } from "../creative/formats.js";
import type { DesignSpec, Lineage } from "../core/compose/spec.js";
import type { GateResult } from "../core/gates/index.js";
import type { LayoutResult } from "../core/layout/solver.js";

export type JobStatus =
  | "queued"
  | "generating"
  /** Rendered and code-checked, but nobody has looked at it yet (agent flow). */
  | "awaiting_review"
  | "done"
  | "below_bar"
  | "failed";

export type PipelineStage =
  | "brief"
  | "sample"
  | "idea"
  | "compose"
  | "layout"
  | "render"
  | "critique"
  | "revise"
  | "gates"
  | "export";

export type JobRow = {
  id: string;
  api_key: string;
  batch_id: string | null;
  status: JobStatus;
  stage: PipelineStage | null;
  prompt: string;
  product_name: string | null;
  risk: Risk;
  format: string;
  brand: string | null;
  asset_ids: string;
  callback_url: string | null;
  job_seed: string;
  revision: number;
  idea: string | null;
  lineage: string | null;
  gates: string | null;
  below_bar: number;
  failed_gates: string | null;
  reason: string | null;
  cost_usd: number;
  llm_calls: number;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateJobInput = {
  id: string;
  apiKey: string;
  prompt: string;
  risk: Risk;
  format?: string;
  jobSeed: string;
  assetIds: string[];
  brand: unknown;
  callbackUrl: string | null;
  batchId: string | null;
};

export async function createJob(input: CreateJobInput): Promise<void> {
  const ts = nowIso();
  await dbRun(
    `INSERT INTO jobs (id, api_key, batch_id, status, stage, prompt, risk, format, brand, asset_ids,
                       callback_url, job_seed, revision, created_at, updated_at)
     VALUES ($1, $2, $3, 'queued', NULL, $4, $5, $6, $7, $8, $9, $10, 0, $11, $11)`,
    [
      input.id,
      input.apiKey,
      input.batchId,
      input.prompt,
      input.risk,
      input.format ?? DEFAULT_FORMAT,
      input.brand ? JSON.stringify(input.brand) : null,
      JSON.stringify(input.assetIds),
      input.callbackUrl,
      input.jobSeed,
      ts,
    ],
  );
}

export async function getJob(id: string): Promise<JobRow | null> {
  return dbGet<JobRow>("SELECT * FROM jobs WHERE id = $1", [id]);
}

export async function updateJob(id: string, patch: Partial<Record<string, unknown>>): Promise<void> {
  const keys = Object.keys(patch);
  if (keys.length === 0) return;
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
  const values = keys.map((k) => patch[k]);
  await dbRun(`UPDATE jobs SET ${sets}, updated_at = $${keys.length + 1} WHERE id = $${keys.length + 2}`, [
    ...values,
    nowIso(),
    id,
  ]);
}

export async function setStage(id: string, stage: PipelineStage): Promise<void> {
  await updateJob(id, { status: "generating", stage });
}

export async function saveRevision(input: {
  jobId: string;
  revision: number;
  spec: DesignSpec;
  layout: LayoutResult;
  gates: GateResult;
  instruction: string | null;
}): Promise<void> {
  await dbRun(
    `INSERT INTO revisions (job_id, revision, spec, layout, gates, instruction, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (job_id, revision) DO UPDATE SET
       spec = EXCLUDED.spec, layout = EXCLUDED.layout, gates = EXCLUDED.gates,
       instruction = EXCLUDED.instruction, created_at = EXCLUDED.created_at`,
    [
      input.jobId,
      input.revision,
      JSON.stringify(input.spec),
      JSON.stringify(input.layout),
      JSON.stringify(input.gates),
      input.instruction,
      nowIso(),
    ],
  );
}

export type RevisionRow = {
  job_id: string;
  revision: number;
  spec: string;
  layout: string;
  gates: string;
  instruction: string | null;
  created_at: string;
};

export async function getRevision(jobId: string, revision: number): Promise<RevisionRow | null> {
  return dbGet<RevisionRow>("SELECT * FROM revisions WHERE job_id = $1 AND revision = $2", [
    jobId,
    revision,
  ]);
}

export async function listRevisions(jobId: string): Promise<RevisionRow[]> {
  return dbAll<RevisionRow>("SELECT * FROM revisions WHERE job_id = $1 ORDER BY revision", [jobId]);
}

/** The process log is sacred (AGENTS.md): written for every job, never deleted. */
export async function saveProcessLog(jobId: string, revision: number, log: unknown): Promise<void> {
  await dbRun(
    `INSERT INTO process_logs (job_id, revision, log, created_at) VALUES ($1, $2, $3, $4)
     ON CONFLICT (job_id, revision) DO UPDATE SET log = EXCLUDED.log, created_at = EXCLUDED.created_at`,
    [jobId, revision, JSON.stringify(log), nowIso()],
  );
}

export async function getProcessLog(jobId: string, revision: number): Promise<unknown | null> {
  const row = await dbGet<{ log: string }>(
    "SELECT log FROM process_logs WHERE job_id = $1 AND revision = $2",
    [jobId, revision],
  );
  return row ? JSON.parse(row.log) : null;
}

/**
 * Recent flyers for a key, newest first.
 *
 * Added because a flyer could be created and then be unfindable: the id lived
 * only in a chat transcript, and if the image never reached the reader there
 * was no way back to it. A job store you cannot enumerate is a job store that
 * loses work.
 */
export async function listJobs(apiKey: string, limit = 20): Promise<JobRow[]> {
  return dbAll<JobRow>("SELECT * FROM jobs WHERE api_key = $1 ORDER BY created_at DESC LIMIT $2", [
    apiKey,
    limit,
  ]);
}

export async function countActiveJobs(apiKey: string): Promise<number> {
  const row = await dbGet<{ n: number | string }>(
    "SELECT COUNT(*) AS n FROM jobs WHERE api_key = $1 AND status IN ('queued','generating')",
    [apiKey],
  );
  // pg returns COUNT(*) as a string (it's a bigint); SQLite returns a number.
  return Number(row?.n ?? 0);
}

export async function spendToday(apiKey: string): Promise<number> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const row = await dbGet<{ total: number | string }>(
    "SELECT COALESCE(SUM(usd), 0) AS total FROM cost_events WHERE api_key = $1 AND created_at >= $2",
    [apiKey, since.toISOString()],
  );
  return Number(row?.total ?? 0);
}

export async function recordCost(input: {
  jobId: string | null;
  apiKey: string;
  stage: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  usd: number;
}): Promise<void> {
  await dbRun(
    `INSERT INTO cost_events (id, job_id, api_key, stage, model, input_tokens, output_tokens, usd, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      `cost_${ulid()}`,
      input.jobId,
      input.apiKey,
      input.stage,
      input.model,
      input.inputTokens,
      input.outputTokens,
      input.usd,
      nowIso(),
    ],
  );
  if (input.jobId) {
    await dbRun("UPDATE jobs SET cost_usd = cost_usd + $1, llm_calls = llm_calls + 1 WHERE id = $2", [
      input.usd,
      input.jobId,
    ]);
  }
}

export async function createBatch(input: {
  id: string;
  apiKey: string;
  prompt: string;
  runs: number;
  risk: Risk;
  format?: string;
}): Promise<void> {
  await dbRun(
    "INSERT INTO batches (id, api_key, prompt, runs, risk, format, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [input.id, input.apiKey, input.prompt, input.runs, input.risk, input.format ?? DEFAULT_FORMAT, nowIso()],
  );
}

export type BatchRow = {
  id: string;
  api_key: string;
  prompt: string;
  runs: number;
  risk: Risk;
  format: string;
  created_at: string;
};

export async function getBatch(id: string): Promise<BatchRow | null> {
  return dbGet<BatchRow>("SELECT * FROM batches WHERE id = $1", [id]);
}

export async function jobsInBatch(batchId: string): Promise<JobRow[]> {
  return dbAll<JobRow>("SELECT * FROM jobs WHERE batch_id = $1 ORDER BY created_at", [batchId]);
}

export function parseLineage(row: JobRow): Lineage | null {
  return row.lineage ? (JSON.parse(row.lineage) as Lineage) : null;
}
