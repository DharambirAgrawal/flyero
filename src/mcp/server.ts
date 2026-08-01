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
    /**
     * Surface the whole error, not just its headline.
     *
     * This used to throw `${error.message} (400)` and drop `error.details` —
     * which is the only part that says *which field* is wrong. Two different
     * agents hit "Invalid composition (400)" and then guessed at the schema
     * fifteen times each, because the answer was in the response and we threw
     * it away. An error an agent cannot act on is worse than no error: it looks
     * like the service is broken.
     */
    const message = body?.error?.message ?? `HTTP ${res.status}`;
    const details = body?.error?.details ?? body?.hint;
    const rendered = details ? `\n${JSON.stringify(details, null, 2)}` : "";
    throw new Error(`${message} (${res.status})${rendered}`);
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


/** Endpoints that return markdown rather than JSON (the guide and the skills). */
async function apiText(path: string): Promise<string> {
  const res = await fetch(`${BASE}${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`${path} failed: ${res.status} ${await res.text()}`);
  return res.text();
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

  // ── The agent-driven surface ──────────────────────────────────────────────
  //
  // Everything above generates a flyer *for* you: the pipeline calls a language
  // model to write the brief, invent the idea and compose the page, which needs
  // ANTHROPIC_API_KEY on the server.
  //
  // These tools invert that. The connected agent *is* the designer — it reads
  // the skills, picks a designer profile, chooses the pictures, writes the
  // words, and judges the render. The server contributes what an LLM must not:
  // geometry, colour, typography, ornament and the gates. No model key is
  // needed on the server, because the model is already at the other end of the
  // connector.

  server.registerTool(
    "read_design_guide",
    {
      title: "Read the design guide",
      description:
        "How to compose a flyer with this system: the loop, the component catalogue, the Six Gates, and " +
        "what you do and do not control. Read this before your first composition.",
      inputSchema: {},
    },
    async () => ({ content: [{ type: "text", text: await apiText("/v1/guide") }] }),
  );

  server.registerTool(
    "read_design_skill",
    {
      title: "Read a design skill",
      description:
        "Short guides on judgement: 'brief' (reading a request, choosing a designer), 'composition' (what " +
        "the flyer shows), 'copywriting' (words that survive the gates), 'critique' (judging the render). " +
        "Call with no name to list them. These teach judgement, not palettes — colour and type come from " +
        "your assigned designer.",
      inputSchema: {
        name: z
          .enum(["brief", "composition", "copywriting", "critique"])
          .optional()
          .describe("Omit to list all four."),
      },
    },
    async ({ name }) => {
      if (!name) {
        const index = await api("/v1/skills");
        return {
          content: [
            {
              type: "text",
              text: index.skills
                .map((s: Json) => `**${s.name}** — ${s.title}\n${s.description}\nUse when: ${s.useWhen}`)
                .join("\n\n"),
            },
          ],
        };
      }
      return { content: [{ type: "text", text: await apiText(`/v1/skills/${name}`) }] };
    },
  );

  server.registerTool(
    "request_designers",
    {
      title: "Request designer assignments",
      description:
        "Ask the Studio Sampler for candidate designers. Each is a bundle — metaphor, layout topology, " +
        "typography, material, colour logic, signature gesture, graphic language — and you cannot edit " +
        "one. Pick the designer whose METAPHOR fits your message. Pass campaignArchetype so the sampler " +
        "only returns metaphors suited to that kind of brief; redrawing until one fits is fighting it.",
      inputSchema: {
        runs: z.number().int().min(1).max(6).optional().describe("How many designers. Default 3."),
        campaignArchetype: z
          .enum([
            "product-promotion",
            "event-invitation",
            "awareness-education",
            "editorial-announcement",
            "offer-promotion",
          ])
          .optional()
          .describe("What kind of flyer this is. Strongly recommended."),
        risk: z.enum(["safe", "studio", "experimental"]).optional(),
        jobSeed: z.string().optional().describe("Reuse to get the same designers again."),
      },
    },
    async (args) => ({
      content: [
        { type: "text", text: JSON.stringify(await api("/v1/studio/assignments", {
          method: "POST",
          body: JSON.stringify(args),
        }), null, 2) },
      ],
    }),
  );

  server.registerTool(
    "search_images",
    {
      title: "Search stock photography",
      description:
        "Find real photographs for the flyer. Returns candidates with previews; nothing is downloaded, so " +
        "looking is cheap. A flyer about a place, a dish or an object with no picture of it cannot pass " +
        "the cover test — search before you compose.",
      inputSchema: {
        query: z.string().describe("What to show, e.g. 'himalaya peak nepal'."),
        perPage: z.number().int().min(1).max(40).optional(),
        orientation: z.enum(["portrait", "landscape", "square"]).optional(),
      },
    },
    async (args) => ({
      content: [
        { type: "text", text: JSON.stringify(await api("/v1/assets/search", {
          method: "POST",
          body: JSON.stringify(args),
        }), null, 2) },
      ],
    }),
  );

  server.registerTool(
    "import_image",
    {
      title: "Import a searched image",
      description:
        "Bring a chosen search result into the flyer's assets and get an assetId. Pass the candidate's " +
        "downloadUrl, sourceUrl and author — the photographer's credit is stored with it.",
      inputSchema: {
        downloadUrl: z.string().describe("From a search result."),
        sourceUrl: z.string().optional(),
        author: z.string().optional(),
        kind: z.enum(["logo", "screenshot", "reference"]).optional(),
      },
    },
    async (args) => ({
      content: [
        { type: "text", text: JSON.stringify(await api("/v1/assets/import", {
          method: "POST",
          body: JSON.stringify(args),
        }), null, 2) },
      ],
    }),
  );

  server.registerTool(
    "get_composition_example",
    {
      title: "Get a copyable composition example",
      description:
        "A complete, valid composition you can paste and edit, plus the rules that are not obvious from " +
        "the shape alone. CALL THIS BEFORE compose_flyer. Guessing the schema wastes attempts — the " +
        "example is exact.",
      inputSchema: {},
    },
    async () => ({
      content: [
        { type: "text", text: JSON.stringify(await api("/v1/schema/composition"), null, 2) },
      ],
    }),
  );

  server.registerTool(
    "compose_flyer",
    {
      title: "Compose a flyer yourself",
      description:
        "You write the flyer; the engine draws it. CALL get_composition_example FIRST — it returns a valid " +
        "composition to copy, and guessing the shape wastes attempts. Send the lineage from " +
        "request_designers unchanged, the copy, and 4-7 elements each naming a component, a role and " +
        "`whyHere`. Returns the rendered flyer plus which gates passed. A rejection lists the exact " +
        "fields that are wrong — read them, they are precise. Never send coordinates, colours or fonts.",
      inputSchema: {
        composition: z
          .record(z.any())
          .describe(
            "The full composition object. Get its exact shape from get_composition_example — it is a " +
              "working one you can edit, not a description of one.",
          ),
      },
    },
    async ({ composition }) => {
      const out = await api("/v1/flyers/compose", {
        method: "POST",
        body: JSON.stringify(composition),
      });
      const preview = out.flyerId ? await previewContent(out.flyerId) : [];
      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }, ...preview] };
    },
  );

  server.registerTool(
    "revise_composition",
    {
      title: "Revise a composed flyer",
      description:
        "Edit an existing composition — swap a component, rewrite copy, change props — and re-render. " +
        "Spec edits only; you never move anything.",
      inputSchema: {
        flyerId: z.string(),
        patch: z.record(z.any()).describe("The fields to change."),
      },
    },
    async ({ flyerId, patch }) => {
      const out = await api(`/v1/flyers/${flyerId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      return {
        content: [
          { type: "text", text: JSON.stringify(out, null, 2) },
          ...(await previewContent(flyerId)),
        ],
      };
    },
  );

  server.registerTool(
    "review_flyer",
    {
      title: "Judge the rendered flyer",
      description:
        "LOOK at the flyer image first, then submit your verdict. Three gates cannot be settled by code — " +
        "does the idea read (G1), is the product guessable with the words covered (G2), does the type " +
        "participate rather than caption (G4) — so a flyer stays 'awaiting_review' until you answer. " +
        "Reporting done on something you would not print is the one failure that cannot be recovered.",
      inputSchema: {
        flyerId: z.string(),
        ideaReads: z.boolean().describe("Does the single idea land in one pass?"),
        ideaAsSeen: z.string().describe("The idea in your own words, from the image alone."),
        productGuessable: z.boolean().describe("Cover the logo and headline — still obvious?"),
        productGuess: z.string().describe("What a stranger would say it is."),
        headlineParticipates: z.boolean().describe("Is the type part of the composition?"),
        copyReadsHuman: z.boolean(),
        collisions: z.array(z.string()).describe("Anything clipped, overlapping or off-canvas."),
        notes: z.string().optional(),
      },
    },
    async ({ flyerId, ...verdict }) => ({
      content: [
        { type: "text", text: JSON.stringify(await api(`/v1/flyers/${flyerId}/review`, {
          method: "POST",
          body: JSON.stringify(verdict),
        }), null, 2) },
      ],
    }),
  );

  server.registerTool(
    "export_composed_flyer",
    {
      title: "Export a composed flyer",
      description: "Get the finished flyer as PNG or SVG. The SVG keeps text as text, so it stays editable.",
      inputSchema: {
        flyerId: z.string(),
        format: z.enum(["png", "svg"]).optional(),
        outputPath: z.string().optional().describe("Where to write it, if the client has a filesystem."),
      },
    },
    async ({ flyerId, format = "png", outputPath }) => {
      const bytes = await apiBinary(`/v1/flyers/${flyerId}/export?format=${format}`);
      if (outputPath) {
        await mkdir(dirname(resolve(outputPath)), { recursive: true });
        await writeFile(resolve(outputPath), bytes);
        return { content: [{ type: "text", text: `Wrote ${outputPath} (${bytes.length} bytes)` }] };
      }
      if (format === "svg") {
        return { content: [{ type: "text", text: bytes.toString("utf8") }] };
      }
      return {
        content: [
          { type: "image", data: bytes.toString("base64"), mimeType: "image/png" },
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
