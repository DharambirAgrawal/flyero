import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../../src/api/server.js";
import { drain } from "../../src/api/runner.js";
import { fixtureLineages, fixtureSpec } from "../fixtures.js";
import { renderSpec } from "../../src/core/render/index.js";
import { exportFlyer } from "../../src/core/export/index.js";
import { createJob, saveRevision, updateJob } from "../../src/store/jobs.js";
import { solveLayout } from "../../src/core/layout/solver.js";
import { themeFromSpec } from "../../src/core/render/theme.js";
import { runGates } from "../../src/core/gates/index.js";
import { config } from "../../src/config.js";

/**
 * Acceptance test 5 from REQUIREMENTS.md: the full create → poll → revise →
 * export cycle over the REST surface, with no MCP involved.
 *
 * The suite runs without an API key, so generation itself fails fast and cheaply
 * — which lets us assert the honest-failure path too. The live model run is a
 * separate script.
 */

const KEY = "test_key_1";
const auth = { authorization: `Bearer ${KEY}` };

/** A 1×1 PNG, so asset upload can be exercised without a fixture file. */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

let app: FastifyInstance;

beforeAll(async () => {
  app = buildServer();
  await app.ready();
  /*
   * MCP tools that wrap the REST surface (upload_asset, export_flyer, …) call
   * it over real loopback fetch — config.flyeroApiUrl, "how the process talks
   * to itself" — not app.inject. Without an actual listener, those calls
   * either 404 against whatever else happens to be on the port or fail
   * outright; app.inject alone was never enough to exercise them. Binding to
   * config.port, the same default config.flyeroApiUrl already assumes,
   * makes fetch() reach this exact instance.
   */
  await app.listen({ port: config.port, host: "127.0.0.1" });
});

afterAll(async () => {
  await app.close();
});

describe("auth", () => {
  it("rejects a request with no bearer key", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/health" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("unauthorized");
  });

  it("connects whatever Accept header the client sends", async () => {
    /*
     * The transport demands the client accept BOTH application/json and
     * text/event-stream and 406s otherwise. Plenty of connectors send only
     * application/json, or a wildcard, or nothing — all spec-legal, none
     * recoverable client-side, and the user just sees "cannot connect". We answer
     * with JSON regardless, so the handshake requirement is ours to absorb.
     */
    for (const accept of ["application/json", "*/*", undefined]) {
      const headers: Record<string, string> = { ...auth };
      if (accept) headers.accept = accept;
      const res = await app.inject({
        method: "POST",
        url: "/mcp",
        headers,
        payload: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
      });
      expect(res.statusCode, `accept: ${accept ?? "(none)"}`).toBe(200);
    }
  });

  it("returns 404 for OAuth discovery, never 401", async () => {
    // A connector that sees 401 here concludes the server wants an OAuth flow
    // and tries to start one. We have no OAuth — the key is in the URL — so
    // that attempt fails and it reports "cannot connect" without ever reaching
    // /mcp. 404 tells it plainly to use the credential it already has.
    for (const path of [
      "/.well-known/oauth-authorization-server",
      "/.well-known/oauth-protected-resource",
    ]) {
      const res = await app.inject({ method: "GET", url: path });
      expect(res.statusCode, path).toBe(404);
    }
  });

  it("rejects an unknown key", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/health",
      headers: { authorization: "Bearer nope" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("has no unauthenticated path, including health", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/health", headers: auth });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.components).toBeGreaterThanOrEqual(25);
    // Coherent art-direction profiles, not the old unrestricted Cartesian product.
    expect(body.designerProfiles).toBeGreaterThan(10_000);
    expect(body.fontFamilies).toBeGreaterThan(5);
  });
});

