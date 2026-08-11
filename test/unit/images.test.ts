import { describe, it, expect } from "vitest";
import { createAsset } from "../../src/store/assets.js";
import sharp from "sharp";
import { applyImageOps, expandPreset, TRANSFORM_CATALOGUE } from "../../src/core/images/transform.js";
import { focalPreserveAspect } from "../../src/components/assets.js";

/** Solid white 64×64 with a red square in the middle — for cutout tests. */
async function subjectOnWhite(): Promise<Buffer> {
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">` +
      `<rect width="64" height="64" fill="#ffffff"/>` +
      `<rect x="16" y="16" width="32" height="32" fill="#cc0000"/></svg>`,
  );
  return sharp(svg).png().toBuffer();
}

describe("image transforms", () => {
  it("anchors cover crops to the analysed subject", () => {
    expect(focalPreserveAspect({ focalPoint: { x: 0.15, y: 0.82 } })).toBe("xMinYMax slice");
    expect(focalPreserveAspect({ focalPoint: { x: 0.5, y: 0.5 } }, "meet")).toBe("xMidYMid meet");
  });

  it("exposes a catalogue agents can read", () => {
    expect(TRANSFORM_CATALOGUE.ops).toContain("removeBackground");
    expect(TRANSFORM_CATALOGUE.presets["logo-clean"]).toBeTruthy();
  });

  it("expands product-hero into cutout + feather + sharpen", () => {
    const ops = expandPreset("product-hero");
    expect(ops.map((o) => o.op)).toEqual(["removeBackground", "feather", "sharpen"]);
  });

  it("removes a white studio background", async () => {
    const input = await subjectOnWhite();
    const { buffer, width, height, opsApplied } = await applyImageOps(input, "image/png", {
      ops: [{ op: "removeBackground", mode: "auto", tolerance: 30 }],
      reanalyze: false,
    });
    expect(opsApplied).toHaveLength(1);
    // Trim after cutout should shrink past the empty margins around the red square.
    expect(width).toBeLessThan(64);
    expect(height).toBeLessThan(64);
    expect(width).toBeGreaterThan(20);
    expect(height).toBeGreaterThan(20);

    const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    // Subject pixels should still be reddish / opaque.
    let opaque = 0;
    for (let i = 0; i < data.length; i += 4) {
      if ((data[i + 3] ?? 0) > 200 && (data[i] ?? 0) > 150) opaque++;
    }
    expect(opaque).toBeGreaterThan(info.width);
  });

  it("blurs without changing dimensions", async () => {
    const input = await subjectOnWhite();
    const { buffer, width, height } = await applyImageOps(input, "image/png", {
      preset: "bg-plate-blur",
      reanalyze: false,
    });
    expect(width).toBe(64);
    expect(height).toBe(64);
    const meta = await sharp(buffer).metadata();
    expect(meta.format).toBe("png");
  });

  it("circle-crops to a square", async () => {
    const input = await sharp({
      create: { width: 80, height: 60, channels: 3, background: "#336699" },
    })
      .png()
      .toBuffer();
    const { width, height } = await applyImageOps(input, "image/png", {
      ops: [{ op: "circleCrop" }],
      reanalyze: false,
    });
    expect(width).toBe(height);
    expect(width).toBe(60);
  });

  it("rejects empty transform requests", async () => {
    const input = await subjectOnWhite();
    await expect(
      applyImageOps(input, "image/png", { reanalyze: false }),
    ).rejects.toThrow(/ops|preset/i);
  });
});

describe("storage economy", () => {
  it("stores a photograph as JPEG, not lossless PNG", async () => {
    /*
     * The downscale path used to rasterise through resvg and emit PNG —
     * lossless, and therefore catastrophic for a photograph. Measured on one
     * image: 6656KB as PNG against 108KB as JPEG. Seventeen imported photos
     * came to 47MB, on a budget of 500MB.
     *
     * WebP for a while, not JPEG — reverted after resvg (@resvg/resvg-js)
     * was found to silently fail to decode some sharp-encoded WebP photos
     * (no error, just an empty box) while the identical pixels re-encoded as
     * JPEG rendered correctly every time. See src/store/assets.ts's downscale().
     */
    const { default: sharp } = await import("sharp");
    const wide = await sharp({
      create: { width: 2400, height: 3000, channels: 3, background: { r: 90, g: 120, b: 60 } },
    })
      .jpeg()
      .toBuffer();

    const asset = await createAsset({
      buffer: wide,
      mime: "image/jpeg",
      kind: "reference",
      apiKey: "test_key_1",
    });

    expect(asset.mime, "photographs must not be stored lossless, or as WebP (unreliable in resvg)").toBe("image/jpeg");
    expect(Math.max(asset.width, asset.height), "no bigger than the renderer can use").toBeLessThanOrEqual(1600);
  });

  it("re-encodes a small WebP away, even when no downscale is needed", async () => {
    // The bug this guards: a WebP under MAX_ASSET_EDGE used to skip
    // downscale() entirely and reach the renderer unconverted.
    const { default: sharp } = await import("sharp");
    const small = await sharp({
      create: { width: 400, height: 500, channels: 3, background: { r: 10, g: 80, b: 200 } },
    })
      .webp()
      .toBuffer();

    const asset = await createAsset({
      buffer: small,
      mime: "image/webp",
      kind: "reference",
      apiKey: "test_key_1",
    });

    expect(asset.mime, "WebP must never reach storage unconverted").toBe("image/jpeg");
    expect([asset.width, asset.height]).toEqual([400, 500]);
  });

  it("keeps transparency as PNG", async () => {
    // WebP-ing a logo's alpha away would put a white box on the flyer.
    const { default: sharp } = await import("sharp");
    const logo = await sharp({
      create: { width: 2000, height: 2000, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();

    const asset = await createAsset({
      buffer: logo,
      mime: "image/png",
      kind: "logo",
      apiKey: "test_key_1",
    });
    expect(asset.mime).toBe("image/png");
  });
});
