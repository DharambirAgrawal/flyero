import { describe, expect, it } from "vitest";
import { BUSY_VARIANCE, ToneField } from "../../src/core/canvas/tone.js";
import { computeToneMap } from "../../src/store/assets.js";
import { planLight, shadowFor } from "../../src/core/canvas/light.js";
import { depthEffects, depthForRole, FOCAL_DEPTH } from "../../src/core/canvas/depth.js";
import { Rng } from "../../src/lib/rng.js";
import { fixtureLineages, fixtureSpec } from "../fixtures.js";
import { solveLayout } from "../../src/core/layout/solver.js";
import { themeFromSpec } from "../../src/core/render/theme.js";

/**
 * The canvas model (docs/CANVAS-MODEL.md).
 *
 * Every legibility bug in this project came from components drawing blind and
 * being patched one at a time. These tests pin the single question that
 * replaced those patches: *what is under this box, and will ink read on it?*
 */

const CANVAS = { w: 1080, h: 1350 };
const FULL = { x: 0, y: 0, ...CANVAS };

describe("tone field — basics", () => {
  it("starts flat at the base luminance", () => {
    const dark = new ToneField(CANVAS, "#000000").sample(FULL);
    const light = new ToneField(CANVAS, "#ffffff").sample(FULL);
    expect(dark.luminance).toBeLessThan(0.05);
    expect(light.luminance).toBeGreaterThan(0.95);
    expect(dark.variance).toBeLessThan(0.01);
  });

  it("reports a painted region locally, not as a page average", () => {
    const field = new ToneField(CANVAS, "#ffffff");
    field.paintFlat({ x: 0, y: 0, w: CANVAS.w, h: CANVAS.h / 2 }, "#000000");
    const top = field.sample({ x: 100, y: 100, w: 200, h: 200 });
    const bottom = field.sample({ x: 100, y: 1100, w: 200, h: 200 });
    // The whole point: the same page reports different tone in different places.
    expect(top.luminance).toBeLessThan(0.1);
    expect(bottom.luminance).toBeGreaterThan(0.9);
  });

  it("picks ink that clears the measured tone", () => {
    const field = new ToneField(CANVAS, "#111111");
    expect(field.inkOver(FULL)).toBe("#ffffff");
    const pale = new ToneField(CANVAS, "#f4f4f4");
    expect(pale.inkOver(FULL)).toBe("#111111");
  });

  it("finds deterministic quiet zones large enough for type", () => {
    const field = new ToneField(CANVAS, "#ffffff");
    field.paintPhoto(FULL, undefined);
    field.paintFlat({ x: 0, y: 0, w: 420, h: 300 }, "#f5f5f5");
    const first = field.quietZones({ w: 240, h: 100 }, FULL, 4);
    const second = field.quietZones({ w: 240, h: 100 }, FULL, 4);
    expect(second).toEqual(first);
    expect(first).toHaveLength(4);
    expect(first[0]!.x).toBeLessThan(420);
    expect(first[0]!.y).toBeLessThan(300);
    expect(first[0]!.sample.variance).toBeLessThan(BUSY_VARIANCE);
  });
});

describe("tone field — the bugs it exists to prevent", () => {
  it("catches white type on a bright photograph", async () => {
    // The forest canopy that shipped an unreadable headline: mean 0.45, but a
    // band at 0.72 where white type disappears. A mean would never show it.
    const bright = new Array(64).fill(0.7);
    const field = new ToneField(CANVAS, "#0B3B57");
    field.paintPhoto(FULL, bright, "#ffffff");
    const headline = { x: 100, y: 500, w: 880, h: 200 };
    expect(field.sample(headline).luminance).toBeGreaterThan(0.6);
    expect(field.legibleFor(headline, "#ffffff", true)).toBe(false);
    expect(field.legibleFor(headline, "#111111", true)).toBe(true);
  });

  it("treats an image with no tone map as hostile rather than assuming", () => {
    const field = new ToneField(CANVAS, "#ffffff");
    field.paintPhoto(FULL, undefined, "#808080");
    const box = { x: 100, y: 100, w: 400, h: 200 };
    expect(field.sample(box).variance).toBeGreaterThan(BUSY_VARIANCE);
    // Unknown brightness must never be optimistically declared legible.
    expect(field.legibleFor(box, "#ffffff", false)).toBe(false);
  });

  it("rejects fine type on a busy ground even at perfect contrast", () => {
    // A contrast ratio alone cannot see this, which is exactly why the gate
    // consults the field rather than only comparing two colours.
    const field = new ToneField(CANVAS, "#ffffff");
    field.paintPhoto(FULL, undefined, "#000000");
    const small = { x: 100, y: 100, w: 300, h: 40 };
    expect(field.legibleFor(small, "#000000", false)).toBe(false);
  });

  it("a scrim painted over a photograph makes it legible again", () => {
    const field = new ToneField(CANVAS, "#ffffff");
    field.paintPhoto(FULL, new Array(64).fill(0.72), "#ffffff");
    const box = { x: 100, y: 500, w: 880, h: 200 };
    expect(field.legibleFor(box, "#ffffff", true)).toBe(false);
    field.paintFlat(FULL, "#0B3B57", 0.7);
    expect(field.legibleFor(box, "#ffffff", true)).toBe(true);
  });
});

