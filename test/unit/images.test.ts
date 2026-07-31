import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { applyImageOps, expandPreset, TRANSFORM_CATALOGUE } from "../../src/core/images/transform.js";

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
