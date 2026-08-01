import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import multipart from "@fastify/multipart";
import { ulid } from "ulid";
import { z } from "zod";
import { config, type Risk } from "../config.js";
import { COMPONENT_COUNT } from "../components/registry.js";
import { PROFILE_SPACE, newJobSeed } from "../core/studio/sampler.js";
import { VETO_COUNT } from "../creative/compatibility.js";
import { availableFamilies } from "../core/render/fonts.js";
import { createAsset, getAsset, createDerivedAsset } from "../store/assets.js";
import { fetchCandidate, imageProvider } from "../core/images/search.js";
import { SKILL_INDEX, getSkill } from "./skills.js";
import { registerMcpHttp } from "../mcp/http.js";
import { flyerKey, exists, getBuffer, getText } from "../store/objects.js";
import {
  countActiveJobs,
  createBatch,
  createJob,
  getBatch,
  getJob,
  getProcessLog,
  getRevision,
  jobsInBatch,
  listRevisions,
  spendToday,
} from "../store/jobs.js";
import { enqueueJob, enqueueRevision, queueDepth } from "./runner.js";
import { registerAgentRoutes } from "./agent.js";
import {
  TRANSFORM_CATALOGUE,
  applyImageOps,
  transformRequestSchema,
} from "../core/images/transform.js";

/**
 * The REST API — the product core (API.md). Every capability exists here first;
 * MCP is a thin adapter over these same endpoints.
 */

type ErrorCode =
  | "invalid_request"
  | "not_found"
  | "unauthorized"
  | "generation_failed"
  | "below_bar"
  | "rate_limited"
  | "not_implemented"
  /** A capability that needs a key we do not have — image search without PEXELS_API_KEY. */
  | "not_configured"
  /** A third-party service failed. Distinct from our own failure, so it is retryable. */
  | "upstream_error";

function fail(reply: FastifyReply, status: number, code: ErrorCode, message: string, details: unknown = {}) {
  return reply.status(status).send({ error: { code, message, details } });
}

const riskSchema = z.enum(["safe", "studio", "experimental"]);

const createFlyerSchema = z.object({
  prompt: z.string().min(3).max(2000),
  assetIds: z.array(z.string()).max(6).optional(),
  brand: z
    .object({
      colors: z.array(z.string()).max(5).optional(),
      tone: z.array(z.string()).max(5).optional(),
    })
    .optional(),
  risk: riskSchema.optional(),
  callbackUrl: z.string().url().optional(),
  debug: z.boolean().optional(),
});

const batchSchema = z.object({
  prompt: z.string().min(3).max(2000),
  runs: z.number().int().min(1).max(20),
  risk: riskSchema.optional(),
});

const reviseSchema = z.object({
  instruction: z.string().min(3).max(500),
});

declare module "fastify" {
  interface FastifyRequest {
    apiKey: string;
  }
}