describe("tone maps are measured, not guessed", () => {
  it("reports real spread across a synthetic gradient", async () => {
    // A left-to-right ramp: the map must show it rather than one mean.
    const { default: sharp } = await import("sharp");
    const w = 64;
    const px = Buffer.alloc(w * w * 3);
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        const v = Math.round((x / (w - 1)) * 255);
        const o = (y * w + x) * 3;
        px[o] = v;
        px[o + 1] = v;
        px[o + 2] = v;
      }
    }
    const png = await sharp(px, { raw: { width: w, height: w, channels: 3 } }).png().toBuffer();
    const map = await computeToneMap(png);
    expect(map).toHaveLength(64);
    // First column dark, last column light, monotonic across the row.
    expect(map![0]!).toBeLessThan(0.2);
    expect(map![7]!).toBeGreaterThan(0.8);
    for (let i = 0; i < 7; i++) expect(map![i]!).toBeLessThan(map![i + 1]!);
  });

  it("survives a buffer it cannot decode", async () => {
    expect(await computeToneMap(Buffer.from("not an image"))).toBeUndefined();
  });
});

describe("the solver publishes the field the gates read", () => {
  it("attaches a tone field to every layout", () => {
    for (const lineage of fixtureLineages("TONE-1", 4)) {
      const spec = fixtureSpec(lineage);
      const layout = solveLayout(spec, themeFromSpec(spec));
      expect(layout.tone).toBeDefined();
      const sample = layout.tone.sample({ x: 0, y: 0, ...spec.canvas });
      expect(sample.luminance).toBeGreaterThanOrEqual(0);
      expect(sample.luminance).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic across repeated solves", () => {
    const spec = fixtureSpec(fixtureLineages("TONE-2", 1)[0]!);
    const theme = themeFromSpec(spec);
    const first = solveLayout(spec, theme).tone.describe();
    for (let i = 0; i < 4; i++) {
      expect(solveLayout(spec, theme).tone.describe()).toBe(first);
    }
  });
});

describe("one light, one scene", () => {
  it("gives every element a shadow from the same direction", () => {
    // Each component used to invent its own offset — Panel (3,6), polaroid
    // (3,6), the plate none at all. Disagreeing shadows are the reason
    // composited elements read as pasted on rather than sharing a world.
    const light = planLight(new Rng("light:test"), "#222222");
    const small = shadowFor(light, 100);
    const large = shadowFor(light, 800);
    expect(Math.sign(small.dx)).toBe(Math.sign(large.dx));
    expect(Math.sign(small.dy)).toBe(Math.sign(large.dy));
    // Bigger objects throw longer, softer shadows under the same light.
    expect(Math.abs(large.dx)).toBeGreaterThan(Math.abs(small.dx));
    expect(large.blur).toBeGreaterThan(small.blur);
  });

  it("lights every poster from above", () => {
    // Lit from below or head-on is dramatic and nearly always wrong on a
    // poster; every convincing one is lit from above and slightly to a side.
    for (let i = 0; i < 40; i++) {
      const light = planLight(new Rng(`light:${i}`), "#333333");
      expect(light.elevation).toBeGreaterThan(30);
      const fromAbove = light.azimuth > 290 || light.azimuth < 70;
      expect(fromAbove, `azimuth ${light.azimuth}`).toBe(true);
    }
  });

  it("never casts a pure black shadow", () => {
    // Pure black punches a hole through the page instead of sitting in it.
    const light = planLight(new Rng("light:ink"), "#2a3b1f");
    expect(light.tint).not.toBe("#000000");
  });
});

describe("depth is one number, everything else follows", () => {
  it("moves scale, blur, haze and contrast together", () => {
    const far = depthEffects(0.1);
    const focal = depthEffects(FOCAL_DEPTH);
    const near = depthEffects(0.95);

    // Sharp at the focal plane, softer either side — foreground blur is the cue
    // a flat collage never produces by accident.
    expect(focal.blur).toBe(0);
    expect(far.blur).toBeGreaterThan(0);
    expect(near.blur).toBeGreaterThan(0);

    // Distance shrinks, hazes and flattens — all at once, never independently.
    expect(far.scale).toBeLessThan(near.scale);
    expect(far.haze).toBeGreaterThan(focal.haze);
    expect(far.contrast).toBeLessThan(1);
    expect(near.haze).toBe(0);
  });

  it("puts grounds behind, subject on the focal plane, type in front", () => {
    expect(depthForRole("evidence", true)).toBeLessThan(depthForRole("evidence", false));
    expect(depthForRole("evidence", false)).toBeLessThan(depthForRole("message", false));
    expect(depthForRole("structure", false)).toBeLessThan(depthForRole("cta", false));
  });

  it("is assigned to every element by the solver", () => {
    const spec = fixtureSpec(fixtureLineages("DEPTH-1", 1)[0]!);
    const layout = solveLayout(spec, themeFromSpec(spec));
    for (const el of spec.elements) {
      const d = layout.boxes[el.id]?.depth;
      expect(d, `${el.id} has no depth`).toBeDefined();
      expect(d!).toBeGreaterThanOrEqual(0);
      expect(d!).toBeLessThanOrEqual(1);
    }
  });
});
