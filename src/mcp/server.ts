import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { config } from "../config.js";
import { FORMAT_IDS, type FormatId } from "../creative/formats.js";

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

/**
 * A link the person reading can actually open.
 *
 * The inline image goes to the model; a chat UI does not necessarily render
 * tool-result images to the user. Three runs ended with an agent announcing a
 * finished flyer that nobody could see. The key is embedded because a clicked
 * link carries no headers — the same trade-off already accepted for /mcp.
 */
/**
 * The origin a *client* can reach, set per request by the HTTP transport.
 *
 * `BASE` is how this process calls itself — on Render that is
 * http://127.0.0.1:10000. Handing that to a user produces a link only the
 * server can open, which is exactly what happened: an agent delivered two
 * loopback URLs and the reader could use neither. The public origin is whatever
 * host the request actually arrived on, so it has to come from the request.
 */
let publicOrigin: string | null = null;

export function setPublicOrigin(origin: string | null): void {
  publicOrigin = origin;
}

function shareUrl(flyerId: string, format: "png" | "svg"): string {
  const origin = config.publicUrl || publicOrigin || BASE;
  return `${origin.replace(/\/$/, "")}/v1/flyers/${flyerId}/export?format=${format}&key=${encodeURIComponent(config.flyeroApiKey)}`;
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

/**
 * The flyer, small enough to actually arrive.
 *
 * The agent must be able to *see* it — three of the six gates are judgements
 * about the picture. But the full render base64'd to 3.2MB, and chat clients
 * silently drop an inline image that size: the agent reported "image returned"
 * and the person reading saw nothing. That is the worst kind of failure,
 * because it looks like success from both ends. Downscaled to a few hundred KB;
 * the full-resolution file is one export call away.
 */
async function previewContent(
  jobId: string,
): Promise<Array<{ type: "image"; data: string; mimeType: string }>> {
  try {
    const png = await apiBinary(`/v1/flyers/${jobId}/export?format=png&scale=0.4`);
    return [{ type: "image" as const, data: png.toString("base64"), mimeType: "image/png" }];
  } catch {
    // A flyer that failed its gates has nothing to show; the text reply says why.
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
  /**
   * Server instructions — the workflow, delivered automatically.
   *
   * Without these an agent receives a bag of tools and no idea of the order, so
   * the *user* ends up having to write the process into their prompt. Real
   * users say "make me a flyer for my shop" and stop. Everything an agent needs
   * to get from that to a finished poster has to arrive with the connection.
   *
   * Deliberately short. This is read on every conversation, so it carries the
   * order of operations and the traps, and defers detail to the skills.
   */
  const server = new McpServer(
    { name: "flyero", version: "0.1.0" },
    {
      instructions: [
        "Flyero turns a plain-language brief into a flyer. YOU are the Creative Director — invent the",
        "visual story, the copy, and the elements. Think like an award-winning poster designer, not a",
        "template filler. Never ship the same evidence family / reading path / CTA style as your last job.",
        "",
        "The published composition examples are JSON SHAPES only (field names + nesting). They are NOT",
        "flyers to remix. If your elements match an example's slots with different strings, throw the",
        "draft out and invent a new visual sentence from the metaphor.",
        "",
        "The engine owns colour, fonts, sizes, positions and ornament — never send coordinates or hex",
        "values; they are ignored or rejected.",
        "",
        "Intended path (no server model key). Call tools by these names so search finds them:",
        "",
        "1. read_design_guide, then read_design_skill (composition + copywriting at minimum).",
        "2. request_designers — Studio Sampler designer assignment / lineage. Pass campaignArchetype",
        "   (event-invitation | product-promotion | awareness-education | editorial-announcement |",
        "   offer-promotion). Pick the designer whose METAPHOR forces an unexpected visual thought.",
        "   Read `constraints` and `direction.gesture.requiresComponent`.",
        "3. Imagery: user logo/photo → upload_asset (+ prepare_asset). Anything else → search_images",
        "   then import_image (photos, icons, illustrations, shapes, QR). A place/dish/object needs a",
        "   real picture for G2; otherwise scene-illustration / motif-collage / chat-exchange.",
        "4. get_composition_example BEFORE compose_flyer — for schema shape only, then invent.",
        "   Refuse the safe stack (headline + photo-hero + body + CTA + footer) unless metaphor+brief",
        "   both demand it. Prefer unfamiliar evidence: polaroid-stack, photo-cluster, torn-photo,",
        "   chat-exchange, before-after-stack, detail-cluster, composed-figure, …",
        "5. compose_flyer with your authored composition. Fix precise rejection fields; do not guess.",
        "6. LOOK at the image, then review_flyer (G1 idea / G2 cover / G4 type). Reject generic work.",
        "7. Tweaks → revise_composition. Then export_composed_flyer and SHOW the user the export links.",
        "",
        "Avoid create_flyer / create_flyer_batch / revise_flyer unless the server has ANTHROPIC_API_KEY —",
        "you are already a model; those usually fail with a config error. Do not retry; compose yourself.",
        "",
        "Never invent facts. No stats, prices, dates, testimonials not given by the user — Gate G6.",
        "Leave cta.url null unless supplied.",
      ].join("\n"),
    },
  );

  server.registerTool(
    "create_flyer",
    {
      title: "Create a flyer automatically (needs a server-side model key)",
      description:
        "SERVER-KEY ONLY / LAST RESORT. Hands the whole job to a second model on the server. " +
        "REQUIRES ANTHROPIC_API_KEY — most deployments do not set one. You are already a model, so " +
        "prefer compose_flyer (read_design_guide → request_designers → get_composition_example → " +
        "compose_flyer). If this fails with a configuration error, do NOT retry.",
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
        format: z
          .enum(FORMAT_IDS as [FormatId, ...FormatId[]])
          .optional()
          .describe("Canvas size. Default: portrait-4x5 (Instagram feed post, 1080×1350)."),
      },
    },
    async ({ prompt, assetIds, risk, format }) => {
      const created = await api("/v1/flyers", {
        method: "POST",
        body: JSON.stringify({ prompt, assetIds, risk, format }),
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
        "Upload an image so a flyer can place it. Give EXACTLY ONE of `path` or `data`:\n" +
        "- `path` — only if you can read the local filesystem yourself (a locally-spawned agent). " +
        "Most hosted/chat connectors CANNOT do this — there is no shared disk between you and the " +
        "user, so a path they mention in conversation is not one you can open.\n" +
        "- `data` — base64-encoded image bytes, for everyone else. This is the normal case for a " +
        "hosted connector: when a user attaches an image in the conversation, its bytes arrive to " +
        "you as inline content — base64-encode them into `data` and set `mimeType` and `filename` " +
        "from what you were given. Do not guess at a local path or a folder that might hold the " +
        "file; there isn't one.\n" +
        "After upload, usually call prepare_asset so the image is cropped / cut out / blended for " +
        "the slot — raw dumps look amateur.",
      inputSchema: {
        path: z
          .string()
          .optional()
          .describe("Absolute local filesystem path. Only for agents with real disk access."),
        data: z
          .string()
          .optional()
          .describe("Base64-encoded image bytes. Use this for a chat-attached image."),
        mimeType: z
          .string()
          .optional()
          .describe("Required with `data`, e.g. image/png, image/jpeg, image/webp, image/svg+xml."),
        filename: z.string().optional().describe("Original filename, for the confirmation message."),
        kind: z.enum(["logo", "screenshot", "reference"]).describe("What the image is."),
      },
    },
    async ({ path, data, mimeType, filename, kind }) => {
      if (!path && !data) {
        throw new Error(
          "Give either `path` (local disk) or `data` (base64 bytes) — neither was provided. If the " +
            "user attached an image in this conversation, base64-encode those bytes into `data`; do " +
            "not look for a local file or folder.",
        );
      }
      let bytes: Buffer;
      let mime: string;
      let name: string;
      if (data) {
        if (!mimeType) throw new Error("`mimeType` is required alongside `data`.");
        bytes = Buffer.from(data, "base64");
        mime = mimeType;
        name = filename ?? `upload.${mimeType.split("/")[1] ?? "bin"}`;
      } else {
        bytes = await readFile(path!);
        const ext = path!.split(".").pop()?.toLowerCase();
        mime =
          ext === "png"
            ? "image/png"
            : ext === "webp"
              ? "image/webp"
              : ext === "svg"
                ? "image/svg+xml"
                : "image/jpeg";
        name = basename(path!);
      }
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), name);
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
              `Uploaded ${name} as ${body.assetId} (${body.dimensions?.join("×")}). ` +
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
      title: "Change an existing flyer made with create_flyer (needs a server-side model key)",
      description:
        "SERVER-KEY ONLY / LAST RESORT. Plain-language revise of a flyer that create_flyer made. " +
        "REQUIRES ANTHROPIC_API_KEY — most deployments do not set one. If this fails with a configuration " +
        "error, do NOT retry. For flyers you authored with compose_flyer, use revise_composition instead.",
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
      title: "Get a finished flyer made with create_flyer",
      description:
        "Get a finished flyer as PNG or SVG (text stays editable in the SVG). Returns the export URLs " +
        "directly — works the same whether you can reach local disk or not.",
      inputSchema: {
        jobId: z.string(),
        format: z.enum(["png", "svg"]),
        outputPath: z
          .string()
          .optional()
          .describe(
            "Only useful when this server runs on the same machine as you. On a hosted deployment it " +
              "writes to the server's disk, which you cannot reach — the returned URLs work regardless.",
          ),
      },
    },
    async ({ jobId, format, outputPath }) => {
      // Mirrors export_composed_flyer's safer default: outputPath used to be
      // required, so a hosted connector — no shared disk with the user —
      // had no valid way to call this tool at all. Same failure class the
      // upload_asset fix closed, the other direction.
      if (format === "svg") {
        const svg = await apiBinary(`/v1/flyers/${jobId}/export?format=svg`);
        if (outputPath) {
          const target = resolve(outputPath);
          await mkdir(dirname(target), { recursive: true });
          await writeFile(target, svg);
          return { content: [{ type: "text", text: `Wrote ${svg.length} bytes to ${target}` }] };
        }
        return { content: [{ type: "text", text: svg.toString("utf8") }] };
      }
      const preview = await apiBinary(`/v1/flyers/${jobId}/export?format=png&scale=0.4`);
      if (outputPath) {
        const full = await apiBinary(`/v1/flyers/${jobId}/export?format=png`);
        const target = resolve(outputPath);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, full);
      }
      return {
        content: [
          { type: "image" as const, data: preview.toString("base64"), mimeType: "image/png" },
          {
            type: "text" as const,
            text: [
              outputPath ? `Full resolution also written to ${outputPath}.` : "",
              "SHOW THESE LINKS TO THE USER — the inline preview above is for you,",
              "and a chat UI does not always render tool-result images to the reader.",
              `PNG: ${shareUrl(jobId, "png")}`,
              `SVG: ${shareUrl(jobId, "svg")}`,
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
      };
    },
  );

  server.registerTool(
    "create_flyer_batch",
    {
      title: "Explore several different flyers for one brief (needs a server-side model key)",
      description:
        "SERVER-KEY ONLY / LAST RESORT. Generate N server-authored flyers from one prompt. " +
        "REQUIRES ANTHROPIC_API_KEY — most deployments do not set one. Prefer composing each version " +
        "yourself: request_designers (fresh assignment/lineage per version) then compose_flyer. " +
        "If this fails with a configuration error, do NOT retry.",
      inputSchema: {
        prompt: z.string(),
        runs: z.number().int().min(2).max(10),
        risk: z.enum(["safe", "studio", "experimental"]).optional(),
        format: z
          .enum(FORMAT_IDS as [FormatId, ...FormatId[]])
          .optional()
          .describe("Canvas size, shared by every run in the batch. Default: portrait-4x5."),
      },
    },
    async ({ prompt, runs, risk, format }) => {
      const batch = await api("/v1/batches", {
        method: "POST",
        body: JSON.stringify({ prompt, runs, risk, format }),
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
        "Flyero design guide — how to compose a flyer with this system: creative posture (invent, " +
        "do not template-fill), the loop, component catalogue, Six Gates, and what you do not control. " +
        "Read this before your first composition.",
      inputSchema: {},
    },
    async () => ({ content: [{ type: "text", text: await apiText("/v1/guide") }] }),
  );

  server.registerTool(
    "read_design_skill",
    {
      title: "Read a design skill",
      description:
        "Design skills / judgement guides: 'brief' (reading a request, choosing a designer assignment), " +
        "'composition' (what the flyer shows — invent evidence, refuse the safe stack), 'copywriting' " +
        "(words that survive the gates), 'critique' (judging the render, reject generic). Call with no " +
        "name to list them. These teach judgement, not palettes — colour and type come from your lineage.",
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
        "Request designers / designer assignment / lineage from the Studio Sampler. Returns candidate " +
        "designers — each a bundle (metaphor, layout topology, typography, material, colour logic, " +
        "signature gesture, graphic language) you cannot edit. Pick the one whose METAPHOR forces a " +
        "fresh visual sentence for this brief. Pass campaignArchetype so the sampler only returns " +
        "metaphors suited to that kind of brief; redrawing until one fits is fighting it.",
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
        format: z
          .enum(FORMAT_IDS as [FormatId, ...FormatId[]])
          .optional()
          .describe(
            "Canvas size for the flyer(s) you'll compose from this assignment. Default: portrait-4x5. " +
              "Pass the same value again to compose_flyer.",
          ),
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
      title: "Search images, icons, illustrations, shapes and QR codes",
      description:
        "Search images for the flyer — find photos, icons, illustrations, shapes and QR codes across a " +
        "dozen sources at once. Returns candidates with previews; nothing is downloaded, so looking is " +
        "cheap. Most sources need no API key — try search_images before asking the user for stock. " +
        "Only their OWN logo or product photo must come from upload_asset. A flyer about a place, dish " +
        "or object with no picture cannot pass the cover test — search before you compose. Set `type` " +
        "to aim: 'photo' for the cover-test shot, 'icon'/'svg' for a small motif, 'vector' for a full " +
        "illustration, 'shape' for a divider/arrow/badge/QR, 'background' for full-bleed texture, " +
        "'png' for a pre-cut sticker. For a QR code, set query to 'qr:<the url to encode>'.",
      inputSchema: {
        query: z.string().describe("What to show, e.g. 'himalaya peak nepal', 'coffee cup icon', 'qr:https://example.com'."),
        type: z
          .union([
            z.enum(["photo", "svg", "icon", "vector", "png", "background", "shape"]),
            z.array(z.enum(["photo", "svg", "icon", "vector", "png", "background", "shape"])),
          ])
          .optional()
          .describe("Narrow to a kind of asset. Omit to search every kind at once."),
        provider: z
          .enum([
            "pexels", "unsplash", "pixabay", "openverse", "wikimedia", "svgrepo",
            "coloricons", "undraw", "opendoodles", "simpleicons", "shapes", "qrcode",
          ])
          .optional()
          .describe("Pin the search to one named source. Omit to search all configured sources, ranked by query."),
        perPage: z.number().int().min(1).max(40).optional(),
        orientation: z.enum(["portrait", "landscape", "square"]).optional(),
        color: z.string().optional().describe("A colour name (red, blue, ...) to match a palette or recolour an SVG/shape."),
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
        "Bring a chosen search_images result into the flyer's assets and get an assetId. Pass the " +
        "candidate's downloadUrl, sourceUrl, author and provider exactly as returned — the source's " +
        "credit is stored with it. Only downloadUrls that came from search_images are accepted.",
      inputSchema: {
        downloadUrl: z.string().describe("From a search result."),
        sourceUrl: z.string().optional(),
        author: z.string().optional(),
        provider: z.string().optional().describe("The result's `provider` field, for provenance."),
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
        "Composition example / schema shape for compose_flyer — complete valid JSON plus rules that " +
        "are not obvious from the shape. CALL THIS BEFORE compose_flyer. The examples are SHAPES to " +
        "learn field names from, NOT flyers to remix; invent a new visual sentence and evidence family. " +
        "Several examples are returned (photo-led, assembled, exchange-led) so none reads as the answer. " +
        "Guessing the schema wastes attempts.",
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
        "Compose flyer — you write it; the engine draws it. CALL get_composition_example FIRST for the " +
        "JSON shape (not a template to fill). Send the lineage from request_designers unchanged, the " +
        "copy, and 4-7 elements each naming a component, a role and `whyHere`. Invent the visual idea " +
        "from the metaphor; refuse the safe photo-hero stack unless the brief demands it. Returns the " +
        "rendered flyer plus which gates passed. A rejection lists the exact fields that are wrong — " +
        "read them. Never send coordinates, colours or fonts.",
      inputSchema: {
        composition: z
          .record(z.any())
          .describe(
            "The full composition object. Get its exact shape from get_composition_example — it is a " +
              "working shape you edit into a NEW flyer, not a flyer to lightly remix.",
          ),
      },
    },
    async ({ composition }) => {
      const out = await api("/v1/flyers/compose", {
        method: "POST",
        body: JSON.stringify(composition),
      });
      const preview = out.flyerId ? await previewContent(out.flyerId) : [];
      const links = out.flyerId
        ? [
            {
              type: "text" as const,
              text:
                `SHOW THESE TO THE USER — the preview above is for your eyes only:\n` +
                `PNG: ${shareUrl(out.flyerId, "png")}\n` +
                `SVG: ${shareUrl(out.flyerId, "svg")}`,
            },
          ]
        : [];
      return {
        content: [{ type: "text", text: JSON.stringify(out, null, 2) }, ...preview, ...links],
      };
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
        outputPath: z
          .string()
          .optional()
          .describe(
            "Only useful when this server runs on the same machine as you. On a hosted deployment it " +
              "writes to the server's disk, which you cannot reach — use the returned URL instead.",
          ),
      },
    },
    async ({ flyerId, format = "png", outputPath }) => {
      if (format === "svg") {
        const svg = await apiBinary(`/v1/flyers/${flyerId}/export?format=svg`);
        if (outputPath) {
          await mkdir(dirname(resolve(outputPath)), { recursive: true });
          await writeFile(resolve(outputPath), svg);
          return { content: [{ type: "text", text: `Wrote ${outputPath}` }] };
        }
        return { content: [{ type: "text", text: svg.toString("utf8") }] };
      }

      /**
       * Show a preview, link the original.
       *
       * Returning the full render inline base64'd to 3.2MB, which chat clients
       * drop without a word — the tool reported success and nobody saw a flyer.
       * `outputPath` was no help either: on a hosted server it writes to the
       * *server's* disk, which the reader cannot reach. So: a preview small
       * enough to travel, plus the URL of the real file.
       */
      const preview = await apiBinary(`/v1/flyers/${flyerId}/export?format=png&scale=0.4`);
      if (outputPath) {
        const full = await apiBinary(`/v1/flyers/${flyerId}/export?format=png`);
        await mkdir(dirname(resolve(outputPath)), { recursive: true });
        await writeFile(resolve(outputPath), full);
      }
      return {
        content: [
          { type: "image" as const, data: preview.toString("base64"), mimeType: "image/png" },
          {
            type: "text" as const,
            text: [
              outputPath ? `Full resolution written to ${outputPath}.` : "",
              "SHOW THESE LINKS TO THE USER — the inline preview above is for you,",
              "and a chat UI does not always render tool-result images to the reader.",
              `PNG: ${shareUrl(flyerId, "png")}`,
              `SVG: ${shareUrl(flyerId, "svg")}`,
            ]
              .filter(Boolean)
              .join("\n"),
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
