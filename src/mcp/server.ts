import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { config } from "../config.js";

/**
 * MCP server — a thin adapter over the REST core (AGENTS.md law 6).
 *
 * There is deliberately no business logic in this file: every tool is an HTTP
 * call plus presentation. If you find yourself wanting to decide something here,
 * it belongs in src/core/.
 *
 * Tools are goal-oriented, not primitives: an agent asks for a flyer, not for a
 * rectangle.
 */

const BASE = config.flyeroApiUrl.replace(/\/$/, "");
const HEADERS = {
  authorization: `Bearer ${config.flyeroApiKey}`,
  "content-type": "application/json",
};

type Json = Record<string, any>;

async function api(path: string, init: RequestInit = {}): Promise<Json> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...HEADERS, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let body: Json;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const message = body?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`${message} (${res.status})`);
  }
  return body;
}

async function apiBinary(path: string): Promise<Buffer> {
  const res = await fetch(`${BASE}${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const TERMINAL = new Set(["done", "below_bar", "failed"]);

async function pollJob(jobId: string, timeoutMs = config.jobTimeoutSeconds * 1000): Promise<Json> {
  const deadline = Date.now() + timeoutMs;
  let job = await api(`/v1/flyers/${jobId}`);
  while (!TERMINAL.has(job.status) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    job = await api(`/v1/flyers/${jobId}`);
  }
  return job;
}

/** The calling agent should be able to *see* the flyer, not just read about it. */
async function previewContent(jobId: string) {
  try {
    const png = await apiBinary(`/v1/flyers/${jobId}/export?format=png`);
    return [{ type: "image" as const, data: png.toString("base64"), mimeType: "image/png" }];
  } catch {
    return [];
  }
}

function describeJob(job: Json): string {
  if (job.status === "done") {
    return [
      `Flyer ready — ${job.jobId}`,
      `Idea: ${job.idea}`,
      `Approach: ${job.lineage?.metaphor} · ${job.lineage?.topology}`,
      `All six quality gates passed. Cost $${job.cost?.usd ?? "?"}.`,
      `Export with export_flyer, or ask for changes with revise_flyer.`,
    ].join("\n");
  }
  if (job.status === "below_bar") {
    return [
      `Flyero could not clear its own quality bar for ${job.jobId}, so this is not marked done.`,
      `Failed: ${(job.bestCandidate?.failedGates ?? []).join(", ") || "unknown"}`,
      `Why: ${job.bestCandidate?.reason ?? "not recorded"}`,
      `The best attempt is attached. Revising with a more specific prompt usually helps.`,
    ].join("\n");
  }
  if (job.status === "failed") return `Generation failed: ${job.error ?? "unknown error"}`;
  return `Still generating (stage: ${job.stage ?? "?"}). Poll get_flyer in a moment.`;
}

export function buildMcpServer(): McpServer {
  const server = new McpServer({ name: "flyero", version: "0.1.0" });

  server.registerTool(
    "create_flyer",
    {
      title: "Create a marketing flyer",
      description:
        "Generate one Instagram-portrait marketing flyer from a plain-language description of a product " +
        "and what you want people to do. Returns the flyer image plus the one-sentence idea behind it. " +
        "Takes up to ~3 minutes because several designs compete internally and only a design that passes " +
        "every quality gate is returned.",
      inputSchema: {
        prompt: z
          .string()
          .describe("What the flyer is for: the product, who it's for, and the action you want."),
        assetIds: z
          .array(z.string())
          .optional()
          .describe("Asset ids from upload_asset — a logo or product screenshot."),
        risk: z
          .enum(["safe", "studio", "experimental"])
          .optional()
          .describe("How adventurous the design may be. Default: studio."),
      },
    },
    async ({ prompt, assetIds, risk }) => {
      const created = await api("/v1/flyers", {
        method: "POST",
        body: JSON.stringify({ prompt, assetIds, risk }),
      });
      const job = await pollJob(created.jobId);
      return {
        content: [{ type: "text", text: describeJob(job) }, ...(await previewContent(job.jobId))],
      };
    },
  );

  server.registerTool(
    "upload_asset",
    {
      title: "Upload a logo or screenshot for use in a flyer",
      description:
        "Upload an image file so a flyer can place it. After upload, usually call prepare_asset " +
        "so the image is cropped / cut out / blended for the slot — raw dumps look amateur.",
      inputSchema: {
        path: z.string().describe("Absolute path to a PNG, JPEG, WebP or SVG file."),
        kind: z.enum(["logo", "screenshot", "reference"]).describe("What the image is."),
      },
    },
    async ({ path, kind }) => {
      const bytes = await readFile(path);
      const form = new FormData();
      const ext = path.split(".").pop()?.toLowerCase();
      const mime =
        ext === "png"
          ? "image/png"
          : ext === "webp"
            ? "image/webp"
            : ext === "svg"
              ? "image/svg+xml"
              : "image/jpeg";
      form.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), basename(path));
      form.append("kind", kind);

      const res = await fetch(`${BASE}/v1/assets`, {
        method: "POST",
        headers: { authorization: HEADERS.authorization },
        body: form,
      });
      const body = (await res.json()) as Json;
      if (!res.ok) throw new Error(body?.error?.message ?? `Upload failed (${res.status})`);
      return {
        content: [
          {
            type: "text",
            text:
              `Uploaded ${basename(path)} as ${body.assetId} (${body.dimensions?.join("×")}). ` +
              `Next: prepare_asset with a preset (logo-clean, product-hero, screenshot-frame, …) ` +
              `then pass the *prepared* id into create_flyer / compose.`,
          },
        ],
      };
    },
  );

  server.registerTool(
    "prepare_asset",
    {
      title: "Prepare an image so it blends into a flyer",
      description:
        "Transform an uploaded asset for a design slot: remove background, crop, blur, round corners, " +
        "tint, feather edges, etc. Returns a NEW assetId (original untouched). Prefer presets for " +
        "common jobs: logo-clean, product-hero, soft-cutout, circle-avatar, bg-plate-blur, " +
        "screenshot-frame, brand-tint. Custom ops can be chained after a preset.",
      inputSchema: {
        assetId: z.string().describe("Asset id from upload_asset."),
        preset: z
          .enum([
            "product-hero",
            "logo-clean",
            "soft-cutout",
            "circle-avatar",
            "bg-plate-blur",
            "screenshot-frame",
            "brand-tint",
          ])
          .optional()
          .describe("Named recipe for a common flyer job."),
        accent: z.string().optional().describe("Hex accent for brand-tint, e.g. #2EC4F1."),
        ops: z
          .array(z.record(z.unknown()))
          .optional()
          .describe(
            "Ordered ops from GET /v1/assets/transforms — crop, blur, removeBackground, feather, etc.",
          ),
        reanalyze: z.boolean().optional(),
      },
    },
    async ({ assetId, preset, accent, ops, reanalyze }) => {
      const body = await api(`/v1/assets/${assetId}/transform`, {
        method: "POST",
        body: JSON.stringify({ preset, accent, ops, reanalyze }),
      });
      let preview: { type: "image"; data: string; mimeType: string }[] = [];
      try {
        const png = await apiBinary(`/v1/assets/${body.assetId}/file`);
        preview = [{ type: "image", data: png.toString("base64"), mimeType: "image/png" }];
      } catch {
        /* preview is nice-to-have */
      }
      return {
        content: [
          {
            type: "text",
            text:
              `Prepared ${body.parentId} → ${body.assetId} (${body.dimensions?.join("×")}). ` +
              `Ops: ${JSON.stringify(body.opsApplied)}. Use ${body.assetId} in the flyer.`,
          },
          ...preview,
        ],
      };
    },
  );

  server.registerTool(
    "get_flyer",
    {
      title: "Check a flyer's status",
      description: "Look up a flyer job by id — its status, its idea, and whether it passed the gates.",
      inputSchema: { jobId: z.string() },
    },
    async ({ jobId }) => {
      const job = await api(`/v1/flyers/${jobId}`);
      return {
        content: [
          { type: "text", text: describeJob(job) },
          ...(TERMINAL.has(job.status) ? await previewContent(jobId) : []),
        ],
      };
    },
  );

  server.registerTool(
    "revise_flyer",
    {
      title: "Change an existing flyer",
      description:
        "Apply a plain-language change to a flyer that already exists — 'make the call to action stronger', " +
        "'less text', 'show the product bigger'. The original creative idea is preserved.",
      inputSchema: {
        jobId: z.string(),
        instruction: z.string().describe("What to change, in plain language."),
      },
    },
    async ({ jobId, instruction }) => {
      await api(`/v1/flyers/${jobId}/revise`, {
        method: "POST",
        body: JSON.stringify({ instruction }),
      });
      const job = await pollJob(jobId);
      return {
        content: [
          { type: "text", text: `Revision ${job.revision}. ${describeJob(job)}` },
          ...(await previewContent(jobId)),
        ],
      };
    },
  );

  server.registerTool(
    "export_flyer",
    {
      title: "Save a flyer to a file",
      description:
        "Write a finished flyer to disk. PNG for posting, SVG for editing in Figma or Illustrator " +
        "(text stays editable).",
      inputSchema: {
        jobId: z.string(),
        format: z.enum(["png", "svg"]),
        outputPath: z.string().describe("Absolute path to write to."),
      },
    },
    async ({ jobId, format, outputPath }) => {
      const bytes = await apiBinary(`/v1/flyers/${jobId}/export?format=${format}`);
      const target = resolve(outputPath);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes);
      return {
        content: [{ type: "text", text: `Wrote ${bytes.length} bytes to ${target}` }],
      };
    },
  );

  server.registerTool(
    "create_flyer_batch",
    {
      title: "Explore several different flyers for one brief",
      description:
        "Generate N independent flyers from the same prompt to compare directions. Each run is a " +
        "different designer's take — different idea, different composition. Use when the user wants options.",
      inputSchema: {
        prompt: z.string(),
        runs: z.number().int().min(2).max(10),
        risk: z.enum(["safe", "studio", "experimental"]).optional(),
      },
    },
    async ({ prompt, runs, risk }) => {
      const batch = await api("/v1/batches", {
        method: "POST",
        body: JSON.stringify({ prompt, runs, risk }),
      });
      const deadline = Date.now() + config.jobTimeoutSeconds * 1000 * 2;
      let view = await api(`/v1/batches/${batch.batchId}`);
      while (view.complete < view.runs && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 5000));
        view = await api(`/v1/batches/${batch.batchId}`);
      }
      const lines = view.results.map(
        (r: Json, i: number) =>
          `${i + 1}. [${r.status}] ${r.idea ?? "—"}${r.lineage ? ` (${r.lineage.metaphor} · ${r.lineage.topology})` : ""}`,
      );
      return {
        content: [
          {
            type: "text",
            text: `Batch ${batch.batchId} — ${view.complete}/${view.runs} finished:\n${lines.join("\n")}\n\nUse get_flyer with a jobId to see any of them.`,
          },
        ],
      };
    },
  );

  return server;
}

const isEntrypoint =
  process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;

if (isEntrypoint) {
  const server = buildMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