describe("assets", () => {
  it("accepts an upload and returns dimensions", async () => {
    const form = new FormData();
    // `kind` must precede the file: request.file() resolves at the file part,
    // so fields after it have not been parsed yet.
    form.append("kind", "screenshot");
    form.append("file", new Blob([new Uint8Array(TINY_PNG)], { type: "image/png" }), "dot.png");

    const encoded = new Response(form);
    const payload = Buffer.from(await encoded.arrayBuffer());

    const res = await app.inject({
      method: "POST",
      url: "/v1/assets",
      headers: { ...auth, "content-type": encoded.headers.get("content-type")! },
      payload,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.assetId).toMatch(/^ast_/);
    expect(body.dimensions).toEqual([1, 1]);
    expect(body.kind).toBe("screenshot");
    expect(body.analysis).toBeDefined();
  });

  it("404s an unknown asset", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/assets/ast_nope", headers: auth });
    expect(res.statusCode).toBe(404);
  });

  it("lists transform presets and transforms an upload into a derived asset", async () => {
    const catalogue = await app.inject({ method: "GET", url: "/v1/assets/transforms", headers: auth });
    expect(catalogue.statusCode).toBe(200);
    expect(catalogue.json().presets["screenshot-frame"]).toBeTruthy();

    // A slightly larger PNG so crop/blur have something to work with.
    const png = await (await import("sharp")).default({
      create: { width: 48, height: 48, channels: 3, background: "#eeeeee" },
    })
      .png()
      .toBuffer();

    const form = new FormData();
    form.append("kind", "screenshot");
    form.append("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "shot.png");
    const encoded = new Response(form);
    const upload = await app.inject({
      method: "POST",
      url: "/v1/assets",
      headers: { ...auth, "content-type": encoded.headers.get("content-type")! },
      payload: Buffer.from(await encoded.arrayBuffer()),
    });
    expect(upload.statusCode).toBe(201);
    const parentId = upload.json().assetId as string;

    const transformed = await app.inject({
      method: "POST",
      url: `/v1/assets/${parentId}/transform`,
      headers: auth,
      payload: { preset: "screenshot-frame", reanalyze: false },
    });
    expect(transformed.statusCode).toBe(201);
    const body = transformed.json();
    expect(body.assetId).toMatch(/^ast_/);
    expect(body.parentId).toBe(parentId);
    expect(body.assetId).not.toBe(parentId);
    expect(body.opsApplied.length).toBeGreaterThan(0);

    const file = await app.inject({
      method: "GET",
      url: `/v1/assets/${body.assetId}/file`,
      headers: auth,
    });
    expect(file.statusCode).toBe(200);
    expect(file.headers["content-type"]).toMatch(/image\/png/);
    expect(file.rawPayload.length).toBeGreaterThan(20);

    const meta = await app.inject({
      method: "GET",
      url: `/v1/assets/${body.assetId}`,
      headers: auth,
    });
    expect(meta.json().parentId).toBe(parentId);
    expect(meta.json().transforms).toBeTruthy();
  });
});

describe("flyer lifecycle", () => {
  it("validates the request body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/flyers",
      headers: auth,
      payload: { prompt: "" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("invalid_request");
  });

  it("rejects an unknown assetId before queueing any work", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/flyers",
      headers: auth,
      payload: { prompt: "A flyer for a coffee subscription", assetIds: ["ast_missing"] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 202 with a job id, then reports honest failure without a model key", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/v1/flyers",
      headers: auth,
      payload: { prompt: "Flyer for Vayami, an AI resume tool. Waitlist at vayami.ai/waitlist." },
    });
    expect(created.statusCode).toBe(202);
    const { jobId } = created.json();
    expect(jobId).toMatch(/^fly_/);

    await drain();

    const polled = await app.inject({ method: "GET", url: `/v1/flyers/${jobId}`, headers: auth });
    const body = polled.json();
    // Without a key the pipeline cannot run — and it says so rather than
    // pretending to have produced something.
    expect(body.status).toBe("failed");
    expect(body.error).toMatch(/ANTHROPIC_API_KEY/);
  });

  it("reports honest failure on revise without a model key too, not a raw SDK error", async () => {
    /*
     * Real bug this closes: runJob checks hasLlm() up front and fails
     * cleanly; runRevision never did, so a caller with no server-side model
     * key (revise_flyer over MCP, or this route directly) got a raw SDK
     * exception after a poll delay instead of the same immediate, clear
     * signal create_flyer already gives. The tool description didn't warn
     * either — this endpoint-level fix protects every caller regardless.
     */
    const jobId = "fly_REVISENOKEY";
    const spec = fixtureSpec(fixtureLineages("revise-no-key", 1)[0]!);
    const { svg, layout } = renderSpec(spec);
    await createJob({
      id: jobId,
      apiKey: KEY,
      prompt: "fixture",
      risk: "studio",
      jobSeed: "fixture",
      assetIds: [],
      brand: null,
      callbackUrl: null,
      batchId: null,
    });
    const gates = await runGates(
      { spec, layout, requestedAssetIds: [] },
      { jobId, apiKey: KEY, stage: "gates" },
    );
    exportFlyer({ jobId, revision: 0, spec, svg });
    await saveRevision({ jobId, revision: 0, spec, layout, gates, instruction: null });
    await updateJob(jobId, { status: "done", idea: spec.idea, gates: JSON.stringify(gates) });

    const res = await app.inject({
      method: "POST",
      url: `/v1/flyers/${jobId}/revise`,
      headers: auth,
      payload: { instruction: "make the call to action stronger" },
    });
    expect(res.statusCode).toBe(202);

    await drain();

    const polled = await app.inject({ method: "GET", url: `/v1/flyers/${jobId}`, headers: auth });
    const body = polled.json();
    expect(body.status).toBe("failed");
    expect(body.error).toMatch(/ANTHROPIC_API_KEY/);
    expect(body.error).toMatch(/revise_composition|compose_flyer/);
  });

  it("404s an unknown job", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/flyers/fly_nope", headers: auth });
    expect(res.statusCode).toBe(404);
  });
});

