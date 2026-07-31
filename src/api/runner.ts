import { config } from "../config.js";
import { runJob, runRevision } from "../core/pipeline.js";
import { updateJob } from "../store/jobs.js";

/**
 * In-process async job runner (v1). Jobs are queued per API key and drained up
 * to MAX_CONCURRENT_JOBS. BullMQ replaces this when sustained load justifies it
 * (ROADMAP L6) — the interface here is deliberately the whole surface that
 * would need to change.
 */

type Task = { jobId: string; run: () => Promise<void> };

const queue: Task[] = [];
const inFlight = new Set<string>();

function pump(): void {
  while (inFlight.size < config.maxConcurrentJobs && queue.length > 0) {
    const task = queue.shift()!;
    inFlight.add(task.jobId);
    void task
      .run()
      .catch((err) => {
        updateJob(task.jobId, {
          status: "failed",
          stage: null,
          error: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => {
        inFlight.delete(task.jobId);
        pump();
      });
  }
}

export function enqueueJob(jobId: string): void {
  queue.push({ jobId, run: () => withTimeout(runJob(jobId), jobId) });
  pump();
}

export function enqueueRevision(jobId: string, instruction: string): void {
  queue.push({ jobId, run: () => withTimeout(runRevision(jobId, instruction), jobId) });
  pump();
}

async function withTimeout(work: Promise<void>, jobId: string): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`job ${jobId} exceeded JOB_TIMEOUT_SECONDS (${config.jobTimeoutSeconds}s)`)),
      config.jobTimeoutSeconds * 1000,
    );
  });
  try {
    await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function queueDepth(): { queued: number; running: number } {
  return { queued: queue.length, running: inFlight.size };
}

/** Test seam: resolves once nothing is queued or running. */
export async function drain(pollMs = 50): Promise<void> {
  while (queue.length > 0 || inFlight.size > 0) {
    await new Promise((r) => setTimeout(r, pollMs));
  }
}
