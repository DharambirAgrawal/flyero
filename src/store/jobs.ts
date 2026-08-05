import { getDb, nowIso } from "./db.js";
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

export function createJob(input: CreateJobInput): void {
  const ts = nowIso();
  getDb()
    .prepare(
      `INSERT INTO jobs (id, api_key, batch_id, status, stage, prompt, risk, format, brand, asset_ids,
                         callback_url, job_seed, revision, created_at, updated_at)
       VALUES (@id, @apiKey, @batchId, 'queued', NULL, @prompt, @risk, @format, @brand, @assetIds,
               @callbackUrl, @jobSeed, 0, @ts, @ts)`,
    )
    .run({
      id: input.id,
      apiKey: input.apiKey,
      batchId: input.batchId,
      prompt: input.prompt,
      risk: input.risk,
      format: input.format ?? DEFAULT_FORMAT,
      brand: input.brand ? JSON.stringify(input.brand) : null,
      assetIds: JSON.stringify(input.assetIds),
      callbackUrl: input.callbackUrl,
      jobSeed: input.jobSeed,
      ts,
    });
}

export function getJob(id: string): JobRow | null {
  return (getDb().prepare("SELECT * FROM jobs WHERE id = ?").get(id) as JobRow | undefined) ?? null;
}

export function updateJob(id: string, patch: Partial<Record<string, unknown>>): void {
  const keys = Object.keys(patch);
  if (keys.length === 0) return;
  const sets = keys.map((k) => `${k} = @${k}`).join(", ");
  getDb()
    .prepare(`UPDATE jobs SET ${sets}, updated_at = @updated_at WHERE id = @id`)
    .run({ ...patch, id, updated_at: nowIso() });
}

export function setStage(id: string, stage: PipelineStage): void {
  updateJob(id, { status: "generating", stage });
}

export function saveRevision(input: {
  jobId: string;
  revision: number;
  spec: DesignSpec;
  layout: LayoutResult;
  gates: GateResult;
  instruction: string | null;
}): void {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO revisions (job_id, revision, spec, layout, gates, instruction, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.jobId,
      input.revision,
      JSON.stringify(input.spec),
      JSON.stringify(input.layout),
      JSON.stringify(input.gates),
      input.instruction,
      nowIso(),
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

export function getRevision(jobId: string, revision: number): RevisionRow | null {
  return (
    (getDb()
      .prepare("SELECT * FROM revisions WHERE job_id = ? AND revision = ?")
      .get(jobId, revision) as RevisionRow | undefined) ?? null
  );
}

export function listRevisions(jobId: string): RevisionRow[] {
  return getDb()
    .prepare("SELECT * FROM revisions WHERE job_id = ? ORDER BY revision")
    .all(jobId) as RevisionRow[];
}

/** The process log is sacred (AGENTS.md): written for every job, never deleted. */
export function saveProcessLog(jobId: string, revision: number, log: unknown): void {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO process_logs (job_id, revision, log, created_at) VALUES (?, ?, ?, ?)`,
    )
    .run(jobId, revision, JSON.stringify(log), nowIso());
}

export function getProcessLog(jobId: string, revision: number): unknown | null {
  const row = getDb()
    .prepare("SELECT log FROM process_logs WHERE job_id = ? AND revision = ?")
    .get(jobId, revision) as { log: string } | undefined;
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
export function listJobs(apiKey: string, limit = 20): JobRow[] {
  return getDb()
    .prepare("SELECT * FROM jobs WHERE api_key = ? ORDER BY created_at DESC LIMIT ?")
    .all(apiKey, limit) as JobRow[];
}

export function countActiveJobs(apiKey: string): number {
  const row = getDb()
    .prepare(
      "SELECT COUNT(*) AS n FROM jobs WHERE api_key = ? AND status IN ('queued','generating')",
    )
    .get(apiKey) as { n: number };
  return row.n;
}

export function spendToday(apiKey: string): number {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const row = getDb()
    .prepare("SELECT COALESCE(SUM(usd), 0) AS total FROM cost_events WHERE api_key = ? AND created_at >= ?")
    .get(apiKey, since.toISOString()) as { total: number };
  return row.total;
}

export function recordCost(input: {
  jobId: string | null;
  apiKey: string;
  stage: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  usd: number;
}): void {
  getDb()
    .prepare(
      `INSERT INTO cost_events (job_id, api_key, stage, model, input_tokens, output_tokens, usd, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.jobId,
      input.apiKey,
      input.stage,
      input.model,
      input.inputTokens,
      input.outputTokens,
      input.usd,
      nowIso(),
    );
  if (input.jobId) {
    getDb()
      .prepare("UPDATE jobs SET cost_usd = cost_usd + ?, llm_calls = llm_calls + 1 WHERE id = ?")
      .run(input.usd, input.jobId);
  }
}

export function createBatch(input: {
  id: string;
  apiKey: string;
  prompt: string;
  runs: number;
  risk: Risk;
  format?: string;
}): void {
  getDb()
    .prepare(
      "INSERT INTO batches (id, api_key, prompt, runs, risk, format, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      input.id,
      input.apiKey,
      input.prompt,
      input.runs,
      input.risk,
      input.format ?? DEFAULT_FORMAT,
      nowIso(),
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

export function getBatch(id: string): BatchRow | null {
  return (
    (getDb().prepare("SELECT * FROM batches WHERE id = ?").get(id) as BatchRow | undefined) ?? null
  );
}

export function jobsInBatch(batchId: string): JobRow[] {
  return getDb()
    .prepare("SELECT * FROM jobs WHERE batch_id = ? ORDER BY created_at")
    .all(batchId) as JobRow[];
}

export function parseLineage(row: JobRow): Lineage | null {
  return row.lineage ? (JSON.parse(row.lineage) as Lineage) : null;
}
