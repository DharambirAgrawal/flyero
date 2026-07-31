/**
 * Live end-to-end smoke run: the loop from docs/API.md §8, against the real API
 * and real models. This is the daily development loop, and the only thing here
 * that spends money — which is why it is a script and not part of `npm test`.
 *
 *   npm run smoke -- "Flyer for X. Do Y at z.com"
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { config } from "../src/config.js";
import { buildServer } from "../src/api/server.js";

const PROMPT =
  process.argv.slice(2).join(" ") ||
  "Flyer for Vayami, an AI resume tool. Get people to join the waitlist at vayami.ai/waitlist.";

const OUT = ".scratch/smoke";

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const app = buildServer();
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  const base = typeof address === "object" && address ? `http://127.0.0.1:${address.port}` : "";
  const headers = {
    authorization: `Bearer ${config.apiKeys[0]}`,
    "content-type": "application/json",
  };

  console.log(`models: planner=${config.models.planner} vision=${config.models.vision} cheap=${config.models.cheap}`);
  console.log(`prompt: ${PROMPT}\n`);

  const started = Date.now();
  const created = await (
    await fetch(`${base}/v1/flyers`, {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt: PROMPT }),
    })
  ).json();

  if (!created.jobId) {
    console.error("create failed:", JSON.stringify(created, null, 2));
    process.exit(1);
  }
  console.log(`job ${created.jobId} queued`);

  let job: any = created;
  let lastStage = "";
  while (!["done", "below_bar", "failed"].includes(job.status)) {
    await new Promise((r) => setTimeout(r, 2500));
    job = await (await fetch(`${base}/v1/flyers/${created.jobId}`, { headers })).json();
    if (job.stage && job.stage !== lastStage) {
      lastStage = job.stage;
      console.log(`  ${Math.round((Date.now() - started) / 1000)}s · ${job.stage}`);
    }
  }

  const seconds = Math.round((Date.now() - started) / 1000);
  console.log(`\nstatus: ${job.status} in ${seconds}s`);

  if (job.status === "failed") {
    console.error(`error: ${job.error}`);
    const proc = await (
      await fetch(`${base}/v1/flyers/${created.jobId}/process`, { headers })
    ).json();
    console.error(JSON.stringify(proc, null, 2).slice(0, 2000));
    await app.close();
    process.exit(1);
  }

  console.log(`idea:  ${job.idea}`);
  if (job.lineage) {
    console.log(
      `design: ${job.lineage.metaphor} · ${job.lineage.topology} · ${job.lineage.typography} · ${job.lineage.material} · ${job.lineage.colorLogic} · ${job.lineage.gesture}`,
    );
  }
  console.log(`cost:  $${job.cost?.usd} over ${job.cost?.llmCalls} model calls`);
  if (job.gates) console.log(`gates: ${JSON.stringify(job.gates.detail)}`);
  if (job.status === "below_bar") {
    console.log(`failed gates: ${job.bestCandidate.failedGates.join(", ")}`);
    console.log(`reason: ${job.bestCandidate.reason}`);
  }

  for (const format of ["png", "svg"] as const) {
    const res = await fetch(`${base}/v1/flyers/${created.jobId}/export?format=${format}`, {
      headers,
    });
    const bytes = Buffer.from(await res.arrayBuffer());
    const path = `${OUT}/flyer.${format}`;
    writeFileSync(path, bytes);
    console.log(`wrote ${path} (${bytes.length} bytes)`);
  }

  const proc = await (
    await fetch(`${base}/v1/flyers/${created.jobId}/process`, { headers })
  ).json();
  writeFileSync(`${OUT}/process.json`, JSON.stringify(proc, null, 2));
  const log = proc.log as any;
  console.log(`\ncandidates:`);
  for (const c of log.candidates ?? []) {
    const gates = Object.entries(c.gates.detail)
      .map(([g, ok]) => `${g}${ok ? "✓" : "✗"}`)
      .join(" ");
    console.log(`  ${c.won ? "→" : " "} ${c.lineage.metaphor}/${c.lineage.topology}: ${gates}`);
    console.log(`      "${c.idea}"`);
    if (c.gates.notes.length) console.log(`      notes: ${c.gates.notes.slice(0, 2).join(" | ")}`);
  }
  console.log(`vision calls used: ${log.visionCallsUsed}`);
  console.log(`editability: ${JSON.stringify(log.editability)}`);

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