describe("export surface", () => {
  // Seeded directly from a fixture so export can be tested without generation.
  const jobId = "fly_EXPORTFIXTURE";

  beforeAll(async () => {
    const spec = fixtureSpec(fixtureLineages("export", 1)[0]!);
    const { svg, layout } = renderSpec(spec);
    createJob({
      id: jobId,
      apiKey: KEY,
      prompt: "fixture",
      risk: "studio",
      jobSeed: "fixture",
      assetIds: [],
      brand: null,
      callbackUrl: null,
      batchId: null,
    });
    const gates = await runGates(
      { spec, layout: solveLayout(spec, themeFromSpec(spec)), requestedAssetIds: [] },
      { jobId, apiKey: KEY, stage: "gates" },
    );
    exportFlyer({ jobId, revision: 0, spec, svg });
    saveRevision({ jobId, revision: 0, spec, layout, gates, instruction: null });
    updateJob(jobId, { status: "done", idea: spec.idea, gates: JSON.stringify(gates) });
  });

  it("serves a preview small enough to survive a chat transport", async () => {
    /*
     * The full render base64s to roughly 3MB. Chat clients drop an inline image
     * that size without a word — the agent reported "image returned" and the
     * reader saw nothing, which looks like success from both ends. The MCP
     * preview asks for scale=0.4; this is what makes that possible.
     */
    const full = await app.inject({
      method: "GET",
      url: `/v1/flyers/${jobId}/export?format=png`,
      headers: auth,
    });
    const preview = await app.inject({
      method: "GET",
      url: `/v1/flyers/${jobId}/export?format=png&scale=0.4`,
      headers: auth,
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.rawPayload.length).toBeLessThan(full.rawPayload.length / 2);
    expect(preview.rawPayload.length, "must fit a transport once base64'd").toBeLessThan(700_000);
  });

  it("serves PNG", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/flyers/${jobId}/export?format=png`,
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.rawPayload.length).toBeGreaterThan(1000);
  });

  it("serves SVG with live text", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/flyers/${jobId}/export?format=svg`,
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("image/svg+xml");
    expect(res.body).toContain("<text");
  });

  it("returns 501 for PDF, as documented", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/flyers/${jobId}/export?format=pdf`,
      headers: auth,
    });
    expect(res.statusCode).toBe(501);
    expect(res.json().error.code).toBe("not_implemented");
  });

  it("rejects an unknown format", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/flyers/${jobId}/export?format=gif`,
      headers: auth,
    });
    expect(res.statusCode).toBe(400);
  });

  it("serves the spec as JSON", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/flyers/${jobId}/spec`,
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    const spec = res.json();
    expect(spec.specVersion).toBe("1.0");
    expect(spec.elements.length).toBeGreaterThanOrEqual(4);
    // The spec carries no layout geometry — that is the solver's output.
    // Path-connector props may still hold normalised 0–1 waypoints with `x`/`y`.
    expect(spec).not.toHaveProperty("boxes");
    expect(JSON.stringify(spec)).not.toMatch(/"x":\s*[1-9]\d{2,}/);
  });

  it("serves an export even when the local render cache never existed, from the DB alone", async () => {
    /*
     * Real production failure: "No spec for revision 3" on a job whose spec
     * was safely in Postgres the whole time. exportFlyer's spec.json cache
     * file lives on the same ephemeral disk Render wipes on every redeploy;
     * the export route's fallback only ever checked that file, never the
     * `revisions` table GET .../spec already reads correctly. This job never
     * calls exportFlyer at all — only saveRevision, straight to the DB — so
     * there is no local cache to fall back to except the database.
     */
    const dbOnlyJobId = "fly_DBFALLBACKFIXTURE";
    const spec = fixtureSpec(fixtureLineages("db-fallback", 1)[0]!);
    const { layout } = renderSpec(spec);
    await createJob({
      id: dbOnlyJobId,
      apiKey: KEY,
      prompt: "fixture",
      risk: "studio",
      jobSeed: "fixture",
      assetIds: [],
      brand: null,
      callbackUrl: null,
      batchId: null,
    });
    const gates = await runGates(
      { spec, layout, requestedAssetIds: [] },
      { jobId: dbOnlyJobId, apiKey: KEY, stage: "gates" },
    );
    await saveRevision({ jobId: dbOnlyJobId, revision: 0, spec, layout, gates, instruction: null });
    await updateJob(dbOnlyJobId, { status: "done", idea: spec.idea, gates: JSON.stringify(gates) });

    const png = await app.inject({
      method: "GET",
      url: `/v1/flyers/${dbOnlyJobId}/export?format=png`,
      headers: auth,
    });
    expect(png.statusCode).toBe(200);
    expect(png.headers["content-type"]).toBe("image/png");

    const svg = await app.inject({
      method: "GET",
      url: `/v1/flyers/${dbOnlyJobId}/export?format=svg`,
      headers: auth,
    });
    expect(svg.statusCode).toBe(200);
    expect(svg.body).toContain("<text");
  });
});

describe("batches", () => {
  it("creates N independent jobs, each with its own seed", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/batches",
      headers: auth,
      payload: { prompt: "Flyer for a bike repair shop", runs: 3 },
    });
    expect(res.statusCode).toBe(202);
    const { batchId, jobIds } = res.json();
    expect(jobIds).toHaveLength(3);

    await drain();

    const view = await app.inject({ method: "GET", url: `/v1/batches/${batchId}`, headers: auth });
    const body = view.json();
    expect(body.runs).toBe(3);
    expect(body.results).toHaveLength(3);
    expect(body.complete).toBe(3);
  });
});

describe("introspection", () => {
  it("always writes a process log, even for a failed job", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/v1/flyers",
      headers: auth,
      payload: { prompt: "Flyer for a bookshop" },
    });
    const { jobId } = created.json();
    await drain();

    const res = await app.inject({
      method: "GET",
      url: `/v1/flyers/${jobId}/process`,
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().log).toBeDefined();
  });
});

describe("design skills", () => {
  it("lists skills and serves each as markdown", async () => {
    const index = await app.inject({ method: "GET", url: "/v1/skills", headers: auth });
    expect(index.statusCode).toBe(200);
    const names = (index.json() as { skills: { name: string }[] }).skills.map((s) => s.name);
    expect(names).toEqual(["composition", "copywriting", "critique", "brief"]);

    for (const name of names) {
      const res = await app.inject({ method: "GET", url: `/v1/skills/${name}`, headers: auth });
      expect(res.statusCode, name).toBe(200);
      expect(res.body.startsWith("# "), `${name} should be markdown`).toBe(true);
    }
  });

  it("teaches judgement, never palettes or measurements", async () => {
    /*
     * The load-bearing constraint. Published skill libraries ship curated hex
     * palettes and type scales; serving those to every agent would make every
     * flyer converge — the exact failure the Studio Sampler exists to prevent,
     * and the look the banned list is trying to kill. Colour and type belong to
     * the lineage, so no skill may prescribe them.
     */
    for (const name of ["composition", "copywriting", "critique", "brief"]) {
      const body = (await app.inject({ method: "GET", url: `/v1/skills/${name}`, headers: auth })).body;
      expect(body, `${name} must not prescribe hex colours`).not.toMatch(/#[0-9a-fA-F]{6}/);
      expect(body, `${name} must not prescribe a type scale`).not.toMatch(/\b1\.(125|25|333|414|5|618)\b/);
      expect(body, `${name} must not name a font family`).not.toMatch(
        /\b(Inter|Helvetica|Roboto|Georgia|Playfair|Montserrat)\b/,
      );
    }
  });

  it("pushes agents off template-filling and the safe photo stack", async () => {
    const guide = (await app.inject({ method: "GET", url: "/v1/guide", headers: auth })).body;
    expect(guide).toMatch(/template filling|NOT flyers to remix|Steal the shape/i);
    expect(guide).toMatch(/safe stack|photo-hero/);
    expect(guide).toMatch(/request_designers/);
    expect(guide).toMatch(/search_images/);

    const composition = (
      await app.inject({ method: "GET", url: "/v1/skills/composition", headers: auth })
    ).body;
    expect(composition).toMatch(/Refuse the safe stack|JSON shapes/i);
    expect(composition).toMatch(/chat-exchange/);
  });

  it("surfaces the archetype filter so agents do not brute-force the sampler", async () => {
    // A real run burned 27 assignment draws hunting for a metaphor that suited a
    // travel brief, because nothing told it the sampler can filter by campaign
    // archetype. The control existed; the API just never mentioned it.
    const bare = await app.inject({
      method: "POST",
      url: "/v1/studio/assignments",
      headers: auth,
      payload: { runs: 3 },
    });
    expect(bare.statusCode).toBe(200);
    expect(bare.json().hint, "a bare assignment should name the filter").toMatch(/campaignArchetype/);

    const filtered = await app.inject({
      method: "POST",
      url: "/v1/studio/assignments",
      headers: auth,
      payload: { runs: 3, campaignArchetype: "event-invitation" },
    });
    expect(filtered.json().archetype).toBe("event-invitation");
    expect(filtered.json().hint, "no nagging once it is supplied").toBeUndefined();
  });

  it("reports what is available when a skill is unknown", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/skills/color-palette", headers: auth });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: { details: { available: string[] } } }).error.details.available)
      .toContain("composition");
  });
});

describe("remote MCP", () => {
  it("serves the same tools over HTTP that the stdio server does", async () => {
    // A hosted connector cannot spawn a process, so stdio alone makes Flyero
    // unusable as a connector. The tools are not redefined here — buildMcpServer
    // is shared — so REST and MCP cannot drift apart.
    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: { ...auth, accept: "application/json, text/event-stream" },
      payload: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
    });
    expect(res.statusCode).toBe(200);
    const names = res.json().result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain("create_flyer");
    expect(names).toContain("export_flyer");
  });

  it("delivers the workflow as server instructions, not as the user's problem", async () => {
    /*
     * Without instructions an agent gets a bag of tools and no order, so the
     * *user* has to write the process into their prompt. Real users say "make
     * me a flyer for my shop" and stop. Everything needed to get from that to a
     * finished poster has to arrive with the connection.
     */
    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: { ...auth, accept: "application/json, text/event-stream" },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "test", version: "1" },
        },
      },
    });
    const instructions: string = res.json().result.instructions ?? "";
    expect(instructions.length, "no instructions sent").toBeGreaterThan(500);
    // The traps that actually cost real runs.
    for (const must of [
      "campaignArchetype",
      "get_composition_example",
      "review_flyer",
      "Never invent facts",
      "export",
      "request_designers",
      "search_images",
      "SHAPES",
      "safe stack",
    ]) {
      expect(instructions, `instructions omit ${must}`).toContain(must);
    }
  });

  it("warns off the tool that needs a key the deployment may not have", async () => {
    // ChatGPT fell back to create_flyer, got "ANTHROPIC_API_KEY not configured",
    // and gave up with no flyer — after doing all the creative work correctly.
    // The tool has to say so itself and name the path that needs no key.
    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: { ...auth, accept: "application/json, text/event-stream" },
      payload: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
    });
    const auto = res
      .json()
      .result.tools.find((t: { name: string }) => t.name === "create_flyer");
    expect(auto.description).toContain("ANTHROPIC_API_KEY");
    expect(auto.description).toContain("compose_flyer");
    expect(auto.description).toMatch(/SERVER-KEY ONLY|LAST RESORT/);
  });

  it("puts discovery keywords in tool descriptions so MCP search loads the right tools", async () => {
    /*
     * Hosted clients search tool descriptions and load a shortlist. Vague
     * descriptions caused "request designers assignment lineage" to load
     * revise_flyer / create_flyer_batch instead of request_designers, and
     * "search images" to miss search_images entirely. Keywords must live in
     * the description text itself.
     */
    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: { ...auth, accept: "application/json, text/event-stream" },
      payload: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
    });
    const byName = Object.fromEntries(
      res.json().result.tools.map((t: { name: string; description: string }) => [t.name, t.description]),
    );
    expect(byName.request_designers).toMatch(/designer assignment|lineage/i);
    expect(byName.search_images).toMatch(/Search images/i);
    expect(byName.get_composition_example).toMatch(/SHAPE|schema shape|NOT flyers to remix/i);
    expect(byName.read_design_guide).toMatch(/design guide/i);
    expect(byName.compose_flyer).toMatch(/refuse the safe|NOT a template|invent/i);
    expect(byName.create_flyer_batch).toMatch(/SERVER-KEY ONLY|LAST RESORT/);
    expect(byName.revise_flyer).toMatch(/SERVER-KEY ONLY|LAST RESORT/);
  });

  it("uploads via base64 data, not just a local path — the only route a hosted connector has", async () => {
    /*
     * upload_asset used to require an absolute local filesystem path. That
     * works for a locally-spawned agent (Claude Code) but not for a hosted
     * connector: there is no disk shared between it and the user, so an
     * attached image arrives as inline bytes, not a path. Confirmed live: a
     * connected agent invented an "uploads folder", found it "empty", and
     * gave up. upload_asset must accept those bytes directly.
     */
    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: { ...auth, accept: "application/json, text/event-stream" },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "upload_asset",
          arguments: {
            data: TINY_PNG.toString("base64"),
            mimeType: "image/png",
            filename: "logo.png",
            kind: "logo",
          },
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.result?.isError, JSON.stringify(body)).not.toBe(true);
    const text = body.result.content.map((c: { text?: string }) => c.text ?? "").join(" ");
    expect(text).toMatch(/^Uploaded logo\.png as ast_/);
  });

  it("exports without a local outputPath — the only route a hosted connector has", async () => {
    /*
     * export_flyer used to require outputPath and only ever wrote to local
     * disk — the same failure class as upload_asset, the other direction: a
     * hosted connector has no disk to write to at all, so it had no valid
     * way to call this tool. Uses the "export surface" describe block's
     * fixture job (fly_EXPORTFIXTURE), created earlier in this file's run.
     */
    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: { ...auth, accept: "application/json, text/event-stream" },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "export_flyer", arguments: { jobId: "fly_EXPORTFIXTURE", format: "png" } },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.result?.isError, JSON.stringify(body)).not.toBe(true);
    const content = body.result.content as Array<{ type: string; text?: string }>;
    expect(content.some((c) => c.type === "image")).toBe(true);
    const text = content.find((c) => c.type === "text")?.text ?? "";
    expect(text).toContain("PNG:");
    expect(text).toContain("SVG:");
  });

  it("exposes the agent-driven tools, which need no model key on the server", async () => {
    /*
     * The original tools generate a flyer *for* you and call a language model
     * server-side. A connected agent is already a model — it needs the tools
     * that let it be the designer, with the server contributing only what an
     * LLM must not decide: geometry, colour, typography and the gates.
     */
    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: { ...auth, accept: "application/json, text/event-stream" },
      payload: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
    });
    const names: string[] = res.json().result.tools.map((t: { name: string }) => t.name);
    for (const tool of [
      "read_design_guide",
      "read_design_skill",
      "request_designers",
      "search_images",
      "import_image",
      "compose_flyer",
      "revise_composition",
      "review_flyer",
      "export_composed_flyer",
    ]) {
      expect(names, `${tool} missing`).toContain(tool);
    }
    // Registering a duplicate name throws inside the SDK and 500s the whole
    // endpoint, which is how `revise_flyer` briefly took every tool down.
    expect(new Set(names).size, "duplicate tool name").toBe(names.length);
  });

  it("accepts a key in the query string, but only on /mcp", async () => {
    const ok = await app.inject({
      method: "POST",
      url: `/mcp?key=${KEY}`,
      headers: { accept: "application/json, text/event-stream" },
      payload: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
    });
    expect(ok.statusCode).toBe(200);

    // The REST surface stays header-only: a key in a URL leaks through history
    // and logs, so the convenience is scoped to the one place it is needed.
    const rest = await app.inject({ method: "GET", url: `/v1/skills?key=${KEY}` });
    expect(rest.statusCode).toBe(401);
  });

  it("connects whatever Accept header the client sends", async () => {
    /*
     * The transport demands the client accept BOTH application/json and
     * text/event-stream and 406s otherwise. Plenty of connectors send only
     * application/json, or a wildcard, or nothing — all spec-legal, none
     * recoverable client-side, and the user just sees "cannot connect". We answer
     * with JSON regardless, so the handshake requirement is ours to absorb.
     */
    for (const accept of ["application/json", "*/*", undefined]) {
      const headers: Record<string, string> = { ...auth };
      if (accept) headers.accept = accept;
      const res = await app.inject({
        method: "POST",
        url: "/mcp",
        headers,
        payload: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
      });
      expect(res.statusCode, `accept: ${accept ?? "(none)"}`).toBe(200);
    }
  });

  it("returns 404 for OAuth discovery, never 401", async () => {
    // A connector that sees 401 here concludes the server wants an OAuth flow
    // and tries to start one. We have no OAuth — the key is in the URL — so
    // that attempt fails and it reports "cannot connect" without ever reaching
    // /mcp. 404 tells it plainly to use the credential it already has.
    for (const path of [
      "/.well-known/oauth-authorization-server",
      "/.well-known/oauth-protected-resource",
    ]) {
      const res = await app.inject({ method: "GET", url: path });
      expect(res.statusCode, path).toBe(404);
    }
  });

  it("rejects an unknown key", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/mcp?key=not-a-real-key",
      headers: { accept: "application/json, text/event-stream" },
      payload: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
    });
    expect(res.statusCode).toBe(401);
  });

  it("exposes an unauthenticated liveness probe that reveals nothing", async () => {
    // Without this a platform health check gets 401 and restarts the service
    // forever. It must stay a constant — no version, no counts, no config.
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});