export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: { level: config.logLevel } });

  app.register(multipart, { limits: { fileSize: config.maxUploadBytes } });

  /**
   * The one unauthenticated route: a liveness probe.
   *
   * A platform health check cannot present a key, so without this Render marks
   * the service unhealthy and restarts it forever. The original rule — no
   * bypass paths, including health — was about not exposing *job data*; this
   * returns a constant and reveals nothing about the deployment or its
   * contents, so it does not weaken that. Registered before the auth hook so it
   * is genuinely reachable.
   */
  app.get("/health", async () => ({ ok: true }));

  // ── Auth — no bypass paths beyond the liveness probe above ───────────────
  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.url === "/health") return;
    const header = request.headers.authorization ?? "";
    const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    /**
     * The MCP endpoint also accepts the key in the query string.
     *
     * A hosted connector is configured by pasting a URL; many clients cannot
     * attach an Authorization header to it. The trade-off is real — a URL
     * carrying a key leaks through history, logs and screen shares — so it is
     * allowed *only* on /mcp, and the REST surface stays header-only.
     */
    const viaQuery =
      request.url.startsWith("/mcp") ? (request.query as { key?: string })?.key ?? "" : "";
    const token = bearer || viaQuery;
    if (!token || !config.apiKeys.includes(token)) {
      return fail(reply, 401, "unauthorized", "Provide a valid Bearer key from API_KEYS");
    }
    request.apiKey = token;
  });

  // ── Spend and concurrency guards ─────────────────────────────────────────
  function guard(apiKey: string): { ok: true } | { ok: false; message: string } {
    if (countActiveJobs(apiKey) >= config.maxConcurrentJobs) {
      return {
        ok: false,
        message: `MAX_CONCURRENT_JOBS (${config.maxConcurrentJobs}) reached for this key`,
      };
    }
    const spent = spendToday(apiKey);
    if (spent >= config.maxDailyUsd) {
      return {
        ok: false,
        message: `MAX_DAILY_USD (${config.maxDailyUsd}) reached — spent $${spent.toFixed(2)} today`,
      };
    }
    return { ok: true };
  }

  // ── Assets ───────────────────────────────────────────────────────────────
  /** Teach agents what image prep exists — must be registered before :assetId. */
  /**
   * Design skills for agents.
   *
   * Deliberately teach *judgement*, not palettes or measurements. Published
   * skill libraries ship curated hex colours and type scales; handing those to
   * every agent would make every flyer converge, which is the exact failure the
   * Studio Sampler exists to prevent. Colour, type, geometry and ornament stay
   * the engine's; these cover what the agent actually decides.
   */
  registerMcpHttp(app);

  app.get("/v1/skills", async () => ({
    skills: SKILL_INDEX,
    note:
      "These cover what you decide: what the flyer shows, what it says, and whether it worked. " +
      "Colour, fonts, sizes, positions and ornament are computed from your lineage — steering them is " +
      "how every flyer ends up looking the same.",
  }));

  app.get<{ Params: { name: string } }>("/v1/skills/:name", async (request, reply) => {
    const skill = getSkill(request.params.name);
    if (!skill) {
      return fail(reply, 404, "not_found", `No skill "${request.params.name}"`, {
        available: SKILL_INDEX.map((s) => s.name),
      });
    }
    return reply.type("text/markdown; charset=utf-8").send(skill.body);
  });

  app.get("/v1/assets/transforms", async () => TRANSFORM_CATALOGUE);

  /**
   * Search stock photography. Returns candidates only — nothing is downloaded
   * or stored, so an agent can look at a dozen options cheaply and import one.
   */
  app.post<{
    Body: {
      query?: string;
      perPage?: number;
      page?: number;
      orientation?: "portrait" | "landscape" | "square";
      color?: string;
    };
  }>("/v1/assets/search", async (request, reply) => {
    const query = request.body?.query?.trim();
    if (!query) return fail(reply, 400, "invalid_request", "query is required");
    if (!imageProvider.configured) {
      return fail(
        reply,
        503,
        "not_configured",
        "Image search is unavailable — PEXELS_API_KEY is not set",
      );
    }
    try {
      const results = await imageProvider.search({
        query,
        perPage: request.body?.perPage,
        page: request.body?.page,
        orientation: request.body?.orientation,
        color: request.body?.color,
      });
      return {
        provider: imageProvider.name,
        query,
        results,
        // Pexels' licence asks for visible credit wherever practical.
        attribution: "Photos provided by Pexels",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = (error as { code?: string }).code === "not_configured" ? 503 : 502;
      return fail(reply, code, "upstream_error", message);
    }
  });

  /**
   * Import a searched image into the asset store, so it rides the same
   * normalise → analyse → transform → compose path as an upload. Provenance is
   * recorded because the photographer is owed a credit.
   */
  app.post<{
    Body: { downloadUrl?: string; sourceUrl?: string; author?: string; kind?: string };
  }>("/v1/assets/import", async (request, reply) => {
    const downloadUrl = request.body?.downloadUrl;
    if (!downloadUrl) return fail(reply, 400, "invalid_request", "downloadUrl is required");
    // Only ever fetch from the provider we searched, so this endpoint cannot be
    // turned into a general-purpose URL fetcher.
    if (!/^https:\/\/images\.pexels\.com\//.test(downloadUrl)) {
      return fail(reply, 400, "invalid_request", "downloadUrl must be a Pexels image URL");
    }
    const kind = (request.body?.kind ?? "reference") as "logo" | "screenshot" | "reference";
    if (!["logo", "screenshot", "reference"].includes(kind)) {
      return fail(reply, 400, "invalid_request", "kind must be logo, screenshot or reference");
    }
    try {
      const { buffer, mime } = await fetchCandidate({ downloadUrl });
      const asset = await createAsset({
        buffer,
        mime,
        kind,
        apiKey: request.apiKey,
        provenance: {
          source: imageProvider.name,
          sourceUrl: request.body?.sourceUrl ?? "",
          author: request.body?.author ?? "",
        },
      });
      return reply.status(201).send({
        assetId: asset.id,
        kind: asset.kind,
        dimensions: [asset.width, asset.height],
        analysis: asset.analysis,
        provenance: asset.provenance,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return fail(reply, 400, "invalid_request", message);
    }
  });

  app.post("/v1/assets", async (request, reply) => {
    const file = await request.file();
    if (!file) return fail(reply, 400, "invalid_request", "multipart field 'file' is required");

    const kindField = (file.fields as any)?.kind?.value as string | undefined;
    const kind = (kindField ?? "screenshot") as "logo" | "screenshot" | "reference";
    if (!["logo", "screenshot", "reference"].includes(kind)) {
      return fail(reply, 400, "invalid_request", `kind must be logo, screenshot or reference`);
    }

    const buffer = await file.toBuffer();
    try {
      const asset = await createAsset({ buffer, mime: file.mimetype, kind, apiKey: request.apiKey });
      return reply.status(201).send({
        assetId: asset.id,
        kind: asset.kind,
        dimensions: [asset.width, asset.height],
        analysis: asset.analysis,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return fail(reply, 400, "invalid_request", message);
    }
  });

  app.get<{ Params: { assetId: string } }>("/v1/assets/:assetId", async (request, reply) => {
    const asset = getAsset(request.params.assetId);
    if (!asset) return fail(reply, 404, "not_found", "No such asset");
    return {
      assetId: asset.id,
      kind: asset.kind,
      dimensions: [asset.width, asset.height],
      analysis: asset.analysis,
      parentId: asset.parentId,
      transforms: asset.transforms,
      provenance: asset.provenance,
    };
  });

  /**
   * Prepare an uploaded image for a flyer slot: crop, cut out, blur, tint, etc.
   * Returns a NEW assetId — originals are never overwritten.
   */
  app.post<{ Params: { assetId: string } }>(
    "/v1/assets/:assetId/transform",
    async (request, reply) => {
      const source = getAsset(request.params.assetId);
      if (!source) return fail(reply, 404, "not_found", "No such asset");

      const parsed = transformRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return fail(reply, 400, "invalid_request", "Invalid transform body", parsed.error.issues);
      }
      if (!parsed.data.ops?.length && !parsed.data.preset) {
        return fail(reply, 400, "invalid_request", "Provide ops and/or a preset");
      }

      try {
        const raw = getBuffer(source.path);
        const result = await applyImageOps(raw, source.mime, parsed.data);
        const derived = await createDerivedAsset({
          parent: source,
          buffer: result.buffer,
          mime: "image/png",
          width: result.width,
          height: result.height,
          opsApplied: result.opsApplied,
          apiKey: request.apiKey,
          reanalyze: parsed.data.reanalyze,
        });
        return reply.status(201).send({
          assetId: derived.id,
          parentId: source.id,
          kind: derived.kind,
          dimensions: [derived.width, derived.height],
          analysis: derived.analysis,
          opsApplied: result.opsApplied,
          urls: {
            file: `/v1/assets/${derived.id}/file`,
            meta: `/v1/assets/${derived.id}`,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const code = (error as { code?: string })?.code === "invalid_request" ? 400 : 500;
        return fail(
          reply,
          code,
          code === 400 ? "invalid_request" : "generation_failed",
          message,
        );
      }
    },
  );

  /** Binary download so agents (and humans) can visually check a prepared image. */
  app.get<{ Params: { assetId: string } }>("/v1/assets/:assetId/file", async (request, reply) => {
    const asset = getAsset(request.params.assetId);
    if (!asset) return fail(reply, 404, "not_found", "No such asset");
    return reply.type(asset.mime).send(getBuffer(asset.path));
  });

  // ── Flyers ───────────────────────────────────────────────────────────────
  app.post("/v1/flyers", async (request, reply) => {
    const parsed = createFlyerSchema.safeParse(request.body);
    if (!parsed.success) {
      return fail(reply, 400, "invalid_request", "Invalid request body", parsed.error.issues);
    }
    const check = guard(request.apiKey);
    if (!check.ok) return fail(reply, 429, "rate_limited", check.message);

    const body = parsed.data;
    for (const id of body.assetIds ?? []) {
      if (!getAsset(id)) return fail(reply, 400, "invalid_request", `Unknown assetId ${id}`);
    }

    const jobId = `fly_${ulid()}`;
    createJob({
      id: jobId,
      apiKey: request.apiKey,
      prompt: body.prompt,
      risk: (body.risk ?? config.defaultRisk) as Risk,
      jobSeed: newJobSeed(),
      assetIds: body.assetIds ?? [],
      brand: body.brand ?? null,
      callbackUrl: body.callbackUrl ?? null,
      batchId: null,
    });
    enqueueJob(jobId);

    return reply.status(202).send({
      jobId,
      status: "queued",
      estimatedSeconds: Math.min(config.jobTimeoutSeconds, 120),
    });
  });

  app.get<{ Params: { jobId: string } }>("/v1/flyers/:jobId", async (request, reply) => {
    const job = getJob(request.params.jobId);
    if (!job) return fail(reply, 404, "not_found", "No such flyer job");

    const base = { jobId: job.id, status: job.status };

    if (job.status === "queued" || job.status === "generating") {
      return { ...base, stage: job.stage, revision: job.revision };
    }
    if (job.status === "failed") {
      return { ...base, error: job.error };
    }

    const urls = {
      png: `/v1/flyers/${job.id}/export?format=png`,
      svg: `/v1/flyers/${job.id}/export?format=svg`,
      spec: `/v1/flyers/${job.id}/spec`,
    };

    if (job.status === "awaiting_review") {
      return {
        ...base,
        idea: job.idea,
        lineage: job.lineage ? JSON.parse(job.lineage) : null,
        gates: job.gates ? JSON.parse(job.gates) : null,
        urls,
        revision: job.revision,
        next: `Look at the PNG, then POST /v1/flyers/${job.id}/review with your verdict on G1, G2 and G4.`,
      };
    }

    if (job.status === "below_bar") {
      return {
        ...base,
        bestCandidate: {
          urls,
          failedGates: job.failed_gates ? JSON.parse(job.failed_gates) : [],
          reason: job.reason,
        },
        idea: job.idea,
        cost: { usd: Number(job.cost_usd.toFixed(4)), llmCalls: job.llm_calls },
        revision: job.revision,
      };
    }

    return {
      ...base,
      idea: job.idea,
      lineage: job.lineage ? JSON.parse(job.lineage) : null,
      gates: job.gates ? JSON.parse(job.gates) : null,
      urls,
      cost: { usd: Number(job.cost_usd.toFixed(4)), llmCalls: job.llm_calls },
      revision: job.revision,
    };
  });

  app.post<{ Params: { jobId: string } }>("/v1/flyers/:jobId/revise", async (request, reply) => {
    const job = getJob(request.params.jobId);
    if (!job) return fail(reply, 404, "not_found", "No such flyer job");
    if (job.status === "queued" || job.status === "generating") {
      return fail(reply, 409 as 400, "invalid_request", "This flyer is still generating");
    }
    const parsed = reviseSchema.safeParse(request.body);
    if (!parsed.success) {
      return fail(reply, 400, "invalid_request", "instruction is required", parsed.error.issues);
    }
    const check = guard(request.apiKey);
    if (!check.ok) return fail(reply, 429, "rate_limited", check.message);

    enqueueRevision(job.id, parsed.data.instruction);
    return reply.status(202).send({ jobId: job.id, status: "queued", revision: job.revision + 1 });
  });

  app.get<{ Params: { jobId: string }; Querystring: { revision?: string } }>(
    "/v1/flyers/:jobId/spec",
    async (request, reply) => {
      const job = getJob(request.params.jobId);
      if (!job) return fail(reply, 404, "not_found", "No such flyer job");
      const revision = request.query.revision ? Number(request.query.revision) : job.revision;
      const row = getRevision(job.id, revision);
      if (!row) return fail(reply, 404, "not_found", `No revision ${revision}`);
      return reply.type("application/json").send(row.spec);
    },
  );

  app.get<{ Params: { jobId: string }; Querystring: { format?: string; revision?: string } }>(
    "/v1/flyers/:jobId/export",
    async (request, reply) => {
      const job = getJob(request.params.jobId);
      if (!job) return fail(reply, 404, "not_found", "No such flyer job");

      const format = request.query.format ?? "png";
      if (format === "pdf") {
        return fail(reply, 501, "not_implemented", "PDF export lands after v1");
      }
      if (format !== "png" && format !== "svg") {
        return fail(reply, 400, "invalid_request", "format must be png, svg or pdf");
      }

      const revision = request.query.revision ? Number(request.query.revision) : job.revision;
      const path = flyerKey(job.id, revision, format === "png" ? "render.png" : "render.svg");
      if (!exists(path)) return fail(reply, 404, "not_found", `No ${format} for revision ${revision}`);

      if (format === "svg") {
        return reply
          .type("image/svg+xml")
          .header("content-disposition", `attachment; filename="${job.id}.svg"`)
          .send(getText(path));
      }
      return reply
        .type("image/png")
        .header("content-disposition", `attachment; filename="${job.id}.png"`)
        .send(getBuffer(path));
    },
  );

  // ── Batches (how the Diversity test is run) ───────────────────────────────
  app.post("/v1/batches", async (request, reply) => {
    const parsed = batchSchema.safeParse(request.body);
    if (!parsed.success) {
      return fail(reply, 400, "invalid_request", "Invalid batch body", parsed.error.issues);
    }
    const { prompt, runs } = parsed.data;
    const risk = (parsed.data.risk ?? config.defaultRisk) as Risk;

    const batchId = `bat_${ulid()}`;
    createBatch({ id: batchId, apiKey: request.apiKey, prompt, runs, risk });

    const jobIds: string[] = [];
    for (let i = 0; i < runs; i++) {
      const jobId = `fly_${ulid()}`;
      // Each run gets its own fresh job seed — that independence is what DR-1 measures.
      createJob({
        id: jobId,
        apiKey: request.apiKey,
        prompt,
        risk,
        jobSeed: newJobSeed(),
        assetIds: [],
        brand: null,
        callbackUrl: null,
        batchId,
      });
      enqueueJob(jobId);
      jobIds.push(jobId);
    }

    return reply.status(202).send({ batchId, runs, jobIds });
  });

  app.get<{ Params: { batchId: string } }>("/v1/batches/:batchId", async (request, reply) => {
    const batch = getBatch(request.params.batchId);
    if (!batch) return fail(reply, 404, "not_found", "No such batch");
    const jobs = jobsInBatch(batch.id);
    return {
      batchId: batch.id,
      prompt: batch.prompt,
      runs: batch.runs,
      complete: jobs.filter((j) => ["done", "below_bar", "failed"].includes(j.status)).length,
      results: jobs.map((job) => ({
        jobId: job.id,
        status: job.status,
        idea: job.idea,
        lineage: job.lineage ? JSON.parse(job.lineage) : null,
        gates: job.gates ? JSON.parse(job.gates) : null,
        cost: Number(job.cost_usd.toFixed(4)),
      })),
    };
  });

  // ── Introspection ────────────────────────────────────────────────────────
  app.get<{ Params: { jobId: string }; Querystring: { revision?: string } }>(
    "/v1/flyers/:jobId/process",
    async (request, reply) => {
      const job = getJob(request.params.jobId);
      if (!job) return fail(reply, 404, "not_found", "No such flyer job");
      const revision = request.query.revision ? Number(request.query.revision) : job.revision;
      const log = getProcessLog(job.id, revision);
      if (!log) return fail(reply, 404, "not_found", `No process log for revision ${revision}`);
      return { jobId: job.id, revision, revisions: listRevisions(job.id).map((r) => r.revision), log };
    },
  );

  // The agent-driven surface: an external reasoning agent supplies the idea and
  // the words, this service supplies everything else (src/api/agent.ts).
  registerAgentRoutes(app);

  app.get("/v1/health", async () => ({
    status: "ok",
    version: "0.1.0",
    components: COMPONENT_COUNT,
    designerProfiles: PROFILE_SPACE,
    vetoRules: VETO_COUNT,
    fontFamilies: availableFamilies().length,
    queue: queueDepth(),
    models: config.models,
  }));

  return app;
}

const isEntrypoint =
  process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;

if (isEntrypoint) {
  const app = buildServer();
  app
    .listen({ port: config.port, host: "0.0.0.0" })
    .then(() => app.log.info(`flyero listening on :${config.port}`))
    .catch((err) => {
      app.log.error(err);
      process.exit(1);
    });
}
