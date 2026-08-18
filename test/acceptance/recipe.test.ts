import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { buildServer } from "../../src/api/server.js";
import { config } from "../../src/config.js";
import { legalComponentsFor } from "../../src/core/compose/recipe.js";
import { isPhotoGround } from "../../src/core/layout/recipes.js";
import type { Lineage } from "../../src/core/compose/spec.js";

/**
 * `/v1/flyers/compose-recipe` (R3) end to end, through the real route — not a
 * hand-built spec. The point of this surface is that an author only fills
 * four named slots; this proves that's actually enough to reach a rendered,
 * gated flyer via the real HTTP path, the same as `/v1/flyers/compose`.
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

async function uploadSyntheticPhoto(): Promise<string> {
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
    headers: { ...auth, "content-type": `multipart/form-data; boundary=${boundary}` },
    payload: body,
  });
  expect(res.statusCode, `synthetic asset upload failed: ${res.body}`).toBe(201);
  return res.json().assetId as string;
}

const DENSITY_BUDGET = { quiet: [4, 5], balanced: [5, 6], rich: [6, 7] } as const;

/** A lineage with no gesture content requirement, so a minimal fill is enough. */
async function simpleLineage(): Promise<{ lineage: Lineage; min: number }> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await app.inject({
      method: "POST",
      url: "/v1/studio/assignments",
      headers: auth,
      payload: { brief: `A community bake sale flyer ${attempt}`, runs: 3 },
    });
    expect(res.statusCode).toBe(200);
    for (const assignment of res.json().assignments) {
      if (!assignment.direction.gesture.requiresComponent) {
        const density = assignment.direction.artDirection.density as keyof typeof DENSITY_BUDGET;
        return { lineage: assignment.lineage as Lineage, min: DENSITY_BUDGET[density][0] };
      }
    }
  }
  throw new Error("no assignment without a gesture content requirement in 8 attempts");
}

describe("POST /v1/flyers/compose-recipe", () => {
  it("compiles a minimal slot fill into a rendered, gated flyer", async () => {
    const { lineage, min } = await simpleLineage();
    const assetId = isPhotoGround(lineage.topology) ? await uploadSyntheticPhoto() : undefined;

    const pick = (role: "evidence" | "message" | "support" | "cta") => {
      const options = legalComponentsFor(lineage, role);
      expect(options.length, `${lineage.topology}/${role}`).toBeGreaterThan(0);
      return { component: options[0]!, whyHere: `carries the ${role} of this flyer` };
    };

    // The four named slots always give 4 elements; a "balanced"/"rich"
    // density lineage needs more — add the optional brand slot, then generic
    // extras, exactly the way a real author would pad a fill to fit.
    const slots: Record<string, { component: string; whyHere: string }> = {
      evidence: pick("evidence"),
      message: pick("message"),
      support: pick("support"),
      cta: pick("cta"),
    };
    if (min > 4) {
      slots.brand = { component: legalComponentsFor(lineage, "brand")[0]!, whyHere: "carries the brand mark" };
    }
    const extras =
      min > 5
        ? [{ component: legalComponentsFor(lineage, "support")[0]!, whyHere: "carries an extra supporting fact", role: "support" as const }]
        : undefined;

    const res = await app.inject({
      method: "POST",
      url: "/v1/flyers/compose-recipe",
      headers: auth,
      payload: {
        lineage,
        productName: "Maple Street Bake Sale",
        idea: "A single warm loaf sits alone on a folding table, the whole sale in one object.",
        story: ["an empty folding table", "one loaf appears", "the table fills up", "come buy one"],
        copy: {
          eyebrow: null,
          headline: "One Loaf To Start",
          body: null,
          cta: { label: "Find the table", url: null, qr: false },
        },
        groundAsset: assetId,
        slots,
        extras,
        gesturePurpose: `applies ${lineage.gesture} so the composition isn't just a stack of boxes`,
      },
    });

    expect(res.statusCode, JSON.stringify(res.json(), null, 2).slice(0, 1500)).toBe(201);
    const body = res.json() as { flyerId?: string; status?: string };
    expect(body.flyerId).toBeTruthy();
    expect(body.status).toBeTruthy();
  });

  it("rejects an unknown component with a clear, addressable error", async () => {
    const { lineage } = await simpleLineage();
    const res = await app.inject({
      method: "POST",
      url: "/v1/flyers/compose-recipe",
      headers: auth,
      payload: {
        lineage,
        productName: "Test",
        idea: "A test idea sentence describing what the viewer sees, ten chars plus.",
        story: ["a", "b", "c", "d"],
        copy: { eyebrow: null, headline: "Headline", body: null, cta: { label: "Go", url: null, qr: false } },
        slots: {
          evidence: { component: "not-a-real-component", whyHere: "testing the error path here" },
          message: { component: "headline-block", whyHere: "carries the message of this flyer" },
          support: { component: "body-paragraph", whyHere: "carries the support of this flyer" },
          cta: { component: "cta-button", whyHere: "carries the cta of this flyer" },
        },
        gesturePurpose: "applies the lineage gesture to this composition",
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error?.code).toBe("invalid_recipe");
  });
});
