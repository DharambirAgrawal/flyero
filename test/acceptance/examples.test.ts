import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { buildServer } from "../../src/api/server.js";
import { config } from "../../src/config.js";

/**
 * The published composition examples must actually compose.
 *
 * These were never tested. That is a worse gap than it sounds: the MCP
 * instructions tell an agent to fetch an example and copy it, so the example is
 * the single most influential text in the system — more so than the guide,
 * because an agent copies structure far more faithfully than it follows prose.
 * An example that does not compose sends every caller into a retry loop against
 * a shape we published ourselves.
 *
 * These tests run the real route, not a hand-built object, so an example can
 * never drift away from the schema it is meant to demonstrate.
 */

let app: FastifyInstance;
const auth = { authorization: `Bearer ${config.apiKeys[0]}` };

beforeAll(async () => {
  app = buildServer();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

/**
 * A lineage this example can actually be sent as-is.
 *
 * Deliberately mirrors what a caller must do rather than papering over it. Two
 * things vary per assignment and both will reject a composition that ignores
 * them: `direction.density` narrows the element budget (quiet 4-5, balanced
 * 5-6, rich 6-7), and `direction.gesture.requiresComponent` can demand a
 * specific component be present. An example is only honestly "copyable" if a
 * caller who reads those two fields can paste it and have it work.
 */
async function lineageFor(
  fitsDensity: readonly string[],
  elementCount: number,
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await app.inject({
      method: "POST",
      url: "/v1/studio/assignments",
      headers: auth,
      payload: { brief: `A community planting day in a small park ${attempt}`, runs: 3 },
    });
    expect(res.statusCode).toBe(200);
    for (const assignment of res.json().assignments) {
      const density = assignment.direction.artDirection.density;
      const requires = assignment.direction.gesture.requiresComponent ?? null;
      const budget = { quiet: [4, 5], balanced: [5, 6], rich: [6, 7] }[
        density as "quiet" | "balanced" | "rich"
      ]!;
      const fits =
        fitsDensity.includes(density) &&
        elementCount >= budget[0]! &&
        elementCount <= budget[1]! &&
        !requires;
      if (fits) return assignment.lineage;
    }
  }
  throw new Error(`no assignment found that this ${elementCount}-element example fits`);
}

/**
 * Uploads a tiny solid-colour PNG through the real asset route and returns its
 * assetId. A uniform light-grey image produces a near-flat toneMap (luminance
 * ~0.78, variance ≈ PHOTO_VARIANCE_FLOOR ≈ 0.02) — well under BUSY_VARIANCE —
 * so text elements near the photo zone pass `legibleFor` without needing a real
 * photograph. The alternative (stripping `assets` entirely) causes `paintPhoto`
 * to use its pessimistic no-asset fallback (varr=1, maximally busy), which
 * fails the contrast gate even when ink contrast is above 11:1.
 */
async function uploadSyntheticPhoto(
  app: FastifyInstance,
  headers: Record<string, string>,
): Promise<string> {
  // Use portrait-4x5 canvas dimensions so the photo-hero covers the entire
  // tone grid. An 8×8 thumbnail leaves seam variance when body text clips the
  // photo boundary — cells straddle photo (lum≈0.82) and ground (lum≈0.03),
  // producing spread >> BUSY_VARIANCE and a spurious contrast gate failure for
  // any lineage that places the body-paragraph near the photo edge.
  const pngBuf = await sharp({
    create: { width: 1080, height: 1350, channels: 3, background: { r: 210, g: 210, b: 210 } },
  })
    .png({ compressionLevel: 1 })
    .toBuffer();

  const boundary = "----FormBoundary7MA4YWxkTrZu0gW";
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="kind"\r\n\r\nscreenshot\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="synthetic.png"\r\nContent-Type: image/png\r\n\r\n`),
    pngBuf,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const res = await app.inject({
    method: "POST",
    url: "/v1/assets",
    headers: { ...headers, "content-type": `multipart/form-data; boundary=${boundary}` },
    payload: body,
  });

  expect(res.statusCode, `synthetic asset upload failed: ${res.body}`).toBe(201);
  return res.json().assetId as string;
}

describe("the published composition examples", () => {
  it("serves three, so none reads as the only answer", async () => {
    // One example is copied as a template; several different evidence families
    // are compared as a range. Real output collapsed onto "photograph,
    // paragraph, button, lots of paper" when that was the only shape shown.
    const res = await app.inject({ method: "GET", url: "/v1/schema/composition", headers: auth });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.examples).toHaveLength(3);
    const names = body.examples.map((e: { name: string }) => e.name);
    expect(names).toContain("photo-led");
    expect(names).toContain("assembled");
    expect(names).toContain("exchange-led");
    for (const example of body.examples) {
      expect(example.useWhen.length).toBeGreaterThan(20);
    }
    // Notes must scream that examples are shapes, not flyers to remix.
    expect(body.notes.join(" ")).toMatch(/SHAPE|shapes|remix/i);
  });

  it("shows an assembled evidence element, not only a photograph", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/schema/composition", headers: auth });
    const assembled = res
      .json()
      .examples.find((e: { name: string }) => e.name === "assembled").composition;
    const evidence = assembled.elements.find(
      (e: { role: string }) => e.role === "evidence",
    );
    expect(evidence.component).toBe("composed-figure");
    // Density: one element carrying several marks is the whole point.
    expect(evidence.props.parts.length).toBeGreaterThanOrEqual(4);
    // And every part must be placed by relationship, never by coordinate.
    for (const part of evidence.props.parts) {
      expect(Object.keys(part.at).every((k) => ["at", "of", "side", "gap"].includes(k))).toBe(true);
    }
  });

  it("shows an exchange-led evidence element for software/conversation briefs", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/schema/composition", headers: auth });
    const exchange = res
      .json()
      .examples.find((e: { name: string }) => e.name === "exchange-led").composition;
    const evidence = exchange.elements.find(
      (e: { role: string }) => e.role === "evidence",
    );
    expect(evidence.component).toBe("chat-exchange");
    expect(evidence.props.ask.length).toBeGreaterThan(8);
    expect(evidence.props.reply.length).toBeGreaterThan(8);
  });

  for (const name of ["photo-led", "assembled", "exchange-led"] as const) {
    it(`composes the ${name} example through the real route`, async () => {
      const schema = await app.inject({
        method: "GET",
        url: "/v1/schema/composition",
        headers: auth,
      });
      const entry = schema.json().examples.find((e: { name: string }) => e.name === name);
      const example = entry.composition;

      // The examples carry `<<paste ...>>` placeholders where a caller supplies
      // real values. Substitute exactly what a caller would and nothing else.
      //
      // Photo elements need a real asset: without one `paintPhoto` falls back to
      // maximally-busy (lum=0.5, varr=1), which makes `legibleFor` return false
      // for any fine text near the photo region — failing the contrast gate even
      // at a 11:1 ratio. Upload a synthetic solid-colour PNG so the tone field
      // receives an honest measurement (near-uniform luminance, near-zero
      // variance) rather than a pessimistic guess.
      const needsAsset = example.elements.some((el: { assets?: string[] }) => el.assets?.length);
      const syntheticAssetId = needsAsset ? await uploadSyntheticPhoto(app, auth) : null;

      const composition = {
        ...example,
        lineage: await lineageFor(entry.fitsDensity, entry.elementCount),
        elements: example.elements.map((el: Record<string, unknown>) => {
          if (!el.assets || !syntheticAssetId) return el;
          return { ...el, assets: [syntheticAssetId] };
        }),
        assetIds: syntheticAssetId ? [syntheticAssetId] : [],
      };

      const res = await app.inject({
        method: "POST",
        url: "/v1/flyers/compose",
        headers: auth,
        payload: composition,
      });

      // A 4xx here means we published a composition that our own schema
      // rejects, which is the failure this file exists to catch.
      expect(res.statusCode, JSON.stringify(res.json(), null, 2).slice(0, 1200)).toBe(201);
      const body = res.json();
      expect(body.flyerId).toBeTruthy();
      expect(body.status).toBeTruthy();

      /*
       * And it must pass every gate code can decide.
       *
       * The assembled example composed happily while failing G6, because it
       * showed a date and a meeting point without the `sourceStatements` that
       * back them. A published example that quietly fails a gate is worse than
       * no example at all: it teaches the shape *and* the mistake, and the
       * agent that copied it has no idea why its flyer was rejected.
       */
      const gates = body.codeCheckedGates;
      for (const [gate, passed] of Object.entries(gates)) {
        if (gate === "mechanical") continue;
        expect(passed, `${name} example fails ${gate}`).toBe(true);
      }
      for (const [check, passed] of Object.entries(gates.mechanical)) {
        expect(passed, `${name} example fails mechanical check ${check}: ${body.notes?.join("; ")}`).toBe(true);
      }
    });
  }
});
